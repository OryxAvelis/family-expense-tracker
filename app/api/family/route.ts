import {
  ARCHIVED_DEFAULT_MEMBER_USERNAMES,
  getRequestFamilyUser,
  type FamilyRole,
  type FamilySessionUser,
} from "@/lib/family-auth";
import {
  getPushPublicKey,
  notifyDeliveryOfNewOrder,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/push-notifications";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";
import { effectivePlan, parseServicesState, serviceFeeForPlan, SERVICES_META_KEY } from "@/lib/family-services";
import {
  addMemberWalletTransaction,
  memberWalletMetaKey,
  parseMemberWallet,
  removeMemberWalletTransaction,
  summarizeMemberWallet,
  updateMemberWalletOrderAmount,
} from "@/lib/member-wallet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOUSE_CATALOG_IMAGE_VERSION = "4";
const HOUSE_CATALOG_IMAGES = [
  [1, "Lait entier", "/products/milk-jouda.png"],
  [3, "Huile d’olive", "https://storage.googleapis.com/crftobringo-sharing-ma-prelive/ftp/CRF/images/571202-1-2.jpg"],
  [5, "Sucre", "https://media.carrefour.fr/medias/5127cba8d810345e86422a69e8d91a60/p_1500x1500/3560071410964-photosite-20211005-181348-0.jpg"],
  [6, "Œufs", "https://media.carrefour.fr/medias/9af29a281e983cfe972ae7035de9bcd2/p_1500x1500/3348680000123-photosite-20160831-084739-0.jpg"],
  [7, "Thé vert", "/products/tea-assam-401.png"],
  [8, "Lessive", "https://storage.googleapis.com/crftobringo-sharing-ma-prelive/ftp/CRF/images/704718-1-2.jpg"],
  [9, "Savon", "https://storage.googleapis.com/crftobringo-sharing-ma-prelive/ftp/CRF/images/747002-1-3.jpg"],
  [10, "Dentifrice", "https://storage.googleapis.com/crftobringo-sharing-ma-prelive/ftp/CRF/images/163607-1-2.jpg"],
  [11, "Cahier", "https://media.carrefour.fr/medias/02251d8f86ee43908b21141159cf43e5/p_1500x1500/3616958825946_0.jpg"],
  [12, "Papier cuisine", "https://storage.googleapis.com/crftobringo-sharing-ma-prelive/ftp/CRF/images/530609-1-4.jpg"],
] as const;
const HOUSE_CATALOG_PRICE_UPDATES = [
  [1, "Lait entier", 400],
  [7, "Thé vert", 2000],
] as const;
const HOUSE_CATALOG_PACKAGE_UPDATES = [[1, "Lait entier", "0.5 L"]] as const;
const PRODUCT_CATEGORIES = ["food", "cleaning", "hygiene", "school", "household", "health"];
const PRODUCT_IMAGE_KEY_PATTERN =
  /^product-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/;
const ACTIVE_CART_STATUSES = ["pending", "ready", "shopping"];
const PRODUCT_IMAGE_BUCKET = "product-images";
const DELIVERY_SERVICE_FEE_CENTS = 50;
const MONTHLY_BUDGET_META_KEY = "family_monthly_budget_cents";
const DELIVERY_PAID_META_KEY = "delivery_wallet_paid_cents";
const MAX_MONTHLY_BUDGET_CENTS = 100_000_000;
const MAX_MEMBER_DEPOSIT_CENTS = 100_000_000;
const CART_SERVICE_FEE_PREFIX = "cart_service_fee_";
const OFFLINE_PURCHASE_PREFIX = "offline_purchase_";
const CART_PAYMENT_METHOD_PREFIX = "cart_payment_method_";
const AMOUNT_REQUEST_SENTINEL_CENTS = 2_147_483_647;
const FAMILY_TIME_ZONE = "Africa/Casablanca";

type ActionBody = {
  action?: string;
  actorRole?: "admin" | "delivery" | "member";
  [key: string]: unknown;
};

type UserRow = {
  id: number;
  name: string;
  username: string;
  role: FamilyRole;
  initials: string;
};

type PendingUserRow = Pick<UserRow, "id" | "name" | "username" | "initials"> & {
  created_at: string;
};

type ProductRow = {
  id: number;
  name_fr: string;
  name_ar: string;
  name_en: string;
  category: string;
  unit: string;
  unit_price_cents: number;
  image_position: string;
  image_url: string | null;
  barcode: string | null;
  package_size: string | null;
  external_source: string | null;
  external_id: string | null;
  purchase_count: number;
  cart_items?: Array<{ id: number }>;
};

type CartRow = {
  id: number;
  member_id: number;
  status: string;
  priority: string | null;
  created_at: string;
  submitted_at: string;
  approved_at: string | null;
  completed_at: string | null;
  missing_products_note: string;
  family_users: { name: string; initials: string; active: boolean };
};

type ItemRow = {
  id: number;
  cart_id: number;
  product_id: number;
  quantity_hundredths: number;
  requested_unit_price_cents: number;
  actual_unit_price_cents: number;
  purchase_status: string;
  products: Pick<
    ProductRow,
    "name_fr" | "name_ar" | "name_en" | "unit" | "unit_price_cents" | "image_position" | "image_url" | "package_size"
  >;
};

const nowIso = () => new Date().toISOString();

function calendarDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function calendarDateYearsAgo(dateKey: string, years: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const targetYear = year - years;
  const lastDayOfMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDayOfMonth)).padStart(2, "0")}`;
}

function validCalendarDate(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function storedItemTotalCents(item: {
  requested_unit_price_cents: number;
  actual_unit_price_cents: number;
  quantity_hundredths: number;
}) {
  return item.requested_unit_price_cents === AMOUNT_REQUEST_SENTINEL_CENTS
    ? item.actual_unit_price_cents
    : Math.round((item.actual_unit_price_cents * item.quantity_hundredths) / 100);
}

function canPurchaseByAmount(
  product: Pick<ProductRow, "unit" | "unit_price_cents" | "package_size" | "external_source">,
) {
  if (product.unit_price_cents <= 0) return false;
  if (product.unit !== "pièce" && !product.package_size) return true;
  return (
    product.external_source === "mymarket" &&
    /^(\d+(?:[.,]\d+)?)\s*(?:kg|g|l|cl|ml)$/i.test(product.package_size?.trim() ?? "")
  );
}

function asPositiveInt(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${field} est invalide.`);
  return parsed;
}

