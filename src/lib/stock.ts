import { supabase } from "./supabase";
import { Product } from "../types";

export type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  date: string;
  kind: string;
  notes: string;
};

export async function loadStock(): Promise<StockMovement[]> {
  if (!supabase || !navigator.onLine) return [];
  const { data, error } = await supabase.from("ready_stock_movements").select("*").order("movement_date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id, productId: row.product_id, productName: row.product_name,
    quantity: Number(row.quantity), date: row.movement_date,
    kind: row.kind, notes: row.notes ?? ""
  }));
}

export function stockByProduct(movements: StockMovement[]) {
  const totals: Record<string, number> = {};
  for (const movement of movements) totals[movement.productId] = (totals[movement.productId] ?? 0) + movement.quantity;
  return totals;
}

export async function addStock(product: Product, quantity: number, date: string, notes: string) {
  if (!supabase || !navigator.onLine) throw new Error("Conecte-se à internet para alterar a pronta-entrega.");
  const { error } = await supabase.rpc("add_ready_stock", {
    p_product_id: product.id, p_quantity: quantity, p_date: date, p_notes: notes
  });
  if (error) throw new Error(error.message);
}
