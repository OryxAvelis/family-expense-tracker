import { createECDH, createHash } from "node:crypto";

import {
  sendNotification,
  setVapidDetails,
  type PushSubscription,
} from "web-push";

import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

const PUSH_SUBSCRIPTIONS_META_KEY = "delivery_push_subscriptions";
const MAX_PUSH_SUBSCRIPTIONS = 24;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+={0,2}$/;
const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
type PushRole = "admin" | "delivery" | "member";

type StoredPushSubscription = PushSubscription & {
  userId: number;
  role: PushRole;
  createdAt: string;
};

function derivedVapidKeys() {
  const serverSecret = (
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();
  if (!serverSecret) return null;
  const digest = createHash("sha256")
    .update(`family-expense-tracker:vapid:v1:${serverSecret}`)
    .digest("hex");
  const one = BigInt(1);
  const scalar = (BigInt(`0x${digest}`) % (P256_ORDER - one)) + one;
  const privateKeyBytes = Buffer.from(scalar.toString(16).padStart(64, "0"), "hex");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateKeyBytes);
  return {
    publicKey: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
    privateKey: privateKeyBytes.toString("base64url"),
  };
}

function vapidConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() || "https://family-expense-tracker-gamma-five.vercel.app";

  if (publicKey && privateKey) return { publicKey, privateKey, subject };
  const derived = derivedVapidKeys();
  return derived ? { ...derived, subject } : null;
}

export function getPushPublicKey() {
  return vapidConfiguration()?.publicKey ?? null;
}

function isValidSubscription(value: unknown): value is PushSubscription {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (typeof candidate.endpoint !== "string" || candidate.endpoint.length > 2048) return false;
  try {
    if (new URL(candidate.endpoint).protocol !== "https:") return false;
  } catch {
    return false;
  }
  if (
    candidate.expirationTime !== undefined &&
    candidate.expirationTime !== null &&
    typeof candidate.expirationTime !== "number"
  ) {
    return false;
  }
  const p256dh = candidate.keys?.p256dh;
  const auth = candidate.keys?.auth;
  return (
    typeof p256dh === "string" &&
    p256dh.length >= 40 &&
    p256dh.length <= 256 &&
    BASE64_URL_PATTERN.test(p256dh) &&
    typeof auth === "string" &&
    auth.length >= 12 &&
    auth.length <= 128 &&
    BASE64_URL_PATTERN.test(auth)
  );
}

async function readSubscriptions() {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("app_meta")
    .select("value")
    .eq("key", PUSH_SUBSCRIPTIONS_META_KEY)
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!data?.value) return [] as StoredPushSubscription[];

  try {
    const parsed = JSON.parse(data.value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is Omit<StoredPushSubscription, "role"> & { role?: unknown } =>
        isValidSubscription(entry) &&
        Number.isInteger((entry as StoredPushSubscription).userId) &&
        typeof (entry as StoredPushSubscription).createdAt === "string",
    ).map((entry) => ({
      ...entry,
      role: entry.role === "admin"
        ? "admin" as const
        : entry.role === "member"
          ? "member" as const
          : "delivery" as const,
    }));
  } catch {
    return [];
  }
}

async function writeSubscriptions(subscriptions: StoredPushSubscription[]) {
  const { error } = await getSupabaseAdmin()
    .from("app_meta")
    .upsert(
      {
        key: PUSH_SUBSCRIPTIONS_META_KEY,
        value: JSON.stringify(subscriptions.slice(-MAX_PUSH_SUBSCRIPTIONS)),
      },
      { onConflict: "key" },
    );
  throwIfSupabaseError(error);
}

export async function savePushSubscription(userId: number, role: PushRole, value: unknown) {
  if (!isValidSubscription(value)) throw new Error("Abonnement de notification invalide.");
  const subscriptions = await readSubscriptions();
  const next = subscriptions.filter((entry) => entry.endpoint !== value.endpoint);
  next.push({
    endpoint: value.endpoint,
    expirationTime: value.expirationTime ?? null,
    keys: value.keys,
    userId,
    role,
    createdAt: new Date().toISOString(),
  });
  await writeSubscriptions(next);
}

