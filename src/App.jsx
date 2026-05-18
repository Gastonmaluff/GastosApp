import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Bell,
  Boxes,
  CalendarCheck,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  Home,
  Landmark,
  PackagePlus,
  Pencil,
  Plus,
  ReceiptText,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  Wallet,
  X,
} from "lucide-react";
import { useCajaStore } from "./data/useCajaStore";
import {
  expenseCategories,
  paymentMethods,
  productCategories,
  walletLabels,
} from "./data/seed";
import { formatGs, todayISO } from "./lib/format";

const navItems = [
  { id: "dashboard", label: "Inicio", icon: Home },
  { id: "movements", label: "Movimientos", icon: ArrowRightLeft },
  { id: "stock", label: "Stock", icon: Boxes },
  { id: "debts", label: "Deudas", icon: ReceiptText },
  { id: "reports", label: "Reportes", icon: ChartNoAxesColumnIncreasing },
];

const actionOptions = [
  { id: "sale", title: "Venta", icon: PackagePlus, tone: "green" },
  { id: "income", title: "Ingreso manual", icon: ArrowUpRight, tone: "blue" },
  { id: "expense", title: "Egreso", icon: ArrowDownLeft, tone: "red" },
  { id: "debtPayment", title: "Pago deuda", icon: Landmark, tone: "orange" },
];

const initialForms = {
  sale: {
    date: todayISO(),
    productId: "",
    quantity: 1,
    unitPrice: "",
    paymentMethod: "Efectivo",
    customer: "",
    observation: "",
  },
  income: {
    date: todayISO(),
    concept: "",
    category: "Otro ingreso",
    amount: "",
    paymentMethod: "Efectivo",
    walletDestination: "available",
    observation: "",
  },
  expense: {
    date: todayISO(),
    concept: "",
    category: "Otro",
    amount: "",
    paymentMethod: "Efectivo",
    walletOrigin: "profit_edredones",
    spendingType: "necesario",
    debtId: "",
    observation: "",
  },
  stock: {
    productId: "",
    quantityDelta: 1,
    reason: "Entrada de mercadería",
  },
  debt: {
    name: "",
    initialAmount: "",
    currentBalance: "",
    monthlyTarget: "",
    nextPaymentDate: todayISO(),
    status: "al día",
    observation: "",
  },
  debtEdit: {
    name: "",
    initialAmount: "",
    currentBalance: "",
    monthlyTarget: "",
    nextPaymentDate: todayISO(),
    status: "al día",
    observation: "",
  },
  product: {
    name: "",
    category: "Edredones",
    variant: "",
    quantity: "",
    unitCost: "",
    salePrice: "",
    supplier: "",
    observation: "",
  },
  closure: {
    date: todayISO(),
    realCash: "",
    explanation: "Falta registrar gasto",
    note: "",
  },
};

function App() {
  const store = useCajaStore();
  const { data, metrics } = store;
  const [activeTab, setActiveTab] = useState("dashboard");
  const [sheet, setSheet] = useState(null);

  const screen = {
    dashboard: <Dashboard store={store} openSheet={setSheet} goTo={setActiveTab} />,
    movements: <Movements data={data} metrics={metrics} />,
    stock: <Stock store={store} openSheet={setSheet} />,
    debts: <Debts store={store} openSheet={setSheet} />,
    reports: <Reports data={data} metrics={metrics} />,
    settings: <SettingsScreen data={data} remoteReady={store.isRemoteReady} />,
  }[activeTab];

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="phone-frame">
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          remoteReady={store.isRemoteReady}
          openActions={() => setSheet("actions")}
        />
        <section className={`screen ${activeTab}-screen`}>{screen}</section>
        <FloatingActionButton onClick={() => setSheet("actions")} />
        <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        <TransactionSheet sheet={sheet} setSheet={setSheet} store={store} />
      </main>
    </div>
  );
}

