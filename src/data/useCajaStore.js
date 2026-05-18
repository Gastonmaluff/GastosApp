import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { auth, authPersistenceReady, cajaWorkspaceId, db, firebaseApp, isFirebaseConfigured } from "../lib/firebase";
import { appBuildId } from "../lib/appInfo";
import { categoryKey, sameMonth, todayISO } from "../lib/format";
import { seedData, walletLabels } from "./seed";

const STORAGE_KEY = "control-de-caja:v1";
const MIGRATION_KEY = `control-de-caja:migrated:${cajaWorkspaceId}`;
const LOCAL_BACKUP_KEY = `control-de-caja:backup-before-firestore:${cajaWorkspaceId}`;
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

const collectionPath = (name) => `workspaces/${cajaWorkspaceId}/${name}`;

const toPlainError = (error) => ({
  code: error?.code || "",
  message: error?.message || "Error desconocido",
});

const logSync = (message, details = {}) => {
  console.info("[GastosApp sync]", message, details);
};

const logSyncError = (message, error, details = {}) => {
  console.error("[GastosApp sync]", message, { ...details, error: toPlainError(error) });
};

const backupLocalBeforeRemote = () => {
  if (localStorage.getItem(LOCAL_BACKUP_KEY)) return;
  localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify({
    createdAt: new Date().toISOString(),
    data: loadLocal(),
  }));
};

const hasLocalActivity = (localData) => {
  if (COLLECTIONS.some((name) => name !== "products" && (localData[name] ?? []).length > 0)) {
    return true;
  }

  const seedProducts = new Map(cloneSeed().products.map((product) => [product.id, product]));
  return (localData.products ?? []).some((product) => {
    const seedProduct = seedProducts.get(product.id);
    if (!seedProduct) return true;
    return (
      product.name !== seedProduct.name ||
      product.category !== seedProduct.category ||
      product.variant !== seedProduct.variant ||
      Number(product.quantity) !== Number(seedProduct.quantity) ||
      Number(product.unitCost) !== Number(seedProduct.unitCost) ||
      Number(product.salePrice) !== Number(seedProduct.salePrice)
    );
  });
};

