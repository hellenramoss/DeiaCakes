import { Customer, Order, Payment, Product } from "../types";
import { hasSupabase, supabase } from "./supabase";

type AppData = {
  products: Product[];
  customers: Customer[];
  orders: Order[];
};

const STORAGE_KEY = "deia-cakes-data-v1";

const seed: AppData = {
  products: [
    { id: "p1", name: "Torta de frango", size: "Média", price: 65, cost: 32, active: true },
    { id: "p2", name: "Torta de palmito", size: "Média", price: 70, cost: 36, active: true },
    { id: "p3", name: "Torta de limão", size: "Média", price: 58, cost: 27, active: true }
  ],
  customers: [],
  orders: []
};

function readLocal(): AppData {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    return JSON.parse(raw) as AppData;
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function writeLocal(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    status: row.status,
    paymentStatus: row.payment_status,
    notes: row.notes ?? "",
    items: orderItems,
    payments: orderPayments
  };
}

export async function loadData(): Promise<AppData> {
  if (!hasSupabase || !supabase) return readLocal();

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

  if (error) throw error;

  return {
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
      address: row.address ?? "",
      notes: row.notes ?? ""
    })),
    orders: (ordersResult.data ?? []).map((row) =>
      mapOrderRow(row, itemsResult.data ?? [], paymentsResult.data ?? [])
    )
  };
}

export async function saveProduct(product: Product) {
  if (!hasSupabase || !supabase) {
    const data = readLocal();
    const index = data.products.findIndex((item) => item.id === product.id);
    if (index >= 0) data.products[index] = product;
    else data.products.push(product);
    writeLocal(data);
    return;
  }

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

export async function saveCustomer(customer: Customer) {
  if (!hasSupabase || !supabase) {
    const data = readLocal();
    const index = data.customers.findIndex((item) => item.id === customer.id);
    if (index >= 0) data.customers[index] = customer;
    else data.customers.push(customer);
    writeLocal(data);
    return;
  }

  const { error } = await supabase.from("customers").upsert({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    notes: customer.notes
  });

  if (error) throw error;
}

export async function saveOrder(order: Order) {
  if (!hasSupabase || !supabase) {
    const data = readLocal();
    const index = data.orders.findIndex((item) => item.id === order.id);
    if (index >= 0) data.orders[index] = order;
    else data.orders.push(order);
    writeLocal(data);
    return;
  }

  const { error: orderError } = await supabase.from("orders").upsert({
    id: order.id,
    customer_id: order.customerId,
    customer_name: order.customerName,
    order_date: order.orderDate,
    delivery_date: order.deliveryDate,
    status: order.status,
    payment_status: order.paymentStatus,
    notes: order.notes
  });

  if (orderError) throw orderError;

  await supabase.from("order_items").delete().eq("order_id", order.id);

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

  await supabase.from("payments").delete().eq("order_id", order.id);

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

export async function removeOrder(orderId: string) {
  if (!hasSupabase || !supabase) {
    const data = readLocal();
    data.orders = data.orders.filter((order) => order.id !== orderId);
    writeLocal(data);
    return;
  }

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) throw error;
}
