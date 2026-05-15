import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";
import { categoryKey, sameMonth, todayISO } from "../lib/format";
import { seedData, walletLabels } from "./seed";

const STORAGE_KEY = "control-de-caja:v1";
const COLLECTIONS = [
  "products",
  "movements",
  "sales",
  "expenses",
  "incomes",
  "debts",
  "dailyClosures",
];

const cloneSeed = () => JSON.parse(JSON.stringify(seedData));

const stamp = (userId) => ({
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  userId,
});

const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const loadLocal = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = cloneSeed();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  return { ...cloneSeed(), ...JSON.parse(raw) };
};

const saveLocal = (next) => localStorage.setItem(STORAGE_KEY, JSON.stringify(next));

export function useCajaStore() {
  const [user, setUser] = useState(null);
  const [isRemoteReady, setIsRemoteReady] = useState(false);
  const [data, setData] = useState(() => loadLocal());

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined;

    let unsubAuth = () => {};
    signInAnonymously(auth).catch(() => setIsRemoteReady(false));
    unsubAuth = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsRemoteReady(Boolean(nextUser));
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!isRemoteReady || !user) return undefined;

    const unsubs = COLLECTIONS.map((name) =>
      onSnapshot(collection(db, "users", user.uid, name), (snapshot) => {
        const values = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        setData((current) => ({ ...current, [name]: values }));
      }),
    );

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [isRemoteReady, user]);

  const persistLocal = (producer) => {
    setData((current) => {
      const next = producer(current);
      saveLocal(next);
      return next;
    });
  };

  const userId = user?.uid ?? "local-demo";

  const addRemote = async (name, payload) => {
    if (!isRemoteReady || !user) return null;
    const ref = await addDoc(collection(db, "users", user.uid, name), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      userId: user.uid,
    });
    return ref.id;
  };

  const updateRemote = async (name, id, payload) => {
    if (!isRemoteReady || !user) return;
    await updateDoc(doc(db, "users", user.uid, name, id), {
      ...payload,
      updatedAt: serverTimestamp(),
      userId: user.uid,
    });
  };

  const setRemote = async (name, id, payload) => {
    if (!isRemoteReady || !user) return;
    await setDoc(doc(db, "users", user.uid, name, id), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      userId: user.uid,
    });
  };

  const addProduct = async (product) => {
    const nextProduct = {
      ...product,
      quantity: Number(product.quantity),
      unitCost: Number(product.unitCost),
      salePrice: Number(product.salePrice),
      margin: Number(product.salePrice) - Number(product.unitCost),
      ...stamp(userId),
    };

    if (isRemoteReady) {
      await addRemote("products", nextProduct);
      return;
    }

    persistLocal((current) => ({
      ...current,
      products: [{ id: makeId("product"), ...nextProduct }, ...current.products],
    }));
  };

  const adjustStock = async ({ productId, quantityDelta, reason }) => {
    const product = data.products.find((item) => item.id === productId);
    if (!product) return;
    const nextQuantity = Math.max(0, Number(product.quantity) + Number(quantityDelta));
    const movement = {
      id: makeId("stock"),
      type: "stock",
      concept: reason || "Ajuste de stock",
      productId,
      quantityDelta: Number(quantityDelta),
      date: todayISO(),
      ...stamp(userId),
    };

    if (isRemoteReady) {
      await updateRemote("products", productId, { quantity: nextQuantity });
      await addRemote("movements", movement);
      return;
    }

    persistLocal((current) => ({
      ...current,
      products: current.products.map((item) =>
        item.id === productId ? { ...item, quantity: nextQuantity, updatedAt: movement.updatedAt } : item,
      ),
      movements: [movement, ...current.movements],
    }));
  };

  const registerSale = async (sale) => {
    const product = data.products.find((item) => item.id === sale.productId);
    if (!product) return;

    const quantity = Number(sale.quantity);
    const unitPrice = Number(sale.unitPrice);
    const total = quantity * unitPrice;
    const costTotal = quantity * Number(product.unitCost);
    const profit = total - costTotal;
    const business = categoryKey(product.category);
    const nextSale = {
      ...sale,
      productName: product.name,
      category: product.category,
      quantity,
      unitPrice,
      total,
      costTotal,
      profit,
      ...stamp(userId),
    };
    const movement = {
      id: makeId("movement"),
      type: "sale",
      date: sale.date,
      concept: `Venta ${product.name}`,
      amount: total,
      paymentMethod: sale.paymentMethod,
      customer: sale.customer,
      allocations: [
        { wallet: `inventory_${business}`, amount: costTotal },
        { wallet: `profit_${business}`, amount: profit },
      ],
      productId: product.id,
      ...stamp(userId),
    };
    const nextQuantity = Math.max(0, Number(product.quantity) - quantity);

    if (isRemoteReady) {
      await addRemote("sales", nextSale);
      await addRemote("movements", movement);
      await updateRemote("products", product.id, { quantity: nextQuantity });
      return;
    }

    persistLocal((current) => ({
      ...current,
      sales: [{ id: makeId("sale"), ...nextSale }, ...current.sales],
      movements: [movement, ...current.movements],
      products: current.products.map((item) =>
        item.id === product.id ? { ...item, quantity: nextQuantity, updatedAt: movement.updatedAt } : item,
      ),
    }));
  };

  const registerIncome = async (income) => {
    const amount = Number(income.amount);
    const nextIncome = { ...income, amount, ...stamp(userId) };
    const movement = {
      id: makeId("movement"),
      type: "income",
      date: income.date,
      concept: income.concept,
      amount,
      category: income.category,
      paymentMethod: income.paymentMethod,
      allocations: [{ wallet: income.walletDestination, amount }],
      observation: income.observation,
      ...stamp(userId),
    };

    if (isRemoteReady) {
      await addRemote("incomes", nextIncome);
      await addRemote("movements", movement);
      return;
    }

    persistLocal((current) => ({
      ...current,
      incomes: [{ id: makeId("income"), ...nextIncome }, ...current.incomes],
      movements: [movement, ...current.movements],
    }));
  };

  const registerExpense = async (expense) => {
    const amount = Number(expense.amount);
    const nextExpense = { ...expense, amount, ...stamp(userId) };
    const movement = {
      id: makeId("movement"),
      type: "expense",
      date: expense.date,
      concept: expense.concept,
      amount,
      category: expense.category,
      paymentMethod: expense.paymentMethod,
      walletOrigin: expense.walletOrigin,
      spendingType: expense.spendingType,
      observation: expense.observation,
      debtId: expense.debtId || "",
      ...stamp(userId),
    };

    if (isRemoteReady) {
      await addRemote("expenses", nextExpense);
      await addRemote("movements", movement);
      if (expense.debtId) {
        const debt = data.debts.find((item) => item.id === expense.debtId);
        await updateRemote("debts", expense.debtId, {
          currentBalance: Math.max(0, Number(debt?.currentBalance ?? 0) - amount),
          payments: [...(debt?.payments ?? []), { amount, date: expense.date, walletOrigin: expense.walletOrigin }],
        });
      }
      return;
    }

    persistLocal((current) => ({
      ...current,
      expenses: [{ id: makeId("expense"), ...nextExpense }, ...current.expenses],
      movements: [movement, ...current.movements],
      debts: expense.debtId
        ? current.debts.map((debt) =>
            debt.id === expense.debtId
              ? {
                  ...debt,
                  currentBalance: Math.max(0, Number(debt.currentBalance) - amount),
                  payments: [
                    ...(debt.payments ?? []),
                    { id: makeId("payment"), amount, date: expense.date, walletOrigin: expense.walletOrigin },
                  ],
                }
              : debt,
          )
        : current.debts,
    }));
  };

  const addDebt = async (debt) => {
    const nextDebt = {
      ...debt,
      initialAmount: Number(debt.initialAmount),
      currentBalance: Number(debt.currentBalance || debt.initialAmount),
      monthlyTarget: Number(debt.monthlyTarget),
      payments: [],
      ...stamp(userId),
    };

    if (isRemoteReady) {
      await addRemote("debts", nextDebt);
      return;
    }

    persistLocal((current) => ({
      ...current,
      debts: [{ id: makeId("debt"), ...nextDebt }, ...current.debts],
    }));
  };

  const updateDebt = async (debtId, debt) => {
    const nextDebt = {
      ...debt,
      initialAmount: Number(debt.initialAmount),
      currentBalance: Number(debt.currentBalance || debt.initialAmount),
      monthlyTarget: Number(debt.monthlyTarget),
      updatedAt: new Date().toISOString(),
      userId,
    };

    if (isRemoteReady) {
      await updateRemote("debts", debtId, nextDebt);
      return;
    }

    persistLocal((current) => ({
      ...current,
      debts: current.debts.map((item) =>
        item.id === debtId ? { ...item, ...nextDebt } : item,
      ),
    }));
  };

  const addDailyClosure = async (closure) => {
    const nextClosure = {
      ...closure,
      expectedCash: Number(closure.expectedCash),
      realCash: Number(closure.realCash),
      difference: Number(closure.realCash) - Number(closure.expectedCash),
      ...stamp(userId),
    };

    if (isRemoteReady) {
      await addRemote("dailyClosures", nextClosure);
      return;
    }

    persistLocal((current) => ({
      ...current,
      dailyClosures: [{ id: makeId("closure"), ...nextClosure }, ...current.dailyClosures],
    }));
  };

  const metrics = useMemo(() => {
    const wallets = Object.fromEntries(Object.keys(walletLabels).map((key) => [key, 0]));

    data.movements.forEach((movement) => {
      if (movement.type === "sale" || movement.type === "income") {
        movement.allocations?.forEach((allocation) => {
          wallets[allocation.wallet] = (wallets[allocation.wallet] ?? 0) + Number(allocation.amount);
        });
      }
      if (movement.type === "expense") {
        wallets[movement.walletOrigin] = (wallets[movement.walletOrigin] ?? 0) - Number(movement.amount);
      }
    });

    const today = todayISO();
    const todaysSales = data.sales.filter((item) => item.date === today);
    const todaysIncomes = data.incomes.filter((item) => item.date === today);
    const todaysExpenses = data.expenses.filter((item) => item.date === today);
    const thisMonthDebtPayments = data.expenses
      .filter((item) => item.category === "Pago deuda" && sameMonth(item.date))
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const totalDebt = data.debts.reduce((sum, item) => sum + Number(item.currentBalance), 0);
    const stockAtCost = data.products.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
      0,
    );
    const stockAtSale = data.products.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.salePrice),
      0,
    );
    const unexplainedDifference = data.dailyClosures.reduce(
      (sum, item) => sum + Number(item.difference),
      0,
    );
    const totalWallets = Object.values(wallets).reduce((sum, amount) => sum + Number(amount), 0);

    return {
      wallets,
      totalWallets,
      totalDebt,
      stockAtCost,
      stockAtSale,
      stockPotentialProfit: stockAtSale - stockAtCost,
      unexplainedDifference,
      today: {
        sales: todaysSales.reduce((sum, item) => sum + Number(item.total), 0),
        incomes: todaysIncomes.reduce((sum, item) => sum + Number(item.amount), 0),
        expenses: todaysExpenses.reduce((sum, item) => sum + Number(item.amount), 0),
        profit: todaysSales.reduce((sum, item) => sum + Number(item.profit), 0),
        cost: todaysSales.reduce((sum, item) => sum + Number(item.costTotal), 0),
        debtPayments: todaysExpenses
          .filter((item) => item.category === "Pago deuda")
          .reduce((sum, item) => sum + Number(item.amount), 0),
      },
      debtProgress: {
        target: Number(data.settings.monthlyDebtTarget || 0),
        paid: thisMonthDebtPayments,
      },
    };
  }, [data]);

  return {
    data,
    metrics,
    isFirebaseConfigured,
    isRemoteReady,
    addProduct,
    adjustStock,
    registerSale,
    registerIncome,
    registerExpense,
    addDebt,
    updateDebt,
    addDailyClosure,
  };
}
