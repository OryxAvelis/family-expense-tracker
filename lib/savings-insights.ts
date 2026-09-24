import { AMOUNT_REQUEST_SENTINEL_CENTS } from "./spending";

export const INSIGHT_WINDOW_DAYS = 180;
type Joined<T> = T | T[] | null;
export type InsightRow = {
  id: number; cart_id: number; product_id: number; requested_unit_price_cents: number;
  actual_unit_price_cents: number; quantity_hundredths: number;
  carts: Joined<{ completed_at: string }>;
  products: Joined<{ name_fr: string; unit_price_cents: number; unit: string; package_size: string | null }>;
};
type PriceInsight = { name: string; unit: string; package_size: string | null; samples: number };
export type SavingsInsights = {
  locked: boolean;
  window?: { from: string; to: string; purchases: number; price_samples: number; excluded_amount_purchases: number };
  expensive: Array<PriceInsight & { current_cents: number; average_cents: number; increase_percent: number }>;
  predictions: Array<{ name: string; next_date: string; purchases: number }>;
  savings: Array<PriceInsight & { possible_cents: number; best_price_cents: number }>;
};

export function calculateSavingsInsights(rows: readonly InsightRow[], from: string, to: string): SavingsInsights {
  const one = <T,>(value: Joined<T>) => Array.isArray(value) ? value[0] : value;
  const grouped = new Map<number, { name: string; current: number; unit: string; package_size: string | null; prices: Map<number, number>; dates: Set<string> }>();
  const purchases = new Set<number>();
  let excluded = 0;
  // Stable ordering also handles duplicate product rows from one order deterministically.
  const sorted = [...rows].sort((a, b) => (one(a.carts)?.completed_at ?? "").localeCompare(one(b.carts)?.completed_at ?? "") || a.id - b.id);
  for (const row of sorted) {
    const cart = one(row.carts), product = one(row.products);
    if (!cart || !product || !Number.isFinite(Date.parse(cart.completed_at)) || Date.parse(cart.completed_at) < Date.parse(from) || Date.parse(cart.completed_at) > Date.parse(to)) continue;
    if (!Number.isSafeInteger(row.actual_unit_price_cents) || row.actual_unit_price_cents <= 0 || !Number.isSafeInteger(row.quantity_hundredths) || row.quantity_hundredths <= 0) continue;
    purchases.add(row.cart_id);
    const item = grouped.get(row.product_id) ?? { name: product.name_fr, current: product.unit_price_cents, unit: product.unit, package_size: product.package_size, prices: new Map<number, number>(), dates: new Set<string>() };
    item.dates.add(cart.completed_at.slice(0, 10));
    if (row.requested_unit_price_cents === AMOUNT_REQUEST_SENTINEL_CENTS) excluded += 1;
    else item.prices.set(row.cart_id, row.actual_unit_price_cents);
    grouped.set(row.product_id, item);
  }
  const expensive: SavingsInsights["expensive"] = [], savings: SavingsInsights["savings"] = [], predictions: SavingsInsights["predictions"] = [];
  let samples = 0;
  for (const item of grouped.values()) {
    const prices = [...item.prices.values()];
    samples += prices.length;
    if (prices.length >= 2 && Number.isSafeInteger(item.current) && item.current > 0) {
      const info = { name: item.name, unit: item.unit, package_size: item.package_size, samples: prices.length };
      const average = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
      if (item.current > average * 1.15) expensive.push({ ...info, current_cents: item.current, average_cents: average, increase_percent: Math.round((item.current / average - 1) * 100) });
      const best = Math.min(...prices);
      if (item.current > best) savings.push({ ...info, possible_cents: item.current - best, best_price_cents: best });
    }
    const dates = [...item.dates].sort();
    if (dates.length >= 2) {
      const averageDays = Math.max(1, Math.round((Date.parse(dates.at(-1)!) - Date.parse(dates[0])) / 86_400_000 / (dates.length - 1)));
      predictions.push({ name: item.name, next_date: new Date(Date.parse(dates.at(-1)!) + averageDays * 86_400_000).toISOString().slice(0, 10), purchases: dates.length });
    }
  }
  return {
    locked: false, window: { from, to, purchases: purchases.size, price_samples: samples, excluded_amount_purchases: excluded },
    expensive: expensive.sort((a, b) => b.increase_percent - a.increase_percent || a.name.localeCompare(b.name)).slice(0, 5),
    savings: savings.sort((a, b) => b.possible_cents - a.possible_cents || a.name.localeCompare(b.name)).slice(0, 5),
    predictions: predictions.sort((a, b) => a.next_date.localeCompare(b.next_date) || a.name.localeCompare(b.name)).slice(0, 5),
  };
}