export function useCajaStore() {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(!isFirebaseConfigured);
  const [isRemoteReady, setIsRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState(isFirebaseConfigured ? "signed-out" : "local");
  const [syncError, setSyncError] = useState("");
  const [authError, setAuthError] = useState("");
  const [data, setData] = useState(() => loadLocal());

  useEffect(() => {
    if (!isFirebaseConfigured) {
      logSync("Firebase no configurado, usando localStorage", { build: appBuildId });
      return undefined;
    }

    let isCancelled = false;
    let unsubAuth = () => {};
    authPersistenceReady.then(() => {
      if (isCancelled) return;
      unsubAuth = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setIsRemoteReady(false);
      setIsAuthReady(true);
      setSyncError("");
      setSyncStatus(nextUser ? "syncing" : "signed-out");
      console.log("APP BUILD VERSION:", appBuildId);
      console.log("Firebase project:", firebaseApp?.options?.projectId);
      console.log("Auth currentUser:", auth.currentUser?.uid, auth.currentUser?.email);
      console.log("Auth ready:", !!auth.currentUser);
      console.log("Active localId:", cajaWorkspaceId);
      console.log("Firestore read path:", collectionPath("movements"));
      logSync("Estado de autenticacion", {
        build: appBuildId,
        uid: nextUser?.uid || null,
        email: nextUser?.email || null,
        workspaceId: cajaWorkspaceId,
        collections: COLLECTIONS.map(collectionPath),
      });
      });
    }).catch((error) => {
      setIsAuthReady(true);
      setSyncStatus("error");
      setSyncError(`Error inicializando Auth: ${toPlainError(error).message}`);
      logSyncError("Error inicializando Auth", error);
    });

    return () => {
      isCancelled = true;
      unsubAuth();
    };
  }, []);

  const collectionRef = (name) => collection(db, "workspaces", cajaWorkspaceId, name);
  const docRef = (name, id) => doc(db, "workspaces", cajaWorkspaceId, name, id);
  const shouldUseRemote = isFirebaseConfigured && Boolean(user);

  const failRemote = (message, error, details = {}) => {
    const plain = toPlainError(error);
    setSyncStatus("error");
    setIsRemoteReady(false);
    setSyncError(`${message}: ${plain.message}`);
    logSyncError(message, error, details);
  };

  useEffect(() => {
    if (!isFirebaseConfigured || !user) return undefined;

    let cancelled = false;
    let unsubs = [];

    const migrateLocalOnce = async () => {
      backupLocalBeforeRemote();

      const localData = loadLocal();
      const localHasActivity = hasLocalActivity(localData);
      const snapshots = await Promise.all(COLLECTIONS.map((name) => getDocs(collectionRef(name))));
      const remoteData = COLLECTIONS.reduce((acc, name, index) => {
        acc[name] = snapshots[index].docs.map((item) => ({ id: item.id, ...item.data() }));
        return acc;
      }, { ...cloneSeed(), products: [] });
      const remoteHasData = snapshots.some((snapshot) => !snapshot.empty);
      const remoteHasActivity = hasLocalActivity(remoteData);
      const alreadyMigrated = Boolean(localStorage.getItem(MIGRATION_KEY));

      logSync("Revision de migracion local a Firestore", {
        uid: user.uid,
        email: user.email,
        workspaceId: cajaWorkspaceId,
        localHasActivity,
        remoteHasData,
        remoteHasActivity,
        alreadyMigrated,
        paths: COLLECTIONS.map(collectionPath),
      });

      if (!localHasActivity && remoteHasData) {
        localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
        return;
      }

      if (alreadyMigrated && remoteHasActivity) return;

      if (localHasActivity && remoteHasActivity) {
        console.warn("[GastosApp sync] Firestore ya tiene actividad; no se migra local automaticamente para evitar duplicados.", {
          workspaceId: cajaWorkspaceId,
          backupKey: LOCAL_BACKUP_KEY,
        });
        localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
        return;
      }

      let batch = writeBatch(db);
      let batchSize = 0;
      const commitBatch = async () => {
        if (batchSize === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        batchSize = 0;
      };

      for (const name of COLLECTIONS) {
        for (const item of localData[name] ?? []) {
          if (!item.id) continue;
          batch.set(docRef(name, item.id), {
            ...item,
            migratedAt: serverTimestamp(),
            lastMigratedBy: user.uid,
          }, { merge: true });
          batchSize += 1;
          if (batchSize >= 450) await commitBatch();
        }
      }
      await commitBatch();
      localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
      logSync("Migracion local a Firestore completada", {
        workspaceId: cajaWorkspaceId,
        uid: user.uid,
        email: user.email,
        paths: COLLECTIONS.map(collectionPath),
      });
    };

    const subscribeRemote = async () => {
      setSyncStatus("syncing");
      setSyncError("");
      await migrateLocalOnce();
      if (cancelled) return;

      unsubs = COLLECTIONS.map((name) =>
        onSnapshot(collectionRef(name), (snapshot) => {
          const values = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
          logSync("Snapshot recibido", {
            path: collectionPath(name),
            count: values.length,
            uid: user.uid,
            email: user.email,
          });
          setData((current) => {
            const next = { ...current, [name]: values };
            saveLocal(next);
            return next;
          });
        }, (error) => {
          failRemote("Error leyendo Firestore", error, { path: collectionPath(name), uid: user.uid, email: user.email });
        }),
      );
      setIsRemoteReady(true);
      setSyncStatus("online");
      logSync("Listeners Firestore activos", {
        uid: user.uid,
        email: user.email,
        workspaceId: cajaWorkspaceId,
        paths: COLLECTIONS.map(collectionPath),
      });
    };

    subscribeRemote().catch((error) => {
      failRemote("Error inicializando sincronizacion Firestore", error, {
        uid: user.uid,
        email: user.email,
        workspaceId: cajaWorkspaceId,
      });
    });

    return () => {
      cancelled = true;
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [user]);

  const persistLocal = (producer) => {
    setData((current) => {
      const next = producer(current);
      saveLocal(next);
      return next;
    });
  };

  const userId = user?.uid ?? "local-demo";

  const login = async ({ email, password }) => {
    if (!isFirebaseConfigured) return;
    setAuthError("");
    setSyncError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setAuthError("No se pudo iniciar sesion. Revisá el email y la contraseña.");
      logSyncError("Error de login Firebase", error, { email });
      throw error;
    }
  };

  const logout = async () => {
    if (!isFirebaseConfigured) return;
    setAuthError("");
    await firebaseSignOut(auth);
  };

  const addRemote = async (name, payload) => {
    if (!shouldUseRemote) return null;
    try {
      logSync("Escribiendo Firestore", { action: "add", path: collectionPath(name), uid: user.uid, email: user.email });
      const ref = await addDoc(collectionRef(name), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        userId: user.uid,
      });
      return ref.id;
    } catch (error) {
      failRemote("Error escribiendo Firestore", error, { action: "add", path: collectionPath(name), uid: user.uid, email: user.email });
      throw error;
    }
  };

  const updateRemote = async (name, id, payload) => {
    if (!shouldUseRemote) return;
    try {
      logSync("Actualizando Firestore", { action: "update", path: `${collectionPath(name)}/${id}`, uid: user.uid, email: user.email });
      await updateDoc(docRef(name, id), {
        ...payload,
        updatedAt: serverTimestamp(),
        userId: user.uid,
      });
    } catch (error) {
      failRemote("Error actualizando Firestore", error, { action: "update", path: `${collectionPath(name)}/${id}`, uid: user.uid, email: user.email });
      throw error;
    }
  };

  const setRemote = async (name, id, payload) => {
    if (!shouldUseRemote) return;
    try {
      logSync("Guardando Firestore", { action: "set", path: `${collectionPath(name)}/${id}`, uid: user.uid, email: user.email });
      await setDoc(docRef(name, id), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        userId: user.uid,
      });
    } catch (error) {
      failRemote("Error guardando Firestore", error, { action: "set", path: `${collectionPath(name)}/${id}`, uid: user.uid, email: user.email });
      throw error;
    }
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

    if (shouldUseRemote) {
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

    if (shouldUseRemote) {
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

    if (shouldUseRemote) {
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

    if (shouldUseRemote) {
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

    if (shouldUseRemote) {
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

    if (shouldUseRemote) {
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

    if (shouldUseRemote) {
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

    if (shouldUseRemote) {
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
    isAuthReady,
    isRemoteReady,
    syncStatus,
    syncError,
    workspaceId: cajaWorkspaceId,
    appBuildId,
    firestorePaths: COLLECTIONS.map(collectionPath),
    user,
    authError,
    login,
    logout,
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
