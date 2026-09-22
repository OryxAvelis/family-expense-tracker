import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const FAMILY_WALLET_META_KEY = "family_wallet_v1";

export type FamilyWalletTransaction = {
  id: string;
  type: "contribution" | "order" | "return";
  amount_cents: number;
  cart_id: number | null;
  contributor_id?: number | null;
  contributor_name?: string | null;
  created_at: string;
  actor_name: string;
};

const cleanText = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function parseFamilyWallet(value: string | undefined) {
  if (!value) return [] as FamilyWalletTransaction[];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        id: cleanText(entry.id),
        type: entry.type === "order" ? "order" as const : entry.type === "return" ? "return" as const : "contribution" as const,
        amount_cents: Number(entry.amount_cents),
        cart_id: Number.isInteger(Number(entry.cart_id)) && Number(entry.cart_id) > 0 ? Number(entry.cart_id) : null,
        contributor_id: Number.isInteger(Number(entry.contributor_id)) && Number(entry.contributor_id) > 0
          ? Number(entry.contributor_id)
          : null,
        contributor_name: cleanText(entry.contributor_name) || null,
        created_at: cleanText(entry.created_at),
        actor_name: cleanText(entry.actor_name),
      }))
      .filter((entry) => entry.id && Number.isSafeInteger(entry.amount_cents) && entry.amount_cents !== 0 && entry.created_at)
      .slice(-500);
  } catch {
    return [];
  }
}

export function summarizeFamilyWallet(transactions: FamilyWalletTransaction[]) {
  let balanceCents = 0;
  let creditedCents = 0;
  let spentCents = 0;
  let returnedCents = 0;
  const effectiveTransactions: FamilyWalletTransaction[] = [];

  for (const transaction of transactions) {
    if (transaction.amount_cents > 0) {
      balanceCents += transaction.amount_cents;
      creditedCents += transaction.amount_cents;
      effectiveTransactions.push(transaction);
      continue;
    }

    const debitCents = Math.min(-transaction.amount_cents, balanceCents);
    if (debitCents <= 0) continue;
    balanceCents -= debitCents;
    if (transaction.type === "return") returnedCents += debitCents;
    else spentCents += debitCents;
    effectiveTransactions.push({ ...transaction, amount_cents: -debitCents });
  }

  return { balanceCents, creditedCents, spentCents, returnedCents, transactions: effectiveTransactions };
}

export async function addFamilyWalletTransaction(familyId: string, transaction: FamilyWalletTransaction) {
  const { error } = await getSupabaseAdmin().rpc("append_darnaflow_wallet_transaction", {
    p_family_id: familyId,
    p_wallet_key: FAMILY_WALLET_META_KEY,
    p_transaction: transaction,
    p_history_limit: 500,
  });
  throwIfSupabaseError(error);
}

export async function removeFamilyWalletTransaction(familyId: string, transactionId: string) {
  const { data, error } = await getSupabaseAdmin().rpc("remove_darnaflow_wallet_transaction", {
    p_family_id: familyId,
    p_wallet_key: FAMILY_WALLET_META_KEY,
    p_transaction_id: transactionId,
  });
  throwIfSupabaseError(error);
  return Boolean(data);
}

export async function updateFamilyWalletOrderAmount(familyId: string, cartId: number, amountCents: number) {
  const { data, error } = await getSupabaseAdmin().rpc("update_darnaflow_wallet_order_amount", {
    p_family_id: familyId,
    p_wallet_key: FAMILY_WALLET_META_KEY,
    p_transaction_id: `order-${cartId}`,
    p_amount_cents: Math.abs(amountCents),
  });
  throwIfSupabaseError(error);
  return Boolean(data);
}