export async function removePushSubscription(userId: number, endpoint: unknown) {
  if (typeof endpoint !== "string" || endpoint.length > 2048) {
    throw new Error("Abonnement de notification invalide.");
  }
  const subscriptions = await readSubscriptions();
  await writeSubscriptions(
    subscriptions.filter((entry) => entry.userId !== userId || entry.endpoint !== endpoint),
  );
}

async function notifyRole(
  role: PushRole,
  message: { title: string; body: string; url: string; tag: string },
) {
  const vapid = vapidConfiguration();
  if (!vapid) return 0;

  try {
    const subscriptions = await readSubscriptions();
    const { data: activeUsers, error: activeUsersError } = await getSupabaseAdmin()
      .from("family_users")
      .select("id")
      .eq("role", role)
      .eq("active", true);
    throwIfSupabaseError(activeUsersError);
    const activeUserIds = new Set((activeUsers ?? []).map((user) => Number(user.id)));
    const targets = subscriptions.filter(
      (subscription) => subscription.role === role && activeUserIds.has(subscription.userId),
    );
    if (!targets.length) return 0;
    setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    const payload = JSON.stringify(message);
    const staleEndpoints = new Set<string>();

    await Promise.all(
      targets.map(async (subscription) => {
        try {
          await sendNotification(subscription, payload, { TTL: 60 * 60, urgency: "high" });
        } catch (error) {
          const statusCode =
            typeof error === "object" && error && "statusCode" in error
              ? Number(error.statusCode)
              : 0;
          if (statusCode === 404 || statusCode === 410) staleEndpoints.add(subscription.endpoint);
        }
      }),
    );

    if (staleEndpoints.size) {
      await writeSubscriptions(subscriptions.filter((entry) => !staleEndpoints.has(entry.endpoint)));
    }
    return targets.length - staleEndpoints.size;
  } catch {
    // Notification failures must never block the action that triggered them.
    return 0;
  }
}

export async function notifyMembersOfShoppingReminder() {
  const reminders = [
    {
      title: "Il manque quelque chose à la maison ?",
      body: "Ajoutez votre commande maintenant pour ne rien oublier.",
    },
    {
      title: "Petit rappel courses",
      body: "Pain, lait, légumes… vérifiez les besoins de la maison en quelques secondes.",
    },
    {
      title: "Nouveau dans Dépenses famille",
      body: "Les essais Pro nécessitent maintenant l’accord de Youssef, avec un suivi clair.",
    },
    {
      title: "Votre panier vous attend",
      body: "Ouvrez le catalogue et envoyez les produits dont la famille a besoin.",
    },
  ];
  const slot = Math.floor(Date.now() / (3 * 60 * 60 * 1000));
  const reminder = reminders[slot % reminders.length];
  return notifyRole("member", {
    ...reminder,
    url: "/membre",
    tag: "family-shopping-reminder",
  });
}

export async function notifyDeliveryOfNewOrder({
  cartId,
  memberName,
  itemCount,
  hasMissingProducts,
}: {
  cartId: number;
  memberName: string;
  itemCount: number;
  hasMissingProducts: boolean;
}) {
  const itemLabel = `${itemCount} article${itemCount === 1 ? "" : "s"}`;
  await notifyRole("delivery", {
      title: `Nouvelle commande · ${memberName}`,
      body: hasMissingProducts
        ? `${itemLabel} et un commentaire à vérifier.`
        : `${itemLabel} à acheter.`,
      url: "/livreur",
      tag: `family-cart-${cartId}`,
  });
}

export async function notifyAdminOfPlanRequest({
  paymentId,
  memberName,
  scope,
  plan,
  amountCents,
  requestType = "payment",
}: {
  paymentId: string;
  memberName: string;
  scope: "family" | "personal";
  plan: "plus" | "pro";
  amountCents: number;
  requestType?: "payment" | "trial";
}) {
  const amount = new Intl.NumberFormat("fr-MA", { style: "currency", currency: "MAD" }).format(amountCents / 100);
  await notifyRole("admin", {
    title: `${requestType === "trial" ? "Demande d’essai" : "Demande de forfait"} · ${memberName}`,
    body: requestType === "trial"
      ? "Essai personnel PRO de 7 jours à approuver."
      : `${scope === "family" ? "Participation familiale" : "Forfait personnel"} ${plan.toUpperCase()} · ${amount}`,
    url: "/admin",
    tag: `plan-request-${paymentId}`,
  });
}
