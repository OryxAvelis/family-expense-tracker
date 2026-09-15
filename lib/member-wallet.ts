import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

const MEMBER_WALLET_PREFIX = "member_wallet_";

export type MemberWalletTransaction = {
  id: string;
  type: "deposit" | "order" | "task";
  amount_cents: number;
  cart_id: number | null;
  task_id?: string | null;
  created_at: string;
  actor_name: string;
};

const cleanText = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function memberWalletMetaKey(userId: number) {
  return `${MEMBER_WALLET_PREFIX}${userId}`;
}

export function parseMemberWallet(value: string | undefined) {
  if (!value) return [] as MemberWalletTransaction[];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        id: cleanText(entry.id),
        type: entry.type === "order" ? "order" as const : entry.type === "task" ? "task" as const : "deposit" as const,
        amount_cents: Number(entry.amount_cents),
        cart_id: Number.isInteger(Number(entry.cart_id)) && Number(entry.cart_id) > 0 ? Number(entry.cart_id) : null,
        task_id: cleanText(entry.task_id) || null,
        created_at: cleanText(entry.created_at),
        actor_name: cleanText(entry.actor_name),
      }))
      .filter((entry) => entry.id && Number.isSafeInteger(entry.amount_cents) && entry.amount_cents !== 0 && entry.created_at)
      .slice(-300);
  } catch {
    return [];
  }
}

export function summarizeMemberWallet(transactions: MemberWalletTransaction[]) {
  let balanceCents = 0;
  let creditedCents = 0;
  let spentCents = 0;
  const effectiveTransactions: MemberWalletTransaction[] = [];

  for (const transaction of transactions) {
    if (transaction.amount_cents > 0) {
      balanceCents += transaction.amount_cents;
      creditedCents += transaction.amount_cents;
      effectiveTransactions.push(transaction);
      continue;
    }

    const walletDebitCents = Math.min(-transaction.amount_cents, balanceCents);
    if (walletDebitCents <= 0) continue;

    balanceCents -= walletDebitCents;
    spentCents += walletDebitCents;
    effectiveTransactions.push({
      ...transaction,
      amount_cents: -walletDebitCents,
    });
  }

  return {
    balanceCents,
    creditedCents,
    spentCents,
    transactions: effectiveTransactions,
  };
}

export async function addMemberWalletTransaction(memberId: number, transaction: MemberWalletTransaction) {
  const db = getSupabaseAdmin();
  const key = memberWalletMetaKey(memberId);
  const { data, error: readError } = await db.from("app_meta").select("value").eq("key", key).maybeSingle();
  throwIfSupabaseError(readError);
  const transactions = parseMemberWallet(data?.value);
  if (transactions.some((entry) => entry.id === transaction.id)) return;
  const { error } = await db.from("app_meta").upsert(
    { key, value: JSON.stringify([...transactions, transaction].slice(-300)) },
    { onConflict: "key" },
  );
  throwIfSupabaseError(error);
}

export async function removeMemberWalletTransaction(memberId: number, transactionId: string) {
  const db = getSupabaseAdmin();
  const key = memberWalletMetaKey(memberId);
  const { data, error: readError } = await db.from("app_meta").select("value").eq("key", key).maybeSingle();
  throwIfSupabaseError(readError);
  const transactions = parseMemberWallet(data?.value);
  const remaining = transactions.filter((entry) => entry.id !== transactionId);
  if (remaining.length === transactions.length) return false;
  const { error } = await db.from("app_meta").upsert(
    { key, value: JSON.stringify(remaining) },
    { onConflict: "key" },
  );
  throwIfSupabaseError(error);
  return true;
}

export async function updateMemberWalletOrderAmount(memberId: number, cartId: number, amountCents: number) {
  const db = getSupabaseAdmin();
  const key = memberWalletMetaKey(memberId);
  const { data, error: readError } = await db.from("app_meta").select("value").eq("key", key).maybeSingle();
  throwIfSupabaseError(readError);
  const transactions = parseMemberWallet(data?.value);
  const transactionId = `order-${cartId}`;
  const index = transactions.findIndex((entry) => entry.id === transactionId);
  if (index < 0) return false;
  transactions[index] = { ...transactions[index], amount_cents: -Math.abs(amountCents) };
  const { error } = await db.from("app_meta").upsert(
    { key, value: JSON.stringify(transactions.slice(-300)) },
    { onConflict: "key" },
  );
  throwIfSupabaseError(error);
  return true;
}