function asNonNegativeInt(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${field} est invalide.`);
  return parsed;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function metaInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function favoriteMetaKey(userId: number) {
  return `member_favorites_${userId}`;
}

function parseFavoriteIds(value: string | undefined) {
  if (!value) return [] as number[];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
      .slice(0, 100);
  } catch {
    return [];
  }
}

function asMissingProductsNote(value: unknown) {
  const note = asText(value);
  if (note.length > 500) {
    throw new Error("Le commentaire ne doit pas dépasser 500 caractères.");
  }
  return note;
}

function asProductImageUrl(value: unknown) {
  const imageUrl = asText(value);
  if (!imageUrl) return null;

  const parsed = new URL(imageUrl, "https://family-expenses.local");
  const key = parsed.searchParams.get("key") ?? "";
  const parameterNames = [...parsed.searchParams.keys()];
  if (
    parsed.origin !== "https://family-expenses.local" ||
    parsed.pathname !== "/api/products/images" ||
    parameterNames.length !== 1 ||
    parameterNames[0] !== "key" ||
    !PRODUCT_IMAGE_KEY_PATTERN.test(key)
  ) {
    throw new Error("L’adresse de l’image est invalide.");
  }

  return `/api/products/images?key=${encodeURIComponent(key)}`;
}

function uploadedProductImageKey(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value, "https://family-expenses.local");
    const key = parsed.searchParams.get("key") ?? "";
    return parsed.origin === "https://family-expenses.local" &&
      parsed.pathname === "/api/products/images" &&
      PRODUCT_IMAGE_KEY_PATTERN.test(key)
      ? key
      : null;
  } catch {
    return null;
  }
}

function requireRole(actualRole: FamilyRole, requiredRole: FamilyRole) {
  if (actualRole !== requiredRole) throw new Error("Action non autorisée pour ce rôle.");
}

function joined<T>(value: T | T[]) {
  return Array.isArray(value) ? value[0] : value;
}

async function syncHouseCatalogImages() {
  const db = getSupabaseAdmin();
  const { data: synced, error } = await db
    .from("app_meta")
    .select("value")
    .eq("key", "house_catalog_image_version")
    .maybeSingle();
  throwIfSupabaseError(error);
  if (synced?.value === HOUSE_CATALOG_IMAGE_VERSION) return;

  const updatedAt = nowIso();
  const updates = await Promise.all([
    ...HOUSE_CATALOG_IMAGES.map(([id, nameFr, imageUrl]) =>
      db
        .from("products")
        .update({ image_url: imageUrl, image_position: "0% 0%", updated_at: updatedAt })
        .eq("id", id)
        .eq("name_fr", nameFr),
    ),
    ...HOUSE_CATALOG_PRICE_UPDATES.map(([id, nameFr, unitPriceCents]) =>
      db
        .from("products")
        .update({ unit_price_cents: unitPriceCents, updated_at: updatedAt })
        .eq("id", id)
        .eq("name_fr", nameFr),
    ),
    ...HOUSE_CATALOG_PACKAGE_UPDATES.map(([id, nameFr, packageSize]) =>
      db
        .from("products")
        .update({ package_size: packageSize, updated_at: updatedAt })
        .eq("id", id)
        .eq("name_fr", nameFr),
    ),
  ]);
  for (const result of updates) throwIfSupabaseError(result.error);

  const { error: metaError } = await db
    .from("app_meta")
    .upsert({ key: "house_catalog_image_version", value: HOUSE_CATALOG_IMAGE_VERSION });
  throwIfSupabaseError(metaError);
}

function cartOrder(
  left: Pick<CartRow, "status" | "priority" | "submitted_at">,
  right: Pick<CartRow, "status" | "priority" | "submitted_at">,
) {
  const activeRank = (cart: Pick<CartRow, "status">) =>
    ACTIVE_CART_STATUSES.includes(cart.status) ? 0 : 1;
  const priorityRank = (priority: string | null) =>
    priority === "urgent" ? 0 : priority === "normal" ? 1 : 2;
  return (
    activeRank(left) - activeRank(right) ||
    priorityRank(left.priority) - priorityRank(right.priority) ||
    left.submitted_at.localeCompare(right.submitted_at)
  );
}

async function readState(viewer: FamilySessionUser) {
  const db = getSupabaseAdmin();

  const [usersResult, productsResult, cartsResult, metadataResult] = await Promise.all([
    db.from("family_users").select("id, name, username, role, initials").eq("active", true).order("id"),
    db
      .from("products")
      .select(
        "id, name_fr, name_ar, name_en, category, unit, unit_price_cents, image_position, image_url, barcode, package_size, external_source, external_id, purchase_count, cart_items(id)",
      )
      .eq("active", true)
      .order("purchase_count", { ascending: false })
      .order("name_fr"),
    db
      .from("carts")
      .select(
        "id, member_id, status, priority, created_at, submitted_at, approved_at, completed_at, missing_products_note, family_users!inner(name, initials, active)",
      )
      .eq("family_users.active", true)
      .neq("status", "cancelled")
      .limit(200),
    db.from("app_meta").select("key, value"),
  ]);
  throwIfSupabaseError(usersResult.error);
  throwIfSupabaseError(productsResult.error);
  throwIfSupabaseError(cartsResult.error);
  throwIfSupabaseError(metadataResult.error);

  const metadata = new Map(
    (metadataResult.data ?? []).map((entry) => [String(entry.key), String(entry.value)]),
  );
  const monthlyBudgetCents = metaInteger(metadata.get(MONTHLY_BUDGET_META_KEY));
  const servicesState = parseServicesState(metadata.get(SERVICES_META_KEY));
  const viewerPlan = viewer.role === "member" ? effectivePlan(servicesState, viewer.id) : "free";
  const viewerServiceFeeCents = serviceFeeForPlan(viewerPlan);
  const favoriteProductIds =
    viewer.role === "member"
      ? parseFavoriteIds(metadata.get(favoriteMetaKey(viewer.id)))
      : [];

  let pendingUsers: PendingUserRow[] = [];
  if (viewer.role === "admin" || viewer.role === "delivery") {
    const { data, error } = await db
      .from("family_users")
      .select("id, name, username, initials, created_at")
      .eq("role", "member")
      .eq("active", false)
      .order("created_at", { ascending: true })
      .limit(50);
    throwIfSupabaseError(error);
    pendingUsers = ((data ?? []) as PendingUserRow[]).filter(
      (user) => !ARCHIVED_DEFAULT_MEMBER_USERNAMES.includes(
        user.username as typeof ARCHIVED_DEFAULT_MEMBER_USERNAMES[number],
      ),
    );
  }

  const users = (usersResult.data ?? []) as UserRow[];
  const activeMemberIds = users.filter((user) => user.role === "member").map((user) => user.id);
  const memberWallets = users
    .filter((user) => user.role === "member" && (viewer.role !== "member" || user.id === viewer.id))
    .map((user) => {
      const transactions = parseMemberWallet(metadata.get(memberWalletMetaKey(user.id)));
      const wallet = summarizeMemberWallet(transactions);
      return {
        member_id: user.id,
        member_name: user.name,
        member_initials: user.initials,
        balance_cents: wallet.balanceCents,
        credited_cents: wallet.creditedCents,
        spent_cents: wallet.spentCents,
        transactions: wallet.transactions.slice().reverse(),
      };
    });
  const memberServiceFees = users
    .filter((user) => user.role === "member")
    .map((user) => ({
      member_id: user.id,
      service_fee_cents: serviceFeeForPlan(effectivePlan(servicesState, user.id)),
    }));
  const products = ((productsResult.data ?? []) as unknown as ProductRow[]).map(
    ({ cart_items, ...product }) => ({ ...product, has_orders: Number(Boolean(cart_items?.length)) }),
  );
  const carts = ((cartsResult.data ?? []) as unknown as CartRow[])
    .map((cart) => {
      const member = joined(cart.family_users);
      return {
        id: Number(cart.id),
        member_id: Number(cart.member_id),
        status: cart.status,
        priority: cart.priority,
        created_at: cart.created_at,
        submitted_at: cart.submitted_at,
        approved_at: cart.approved_at,
        completed_at: cart.completed_at,
        missing_products_note: cart.missing_products_note,
        offline_purchase: metadata.get(`${OFFLINE_PURCHASE_PREFIX}${cart.id}`) === "1",
        member_name: member.name,
        member_initials: member.initials,
        service_fee_cents: cart.status === "completed"
          ? metadata.has(`${CART_SERVICE_FEE_PREFIX}${cart.id}`)
            ? metaInteger(metadata.get(`${CART_SERVICE_FEE_PREFIX}${cart.id}`))
            : DELIVERY_SERVICE_FEE_CENTS
          : serviceFeeForPlan(effectivePlan(servicesState, Number(cart.member_id))),
      };
    })
    .sort(cartOrder)
    .slice(0, 80);

  const visibleCarts = viewer.role === "member"
    ? carts.filter((cart) => cart.member_id === viewer.id)
    : viewer.role === "delivery"
      ? carts.filter((cart) => !cart.offline_purchase || cart.status === "completed")
      : carts;
  const visibleCartIds = visibleCarts.map((cart) => cart.id);

  let items: Array<Record<string, unknown>> = [];
  if (visibleCartIds.length) {
    const { data, error } = await db
      .from("cart_items")
      .select(
        "id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status, products!inner(name_fr, name_ar, name_en, unit, unit_price_cents, image_position, image_url, package_size)",
      )
      .in("cart_id", visibleCartIds)
      .order("id");
    throwIfSupabaseError(error);
    items = ((data ?? []) as unknown as ItemRow[]).map((item) => {
      const product = joined(item.products);
      return {
        id: Number(item.id),
        cart_id: Number(item.cart_id),
        product_id: Number(item.product_id),
        quantity_hundredths: item.quantity_hundredths,
        requested_unit_price_cents: item.requested_unit_price_cents,
        actual_unit_price_cents: item.actual_unit_price_cents,
        catalog_unit_price_cents: product.unit_price_cents,
        purchase_status: item.purchase_status,
        ...product,
      };
    });
  }

  const monthlyTotals: Array<{ month: string; total_cents: number; carts_count: number }> = [];
  if (viewer.role === "admin") {
    const { data, error } = await db
      .from("carts")
      .select(
        "id, member_id, completed_at, cart_items(quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status)",
      )
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .limit(1000);
    throwIfSupabaseError(error);

    const months = new Map<string, { total_cents: number; carts: Set<number> }>();
    for (const cart of (data ?? []) as unknown as Array<{
      id: number;
      member_id: number;
      completed_at: string;
      cart_items: Array<{
        quantity_hundredths: number;
        requested_unit_price_cents: number;
        actual_unit_price_cents: number;
        purchase_status: string;
      }>;
    }>) {
      if (!activeMemberIds.includes(Number(cart.member_id))) continue;
      const month = cart.completed_at.slice(0, 7);
      const entry = months.get(month) ?? { total_cents: 0, carts: new Set<number>() };
      entry.carts.add(Number(cart.id));
      const storedFee = metadata.get(`${CART_SERVICE_FEE_PREFIX}${cart.id}`);
      entry.total_cents += storedFee === undefined ? DELIVERY_SERVICE_FEE_CENTS : metaInteger(storedFee);
      for (const item of cart.cart_items) {
        if (item.purchase_status !== "bought") continue;
        entry.total_cents += storedItemTotalCents(item);
      }
      months.set(month, entry);
    }
    monthlyTotals.push(
      ...[...months.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .slice(0, 12)
        .map(([month, value]) => ({
          month,
          total_cents: value.total_cents,
          carts_count: value.carts.size,
        })),
    );
  }

  let deliveryWallet = {
    completedOrders: 0,
    completedMissions: 0,
    earnedCents: 0,
    missionEarnedCents: 0,
    paidCents: 0,
    unpaidCents: 0,
    completedThisMonth: 0,
    missionsThisMonth: 0,
    earnedThisMonthCents: 0,
  };
  if (viewer.role === "admin" || viewer.role === "delivery") {
    let completedOrderRows: Array<{ id: number; completed_at: string | null }> = [];
    if (activeMemberIds.length) {
      const { data, error } = await db
        .from("carts")
        .select("id, completed_at")
        .eq("status", "completed")
        .in("member_id", activeMemberIds)
        .limit(1000);
      throwIfSupabaseError(error);
      completedOrderRows = (data ?? []) as Array<{ id: number; completed_at: string | null }>;
    }
    const completedOrders = completedOrderRows.length;
    const orderEarnedCents = completedOrderRows.reduce((sum, cart) => {
      const storedFee = metadata.get(`${CART_SERVICE_FEE_PREFIX}${cart.id}`);
      return sum + (storedFee === undefined ? DELIVERY_SERVICE_FEE_CENTS : metaInteger(storedFee));
    }, 0);
    const deliveryIds = new Set(users.filter((user) => user.role === "delivery").map((user) => user.id));
    const completedMissions = servicesState.tasks.filter(
      (task) => task.status === "completed" && deliveryIds.has(task.assignee_id),
    );
    const missionEarnedCents = completedMissions.reduce((sum, task) => sum + task.reward_cents, 0);
    const earnedCents = orderEarnedCents + missionEarnedCents;
    const paidCents = Math.min(metaInteger(metadata.get(DELIVERY_PAID_META_KEY)), earnedCents);
    const currentMonth = nowIso().slice(0, 7);
    const completedThisMonth = completedOrderRows.filter((cart) => cart.completed_at?.startsWith(currentMonth)).length;
    const orderEarnedThisMonthCents = completedOrderRows
      .filter((cart) => cart.completed_at?.startsWith(currentMonth))
      .reduce((sum, cart) => {
        const storedFee = metadata.get(`${CART_SERVICE_FEE_PREFIX}${cart.id}`);
        return sum + (storedFee === undefined ? DELIVERY_SERVICE_FEE_CENTS : metaInteger(storedFee));
      }, 0);
    const missionsThisMonth = completedMissions.filter(
      (task) => task.completed_at?.startsWith(currentMonth),
    );
    deliveryWallet = {
      completedOrders,
      completedMissions: completedMissions.length,
      earnedCents,
      missionEarnedCents,
      paidCents,
      unpaidCents: earnedCents - paidCents,
      completedThisMonth,
      missionsThisMonth: missionsThisMonth.length,
      earnedThisMonthCents: orderEarnedThisMonthCents + missionsThisMonth.reduce((sum, task) => sum + task.reward_cents, 0),
    };
  }

  return {
    users: viewer.role === "member" ? users.filter((user) => user.id === viewer.id) : users,
    products,
    carts: visibleCarts,
    items,
    monthlyTotals,
    pendingUsers,
    deliveryServiceFeeCents: viewerServiceFeeCents,
    deliveryRewardCents: DELIVERY_SERVICE_FEE_CENTS,
    currentPlan: viewerPlan,
    monthlyBudgetCents,
    favoriteProductIds,
    deliveryWallet,
    memberWallets,
    memberServiceFees,
    pushPublicKey: getPushPublicKey(),
  };
}

export async function GET(request: Request) {
  try {
    const viewer = await getRequestFamilyUser(request);
    if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });
    await syncHouseCatalogImages();
    return Response.json(await readState(viewer));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ActionBody;
    const viewer = await getRequestFamilyUser(request);
    if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });
    const db = getSupabaseAdmin();

    switch (body.action) {
      case "approve_user": {
        requireRole(viewer.role, "admin");
        const userId = asPositiveInt(body.userId, "userId");
        if (userId <= 2) throw new Error("Ce compte ne peut pas être modifié.");
        const { data, error } = await db
          .from("family_users")
          .update({ active: true })
          .eq("id", userId)
          .eq("role", "member")
          .eq("active", false)
          .select("id")
          .maybeSingle();
        throwIfSupabaseError(error);
        if (!data) throw new Error("Cette demande a déjà été traitée.");
        break;
      }

      case "reject_user": {
        requireRole(viewer.role, "admin");
        const userId = asPositiveInt(body.userId, "userId");
        if (userId <= 2) throw new Error("Ce compte ne peut pas être modifié.");
        const { data, error } = await db
          .from("family_users")
          .delete()
          .eq("id", userId)
          .eq("role", "member")
          .eq("active", false)
          .select("id")
          .maybeSingle();
        throwIfSupabaseError(error);
        if (!data) throw new Error("Cette demande a déjà été traitée.");
        break;
      }

      case "submit_cart": {
        requireRole(viewer.role, "member");
        const items = Array.isArray(body.items) ? body.items : [];
        const missingProductsNote = asMissingProductsNote(body.missingProductsNote);
        if (!items.length && !missingProductsNote) throw new Error("Le panier est vide.");

        const { count, error: countError } = await db
          .from("carts")
          .select("id", { count: "exact", head: true })
          .eq("member_id", viewer.id)
          .in("status", ACTIVE_CART_STATUSES);
        throwIfSupabaseError(countError);
        if ((count ?? 0) >= 3) throw new Error("Vous avez déjà trois paniers actifs.");

        const orderById = new Map<number, { quantityHundredths: number; amountCents: number | null }>();
        for (const raw of items) {
          const entry = raw as Record<string, unknown>;
          const amountCents = entry.amountCents === undefined
            ? null
            : asPositiveInt(entry.amountCents, "amountCents");
          if (amountCents !== null && (amountCents < 50 || amountCents > 10_000_000)) {
            throw new Error("Le montant demandé est invalide.");
          }
          orderById.set(asPositiveInt(entry.productId, "productId"), {
            quantityHundredths: asPositiveInt(entry.quantityHundredths, "quantity"),
            amountCents,
          });
        }
        const productIds = [...orderById.keys()];
        let productRows: Array<Pick<ProductRow, "id" | "unit_price_cents" | "unit" | "package_size" | "external_source">> = [];
        if (productIds.length) {
          const { data, error: productsError } = await db
            .from("products")
            .select("id, unit_price_cents, unit, package_size, external_source")
            .eq("active", true)
            .in("id", productIds);
          throwIfSupabaseError(productsError);
          productRows = data ?? [];
          if (productRows.length !== productIds.length) {
            throw new Error("Un produit du panier est indisponible.");
          }
          for (const product of productRows) {
            const order = orderById.get(Number(product.id));
            if (order?.amountCents !== null && order?.amountCents !== undefined) {
              if (!canPurchaseByAmount(product)) {
                throw new Error("Ce produit ne peut pas être acheté par montant.");
              }
            }
          }
        }

        const timestamp = nowIso();
        const { data: created, error: cartError } = await db
          .from("carts")
          .insert({
            member_id: viewer.id,
            status: "pending",
            missing_products_note: missingProductsNote,
            created_at: timestamp,
            submitted_at: timestamp,
          })
          .select("id")
          .single();
        throwIfSupabaseError(cartError);
        if (!created) throw new Error("Le panier n’a pas pu être créé.");

        if (productRows.length) {
          const { error: itemError } = await db.from("cart_items").insert(
            productRows.map((product) => ({
              cart_id: created.id,
              product_id: product.id,
              quantity_hundredths:
                orderById.get(Number(product.id))?.amountCents ??
                orderById.get(Number(product.id))?.quantityHundredths,
              requested_unit_price_cents:
                orderById.get(Number(product.id))?.amountCents === null
                  ? product.unit_price_cents
                  : AMOUNT_REQUEST_SENTINEL_CENTS,
              actual_unit_price_cents:
                orderById.get(Number(product.id))?.amountCents ?? product.unit_price_cents,
              purchase_status: "requested",
            })),
          );
          if (itemError) {
            await db.from("carts").delete().eq("id", created.id);
            throwIfSupabaseError(itemError);
          }
        }
        await notifyDeliveryOfNewOrder({
          cartId: Number(created.id),
          memberName: viewer.name,
          itemCount: productRows.length,
          hasMissingProducts: Boolean(missingProductsNote),
        });
        break;
      }

      case "update_cart": {
        requireRole(viewer.role, "member");
        const cartId = asPositiveInt(body.cartId, "cartId");
        const items = Array.isArray(body.items) ? body.items : [];
        const missingProductsNote = asMissingProductsNote(body.missingProductsNote);
        if (!items.length && !missingProductsNote) throw new Error("Le panier est vide.");
        const { data: cart, error: cartError } = await db
          .from("carts")
          .select("id")
          .eq("id", cartId)
          .eq("member_id", viewer.id)
          .in("status", ["pending", "ready"])
          .maybeSingle();
        throwIfSupabaseError(cartError);
        if (!cart) throw new Error("Ce panier ne peut plus être modifié.");

        const orderById = new Map<number, { quantityHundredths: number; amountCents: number | null }>();
        for (const raw of items) {
          const entry = raw as Record<string, unknown>;
          const amountCents = entry.amountCents === undefined
            ? null
            : asPositiveInt(entry.amountCents, "amountCents");
          if (amountCents !== null && (amountCents < 50 || amountCents > 10_000_000)) {
            throw new Error("Le montant demandé est invalide.");
          }
          orderById.set(asPositiveInt(entry.productId, "productId"), {
            quantityHundredths: asPositiveInt(entry.quantityHundredths, "quantity"),
            amountCents,
          });
        }
        const productIds = [...orderById.keys()];
        let productRows: Array<Pick<ProductRow, "id" | "unit_price_cents" | "unit" | "package_size" | "external_source">> = [];
        if (productIds.length) {
          const { data, error: productsError } = await db
            .from("products")
            .select("id, unit_price_cents, unit, package_size, external_source")
            .eq("active", true)
            .in("id", productIds);
          throwIfSupabaseError(productsError);
          productRows = data ?? [];
          if (productRows.length !== productIds.length) {
            throw new Error("Un produit du panier est indisponible.");
          }
          for (const product of productRows) {
            const order = orderById.get(Number(product.id));
            if (order?.amountCents !== null && order?.amountCents !== undefined) {
              if (!canPurchaseByAmount(product)) {
                throw new Error("Ce produit ne peut pas être acheté par montant.");
              }
            }
          }
        }

        const { error: deleteError } = await db.from("cart_items").delete().eq("cart_id", cartId);
        throwIfSupabaseError(deleteError);
        const { error: updateError } = await db
          .from("carts")
          .update({
            status: "pending",
            priority: null,
            approved_at: null,
            missing_products_note: missingProductsNote,
            submitted_at: nowIso(),
          })
          .eq("id", cartId);
        throwIfSupabaseError(updateError);
        if (productRows.length) {
          const { error: insertError } = await db.from("cart_items").insert(
            productRows.map((product) => ({
              cart_id: cartId,
              product_id: product.id,
              quantity_hundredths:
                orderById.get(Number(product.id))?.amountCents ??
                orderById.get(Number(product.id))?.quantityHundredths,
              requested_unit_price_cents:
                orderById.get(Number(product.id))?.amountCents === null
                  ? product.unit_price_cents
                  : AMOUNT_REQUEST_SENTINEL_CENTS,
              actual_unit_price_cents:
                orderById.get(Number(product.id))?.amountCents ?? product.unit_price_cents,
              purchase_status: "requested",
            })),
          );
          throwIfSupabaseError(insertError);
        }
        break;
      }

      case "cancel_cart": {
        requireRole(viewer.role, "member");
        const { data, error } = await db
          .from("carts")
          .update({ status: "cancelled" })
          .eq("id", asPositiveInt(body.cartId, "cartId"))
          .eq("member_id", viewer.id)
          .in("status", ["pending", "ready"])
          .select("id")
          .maybeSingle();
        throwIfSupabaseError(error);
        if (!data) throw new Error("Ce panier ne peut plus être annulé.");
        break;
      }

      case "set_priority": {
        requireRole(viewer.role, "admin");
        const cartId = asPositiveInt(body.cartId, "cartId");
        const { data: cart, error: cartError } = await db
          .from("carts")
          .select("status")
          .eq("id", cartId)
          .in("status", ACTIVE_CART_STATUSES)
          .maybeSingle();
        throwIfSupabaseError(cartError);
        if (!cart) throw new Error("Ce panier a déjà été traité.");

        const { error } = await db
          .from("carts")
          .update({
            status: cart.status === "pending" ? "ready" : cart.status,
            priority: body.priority === "urgent" ? "urgent" : "normal",
            approved_at: nowIso(),
          })
          .eq("id", cartId);
        throwIfSupabaseError(error);
        break;
      }

      case "update_item": {
        requireRole(viewer.role, "delivery");
        const itemId = asPositiveInt(body.itemId, "itemId");
        const purchaseStatus = body.purchaseStatus === "bought" ? "bought" : "unbought";
        const actualUnitPriceCents =
          purchaseStatus === "bought"
            ? asPositiveInt(body.actualUnitPriceCents, "actualUnitPriceCents")
            : asNonNegativeInt(body.actualUnitPriceCents, "actualUnitPriceCents");
        const { data: item, error: itemError } = await db
          .from("cart_items")
          .select("id, cart_id, carts!inner(status)")
          .eq("id", itemId)
          .in("carts.status", ACTIVE_CART_STATUSES)
          .maybeSingle();
        throwIfSupabaseError(itemError);
        if (!item) throw new Error("Cet article ne peut plus être modifié.");

        const { error: updateError } = await db
          .from("cart_items")
          .update({ purchase_status: purchaseStatus, actual_unit_price_cents: actualUnitPriceCents })
          .eq("id", itemId);
        throwIfSupabaseError(updateError);
        const { error: cartError } = await db
          .from("carts")
          .update({ status: "shopping" })
          .eq("id", item.cart_id)
          .in("status", ["pending", "ready"]);
        throwIfSupabaseError(cartError);
        break;
      }

      case "finish_cart": {
        requireRole(viewer.role, "delivery");
        const cartId = asPositiveInt(body.cartId, "cartId");
        const { data: cart, error: cartError } = await db
          .from("carts")
          .select("id, member_id, missing_products_note")
          .eq("id", cartId)
          .in("status", ACTIVE_CART_STATUSES)
          .maybeSingle();
        throwIfSupabaseError(cartError);
        if (!cart) throw new Error("Ce panier a déjà été traité.");

        const { data: rows, error } = await db
          .from("cart_items")
          .select("product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status, products!inner(purchase_count)")
          .eq("cart_id", cartId);
        throwIfSupabaseError(error);
        if (
          (!rows?.length && !cart.missing_products_note.trim()) ||
          rows?.some((item) => item.purchase_status === "requested")
        ) {
          throw new Error("Marquez chaque article comme acheté ou non acheté.");
        }

        for (const item of (rows ?? []).filter((entry) => entry.purchase_status === "bought")) {
          const product = joined(item.products as unknown as { purchase_count: number });
          const productUpdate = item.requested_unit_price_cents === AMOUNT_REQUEST_SENTINEL_CENTS
            ? { purchase_count: product.purchase_count + 1, updated_at: nowIso() }
            : {
                unit_price_cents: item.actual_unit_price_cents,
                purchase_count: product.purchase_count + 1,
                updated_at: nowIso(),
              };
          const { error: productError } = await db
            .from("products")
            .update(productUpdate)
            .eq("id", item.product_id);
          throwIfSupabaseError(productError);
        }
        const { data: finished, error: finishError } = await db
          .from("carts")
          .update({ status: "completed", completed_at: nowIso() })
          .eq("id", cartId)
          .in("status", ACTIVE_CART_STATUSES)
          .select("id")
          .maybeSingle();
        throwIfSupabaseError(finishError);
        if (!finished) throw new Error("Ce panier a déjà été traité.");
        const purchasedTotalCents = (rows ?? [])
          .filter((entry) => entry.purchase_status === "bought")
          .reduce(
            (total, entry) => total + storedItemTotalCents(entry),
            0,
          );
        const { data: serviceMeta, error: serviceMetaError } = await db
          .from("app_meta")
          .select("value")
          .eq("key", SERVICES_META_KEY)
          .maybeSingle();
        throwIfSupabaseError(serviceMetaError);
        const memberPlan = effectivePlan(parseServicesState(serviceMeta?.value), Number(cart.member_id));
        const chargedServiceFeeCents = serviceFeeForPlan(memberPlan);
        const { error: feeError } = await db.from("app_meta").upsert(
          { key: `${CART_SERVICE_FEE_PREFIX}${cartId}`, value: String(chargedServiceFeeCents) },
          { onConflict: "key" },
        );
        throwIfSupabaseError(feeError);
        await addMemberWalletTransaction(Number(cart.member_id), {
          id: `order-${cartId}`,
          type: "order",
          amount_cents: -(purchasedTotalCents + chargedServiceFeeCents),
          cart_id: cartId,
          created_at: nowIso(),
          actor_name: viewer.name,
        });
        break;
      }

      case "record_offline_purchase": {
        requireRole(viewer.role, "admin");
        const memberId = asPositiveInt(body.memberId, "memberId");
        const rawItems = Array.isArray(body.items) ? body.items : [];
        if (!rawItems.length || rawItems.length > 50) throw new Error("Ajoutez entre 1 et 50 produits.");

        const purchasedDate = asText(body.purchasedDate);
        if (!validCalendarDate(purchasedDate)) throw new Error("La date d’achat est invalide.");
        const today = calendarDateInTimeZone(new Date(), FAMILY_TIME_ZONE);
        const oldestAllowed = calendarDateYearsAgo(today, 2);
        if (purchasedDate > today || purchasedDate < oldestAllowed) {
          throw new Error("Choisissez une date comprise dans les deux dernières années.");
        }
        const completedAt = new Date(`${purchasedDate}T12:00:00.000Z`);

        const { data: member, error: memberError } = await db
          .from("family_users")
          .select("id")
          .eq("id", memberId)
          .eq("role", "member")
          .eq("active", true)
          .maybeSingle();
        throwIfSupabaseError(memberError);
        if (!member) throw new Error("Membre introuvable.");

        const itemByProduct = new Map<number, { quantityHundredths: number; actualUnitPriceCents: number }>();
        for (const rawItem of rawItems) {
          const item = rawItem as Record<string, unknown>;
          const productId = asPositiveInt(item.productId, "productId");
          const quantityHundredths = asPositiveInt(item.quantityHundredths, "quantityHundredths");
          const actualUnitPriceCents = asPositiveInt(item.actualUnitPriceCents, "actualUnitPriceCents");
          if (quantityHundredths > 100_000 || actualUnitPriceCents > 10_000_000) {
            throw new Error("Une quantité ou un prix est trop élevé.");
          }
          itemByProduct.set(productId, { quantityHundredths, actualUnitPriceCents });
        }

        const productIds = [...itemByProduct.keys()];
        const { data: products, error: productsError } = await db
          .from("products")
          .select("id, unit_price_cents")
          .eq("active", true)
          .in("id", productIds);
        throwIfSupabaseError(productsError);
        if (!products || products.length !== productIds.length) throw new Error("Un produit est indisponible.");

        const timestamp = completedAt.toISOString();
        const { data: created, error: cartError } = await db
          .from("carts")
          .insert({
            member_id: memberId,
            status: "completed",
            priority: "normal",
            missing_products_note: "",
            created_at: timestamp,
            submitted_at: timestamp,
            approved_at: timestamp,
            completed_at: timestamp,
          })
          .select("id")
          .single();
        throwIfSupabaseError(cartError);
        if (!created) throw new Error("L’achat n’a pas pu être créé.");

        const cartId = Number(created.id);
        const rows = products.map((product) => {
          const item = itemByProduct.get(Number(product.id))!;
          return {
            cart_id: cartId,
            product_id: product.id,
            quantity_hundredths: item.quantityHundredths,
            requested_unit_price_cents: product.unit_price_cents,
            actual_unit_price_cents: item.actualUnitPriceCents,
            purchase_status: "bought",
          };
        });
        const totalCents = rows.reduce(
          (total, item) => total + Math.round((item.actual_unit_price_cents * item.quantity_hundredths) / 100),
          0,
        );

        const { data: serviceMeta, error: serviceMetaError } = await db
          .from("app_meta")
          .select("value")
          .eq("key", SERVICES_META_KEY)
          .maybeSingle();
        throwIfSupabaseError(serviceMetaError);
        const memberPlan = effectivePlan(parseServicesState(serviceMeta?.value), memberId);
        const chargedServiceFeeCents = serviceFeeForPlan(memberPlan);

        const { error: itemError } = await db.from("cart_items").insert(rows);
        if (itemError) {
          await db.from("carts").delete().eq("id", cartId);
          throwIfSupabaseError(itemError);
        }
        try {
          const { error: metaError } = await db.from("app_meta").upsert([
            { key: `${CART_SERVICE_FEE_PREFIX}${cartId}`, value: String(chargedServiceFeeCents) },
            { key: `${OFFLINE_PURCHASE_PREFIX}${cartId}`, value: "1" },
          ], { onConflict: "key" });
          throwIfSupabaseError(metaError);
          await addMemberWalletTransaction(memberId, {
            id: `order-${cartId}`,
            type: "order",
            amount_cents: -(totalCents + chargedServiceFeeCents),
            cart_id: cartId,
            created_at: timestamp,
            actor_name: viewer.name,
          });
        } catch (error) {
          await db.from("cart_items").delete().eq("cart_id", cartId);
          await db.from("carts").delete().eq("id", cartId);
          await db.from("app_meta").delete().in("key", [
            `${CART_SERVICE_FEE_PREFIX}${cartId}`,
            `${OFFLINE_PURCHASE_PREFIX}${cartId}`,
          ]);
          throw error;
        }
        break;
      }

      case "add_member_funds": {
        if (viewer.role !== "admin" && viewer.role !== "delivery") {
          throw new Error("Action non autorisée pour ce rôle.");
        }
        const memberId = asPositiveInt(body.memberId, "memberId");
        const amountCents = asPositiveInt(body.amountCents, "amountCents");
        if (amountCents > MAX_MEMBER_DEPOSIT_CENTS) {
          throw new Error("Le montant est trop élevé.");
        }
        const { data: member, error: memberError } = await db
          .from("family_users")
          .select("id")
          .eq("id", memberId)
          .eq("role", "member")
          .eq("active", true)
          .maybeSingle();
        throwIfSupabaseError(memberError);
        if (!member) throw new Error("Membre introuvable.");

        await addMemberWalletTransaction(memberId, {
          id: crypto.randomUUID(),
          type: "deposit",
          amount_cents: amountCents,
          cart_id: null,
          created_at: nowIso(),
          actor_name: viewer.name,
        });
        break;
      }

      case "mark_order_paid_directly": {
        if (viewer.role !== "admin" && viewer.role !== "delivery") {
          throw new Error("Action non autorisée pour ce rôle.");
        }
        const cartId = asPositiveInt(body.cartId, "cartId");
        const { data: cart, error: cartError } = await db
          .from("carts")
          .select("id, member_id, status")
          .eq("id", cartId)
          .eq("status", "completed")
          .maybeSingle();
        throwIfSupabaseError(cartError);
        if (!cart) throw new Error("Commande terminée introuvable.");

        const removed = await removeMemberWalletTransaction(
          Number(cart.member_id),
          `order-${cartId}`,
        );
        if (!removed) throw new Error("Cette commande ne touche déjà plus au portefeuille.");

        const { error: paymentError } = await db.from("app_meta").upsert(
          { key: `${CART_PAYMENT_METHOD_PREFIX}${cartId}`, value: "direct" },
          { onConflict: "key" },
        );
        throwIfSupabaseError(paymentError);
        break;
      }

      case "recalculate_order_service_fee": {
        requireRole(viewer.role, "admin");
        const cartId = asPositiveInt(body.cartId, "cartId");
        const { data: cart, error: cartError } = await db
          .from("carts")
          .select("id, member_id, status, cart_items(quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status)")
          .eq("id", cartId)
          .eq("status", "completed")
          .maybeSingle();
        throwIfSupabaseError(cartError);
        if (!cart) throw new Error("Commande terminée introuvable.");

        const { data: metadataRows, error: metadataError } = await db
          .from("app_meta")
          .select("key, value")
          .in("key", [SERVICES_META_KEY, `${CART_PAYMENT_METHOD_PREFIX}${cartId}`]);
        throwIfSupabaseError(metadataError);
        const metadata = new Map((metadataRows ?? []).map((entry) => [String(entry.key), String(entry.value)]));
        const memberId = Number(cart.member_id);
        const memberPlan = effectivePlan(parseServicesState(metadata.get(SERVICES_META_KEY)), memberId);
        const chargedServiceFeeCents = serviceFeeForPlan(memberPlan);
        const purchasedTotalCents = (cart.cart_items as Array<{
          quantity_hundredths: number;
          requested_unit_price_cents: number;
          actual_unit_price_cents: number;
          purchase_status: string;
        }>).filter((item) => item.purchase_status === "bought").reduce(
          (total, item) => total + storedItemTotalCents(item),
          0,
        );

        const { error: feeError } = await db.from("app_meta").upsert(
          { key: `${CART_SERVICE_FEE_PREFIX}${cartId}`, value: String(chargedServiceFeeCents) },
          { onConflict: "key" },
        );
        throwIfSupabaseError(feeError);
        if (metadata.get(`${CART_PAYMENT_METHOD_PREFIX}${cartId}`) !== "direct") {
          await updateMemberWalletOrderAmount(
            memberId,
            cartId,
            purchasedTotalCents + chargedServiceFeeCents,
          );
        }
        break;
      }

      case "toggle_favorite": {
        requireRole(viewer.role, "member");
        const productId = asPositiveInt(body.productId, "productId");
        const { data: product, error: productError } = await db
          .from("products")
          .select("id")
          .eq("id", productId)
          .eq("active", true)
          .maybeSingle();
        throwIfSupabaseError(productError);
        if (!product) throw new Error("Produit introuvable.");

        const key = favoriteMetaKey(viewer.id);
        const { data: stored, error: readError } = await db
          .from("app_meta")
          .select("value")
          .eq("key", key)
          .maybeSingle();
        throwIfSupabaseError(readError);
        const favoriteIds = parseFavoriteIds(stored?.value);
        const nextIds = favoriteIds.includes(productId)
          ? favoriteIds.filter((id) => id !== productId)
          : [...favoriteIds, productId].slice(-100);
        const { error: writeError } = await db
          .from("app_meta")
          .upsert({ key, value: JSON.stringify(nextIds) }, { onConflict: "key" });
        throwIfSupabaseError(writeError);
        break;
      }

      case "set_monthly_budget": {
        requireRole(viewer.role, "admin");
        const budgetCents = asNonNegativeInt(body.budgetCents, "budgetCents");
        if (budgetCents > MAX_MONTHLY_BUDGET_CENTS) {
          throw new Error("Le budget mensuel est trop élevé.");
        }
        const { error } = await db
          .from("app_meta")
          .upsert(
            { key: MONTHLY_BUDGET_META_KEY, value: String(budgetCents) },
            { onConflict: "key" },
          );
        throwIfSupabaseError(error);
        break;
      }

      case "settle_delivery_wallet": {
        requireRole(viewer.role, "admin");
        const { data: activeMembers, error: membersError } = await db
          .from("family_users")
          .select("id")
          .eq("role", "member")
          .eq("active", true);
        throwIfSupabaseError(membersError);
        const memberIds = (activeMembers ?? []).map((member) => Number(member.id));
        let completedCartIds: number[] = [];
        if (memberIds.length) {
          const { data: completedCarts, error: cartsError } = await db
            .from("carts")
            .select("id")
            .eq("status", "completed")
            .in("member_id", memberIds)
            .limit(1000);
          throwIfSupabaseError(cartsError);
          completedCartIds = (completedCarts ?? []).map((cart) => Number(cart.id));
        }
        const { data: accountingMeta, error: metaReadError } = await db
          .from("app_meta")
          .select("key, value");
        throwIfSupabaseError(metaReadError);
        const metadata = new Map((accountingMeta ?? []).map((entry) => [String(entry.key), String(entry.value)]));
        const orderEarningsCents = completedCartIds.reduce((sum, cartId) => {
          const storedFee = metadata.get(`${CART_SERVICE_FEE_PREFIX}${cartId}`);
          return sum + (storedFee === undefined ? DELIVERY_SERVICE_FEE_CENTS : metaInteger(storedFee));
        }, 0);
        const servicesState = parseServicesState(metadata.get(SERVICES_META_KEY));
        const { data: deliveryUsers, error: deliveryUsersError } = await db
          .from("family_users")
          .select("id")
          .eq("role", "delivery")
          .eq("active", true);
        throwIfSupabaseError(deliveryUsersError);
        const deliveryIds = new Set((deliveryUsers ?? []).map((user) => Number(user.id)));
        const missionEarningsCents = servicesState.tasks
          .filter((task) => task.status === "completed" && deliveryIds.has(task.assignee_id))
          .reduce((sum, task) => sum + task.reward_cents, 0);
        const paidCents = orderEarningsCents + missionEarningsCents;
        const { error } = await db
          .from("app_meta")
          .upsert(
            { key: DELIVERY_PAID_META_KEY, value: String(paidCents) },
            { onConflict: "key" },
          );
        throwIfSupabaseError(error);
        break;
      }

      case "subscribe_push": {
        if (!getPushPublicKey()) throw new Error("Les notifications ne sont pas encore configurées.");
        await savePushSubscription(viewer.id, viewer.role, body.subscription);
        break;
      }

      case "unsubscribe_push": {
        await removePushSubscription(viewer.id, body.endpoint);
        break;
      }

      case "update_product": {
        requireRole(viewer.role, "admin");
        const { error } = await db
          .from("products")
          .update({
            unit_price_cents: asPositiveInt(body.unitPriceCents, "unitPriceCents"),
            updated_at: nowIso(),
          })
          .eq("id", asPositiveInt(body.productId, "productId"));
        throwIfSupabaseError(error);
        break;
      }

      case "add_product": {
        requireRole(viewer.role, "admin");
        const nameFr = asText(body.nameFr);
        const category = asText(body.category);
        const unit = asText(body.unit);
        if (!nameFr || !PRODUCT_CATEGORIES.includes(category) || !["L", "kg", "pièce"].includes(unit)) {
          throw new Error("Les informations du produit sont incomplètes.");
        }
        const { error } = await db.from("products").insert({
          name_fr: nameFr,
          name_ar: asText(body.nameAr),
          name_en: asText(body.nameEn),
          category,
          unit,
          unit_price_cents: asPositiveInt(body.unitPriceCents, "unitPriceCents"),
          image_position: "none",
          image_url: asProductImageUrl(body.imageUrl),
          active: true,
        });
        throwIfSupabaseError(error);
        break;
      }

      case "edit_product": {
        requireRole(viewer.role, "admin");
        const productId = asPositiveInt(body.productId, "productId");
        const nameFr = asText(body.nameFr);
        const category = asText(body.category);
        const unit = asText(body.unit);
        const removeImage = body.removeImage === true;
        const hasReplacementImage = body.imageUrl !== undefined && body.imageUrl !== null;
        const replacementImageUrl = hasReplacementImage ? asProductImageUrl(body.imageUrl) : null;
        if (!nameFr || !PRODUCT_CATEGORIES.includes(category) || !["L", "kg", "pièce"].includes(unit)) {
          throw new Error("Les informations du produit sont incomplètes.");
        }

        const { data: currentProduct, error: currentError } = await db
          .from("products")
          .select("image_url, unit")
          .eq("id", productId)
          .eq("active", true)
          .maybeSingle();
        throwIfSupabaseError(currentError);
        if (!currentProduct) throw new Error("Produit introuvable.");

        if (unit !== currentProduct.unit) {
          const { data: previousOrder, error: orderError } = await db
            .from("cart_items")
            .select("id")
            .eq("product_id", productId)
            .limit(1)
            .maybeSingle();
          throwIfSupabaseError(orderError);
          if (previousOrder) {
            throw new Error("L’unité ne peut plus être modifiée après la première commande.");
          }
        }

        const updates: Record<string, unknown> = {
          name_fr: nameFr,
          name_ar: asText(body.nameAr),
          name_en: asText(body.nameEn),
          category,
          unit,
          unit_price_cents: asPositiveInt(body.unitPriceCents, "unitPriceCents"),
          updated_at: nowIso(),
        };
        if (removeImage || hasReplacementImage) {
          updates.image_url = removeImage ? null : replacementImageUrl;
          updates.image_position = removeImage ? "none" : "0% 0%";
        }
        const { error: updateError } = await db
          .from("products")
          .update(updates)
          .eq("id", productId)
          .eq("active", true);
        throwIfSupabaseError(updateError);

        const previousImageKey = uploadedProductImageKey(currentProduct.image_url);
        const replacementImageKey = uploadedProductImageKey(replacementImageUrl);
        if (previousImageKey && previousImageKey !== replacementImageKey && (removeImage || hasReplacementImage)) {
          await db.storage.from(PRODUCT_IMAGE_BUCKET).remove([previousImageKey]);
        }
        break;
      }

      case "remove_product": {
        requireRole(viewer.role, "admin");
        const productId = asPositiveInt(body.productId, "productId");
        const { data: activeItem, error: activeError } = await db
          .from("cart_items")
          .select("id, carts!inner(status)")
          .eq("product_id", productId)
          .in("carts.status", ACTIVE_CART_STATUSES)
          .limit(1)
          .maybeSingle();
        throwIfSupabaseError(activeError);
        if (activeItem) throw new Error("Ce produit est encore présent dans un panier actif.");

        const { data, error } = await db
          .from("products")
          .update({ active: false, updated_at: nowIso() })
          .eq("id", productId)
          .eq("active", true)
          .select("id")
          .maybeSingle();
        throwIfSupabaseError(error);
        if (!data) throw new Error("Produit introuvable.");
        break;
      }

      default:
        throw new Error("Action inconnue.");
    }

    return Response.json(await readState(viewer));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    return Response.json({ error: message }, { status: 400 });
  }
}
