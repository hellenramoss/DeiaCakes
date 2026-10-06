import { Customer, Order, Payment, Product } from "../types";
import { hasSupabase, supabase } from "./supabase";

type AppData = {
  products: Product[];
  customers: Customer[];
  orders: Order[];
};

type PendingChange =
  | { type: "product"; value: Product }
  | { type: "customer"; value: Customer }
  | { type: "order"; value: Order }
  | { type: "removeOrder"; id: string };

const STORAGE_KEY = "deia-cakes-data-v1";
const PENDING_KEY = "deia-cakes-pending-v1";

const seed: AppData = {
  products: [],
  customers: [],
  orders: []
};

function readLocal(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seed;

  try {
    return JSON.parse(raw) as AppData;
  } catch {
    return seed;
  }
}

function writeLocal(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function readPending(): PendingChange[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as PendingChange[];
  } catch {
    return [];
  }
}

function writePending(items: PendingChange[]) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("deia-pending-change"));
}

function queueChange(change: PendingChange) {
  const pending = readPending();

  if (change.type === "product") {
    const filtered = pending.filter((item) => !(item.type === "product" && item.value.id === change.value.id));
    writePending([...filtered, change]);
    return;
  }

  if (change.type === "customer") {
    const filtered = pending.filter((item) => !(item.type === "customer" && item.value.id === change.value.id));
    writePending([...filtered, change]);
    return;
  }

  if (change.type === "order") {
    const filtered = pending.filter((item) =>
      !(item.type === "order" && item.value.id === change.value.id) &&
      !(item.type === "removeOrder" && item.id === change.value.id)
    );
    writePending([...filtered, change]);
    return;
  }

  const filtered = pending.filter((item) =>
    !(item.type === "order" && item.value.id === change.id) &&
    !(item.type === "removeOrder" && item.id === change.id)
  );
  writePending([...filtered, change]);
}

function updateLocalProduct(product: Product) {
  const data = readLocal();
  const index = data.products.findIndex((item) => item.id === product.id);
  if (index >= 0) data.products[index] = product;
  else data.products.push(product);
  writeLocal(data);
}

function updateLocalCustomer(customer: Customer) {
  const data = readLocal();
  const index = data.customers.findIndex((item) => item.id === customer.id);
  if (index >= 0) data.customers[index] = customer;
  else data.customers.push(customer);

  data.orders = data.orders.map((order) =>
    order.customerId === customer.id ? { ...order, customerName: customer.name } : order
  );

  writeLocal(data);
}

function updateLocalOrder(order: Order) {
  const data = readLocal();
  const index = data.orders.findIndex((item) => item.id === order.id);
  if (index >= 0) data.orders[index] = order;
  else data.orders.push(order);
  writeLocal(data);
}

function removeLocalOrder(orderId: string) {
  const data = readLocal();
  data.orders = data.orders.filter((order) => order.id !== orderId);
  writeLocal(data);
}

function mapOrderRow(row: any, items: any[], payments: any[]): Order {
  const orderItems = items
    .filter((item) => item.order_id === row.id)
    .map((item) => ({
      id: item.id,
      productId: item.product_id,
      productName: item.product_name,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price)
    }));

  const orderPayments = payments
    .filter((payment) => payment.order_id === row.id)
    .map((payment) => ({
      id: payment.id,
      orderId: payment.order_id,
      amount: Number(payment.amount),
      method: payment.method,
      paidAt: payment.paid_at
    })) as Payment[];

  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    orderDate: row.order_date,
    deliveryDate: row.delivery_date,
    expectedPaymentDate: row.expected_payment_date ?? "",
    status: row.status,
    paymentStatus: row.payment_status,
    notes: row.notes ?? "",
    items: orderItems,
    payments: orderPayments
  };
}

async function saveProductRemote(product: Product) {
  if (!supabase) throw new Error("Supabase não configurado.");

  const { error } = await supabase.from("products").upsert({
    id: product.id,
    name: product.name,
    category: product.category,
    size: product.size,
    price: product.price,
    cost: product.cost,
    active: product.active
  });

  if (error) throw error;
}

async function saveCustomerRemote(customer: Customer) {
  if (!supabase) throw new Error("Supabase não configurado.");

  const { error } = await supabase.from("customers").upsert({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    origin: customer.origin,
    notes: customer.notes
  });

  if (error) throw error;

  const { error: ordersError } = await supabase
    .from("orders")
    .update({ customer_name: customer.name })
    .eq("customer_id", customer.id);

  if (ordersError) throw ordersError;
}

