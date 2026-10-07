import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X
} from "lucide-react";
import { formatCurrency, formatCurrencyInput, parseCurrencyInput } from "./lib/currency";
import { hasSupabase, supabase } from "./lib/supabase";
import {
  loadData,
  pendingChangesCount,
  removeCustomer,
  removeOrder,
  saveCustomer,
  saveOrder,
  saveProduct,
  syncPendingChanges
} from "./lib/storage";
import AppLoader from "./components/AppLoader";
import { notifyUpcomingDeliveries, showAppNotification } from "./lib/notifications";
import {
  Customer,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentMethod,
  PaymentStatus,
  Product
} from "./types";

type Tab = "inicio" | "pedidos" | "clientes" | "produtos" | "receber" | "producao";

const orderStatuses: OrderStatus[] = ["Encomendado", "Em produção", "Pronto", "Entregue", "Cancelado"];
const paymentMethods: PaymentMethod[] = ["Pix", "Dinheiro", "Cartão", "Outro"];

function uid() {
  return crypto.randomUUID();
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function orderTotal(order: Order) {
  return order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function amountPaid(order: Order) {
  return order.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

function amountDue(order: Order) {
  return Math.max(0, orderTotal(order) - amountPaid(order));
}

function actualPaymentDate(order: Order) {
  if (paymentStatusFrom(order) !== "Pago" || order.payments.length === 0) return "";
  return [...order.payments]
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    .at(-1)?.paidAt ?? "";
}

function paymentStatusFrom(order: Order): PaymentStatus {
  const total = orderTotal(order);
  const paid = amountPaid(order);

  if (paid <= 0) return "Pendente";
  if (paid + 0.009 >= total) return "Pago";
  return "Parcial";
}

function badgeClass(value: string) {
  const normalized = value.toLowerCase();

  if (normalized.includes("pago") || normalized.includes("entregue") || normalized.includes("pronto")) return "badge success";
  if (normalized.includes("parcial") || normalized.includes("produção") || normalized.includes("encomendado")) return "badge warning";
  if (normalized.includes("cancelado")) return "badge muted";
  return "badge danger";
}

export default function App({ logoSrc }: { logoSrc?: string }) {
  const [tab, setTab] = useState<Tab>("inicio");
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [productModal, setProductModal] = useState(false);
  const [customerModal, setCustomerModal] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [loaderMessage, setLoaderMessage] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(pendingChangesCount());

  async function refresh() {
    setLoading(true);
    try {
      const data = await loadData();
      setProducts(data.products);
      setCustomers(data.customers);
      setOrders(data.orders);
      void notifyUpcomingDeliveries(data.orders);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar os dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    let refreshTimer = 0;
    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => refresh(), 180);
    };

    const channel = client
      .channel("deia-cakes-data-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        scheduleRefresh();
        if (document.hidden) {
          void showAppNotification(
            "Pedido atualizado",
            "Houve uma alteração nos pedidos do Déia Cake.",
            "orders-updated"
          );
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, scheduleRefresh)
      .subscribe();

    return () => {
      window.clearTimeout(refreshTimer);
      client.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const updatePending = () => setPendingCount(pendingChangesCount());

    const handleOffline = () => {
      setOnline(false);
      updatePending();
    };

    const handleOnline = async () => {
      setOnline(true);
      const synced = await syncPendingChanges();
      updatePending();
      await refresh();
      if (synced > 0) notify(`${synced} alteração(ões) sincronizada(s).`);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("deia-pending-change", updatePending);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("deia-pending-change", updatePending);
    };
  }, []);

  function notify(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2800);
  }

  async function handleProductSave(product: Product) {
    setLoaderMessage("Salvando produto...");
    try {
      await saveProduct(product);
      await refresh();
      setProductModal(false);
      setEditingProduct(null);
      notify("Produto salvo.");
    } finally {
      setLoaderMessage(null);
    }
  }

  async function handleCustomerSave(customer: Customer) {
    setLoaderMessage("Salvando cliente...");
    try {
      await saveCustomer(customer);
      await refresh();
      setCustomerModal(false);
      setEditingCustomer(null);
      notify("Cliente salvo.");
    } finally {
      setLoaderMessage(null);
    }
  }

  async function handleDeleteCustomer(customer: Customer) {
    if (!window.confirm(`Excluir o cliente ${customer.name}?`)) return;

    setLoaderMessage("Excluindo cliente...");
    try {
      await removeCustomer(customer.id);
      await refresh();
      setCustomerModal(false);
      setEditingCustomer(null);
      notify("Cliente excluído.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível excluir o cliente.");
    } finally {
      setLoaderMessage(null);
    }
  }

  async function handleOrderSave(order: Order) {
    setLoaderMessage("Salvando pedido...");
    try {
      const normalized = { ...order, paymentStatus: paymentStatusFrom(order) };
      await saveOrder(normalized);
      await refresh();
      setOrderModal(false);
      setEditingOrder(null);
      notify("Pedido salvo.");
    } finally {
      setLoaderMessage(null);
    }
  }

  async function handlePaymentSave(order: Order, payment: Payment) {
    setLoaderMessage("Registrando pagamento...");
    try {
      const updated = {
        ...order,
        payments: [...order.payments, payment]
      };
      updated.paymentStatus = paymentStatusFrom(updated);

      await saveOrder(updated);
      await refresh();
      setPaymentOrder(null);
      notify("Pagamento registrado.");
    } finally {
      setLoaderMessage(null);
    }
  }

  async function handleDeleteOrder(order: Order) {
    if (!window.confirm(`Excluir o pedido de ${order.customerName}?`)) return;
    setLoaderMessage("Excluindo pedido...");
    try {
      await removeOrder(order.id);
      await refresh();
      notify("Pedido excluído.");
    } finally {
      setLoaderMessage(null);
    }
  }

  const currentMonth = isoToday().slice(0, 7);
  const monthOrders = useMemo(
    () => orders.filter((order) => order.orderDate.startsWith(currentMonth) && order.status !== "Cancelado"),
    [orders, currentMonth]
  );

  const monthRevenue = monthOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const monthReceived = monthOrders.reduce((sum, order) => sum + amountPaid(order), 0);
  const totalDue = orders
    .filter((order) => order.status !== "Cancelado")
    .reduce((sum, order) => sum + amountDue(order), 0);
  const monthUnits = monthOrders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );

  const menu = [
    { id: "inicio" as Tab, label: "Início", icon: LayoutDashboard },
    { id: "pedidos" as Tab, label: "Pedidos", icon: ClipboardList },
    { id: "receber" as Tab, label: "A receber", icon: WalletCards },
    { id: "producao" as Tab, label: "Produção", icon: PackageCheck },
    { id: "clientes" as Tab, label: "Clientes", icon: UsersRound },
    { id: "produtos" as Tab, label: "Produtos", icon: ShoppingBag }
  ];

  return (
    <div className="app-shell">
      {loaderMessage && <AppLoader message={loaderMessage} logoSrc={logoSrc} />}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <strong>Deia Cakes</strong>
            <span>Controle de vendas</span>
          </div>
        </div>

        <nav>
          {menu.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={tab === item.id ? "nav-item active" : "nav-item"}
                onClick={() => setTab(item.id)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="data-mode">
          <span className={online && hasSupabase ? "status-dot online" : "status-dot"} />
          {!online
            ? pendingCount > 0 ? `Offline · ${pendingCount} pendente(s)` : "Offline · dados salvos"
            : pendingCount > 0 ? `Sincronizando · ${pendingCount}` : hasSupabase ? "Supabase conectado" : "Modo local"}
        </div>
      </aside>

      <main className="main">
        {!online && (
          <div className="offline-banner">
            Sem internet. Você pode continuar usando o app e as alterações serão sincronizadas quando a conexão voltar.
          </div>
        )}
        <header className="mobile-header">
          <div className="brand compact">
            <div className="brand-mark">D</div>
            <div>
              <strong>Deia Cakes</strong>
              <span>Controle de vendas</span>
            </div>
          </div>
        </header>

        {loading ? (
          <AppLoader message="Atualizando dados..." logoSrc={logoSrc} />
        ) : (
          <>
            {tab === "inicio" && (
              <Dashboard
                monthRevenue={monthRevenue}
                monthReceived={monthReceived}
                totalDue={totalDue}
                monthUnits={monthUnits}
                orders={orders}
                onNewOrder={() => {
                  setEditingOrder(null);
                  setOrderModal(true);
                }}
                onPayment={(order) => setPaymentOrder(order)}
              />
            )}

            {tab === "pedidos" && (
              <OrdersView
                orders={orders}
                onNew={() => {
                  setEditingOrder(null);
                  setOrderModal(true);
                }}
                onEdit={(order) => {
                  setEditingOrder(order);
                  setOrderModal(true);
                }}
                onPayment={(order) => setPaymentOrder(order)}
                onDelete={handleDeleteOrder}
              />
            )}

            {tab === "clientes" && (
              <CustomersView
                customers={customers}
                orders={orders}
                onNew={() => {
                  setEditingCustomer(null);
                  setCustomerModal(true);
                }}
                onEdit={(customer) => {
                  setEditingCustomer(customer);
                  setCustomerModal(true);
                }}
              />
            )}

            {tab === "produtos" && (
              <ProductsView
                products={products}
                orders={orders}
                onNew={() => {
                  setEditingProduct(null);
                  setProductModal(true);
                }}
                onEdit={(product) => {
                  setEditingProduct(product);
                  setProductModal(true);
                }}
              />
            )}

            {tab === "receber" && (
              <ReceivablesView orders={orders} onPayment={(order) => setPaymentOrder(order)} />
            )}

            {tab === "producao" && <ProductionView orders={orders} />}
          </>
        )}
      </main>

      <nav className="bottom-nav">
        {menu.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={tab === item.id ? "bottom-item active" : "bottom-item"}
              onClick={() => setTab(item.id)}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {productModal && (
        <ProductModal
          product={editingProduct}
          orders={orders}
          onClose={() => {
            setProductModal(false);
            setEditingProduct(null);
          }}
          onSave={handleProductSave}
        />
      )}

      {customerModal && (
        <CustomerModal
          customer={editingCustomer}
          orders={orders}
          onClose={() => {
            setCustomerModal(false);
            setEditingCustomer(null);
          }}
          onSave={handleCustomerSave}
          onDelete={handleDeleteCustomer}
        />
      )}

      {orderModal && (
        <OrderModal
          products={products}
          customers={customers}
          order={editingOrder}
          onClose={() => {
            setOrderModal(false);
            setEditingOrder(null);
          }}
          onSave={handleOrderSave}
        />
      )}

      {paymentOrder && (
        <PaymentModal
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onSave={handlePaymentSave}
        />
      )}

      {message && <div className="toast">{message}</div>}
    </div>
  );
}

function Dashboard({
  monthRevenue,
  monthReceived,
  totalDue,
  monthUnits,
  orders,
  onNewOrder,
  onPayment
}: {
  monthRevenue: number;
  monthReceived: number;
  totalDue: number;
  monthUnits: number;
  orders: Order[];
  onNewOrder: () => void;
  onPayment: (order: Order) => void;
}) {
  const today = isoToday();
  const upcoming = orders
    .filter((order) => order.deliveryDate >= today && order.status !== "Cancelado" && order.status !== "Entregue")
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))
    .slice(0, 5);

  const overdue = orders
    .filter((order) => amountDue(order) > 0 && order.status !== "Cancelado")
    .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate))
    .slice(0, 4);

  return (
    <section>
      <PageHeader
        eyebrow="Visão geral"
        title="Bom trabalho por aí 🍰"
        subtitle="Tudo o que precisa de atenção aparece primeiro."
        action="Novo pedido"
        onAction={onNewOrder}
      />

      <div className="stats-grid">
        <Stat icon={CircleDollarSign} label="Total vendido no mês" value={formatCurrency(totalDue)} />
        <Stat icon={CheckCircle2} label="Recebido no mês" value={formatCurrency(monthReceived)} />
        <Stat icon={WalletCards} label="Total pendente a receber" value={formatCurrency(monthRevenue)} highlight={monthRevenue > 0} />
        <Stat icon={ShoppingBag} label="Unidades no mês" value={String(monthUnits)} />
      </div>

      <div className="two-columns">
        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Próximas entregas</h2>
              <p>Pedidos que ainda estão em andamento.</p>
            </div>
            <CalendarDays size={22} />
          </div>

          {upcoming.length === 0 ? (
            <Empty text="Nenhuma entrega pendente." />
          ) : (
            <div className="stack-list">
              {upcoming.map((order) => (
                <div className="order-row" key={order.id}>
                  <div className="date-box">
                    <strong>{order.deliveryDate.slice(8, 10)}</strong>
                    <span>{new Date(`${order.deliveryDate}T12:00:00`).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
                  </div>
                  <div className="row-main">
                    <strong>{order.customerName}</strong>
                    <span>{order.items.map((item) => `${item.quantity}x ${item.productName}`).join(" · ")}</span>
                  </div>
                  <span className={badgeClass(order.status)}>{order.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Valores pendentes</h2>
              <p>Quem ainda precisa pagar.</p>
            </div>
            <WalletCards size={22} />
          </div>

          {overdue.length === 0 ? (
            <Empty text="Tudo pago por aqui." />
          ) : (
            <div className="stack-list">
              {overdue.map((order) => (
                <button className="debt-row" key={order.id} onClick={() => onPayment(order)}>
                  <div>
                    <strong>{order.customerName}</strong>
                    <span>{formatDate(order.deliveryDate)} · {order.paymentStatus}</span>
                  </div>
                  <div className="debt-value">
                    <strong>{formatCurrency(amountDue(order))}</strong>
                    <ChevronRight size={18} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function OrdersView({
  orders,
  onNew,
  onEdit,
  onPayment,
  onDelete
}: {
  orders: Order[];
  onNew: () => void;
  onEdit: (order: Order) => void;
  onPayment: (order: Order) => void;
  onDelete: (order: Order) => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("Todos");
  const [paymentStatus, setPaymentStatus] = useState("Todos");

  const filtered = orders
    .filter((order) => {
      const matchesSearch = order.customerName.toLowerCase().includes(search.toLowerCase()) ||
        order.items.some((item) => item.productName.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = status === "Todos" || order.status === status;
      const matchesPaymentStatus = paymentStatus === "Todos" || order.paymentStatus === paymentStatus;
      return matchesSearch && matchesStatus && matchesPaymentStatus;
    })
    .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));

  return (
    <section>
      <PageHeader
        eyebrow="Vendas e encomendas"
        title="Pedidos"
        subtitle="Acompanhe produção, entrega e pagamento sem misturar os status."
        action="Novo pedido"
        onAction={onNew}
      />

      <div className="toolbar orders-toolbar">
        <label className="search-box">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente ou produto" />
        </label>
        <div className="orders-filters">
          <select aria-label="Status do pedido" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option>Todos</option>
            {orderStatuses.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select aria-label="Status do pagamento" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
            <option>Todos</option>
            <option>Pendente</option>
            <option>Parcial</option>
            <option>Pago</option>
          </select>
        </div>
      </div>

      <div className="panel table-panel">
        {filtered.length === 0 ? (
          <Empty text="Nenhum pedido encontrado." />
        ) : (
          <div className="orders-table">
            {filtered.map((order) => (
              <div className="order-card" key={order.id}>
                <button className="order-card-main" onClick={() => onEdit(order)}>
                  <div>
                    <strong>{order.customerName}</strong>
                    <span>{order.items.map((item) => `${item.quantity}x ${item.productName}`).join(" · ")}</span>
                    <small>Entrega: {formatDate(order.deliveryDate)}</small>
                  </div>
                  <div className="order-card-values">
                    <strong>{formatCurrency(orderTotal(order))}</strong>
                    <span className={badgeClass(order.status)}>{order.status}</span>
                    <span className={badgeClass(order.paymentStatus)}>{order.paymentStatus}</span>
                  </div>
                </button>

                <div className="order-actions">
                  {amountDue(order) > 0 && order.status !== "Cancelado" && (
                    <button className="link-button" onClick={() => onPayment(order)}>
                      Receber {formatCurrency(amountDue(order))}
                    </button>
                  )}
                  <button className="icon-button danger-button" aria-label="Excluir pedido" onClick={() => onDelete(order)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CustomersView({
  customers,
  orders,
  onNew,
  onEdit
}: {
  customers: Customer[];
  orders: Order[];
  onNew: () => void;
  onEdit: (customer: Customer) => void;
}) {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.toLowerCase();

  const filtered = customers.filter((customer) =>
    customer.name.toLowerCase().includes(normalizedSearch) ||
    customer.phone.toLowerCase().includes(normalizedSearch) ||
    customer.origin.toLowerCase().includes(normalizedSearch)
  );

  return (
    <section>
      <PageHeader
        eyebrow="Cadastro e histórico"
        title="Clientes"
        subtitle="Veja rapidamente quem compra, quanto já comprou e se existe saldo pendente."
        action="Novo cliente"
        onAction={onNew}
      />

      <div className="toolbar">
        <label className="search-box">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, telefone ou origem" />
        </label>
      </div>

      <div className="cards-grid">
        {filtered.map((customer) => {
          const customerOrders = orders.filter((order) => order.customerId === customer.id && order.status !== "Cancelado");
          const total = customerOrders.reduce((sum, order) => sum + orderTotal(order), 0);
          const due = customerOrders.reduce((sum, order) => sum + amountDue(order), 0);

          return (
            <button className="customer-card customer-card-button" key={customer.id} onClick={() => onEdit(customer)}>
              <div className="avatar"><UserRound size={22} /></div>
              <div className="customer-info">
                <strong>{customer.name}</strong>
                <span>{customer.phone || "Sem telefone"}</span>
                <span>{customer.origin || "Sem origem"}</span>
              </div>
              <div className="customer-numbers">
                <div><span>Total comprado</span><strong>{formatCurrency(total)}</strong></div>
                <div><span>Pendente</span><strong className={due > 0 ? "text-danger" : ""}>{formatCurrency(due)}</strong></div>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && <div className="panel"><Empty text="Nenhum cliente cadastrado." /></div>}
    </section>
  );
}

function ProductsView({
  products,
  orders,
  onNew,
  onEdit
}: {
  products: Product[];
  orders: Order[];
  onNew: () => void;
  onEdit: (product: Product) => void;
}) {
  const quantities = new Map<string, number>();
  orders
    .filter((order) => order.status !== "Cancelado")
    .forEach((order) => {
      order.items.forEach((item) => {
        quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
      });
    });

  return (
    <section>
      <PageHeader
        eyebrow="Catálogo"
        title="Produtos"
        subtitle="Preço e custo ficam cadastrados uma vez e entram automaticamente no pedido."
        action="Novo produto"
        onAction={onNew}
      />

      <div className="cards-grid product-grid">
        {products.map((product) => (
          <button className="product-card product-card-button" key={product.id} onClick={() => onEdit(product)}>
            <div className="product-icon"><ShoppingBag size={22} /></div>
            <div>
              <strong>{product.name}</strong>
              <span>{product.size}</span>
            </div>
            <div className="product-price">{formatCurrency(product.price)}</div>
            <div className="product-meta">
              <span>Custo {formatCurrency(product.cost)}</span>
              <span>{quantities.get(product.id) ?? 0} vendidas</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function ReceivablesView({
  orders,
  onPayment
}: {
  orders: Order[];
  onPayment: (order: Order) => void;
}) {
  const pending = orders
    .filter((order) => amountDue(order) > 0 && order.status !== "Cancelado")
    .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));

  const total = pending.reduce((sum, order) => sum + amountDue(order), 0);

  return (
    <section>
      <PageHeader
        eyebrow="Financeiro"
        title="A receber"
        subtitle={`${pending.length} pedido(s) com saldo pendente · ${formatCurrency(total)} no total`}
      />

      <div className="panel">
        {pending.length === 0 ? (
          <Empty text="Nenhum valor pendente. Tudo pago 🎉" />
        ) : (
          <div className="receivables-list">
            {pending.map((order) => (
              <button className="receivable-card" key={order.id} onClick={() => onPayment(order)}>
                <div className="avatar"><UserRound size={20} /></div>
                <div className="row-main">
                  <strong>{order.customerName}</strong>
                  <span>Pedido de {formatDate(order.orderDate)} · {formatCurrency(orderTotal(order))}</span>
                </div>
                <div className="receivable-value">
                  <span>Falta</span>
                  <strong>{formatCurrency(amountDue(order))}</strong>
                </div>
                <ChevronRight size={19} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProductionView({ orders }: { orders: Order[] }) {
  const [date, setDate] = useState(isoToday());

  const pendingProduction = orders
    .filter((order) => order.status === "Encomendado" || order.status === "Em produção")
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));

  const pendingByDate = pendingProduction.reduce<Record<string, Order[]>>((groups, order) => {
    (groups[order.deliveryDate] ??= []).push(order);
    return groups;
  }, {});

  const items = new Map<string, { name: string; quantity: number }>();
  const dayOrders = orders.filter(
    (order) => order.deliveryDate === date && order.status !== "Cancelado" && order.status !== "Entregue"
  );

  dayOrders.forEach((order) => {
    order.items.forEach((item) => {
      const current = items.get(item.productId);
      items.set(item.productId, {
        name: item.productName,
        quantity: (current?.quantity ?? 0) + item.quantity
      });
    });
  });

  const totalUnits = Array.from(items.values()).reduce((sum, item) => sum + item.quantity, 0);

  return (
    <section>
      <PageHeader
        eyebrow="Organização da cozinha"
        title="Produção"
        subtitle="As quantidades são somadas automaticamente a partir das encomendas."
      />

      <div className="panel production-pending-panel">
        <div className="panel-title">
          <div>
            <h2>Pendências de produção</h2>
            <p>{pendingProduction.length} pedido(s) ainda precisam ser preparados.</p>
          </div>
          <PackageCheck size={22} />
        </div>

        {pendingProduction.length === 0 ? (
          <Empty text="Nenhuma produção pendente." />
        ) : (
          <div className="production-pending-groups">
            {Object.entries(pendingByDate).map(([deliveryDate, dateOrders]) => (
              <div className="production-pending-group" key={deliveryDate}>
                <button type="button" className="production-pending-date" onClick={() => setDate(deliveryDate)}>
                  <span>{formatDate(deliveryDate)}</span>
                  <strong>
                    {dateOrders.reduce(
                      (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
                      0
                    )} un.
                  </strong>
                </button>

                <div className="production-pending-orders">
                  {dateOrders.map((order) => (
                    <div className="production-pending-order" key={order.id}>
                      <div>
                        <strong>{order.customerName}</strong>
                        <span>{order.items.map((item) => `${item.quantity}x ${item.productName}`).join(" · ")}</span>
                      </div>
                      <span className={badgeClass(order.status)}>{order.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="production-date">
        <label>
          <span>Produção para</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <div>
          <strong>{totalUnits}</strong>
          <span>unidades</span>
        </div>
      </div>

      <div className="two-columns">
        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>O que preparar</h2>
              <p>{formatDate(date)}</p>
            </div>
            <PackageCheck size={22} />
          </div>

          {items.size === 0 ? (
            <Empty text="Nada para produzir nesta data." />
          ) : (
            <div className="production-list">
              {Array.from(items.values()).map((item) => (
                <div key={item.name}>
                  <strong>{item.quantity}</strong>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Pedidos do dia</h2>
              <p>{dayOrders.length} encomenda(s)</p>
            </div>
            <ClipboardList size={22} />
          </div>

          <div className="stack-list">
            {dayOrders.map((order) => (
              <div className="simple-row" key={order.id}>
                <div>
                  <strong>{order.customerName}</strong>
                  <span>{order.items.map((item) => `${item.quantity}x ${item.productName}`).join(" · ")}</span>
                </div>
                <span className={badgeClass(order.status)}>{order.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  onAction
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action && (
        <button className="primary-button" onClick={onAction}>
          <Plus size={19} />
          {action}
        </button>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  highlight
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={highlight ? "stat-card highlight" : "stat-card"}>
      <div className="stat-icon"><Icon size={22} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function Modal({
  title,
  subtitle,
  children,
  onClose
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProductModal({
  product,
  orders,
  onClose,
  onSave
}: {
  product: Product | null;
  orders: Order[];
  onClose: () => void;
  onSave: (product: Product) => Promise<void>;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "Outros");
  const [size, setSize] = useState(product?.size ?? "Unidade");
  const [price, setPrice] = useState(product ? formatCurrencyInput(product.price) : "");
  const [cost, setCost] = useState(product ? formatCurrencyInput(product.cost) : "");
  const [active, setActive] = useState(product?.active ?? true);
  const [saving, setSaving] = useState(false);

  const productOrders = product
    ? orders
        .filter((order) => order.status !== "Cancelado" && order.items.some((item) => item.productId === product.id))
        .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    : [];
  const productUnits = productOrders.reduce(
    (sum, order) => sum + order.items
      .filter((item) => item.productId === product?.id)
      .reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  );
  const productRevenue = productOrders.reduce(
    (sum, order) => sum + order.items
      .filter((item) => item.productId === product?.id)
      .reduce((itemSum, item) => itemSum + item.quantity * item.unitPrice, 0),
    0
  );
  const lastSale = productOrders[0]?.orderDate ?? "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onSave({
        id: product?.id ?? uid(),
        name: name.trim(),
        category: category.trim() || "Outros",
        size: size.trim(),
        price: parseCurrencyInput(price),
        cost: parseCurrencyInput(cost),
        active
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={product ? "Editar produto" : "Novo produto"}
      subtitle="Preço e custo em reais. Ex.: 30,00"
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        <label><span>Produto</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Bolo de cenoura" autoFocus required /></label>
        <label><span>Categoria</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Bolos de cenoura" /></label>
        <label><span>Tamanho / unidade</span><input value={size} onChange={(event) => setSize(event.target.value)} placeholder="Unidade" /></label>
        <div className="form-row">
          <label><span>Preço de venda</span><div className="money-input"><span>R$</span><input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0,00" required /></div></label>
          <label><span>Custo estimado</span><div className="money-input"><span>R$</span><input inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0,00" /></div></label>
        </div>
        <label className="product-active-toggle">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          <span>Produto ativo para novos pedidos</span>
        </label>

        {product && (
          <div className="history-section">
            <div className="history-title">
              <strong>Histórico do produto</strong>
              <span>{productOrders.length} pedido(s)</span>
            </div>
            <div className="history-stats">
              <div><span>Unidades vendidas</span><strong>{productUnits}</strong></div>
              <div><span>Faturamento</span><strong>{formatCurrency(productRevenue)}</strong></div>
              <div><span>Última venda</span><strong>{lastSale ? formatDate(lastSale) : "Nenhuma"}</strong></div>
            </div>
            {productOrders.length > 0 && (
              <div className="history-list">
                {productOrders.slice(0, 5).map((order) => {
                  const item = order.items.find((orderItem) => orderItem.productId === product.id);
                  return (
                    <div className="history-row" key={order.id}>
                      <div>
                        <strong>{order.customerName}</strong>
                        <span>{formatDate(order.orderDate)}</span>
                      </div>
                      <span>{item?.quantity ?? 0} un. · {formatCurrency((item?.quantity ?? 0) * (item?.unitPrice ?? 0))}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Salvando..." : product ? "Salvar alterações" : "Salvar produto"}</button></div>
      </form>
    </Modal>
  );
}

function CustomerModal({
  customer,
  orders,
  onClose,
  onSave,
  onDelete
}: {
  customer: Customer | null;
  orders: Order[];
  onClose: () => void;
  onSave: (customer: Customer) => Promise<void>;
  onDelete: (customer: Customer) => Promise<void>;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [origin, setOrigin] = useState(customer?.origin ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const customerOrders = customer
    ? orders
        .filter((order) => order.customerId === customer.id && order.status !== "Cancelado")
        .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
    : [];
  const customerTotal = customerOrders.reduce((sum, order) => sum + orderTotal(order), 0);
  const customerPaid = customerOrders.reduce((sum, order) => sum + amountPaid(order), 0);
  const customerDue = customerOrders.reduce((sum, order) => sum + amountDue(order), 0);


  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onSave({
        id: customer?.id ?? uid(),
        name: name.trim(),
        phone: phone.trim(),
        origin: origin.trim(),
        notes
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={customer ? "Editar cliente" : "Novo cliente"}
      subtitle="A origem pode ser trabalho, escola, rua de casa, indicação..."
      onClose={onClose}
    >
      <form className="form" onSubmit={submit}>
        <label><span>Nome</span><input value={name} onChange={(event) => setName(event.target.value)} autoFocus required /></label>
        <label><span>Telefone / WhatsApp</span><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" /></label>
        <label><span>Origem</span><input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Ex.: trabalho, escola, rua de casa" /></label>
        <label><span>Observações</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} /></label>

        {customer && (
          <div className="history-section">
            <div className="history-title">
              <strong>Histórico do cliente</strong>
              <span>{customerOrders.length} pedido(s)</span>
            </div>
            <div className="history-stats">
              <div><span>Total comprado</span><strong>{formatCurrency(customerTotal)}</strong></div>
              <div><span>Total pago</span><strong>{formatCurrency(customerPaid)}</strong></div>
              <div><span>Saldo pendente</span><strong>{formatCurrency(customerDue)}</strong></div>
            </div>
            {customerOrders.length > 0 ? (
              <div className="history-list">
                {customerOrders.slice(0, 6).map((order) => (
                  <div className="history-row" key={order.id}>
                    <div>
                      <strong>{formatDate(order.orderDate)}</strong>
                      <span>{order.items.map((item) => `${item.quantity}x ${item.productName}`).join(" · ")}</span>
                    </div>
                    <div className="history-row-value">
                      <strong>{formatCurrency(orderTotal(order))}</strong>
                      <span className={badgeClass(order.paymentStatus)}>{order.paymentStatus}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty small">Ainda não há pedidos para este cliente.</div>
            )}
          </div>
        )}

        <div className="form-actions customer-form-actions">
          {customer && (
            <button
              type="button"
              className="secondary-button delete-customer-button"
              disabled={saving || deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await onDelete(customer);
                } finally {
                  setDeleting(false);
                }
              }}
            >
              <Trash2 size={16} /> {deleting ? "Excluindo..." : "Excluir cliente"}
            </button>
          )}
          <div className="form-actions-right">
            <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
            <button className="primary-button" disabled={saving || deleting}>{saving ? "Salvando..." : customer ? "Salvar alterações" : "Salvar cliente"}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function OrderModal({
  products,
  customers,
  order,
  onClose,
  onSave
}: {
  products: Product[];
  customers: Customer[];
  order: Order | null;
  onClose: () => void;
  onSave: (order: Order) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState(order?.customerId ?? "");
  const [orderDate, setOrderDate] = useState(order?.orderDate ?? isoToday());
  const [deliveryDate, setDeliveryDate] = useState(order?.deliveryDate ?? isoToday());
  const [expectedPaymentDate, setExpectedPaymentDate] = useState(order?.expectedPaymentDate ?? "");
  const [status, setStatus] = useState<OrderStatus>(order?.status ?? "Encomendado");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [items, setItems] = useState<OrderItem[]>(order?.items ?? []);
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries((order?.items ?? []).map((item) => [item.id, formatCurrencyInput(item.unitPrice)]))
  );
  const [saving, setSaving] = useState(false);

  function addItem() {
    const first = products.find((product) => product.active);
    if (!first) return;
    const id = uid();
    setItems((current) => [
      {
        id,
        productId: first.id,
        productName: first.name,
        quantity: 1,
        unitPrice: first.price
      },
      ...current
    ]);
    setPriceInputs((current) => ({ ...current, [id]: formatCurrencyInput(first.price) }));
  }

  function changeProduct(itemId: string, productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, productId: product.id, productName: product.name, unitPrice: product.price }
          : item
      )
    );
    setPriceInputs((current) => ({ ...current, [itemId]: formatCurrencyInput(product.price) }));
  }

  function updateItem(itemId: string, changes: Partial<OrderItem>) {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, ...changes } : item));
  }

  function deleteItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
    setPriceInputs((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const customer = customers.find((item) => item.id === customerId);
    if (!customer || items.length === 0) return;

    setSaving(true);
    try {
      await onSave({
        id: order?.id ?? uid(),
        customerId: customer.id,
        customerName: customer.name,
        orderDate,
        deliveryDate,
        expectedPaymentDate,
        status,
        paymentStatus: order?.paymentStatus ?? "Pendente",
        notes,
        items,
        payments: order?.payments ?? []
      });
    } finally {
      setSaving(false);
    }
  }

  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return (
    <Modal title={order ? "Editar pedido" : "Novo pedido"} subtitle="O pagamento é controlado separadamente da entrega." onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          <span>Cliente</span>
          <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
            <option value="">Selecione</option>
            {customers.map((customer) => <option value={customer.id} key={customer.id}>{customer.name}</option>)}
          </select>
        </label>

        {customers.length === 0 && <div className="form-hint">Cadastre um cliente antes de criar o primeiro pedido.</div>}

        <div className="order-date-grid">
          <label>
            <span>Data do pedido</span>
            <div className="compact-date-field">
              <span>{formatDate(orderDate)}</span>
              <input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} required />
            </div>
          </label>
          <label>
            <span>Data de entrega</span>
            <div className="compact-date-field">
              <span>{formatDate(deliveryDate)}</span>
              <input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} required />
            </div>
          </label>
          <label>
            <span>Data pgto. pretendida</span>
            <div className="compact-date-field">
              <span>{expectedPaymentDate ? formatDate(expectedPaymentDate) : "Selecionar"}</span>
              <input type="date" value={expectedPaymentDate} onChange={(event) => setExpectedPaymentDate(event.target.value)} />
            </div>
          </label>
          <label>
            <span>Data pgto. real</span>
            <div className="readonly-date compact-date-display">
              {order && actualPaymentDate(order) ? formatDate(actualPaymentDate(order)) : "Ainda não pago"}
            </div>
          </label>
        </div>

        <label>
          <span>Status do pedido</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as OrderStatus)}>
            {orderStatuses.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <div className="items-header">
          <div><strong>Itens</strong><span>Preço puxado do cadastro, mas pode ser ajustado neste pedido.</span></div>
          <button type="button" className="small-button" onClick={addItem} disabled={products.length === 0}><Plus size={16} /> Adicionar</button>
        </div>

        <div className="order-items">
          {items.map((item) => (
            <div className="order-item-editor" key={item.id}>
              <select value={item.productId} onChange={(event) => changeProduct(item.id, event.target.value)}>
                {products.filter((product) => product.active).map((product) => <option value={product.id} key={product.id}>{product.name} · {product.size}</option>)}
              </select>
              <label><span>Qtd.</span><input type="number" min="1" value={item.quantity || ""} onChange={(event) => {
                const value = event.target.value;
                updateItem(item.id, { quantity: value === "" ? 0 : Math.max(0, Number(value)) });
              }} onBlur={() => {
                if (item.quantity < 1) updateItem(item.id, { quantity: 1 });
              }} /></label>
              <label><span>Valor un.</span><div className="money-input compact-money"><span>R$</span><input inputMode="decimal" value={priceInputs[item.id] ?? ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => {
                const value = event.target.value;
                setPriceInputs((current) => ({ ...current, [item.id]: value }));
                updateItem(item.id, { unitPrice: parseCurrencyInput(value) });
              }} onBlur={() => {
                setPriceInputs((current) => ({ ...current, [item.id]: formatCurrencyInput(item.unitPrice) }));
              }} /></div></label>
              <button type="button" className="icon-button danger-button" onClick={() => deleteItem(item.id)}><Trash2 size={17} /></button>
            </div>
          ))}
          {items.length === 0 && <div className="empty small">Adicione pelo menos um produto.</div>}
        </div>

        <div className="order-total">
          <span>Total do pedido</span>
          <strong>{formatCurrency(total)}</strong>
        </div>

        <label><span>Observações</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Ex.: retirar às 14h, sem azeitona..." /></label>

        <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving || !customerId || items.length === 0}>{saving ? "Salvando..." : "Salvar pedido"}</button></div>
      </form>
    </Modal>
  );
}

function PaymentModal({
  order,
  onClose,
  onSave
}: {
  order: Order;
  onClose: () => void;
  onSave: (order: Order, payment: Payment) => Promise<void>;
}) {
  const due = amountDue(order);
  const [amount, setAmount] = useState(formatCurrencyInput(due));
  const [method, setMethod] = useState<PaymentMethod>("Pix");
  const [paidAt, setPaidAt] = useState(isoToday());
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Math.min(parseCurrencyInput(amount), due);
    if (value <= 0) return;

    setSaving(true);
    try {
      await onSave(order, {
        id: uid(),
        orderId: order.id,
        amount: value,
        method,
        paidAt
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Registrar pagamento" subtitle={order.customerName} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="payment-summary">
          <div><span>Total</span><strong>{formatCurrency(orderTotal(order))}</strong></div>
          <div><span>Já pago</span><strong>{formatCurrency(amountPaid(order))}</strong></div>
          <div className="due"><span>Falta</span><strong>{formatCurrency(due)}</strong></div>
        </div>

        <div className="payment-fields-grid">
          <label>
            <span>Valor recebido</span>
            <div className="money-input">
              <span>R$</span>
              <input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
            </div>
          </label>

          <label>
            <span>Data</span>
            <div className="compact-date-field payment-date-field">
              <span>{formatDate(paidAt)}</span>
              <input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required />
            </div>
          </label>

          <label className="payment-method-field">
            <span>Forma de pagamento</span>
            <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
              {paymentMethods.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>

        <div className="form-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Registrar pagamento"}</button></div>
      </form>
    </Modal>
  );
}