function Header({ activeTab, setActiveTab, remoteReady, openActions }) {
  const title = {
    dashboard: "Control de Caja",
    movements: "Movimientos",
    stock: "Stock",
    debts: "Deudas",
    reports: "Reportes",
    settings: "Configuración",
  }[activeTab];

  return (
    <header className="app-header">
      <div>
        <p className="eyebrow">{activeTab === "dashboard" ? "Hoy" : "Control financiero"}</p>
        <h1>{title}</h1>
      </div>
      <div className="header-actions">
        <span className={`sync-pill ${remoteReady ? "online" : ""}`}>
          {remoteReady ? "Firebase" : "Local"}
        </span>
        <button className="desktop-new-button" type="button" onClick={openActions}>
          <Plus size={18} /> Nuevo movimiento
        </button>
        <button className="icon-button" type="button" aria-label="Configuración" onClick={() => setActiveTab("settings")}>
          <Settings size={19} />
        </button>
        <button className="icon-button" type="button" aria-label="Alertas">
          <Bell size={19} />
        </button>
      </div>
    </header>
  );
}

function Sidebar({ activeTab, setActiveTab }) {
  return (
    <aside className="desktop-sidebar" aria-label="Navegacion principal">
      <div className="sidebar-brand">
        <div className="sidebar-logo"><Wallet size={22} /></div>
        <div>
          <strong>GastosApp</strong>
          <span>Control diario</span>
        </div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button type="button" className={activeTab === item.id ? "active" : ""} key={item.id} onClick={() => setActiveTab(item.id)}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function Dashboard({ store, openSheet, goTo }) {
  const { data, metrics } = store;
  const debtPercent = Math.min(100, Math.round((metrics.debtProgress.paid / Math.max(1, metrics.debtProgress.target)) * 100));
  const hasRegisteredDebt = data.debts.length > 0 && metrics.totalDebt > 0;

  return (
    <div className="stack">
      <article className="main-balance-card">
        <span className="balance-wave" aria-hidden="true" />
        <div className="balance-icon"><Wallet size={28} /></div>
        <div>
          <span>Caja disponible real</span>
          <strong>{formatGs(metrics.totalWallets)}</strong>
        </div>
        <ChevronRight />
      </article>

      <div className="stat-grid">
        <StatCard label="Ganancia edredones" value={metrics.wallets.profit_edredones} icon={Sparkles} tone="green" />
        <StatCard label="Ganancia gomitas" value={metrics.wallets.profit_gomitas} icon={Sparkles} tone="green" />
        <StatCard label="Fondo mercadería edredones" value={metrics.wallets.inventory_edredones} icon={Boxes} tone="amber" />
        <StatCard label="Fondo mercadería gomitas" value={metrics.wallets.inventory_gomitas} icon={Boxes} tone="amber" />
      </div>

      <DebtSummaryCard
        hasRegisteredDebt={hasRegisteredDebt}
        totalDebt={metrics.totalDebt}
        onClick={() => goTo("debts")}
      />

      <InfoCard title="Resumen de hoy" actionLabel="Cerrar día" onAction={() => openSheet("closure")}>
        <MetricRow label="Ventas" value={metrics.today.sales} positive />
        <MetricRow label="Ingresos manuales" value={metrics.today.incomes} positive />
        <MetricRow label="Egresos" value={metrics.today.expenses} negative />
        <MetricRow label="Ganancia real" value={metrics.today.profit} positive />
        <MetricRow label="Costo mercadería vendido" value={metrics.today.cost} />
        <MetricRow label="Pagos de deuda" value={metrics.today.debtPayments} />
      </InfoCard>

      <article className="progress-card">
        <div className="progress-head">
          <div className="mini-icon blue"><Target size={20} /></div>
          <div>
            <h3>Objetivo de deuda</h3>
            <p>{formatGs(metrics.debtProgress.paid)} / {formatGs(metrics.debtProgress.target)}</p>
          </div>
          <strong>{debtPercent}%</strong>
        </div>
        <div className="progress-track"><span style={{ width: `${debtPercent}%` }} /></div>
      </article>

      {metrics.unexplainedDifference !== 0 && (
        <article className="alert-card">
          <ShieldAlert size={20} />
          <p>Hay una diferencia de {formatGs(Math.abs(metrics.unexplainedDifference))} entre tu caja esperada y tu caja real.</p>
        </article>
      )}

      <button className="wide-action" type="button" onClick={() => goTo("reports")}>
        Ver reportes de control <ChevronRight size={18} />
      </button>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <article className={`stat-card ${tone}`}>
      <div className="mini-icon"><Icon size={18} /></div>
      <span>{label}</span>
      <strong>{formatGs(value)}</strong>
      <i aria-hidden="true" />
    </article>
  );
}

function DebtSummaryCard({ hasRegisteredDebt, totalDebt, onClick }) {
  return (
    <button className="debt-summary-card" type="button" onClick={onClick}>
      <div className="mini-icon red"><Landmark size={18} /></div>
      <div>
        <span>Deudas</span>
        <strong>{hasRegisteredDebt ? "Monto registrado" : "Sin monto registrado"}</strong>
        <p>{hasRegisteredDebt ? formatGs(totalDebt) : "Opcional · Editar monto"}</p>
      </div>
      <Pencil size={18} />
    </button>
  );
}

function InfoCard({ title, actionLabel, onAction, children }) {
  return (
    <article className="info-card">
      <div className="card-head">
        <h2>{title}</h2>
        {actionLabel && <button type="button" onClick={onAction}>{actionLabel}</button>}
      </div>
      <div className="metric-list">{children}</div>
    </article>
  );
}

function MetricRow({ label, value, positive, negative }) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong className={positive ? "positive" : negative ? "negative" : ""}>
        {negative && value > 0 ? "- " : ""}{formatGs(value)}
      </strong>
    </div>
  );
}

