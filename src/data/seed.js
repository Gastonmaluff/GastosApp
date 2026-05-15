import { todayISO } from "../lib/format";

export const walletLabels = {
  profit_edredones: "Ganancia edredones",
  profit_gomitas: "Ganancia gomitas",
  inventory_edredones: "Fondo mercadería edredones",
  inventory_gomitas: "Fondo mercadería gomitas",
  debt_fund: "Fondo deuda",
  available: "Caja disponible",
};

export const paymentMethods = ["Efectivo", "Transferencia", "Tarjeta", "Otro"];

export const expenseCategories = [
  "Mercadería edredones",
  "Mercadería gomitas",
  "Pago deuda",
  "Nafta",
  "Delivery",
  "Comida",
  "Familia",
  "Personal",
  "Operativo",
  "Gasto hormiga",
  "Otro",
];

export const productCategories = ["Edredones", "Gomitas", "Otro"];

export const seedData = {
  products: [
    {
      id: "mock-edredon-king",
      name: "Edredón King",
      category: "Edredones",
      variant: "King premium",
      quantity: 10,
      unitCost: 250000,
      salePrice: 350000,
      supplier: "Proveedor inicial",
      observation: "Dato mock editable",
      createdAt: todayISO(),
      updatedAt: todayISO(),
      userId: "local-demo",
    },
    {
      id: "mock-gomitas-display",
      name: "Display gomitas 360 g",
      category: "Gomitas",
      variant: "Display 360 g",
      quantity: 50,
      unitCost: 12000,
      salePrice: 18000,
      supplier: "Proveedor inicial",
      observation: "Dato mock editable",
      createdAt: todayISO(),
      updatedAt: todayISO(),
      userId: "local-demo",
    },
  ],
  movements: [],
  sales: [],
  incomes: [],
  expenses: [],
  debts: [],
  dailyClosures: [],
  settings: {
    monthlyDebtTarget: 3000000,
    suggestedDebtProfitPercent: 25,
    visibleWallets: Object.keys(walletLabels),
    expenseCategories,
    productCategories,
    paymentMethods,
  },
};
