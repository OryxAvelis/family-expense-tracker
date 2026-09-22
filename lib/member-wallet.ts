import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

const MEMBER_WALLET_PREFIX = "member_wallet_";

export type MemberWalletTransaction = {
  id: string;
  type: "deposit" | "order" | "task" | "transfer" | "return";
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
        type: entry.type === "order"
          ? "order" as const
          : entry.type === "task"
            ? "task" as const
            : entry.type === "transfer"
              ? "transfer" as const
              : entry.type === "return"
                ? "return" as const
              : "deposit" as const,
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
  let returnedCents = 0;
  let transferredCents = 0;
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
    if (transaction.type === "return") returnedCents += walletDebitCents;
    else if (transaction.type === "transfer") transferredCents += walletDebitCents;
    else spentCents += walletDebitCents;
    effectiveTransactions.push({
      ...transaction,
      amount_cents: -walletDebitCents,
    });
  }

  return {
    balanceCents,
    creditedCents,
    spentCents,
    returnedCents,
    transferredCents,
    transactions: effectiveTransactions,
  };
}

export async function addMemberWalletTransaction(familyId: string, memberId: number, transaction: MemberWalletTransaction) {
  const { error } = await getSupabaseAdmin().rpc("append_darnaflow_wallet_transaction", {
    p_family_id: familyId,
    p_wallet_key: memberWalletMetaKey(memberId),
    p_transaction: transaction,
    p_history_limit: 300,
  });
  throwIfSupabaseError(error);
}

export async function removeMemberWalletTransaction(familyId: string, memberId: number, transactionId: string) {
  const { data, error } = await getSupabaseAdmin().rpc("remove_darnaflow_wallet_transaction", {
    p_family_id: familyId,
    p_wallet_key: memberWalletMetaKey(memberId),
    p_transaction_id: transactionId,
  });
  throwIfSupabaseError(error);
  return Boolean(data);
}

export async function updateMemberWalletOrderAmount(familyId: string, memberId: number, cartId: number, amountCents: number) {
  const { data, error } = await getSupabaseAdmin().rpc("update_darnaflow_wallet_order_amount", {
    p_family_id: familyId,
    p_wallet_key: memberWalletMetaKey(memberId),
    p_transaction_id: `order-${cartId}`,
    p_amount_cents: Math.abs(amountCents),
  });
  throwIfSupabaseError(error);
  return Boolean(data);
}
