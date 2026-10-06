create extension if not exists pgcrypto;

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  size text not null default '',
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  address text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  customer_name text not null,
  order_date date not null default current_date,
  delivery_date date not null,
  status text not null check (status in ('Encomendado', 'Em produção', 'Pronto', 'Entregue', 'Cancelado')),
  payment_status text not null check (payment_status in ('Pendente', 'Parcial', 'Pago')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('Pix', 'Dinheiro', 'Cartão', 'Outro')),
  paid_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists orders_delivery_date_idx on orders(delivery_date);
create index if not exists orders_customer_id_idx on orders(customer_id);
create index if not exists order_items_order_id_idx on order_items(order_id);
create index if not exists payments_order_id_idx on payments(order_id);

alter table products enable row level security;
alter table customers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;

create policy "app products" on products for all using (true) with check (true);
create policy "app customers" on customers for all using (true) with check (true);
create policy "app orders" on orders for all using (true) with check (true);
create policy "app order items" on order_items for all using (true) with check (true);
create policy "app payments" on payments for all using (true) with check (true);
