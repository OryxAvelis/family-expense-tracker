import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const FAMILY_WALLET_META_KEY = "family_wallet_v1";

export type FamilyWalletTransaction = {
  id: string;
  type: "contribution" | "order";
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
        type: entry.type === "order" ? "order" as const : "contribution" as const,
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
    spentCents += debitCents;
    effectiveTransactions.push({ ...transaction, amount_cents: -debitCents });
  }

  return { balanceCents, creditedCents, spentCents, transactions: effectiveTransactions };
}

async function readFamilyWallet() {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("app_meta").select("value").eq("key", FAMILY_WALLET_META_KEY).maybeSingle();
  throwIfSupabaseError(error);
  return parseFamilyWallet(data?.value);
}

async function writeFamilyWallet(transactions: FamilyWalletTransaction[]) {
  const db = getSupabaseAdmin();
  const { error } = await db.from("app_meta").upsert(
    { key: FAMILY_WALLET_META_KEY, value: JSON.stringify(transactions.slice(-500)) },
    { onConflict: "key" },
  );
  throwIfSupabaseError(error);
}

export async function addFamilyWalletTransaction(transaction: FamilyWalletTransaction) {
  const transactions = await readFamilyWallet();
  if (transactions.some((entry) => entry.id === transaction.id)) return;
  await writeFamilyWallet([...transactions, transaction]);
}

export async function removeFamilyWalletTransaction(transactionId: string) {
  const transactions = await readFamilyWallet();
  const remaining = transactions.filter((entry) => entry.id !== transactionId);
  if (remaining.length === transactions.length) return false;
  await writeFamilyWallet(remaining);
  return true;
}

export async function updateFamilyWalletOrderAmount(cartId: number, amountCents: number) {
  const transactions = await readFamilyWallet();
  const transactionId = `order-${cartId}`;
  const index = transactions.findIndex((entry) => entry.id === transactionId);
  if (index < 0) return false;
  transactions[index] = { ...transactions[index], amount_cents: -Math.abs(amountCents) };
  await writeFamilyWallet(transactions);
  return true;
}
