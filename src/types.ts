export type OrderStatus = "Encomendado" | "Em produção" | "Pronto" | "Entregue" | "Cancelado";
export type PaymentStatus = "Pendente" | "Parcial" | "Pago";
export type PaymentMethod = "Pix" | "Dinheiro" | "Cartão" | "Outro";

export type Product = {
  id: string;
  name: string;
  category: string;
  size: string;
  price: number;
  cost: number;
  active: boolean;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
};

export type OrderItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
};

export type Payment = {
  id: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
};

export type Order = {
  id: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  deliveryDate: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  notes: string;
  items: OrderItem[];
  payments: Payment[];
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  avatarDataUrl: string | null;
  role: "admin" | "user";
  isActive: boolean;
};

export type AppSettings = {
  appName: string;
  logoDataUrl: string | null;
  backgroundDataUrl: string | null;
  backgroundOpacity: number;
};
