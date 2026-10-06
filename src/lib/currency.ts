const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export function parseCurrencyInput(value: string) {
  const normalized = value
    .replace(/\s/g, "")
    .replace(/R\$/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrencyInput(value: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