async function saveOrderRemote(order: Order) {
  if (!supabase) throw new Error("Supabase não configurado.");

  const { error: orderError } = await supabase.from("orders").upsert({
    id: order.id,
    customer_id: order.customerId,
    customer_name: order.customerName,
    order_date: order.orderDate,
    delivery_date: order.deliveryDate,
    expected_payment_date: order.expectedPaymentDate || null,
    status: order.status,
    payment_status: order.paymentStatus,
    notes: order.notes
  });

  if (orderError) throw orderError;

  const { error: deleteItemsError } = await supabase.from("order_items").delete().eq("order_id", order.id);
  if (deleteItemsError) throw deleteItemsError;

  if (order.items.length) {
    const { error: itemsError } = await supabase.from("order_items").insert(
      order.items.map((item) => ({
        id: item.id,
        order_id: order.id,
        product_id: item.productId,
        product_name: item.productName,
        quantity: item.quantity,
        unit_price: item.unitPrice
      }))
    );
    if (itemsError) throw itemsError;
  }

  const { error: deletePaymentsError } = await supabase.from("payments").delete().eq("order_id", order.id);
  if (deletePaymentsError) throw deletePaymentsError;

  if (order.payments.length) {
    const { error: paymentsError } = await supabase.from("payments").insert(
      order.payments.map((payment) => ({
        id: payment.id,
        order_id: order.id,
        amount: payment.amount,
        method: payment.method,
        paid_at: payment.paidAt
      }))
    );
    if (paymentsError) throw paymentsError;
  }
}

async function removeOrderRemote(orderId: string) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}

export function pendingChangesCount() {
  return readPending().length;
}

export async function syncPendingChanges() {
  if (!hasSupabase || !supabase || !navigator.onLine) return 0;

  const pending = readPending();
  if (!pending.length) return 0;

  const remaining: PendingChange[] = [];

  for (let index = 0; index < pending.length; index += 1) {
    const change = pending[index];

    try {
      if (change.type === "product") await saveProductRemote(change.value);
      if (change.type === "customer") await saveCustomerRemote(change.value);
      if (change.type === "order") await saveOrderRemote(change.value);
      if (change.type === "removeOrder") await removeOrderRemote(change.id);
    } catch {
      remaining.push(...pending.slice(index));
      break;
    }
  }

  writePending(remaining);
  return pending.length - remaining.length;
}

export async function loadData(): Promise<AppData> {
  if (!hasSupabase || !supabase || !navigator.onLine) return readLocal();

  await syncPendingChanges();

  const [productsResult, customersResult, ordersResult, itemsResult, paymentsResult] = await Promise.all([
    supabase.from("products").select("*").order("name"),
    supabase.from("customers").select("*").order("name"),
    supabase.from("orders").select("*").order("delivery_date", { ascending: true }),
    supabase.from("order_items").select("*"),
    supabase.from("payments").select("*")
  ]);

  const error =
    productsResult.error ||
    customersResult.error ||
    ordersResult.error ||
    itemsResult.error ||
    paymentsResult.error;

  if (error) {
    const cached = readLocal();
    if (cached.products.length || cached.customers.length || cached.orders.length) return cached;
    throw error;
  }

  const data: AppData = {
    products: (productsResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      size: row.size,
      category: row.category ?? "Outros",
      price: Number(row.price),
      cost: Number(row.cost),
      active: row.active
    })),
    customers: (customersResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone ?? "",
      origin: row.origin ?? "",
      notes: row.notes ?? ""
    })),
    orders: (ordersResult.data ?? []).map((row) =>
      mapOrderRow(row, itemsResult.data ?? [], paymentsResult.data ?? [])
    )
  };

  writeLocal(data);
  return data;
}

export async function saveProduct(product: Product) {
  updateLocalProduct(product);

  if (!hasSupabase || !supabase || !navigator.onLine) {
    queueChange({ type: "product", value: product });
    return;
  }

  await saveProductRemote(product);
}

export async function saveCustomer(customer: Customer) {
  updateLocalCustomer(customer);

  if (!hasSupabase || !supabase || !navigator.onLine) {
    queueChange({ type: "customer", value: customer });
    return;
  }

  await saveCustomerRemote(customer);
}

export async function removeCustomer(customerId: string) {
  const data = readLocal();

  if (data.orders.some((order) => order.customerId === customerId)) {
    throw new Error("Esse cliente possui pedidos cadastrados e não pode ser excluído. O histórico foi preservado.");
  }

  if (!hasSupabase || !supabase || !navigator.onLine) {
    throw new Error("Para excluir cliente, conecte-se à internet.");
  }

  const { count, error: ordersError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId);

  if (ordersError) throw ordersError;
  if ((count ?? 0) > 0) {
    throw new Error("Esse cliente possui pedidos cadastrados e não pode ser excluído. O histórico foi preservado.");
  }

  const { error } = await supabase.from("customers").delete().eq("id", customerId);
  if (error) throw error;

  data.customers = data.customers.filter((customer) => customer.id !== customerId);
  writeLocal(data);
}

export async function saveOrder(order: Order) {
  updateLocalOrder(order);

  if (!hasSupabase || !supabase || !navigator.onLine) {
    queueChange({ type: "order", value: order });
    return;
  }

  await saveOrderRemote(order);
}

export async function removeOrder(orderId: string) {
  removeLocalOrder(orderId);

  if (!hasSupabase || !supabase || !navigator.onLine) {
    queueChange({ type: "removeOrder", id: orderId });
    return;
  }

  await removeOrderRemote(orderId);
}