function Movements({ data }) {
  return (
    <div className="stack">
      {data.movements.length === 0 ? (
        <EmptyState title="Todavía no hay movimientos" text="Usá el botón + para registrar ventas, ingresos o egresos." />
      ) : (
        data.movements.map((movement) => <MovementItem key={movement.id} movement={movement} />)
      )}
    </div>
  );
}

function MovementItem({ movement }) {
  const Icon = movement.type === "expense" ? ArrowDownLeft : movement.type === "sale" ? PackagePlus : ArrowUpRight;
  return (
    <article className="movement-item">
      <div className={`movement-icon ${movement.type}`}><Icon size={20} /></div>
      <div>
        <h3>{movement.concept}</h3>
        <p>{movement.date} · {movement.paymentMethod || "Ajuste interno"}</p>
        {movement.walletOrigin && <small>Sale de {walletLabels[movement.walletOrigin]}</small>}
        {movement.allocations?.length > 0 && (
          <small>{movement.allocations.map((item) => `${walletLabels[item.wallet]} ${formatGs(item.amount)}`).join(" · ")}</small>
        )}
      </div>
      <strong className={movement.type === "expense" ? "negative" : "positive"}>{formatGs(movement.amount || 0)}</strong>
    </article>
  );
}

function Stock({ store, openSheet }) {
  const { data, metrics } = store;
  const [filter, setFilter] = useState("Todos");
  const products = filter === "Todos" ? data.products : data.products.filter((item) => item.category === filter);

  return (
    <div className="stack">
      <div className="segmented">
        {["Todos", "Edredones", "Gomitas", "Otro"].map((item) => (
          <button key={item} className={filter === item ? "active" : ""} type="button" onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
      </div>
      <div className="stock-summary">
        <StatCard label="Stock al costo" value={metrics.stockAtCost} icon={Boxes} tone="blue" />
        <StatCard label="Ganancia potencial" value={metrics.stockPotentialProfit} icon={ChartNoAxesColumnIncreasing} tone="green" />
      </div>
      <button className="wide-action primary" type="button" onClick={() => openSheet("product")}>
        <Plus size={18} /> Agregar producto
      </button>
      {products.map((product) => <ProductStockCard key={product.id} product={product} />)}
    </div>
  );
}

function ProductStockCard({ product }) {
  const valueAtCost = Number(product.quantity) * Number(product.unitCost);
  const potential = Number(product.quantity) * (Number(product.salePrice) - Number(product.unitCost));

  return (
    <article className="product-card">
      <div className="product-top">
        <div className="product-thumb"><Boxes size={24} /></div>
        <div>
          <h3>{product.name}</h3>
          <p>{product.category} · {product.variant || "Sin variante"}</p>
        </div>
        <span className="status">Activo</span>
      </div>
      <div className="product-metrics">
        <span>Stock <strong>{product.quantity} un.</strong></span>
        <span>Costo <strong>{formatGs(product.unitCost)}</strong></span>
        <span>Precio <strong>{formatGs(product.salePrice)}</strong></span>
      </div>
      <div className="product-bottom">
        <span>Valor al costo <strong>{formatGs(valueAtCost)}</strong></span>
        <span>Ganancia potencial <strong className="positive">{formatGs(potential)}</strong></span>
      </div>
    </article>
  );
}

function Debts({ store, openSheet }) {
  const { data, metrics } = store;
  return (
    <div className="stack">
      <article className="debt-total-card">
        <span>Total registrado</span>
        <strong>{data.debts.length > 0 ? formatGs(metrics.totalDebt) : "Sin monto"}</strong>
        <p>Usalo solo si querés hacer seguimiento de pagos y fechas.</p>
      </article>
      <button className="wide-action primary" type="button" onClick={() => openSheet("debt")}>
        <Plus size={18} /> Agregar deuda
      </button>
      {data.debts.length === 0 ? (
        <EmptyState
          title="Todavía no registraste deudas"
          text="Podés agregarlas cuando quieras para hacer seguimiento."
        />
      ) : (
        data.debts.map((debt) => <DebtCard key={debt.id} debt={debt} onEdit={() => openSheet(`debtEdit:${debt.id}`)} />)
      )}
    </div>
  );
}

function DebtCard({ debt, onEdit }) {
  const paid = Number(debt.initialAmount) - Number(debt.currentBalance);
  const percent = Math.min(100, Math.round((paid / Math.max(1, Number(debt.initialAmount))) * 100));
  const projectedMonths = Math.ceil(Number(debt.currentBalance) / Math.max(1, Number(debt.monthlyTarget)));

  return (
    <article className="debt-card">
      <div className="card-head">
        <div>
          <h2>{debt.name}</h2>
          <p>{debt.status} · próximo pago {debt.nextPaymentDate}</p>
        </div>
        <button className="edit-button" type="button" onClick={onEdit} aria-label={`Editar ${debt.name}`}>
          <Pencil size={16} />
        </button>
      </div>
      <div className="debt-line">
        <span>Saldo actual</span>
        <strong>{formatGs(debt.currentBalance)}</strong>
      </div>
      <div className="debt-line">
        <span>Pago mensual</span>
        <strong>{formatGs(debt.monthlyTarget)}</strong>
      </div>
      <div className="progress-track red"><span style={{ width: `${percent}%` }} /></div>
      <div className="product-bottom">
        <span>Pagado <strong>{formatGs(paid)}</strong></span>
        <span>Proyección <strong>{projectedMonths} meses</strong></span>
      </div>
    </article>
  );
}

function Reports({ data, metrics }) {
  const expensesByCategory = useMemo(() => {
    return data.expenses.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + Number(item.amount);
      return acc;
    }, {});
  }, [data.expenses]);
  const edredonProfit = data.sales.filter((item) => item.category === "Edredones").reduce((sum, item) => sum + Number(item.profit), 0);
  const gomitaProfit = data.sales.filter((item) => item.category === "Gomitas").reduce((sum, item) => sum + Number(item.profit), 0);

  return (
    <div className="stack">
      <div className="segmented">
        {["Hoy", "Semana", "Mes", "Mes pasado"].map((item) => <button key={item} type="button" className={item === "Mes" ? "active" : ""}>{item}</button>)}
      </div>
      <InfoCard title="Rentabilidad">
        <MetricRow label="Ventas totales" value={data.sales.reduce((sum, item) => sum + Number(item.total), 0)} positive />
        <MetricRow label="Ganancia real" value={data.sales.reduce((sum, item) => sum + Number(item.profit), 0)} positive />
        <MetricRow label="Costo vendido" value={data.sales.reduce((sum, item) => sum + Number(item.costTotal), 0)} />
        <MetricRow label="Diferencias de caja" value={metrics.unexplainedDifference} negative={metrics.unexplainedDifference < 0} />
      </InfoCard>
      <InfoCard title="Negocio que más genera">
        <MetricRow label="Edredones" value={edredonProfit} positive />
        <MetricRow label="Gomitas" value={gomitaProfit} positive />
      </InfoCard>
      <InfoCard title="Gastos por categoría">
        {Object.keys(expensesByCategory).length === 0 ? (
          <p className="muted">Sin egresos registrados.</p>
        ) : (
          Object.entries(expensesByCategory).map(([category, amount]) => <MetricRow key={category} label={category} value={amount} negative />)
        )}
      </InfoCard>
      <InfoCard title="Stock actual">
        <MetricRow label="Valor al costo" value={metrics.stockAtCost} />
        <MetricRow label="Valor a precio de venta" value={metrics.stockAtSale} positive />
        <MetricRow label="Ganancia potencial" value={metrics.stockPotentialProfit} positive />
      </InfoCard>
    </div>
  );
}

function SettingsScreen({ data, remoteReady }) {
  return (
    <div className="stack">
      <InfoCard title="Datos">
        <MetricRow label="Modo de persistencia" value={0} />
        <p className="settings-line">{remoteReady ? "Firebase activo por usuario autenticado anónimo." : "Datos mock/localStorage hasta completar .env.local con Firebase."}</p>
      </InfoCard>
      <InfoCard title="Objetivos">
        <MetricRow label="Pago mensual deuda" value={data.settings.monthlyDebtTarget} />
        <p className="settings-line">Sugerencia a deuda: {data.settings.suggestedDebtProfitPercent}% de ganancia.</p>
      </InfoCard>
      <InfoCard title="Cajas internas">
        {Object.values(walletLabels).map((label) => <p className="settings-line" key={label}>{label}</p>)}
      </InfoCard>
    </div>
  );
}

function TransactionSheet({ sheet, setSheet, store }) {
  const [selectedAction, setSelectedAction] = useState(null);
  const [forms, setForms] = useState(initialForms);
  const editingDebtId = sheet?.startsWith("debtEdit:") ? sheet.split(":")[1] : "";

  const active = selectedAction || (editingDebtId ? "debtEdit" : sheet);
  const activeFormKey = active === "debtPayment" ? "expense" : active;
  const update = (key, value) => setForms((current) => ({ ...current, [activeFormKey]: { ...current[activeFormKey], [key]: value } }));
  const setForm = (key, producer) => setForms((current) => ({ ...current, [key]: producer(current[key]) }));

  useEffect(() => {
    if (!editingDebtId) return;
    const debt = store.data.debts.find((item) => item.id === editingDebtId);
    if (!debt) return;
    setForms((current) => ({
      ...current,
      debtEdit: {
        name: debt.name || "",
        initialAmount: debt.initialAmount || "",
        currentBalance: debt.currentBalance || "",
        monthlyTarget: debt.monthlyTarget || "",
        nextPaymentDate: debt.nextPaymentDate || todayISO(),
        status: debt.status || "al día",
        observation: debt.observation || "",
      },
    }));
  }, [editingDebtId, store.data.debts]);

  if (!sheet) return null;

  const close = () => {
    setSheet(null);
    setSelectedAction(null);
  };

  const product = store.data.products.find((item) => item.id === forms.sale.productId);
  const salePreview = product
    ? {
        total: Number(forms.sale.quantity || 0) * Number(forms.sale.unitPrice || product.salePrice || 0),
        cost: Number(forms.sale.quantity || 0) * Number(product.unitCost || 0),
      }
    : { total: 0, cost: 0 };

  const submit = async (event) => {
    event.preventDefault();
    if (active === "sale") await store.registerSale({ ...forms.sale, unitPrice: forms.sale.unitPrice || product?.salePrice || 0 });
    if (active === "income") await store.registerIncome(forms.income);
    if (active === "expense" || active === "debtPayment") await store.registerExpense({
      ...forms.expense,
      category: active === "debtPayment" ? "Pago deuda" : forms.expense.category,
    });
    if (active === "stock") await store.adjustStock(forms.stock);
    if (active === "debt") await store.addDebt(forms.debt);
    if (active === "debtEdit") await store.updateDebt(editingDebtId, forms.debtEdit);
    if (active === "product") await store.addProduct(forms.product);
    if (active === "closure") await store.addDailyClosure({
      ...forms.closure,
      expectedCash: store.metrics.totalWallets,
    });
    close();
  };

  return (
    <div className="sheet-backdrop" onMouseDown={close}>
      <aside className="bottom-sheet" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-grabber" />
        <div className="sheet-head">
          <h2>{active === "actions" ? "Nuevo movimiento" : titleForAction(active)}</h2>
          <button className="icon-button" type="button" onClick={close} aria-label="Cerrar"><X size={20} /></button>
        </div>

        {active === "actions" ? (
          <div className="action-grid">
            {actionOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button className={`action-option ${option.tone}`} key={option.id} type="button" onClick={() => setSelectedAction(option.id)}>
                  <Icon size={24} />
                  <span>{option.title}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <form className="form-stack" onSubmit={submit}>
            {["income", "expense", "debtPayment"].includes(active) && <QuickMovementFields active={active} forms={forms} update={update} store={store} />}

            {active === "sale" && (
              <>
                <Input label="Fecha" type="date" value={forms.sale.date} onChange={(value) => update("date", value)} />
                <Select label="Producto" value={forms.sale.productId} onChange={(value) => setForm("sale", (form) => ({ ...form, productId: value, unitPrice: store.data.products.find((item) => item.id === value)?.salePrice || "" }))} options={store.data.products.map((item) => ({ value: item.id, label: `${item.name} · ${item.quantity} un.` }))} />
                <Input label="Cantidad" type="number" value={forms.sale.quantity} onChange={(value) => update("quantity", value)} />
                <Input label="Precio venta unitario" type="number" value={forms.sale.unitPrice} onChange={(value) => update("unitPrice", value)} />
                <Select label="Medio de pago" value={forms.sale.paymentMethod} onChange={(value) => update("paymentMethod", value)} options={paymentMethods} />
                <Input label="Cliente" value={forms.sale.customer} onChange={(value) => update("customer", value)} placeholder="Comprador" />
                <Distribution total={salePreview.total} cost={salePreview.cost} debtFund={0} />
              </>
            )}

            {false && active === "income" && (
              <>
                <Input label="Fecha" type="date" value={forms.income.date} onChange={(value) => update("date", value)} />
                <Input label="Concepto" value={forms.income.concept} onChange={(value) => update("concept", value)} placeholder="Ej. Transferencia recibida" />
                <Select label="Categoría" value={forms.income.category} onChange={(value) => update("category", value)} options={["Edredones", "Gomitas", "Otro ingreso", "Aporte personal", "Cobro pendiente"]} />
                <Input label="Monto total" type="number" value={forms.income.amount} onChange={(value) => update("amount", value)} />
                <Select label="Medio de pago" value={forms.income.paymentMethod} onChange={(value) => update("paymentMethod", value)} options={paymentMethods} />
                <Select label="Caja destino" value={forms.income.walletDestination} onChange={(value) => update("walletDestination", value)} options={walletOptions()} />
              </>
            )}

            {false && (active === "expense" || active === "debtPayment") && (
              <>
                <Input label="Fecha" type="date" value={forms.expense.date} onChange={(value) => update("date", value)} />
                <Input label="Concepto" value={forms.expense.concept} onChange={(value) => update("concept", value)} placeholder="Ej. Nafta, comida, proveedor" />
                <Select label="Categoría" value={active === "debtPayment" ? "Pago deuda" : forms.expense.category} onChange={(value) => update("category", value)} options={expenseCategories} />
                <Input label="Monto" type="number" value={forms.expense.amount} onChange={(value) => update("amount", value)} />
                <Select label="Medio de pago" value={forms.expense.paymentMethod} onChange={(value) => update("paymentMethod", value)} options={paymentMethods} />
                <Select label="Caja origen" value={forms.expense.walletOrigin} onChange={(value) => update("walletOrigin", value)} options={walletOptions()} />
                <Select label="Tipo" value={forms.expense.spendingType} onChange={(value) => update("spendingType", value)} options={["necesario", "evitable"]} />
                {(active === "debtPayment" || forms.expense.category === "Pago deuda") && (
                  <Select label="Deuda vinculada" value={forms.expense.debtId} onChange={(value) => update("debtId", value)} options={store.data.debts.map((item) => ({ value: item.id, label: item.name }))} />
                )}
              </>
            )}

            {active === "stock" && (
              <>
                <Select label="Producto" value={forms.stock.productId} onChange={(value) => update("productId", value)} options={store.data.products.map((item) => ({ value: item.id, label: item.name }))} />
                <Input label="Cantidad (+ entrada / - salida)" type="number" value={forms.stock.quantityDelta} onChange={(value) => update("quantityDelta", value)} />
                <Input label="Motivo" value={forms.stock.reason} onChange={(value) => update("reason", value)} />
              </>
            )}

            {active === "product" && (
              <>
                <Input label="Nombre" value={forms.product.name} onChange={(value) => update("name", value)} placeholder="Edredón King" />
                <Select label="Categoría" value={forms.product.category} onChange={(value) => update("category", value)} options={productCategories} />
                <Input label="Variante / medida / sabor" value={forms.product.variant} onChange={(value) => update("variant", value)} />
                <Input label="Cantidad actual" type="number" value={forms.product.quantity} onChange={(value) => update("quantity", value)} />
                <Input label="Costo unitario" type="number" value={forms.product.unitCost} onChange={(value) => update("unitCost", value)} />
                <Input label="Precio de venta sugerido" type="number" value={forms.product.salePrice} onChange={(value) => update("salePrice", value)} />
                <Input label="Proveedor" value={forms.product.supplier} onChange={(value) => update("supplier", value)} />
              </>
            )}

            {(active === "debt" || active === "debtEdit") && (
              <>
                <Input label="Proveedor / persona" value={forms[active].name} onChange={(value) => update("name", value)} />
                <Input label="Monto inicial" type="number" value={forms[active].initialAmount} onChange={(value) => update("initialAmount", value)} />
                <Input label="Saldo actual" type="number" value={forms[active].currentBalance} onChange={(value) => update("currentBalance", value)} />
                <Input label="Pago mensual" type="number" value={forms[active].monthlyTarget} onChange={(value) => update("monthlyTarget", value)} />
                <Input label="Próximo pago" type="date" value={forms[active].nextPaymentDate} onChange={(value) => update("nextPaymentDate", value)} />
                <Select label="Estado" value={forms[active].status} onChange={(value) => update("status", value)} options={["al día", "atrasado", "crítico"]} />
              </>
            )}

            {active === "closure" && (
              <>
                <DailyClosePreview metrics={store.metrics} />
                <Input label="Fecha" type="date" value={forms.closure.date} onChange={(value) => update("date", value)} />
                <Input label="Dinero real contado" type="number" value={forms.closure.realCash} onChange={(value) => update("realCash", value)} />
                <Select label="Explicación" value={forms.closure.explanation} onChange={(value) => update("explanation", value)} options={["Falta registrar gasto", "Falta registrar ingreso", "Error de transferencia", "Gasto personal no registrado", "Otro"]} />
                <Input label="Nota" value={forms.closure.note} onChange={(value) => update("note", value)} />
              </>
            )}

            <button className="submit-button" type="submit"><Check size={19} /> Guardar</button>
          </form>
        )}
      </aside>
    </div>
  );
}

function DailyClosePreview({ metrics }) {
  return (
    <article className="daily-preview">
      <MetricRow label="Ventas del día" value={metrics.today.sales} positive />
      <MetricRow label="Ingresos manuales" value={metrics.today.incomes} positive />
      <MetricRow label="Egresos" value={metrics.today.expenses} negative />
      <MetricRow label="Costo mercadería vendido" value={metrics.today.cost} />
      <MetricRow label="Ganancia real del día" value={metrics.today.profit} positive />
      <MetricRow label="Pagos de deuda" value={metrics.today.debtPayments} />
      <MetricRow label="Caja esperada" value={metrics.totalWallets} />
    </article>
  );
}

function QuickMovementFields({ active, forms, update, store }) {
  const isExpense = active === "expense" || active === "debtPayment";
  const form = forms.expense;

  if (active === "income") {
    return (
      <>
        <Input label="Monto" type="number" value={forms.income.amount} onChange={(value) => update("amount", value)} />
        <Input label="Concepto" value={forms.income.concept} onChange={(value) => update("concept", value)} placeholder="Ej. Transferencia recibida" />
        <Select label="Categoría" value={forms.income.category} onChange={(value) => update("category", value)} options={["Edredones", "Gomitas", "Otro ingreso", "Aporte personal", "Cobro pendiente"]} />
        <Select label="Medio de pago" value={forms.income.paymentMethod} onChange={(value) => update("paymentMethod", value)} options={paymentMethods} />
        <Select label="Caja destino" value={forms.income.walletDestination} onChange={(value) => update("walletDestination", value)} options={walletOptions()} />
        <Distribution total={0} cost={0} debtFund={0} />
      </>
    );
  }

  return (
    <>
      <Input label="Monto" type="number" value={form.amount} onChange={(value) => update("amount", value)} />
      <Input label="Concepto" value={form.concept} onChange={(value) => update("concept", value)} placeholder="Ej. Nafta, comida, proveedor" />
      <Select label="Categoría" value={active === "debtPayment" ? "Pago deuda" : form.category} onChange={(value) => update("category", value)} options={expenseCategories} />
      <Select label="Medio de pago" value={form.paymentMethod} onChange={(value) => update("paymentMethod", value)} options={paymentMethods} />
      <Select label="Caja origen" value={form.walletOrigin} onChange={(value) => update("walletOrigin", value)} options={walletOptions()} />
      <Select label="Tipo" value={form.spendingType} onChange={(value) => update("spendingType", value)} options={["necesario", "evitable"]} />
      {(active === "debtPayment" || form.category === "Pago deuda") && (
        <Select label="Deuda vinculada" value={form.debtId} onChange={(value) => update("debtId", value)} options={store.data.debts.map((item) => ({ value: item.id, label: item.name }))} />
      )}
      {isExpense && <Distribution total={0} cost={0} debtFund={0} />}
    </>
  );
}

function Distribution({ total, cost, debtFund }) {
  return (
    <article className="distribution">
      <h3>Distribución automática</h3>
      <MetricRow label="Costo mercadería" value={cost} />
      <MetricRow label="Ganancia" value={total - cost} positive />
      <MetricRow label="Fondo deuda" value={debtFund} />
    </article>
  );
}

function Input({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  const normalized = options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : option,
  );
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Seleccionar</option>
        {normalized.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function walletOptions() {
  return Object.entries(walletLabels).map(([value, label]) => ({ value, label }));
}

function titleForAction(action) {
  return {
    sale: "Registrar venta",
    income: "Registrar ingreso",
    expense: "Registrar egreso",
    stock: "Ajustar stock",
    debtPayment: "Pago de deuda",
    debt: "Registrar deuda",
    debtEdit: "Editar deuda",
    product: "Agregar producto",
    closure: "Cerrar día",
  }[action];
}

function FloatingActionButton({ onClick }) {
  return (
    <button className="fab" type="button" onClick={onClick} aria-label="Nuevo movimiento">
      <Plus size={28} />
    </button>
  );
}

function BottomNav({ activeTab, setActiveTab }) {
  return (
    <nav className="bottom-nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button type="button" className={activeTab === item.id ? "active" : ""} key={item.id} onClick={() => setActiveTab(item.id)}>
            <Icon size={21} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function EmptyState({ title, text }) {
  return (
    <article className="empty-state">
      <div className="mini-icon blue"><ClipboardList size={22} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

export default App;
