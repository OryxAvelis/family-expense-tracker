export const AMOUNT_REQUEST_SENTINEL_CENTS = 2_147_483_647;

type PricedItem = { requested_unit_price_cents: number; actual_unit_price_cents: number; quantity_hundredths: number };
export type SpendingItem = PricedItem & { cart_id: number; purchase_status: string };
export type SpendingCart = { id: number; status: string; completed_at: string | null; service_fee_cents: number };

/** Amount-based purchases already store the whole line amount, not a unit price. */
export function purchasedLineTotal(item: PricedItem) {
  const total = item.requested_unit_price_cents === AMOUNT_REQUEST_SENTINEL_CENTS
    ? item.actual_unit_price_cents
    : Math.round(item.actual_unit_price_cents * item.quantity_hundredths / 100);
  return Number.isSafeInteger(total) && total >= 0 ? total : 0;
}

export function monthlySpending(carts: readonly SpendingCart[], items: readonly SpendingItem[]) {
  const completed = new Map(carts.filter((cart) => cart.status === "completed" && cart.completed_at).map((cart) => [cart.id, cart]));
  const months = new Map<string, { total_cents: number; carts_count: number }>();
  for (const cart of completed.values()) {
    const month = cart.completed_at!.slice(0, 7);
    const entry = months.get(month) ?? { total_cents: 0, carts_count: 0 };
    entry.total_cents += cart.service_fee_cents;
    entry.carts_count += 1;
    months.set(month, entry);
  }
  for (const item of items) {
    const cart = completed.get(item.cart_id);
    if (!cart || item.purchase_status !== "bought") continue;
    months.get(cart.completed_at!.slice(0, 7))!.total_cents += purchasedLineTotal(item);
  }
  return [...months].sort(([a], [b]) => b.localeCompare(a)).slice(0, 12).map(([month, value]) => ({ month, ...value }));
}
