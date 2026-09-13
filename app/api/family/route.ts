import {
  getRequestFamilyUser,
  type FamilyRole,
  type FamilySessionUser,
} from "@/lib/family-auth";
import {
  getPushPublicKey,
  notifyDeliveryOfNewOrder,
  removeDeliveryPushSubscription,
  saveDeliveryPushSubscription,
} from "@/lib/push-notifications";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

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
  family_users: { name: string; initials: string };
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
    "name_fr" | "name_ar" | "name_en" | "unit" | "image_position" | "image_url" | "package_size"
  >;
};

const nowIso = () => new Date().toISOString();

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
  const metadataKeys = [MONTHLY_BUDGET_META_KEY, DELIVERY_PAID_META_KEY];
  if (viewer.role === "member") metadataKeys.push(favoriteMetaKey(viewer.id));

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
        "id, member_id, status, priority, created_at, submitted_at, approved_at, completed_at, missing_products_note, family_users!inner(name, initials)",
      )
      .neq("status", "cancelled")
      .limit(200),
    db.from("app_meta").select("key, value").in("key", metadataKeys),
  ]);
  throwIfSupabaseError(usersResult.error);
  throwIfSupabaseError(productsResult.error);
  throwIfSupabaseError(cartsResult.error);
  throwIfSupabaseError(metadataResult.error);

  const metadata = new Map(
    (metadataResult.data ?? []).map((entry) => [String(entry.key), String(entry.value)]),
  );
  const monthlyBudgetCents = metaInteger(metadata.get(MONTHLY_BUDGET_META_KEY));
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
    pendingUsers = (data ?? []) as PendingUserRow[];
  }

  const users = (usersResult.data ?? []) as UserRow[];
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
        member_name: member.name,
        member_initials: member.initials,
      };
    })
    .sort(cartOrder)
    .slice(0, 80);

  const visibleCarts =
    viewer.role === "member" ? carts.filter((cart) => cart.member_id === viewer.id) : carts;
  const visibleCartIds = visibleCarts.map((cart) => cart.id);

  let items: Array<Record<string, unknown>> = [];
  if (visibleCartIds.length) {
    const { data, error } = await db
      .from("cart_items")
      .select(
        "id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status, products!inner(name_fr, name_ar, name_en, unit, image_position, image_url, package_size)",
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
        "id, completed_at, cart_items(quantity_hundredths, actual_unit_price_cents, purchase_status)",
      )
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .limit(1000);
    throwIfSupabaseError(error);

    const months = new Map<string, { total_cents: number; carts: Set<number> }>();
    for (const cart of (data ?? []) as unknown as Array<{
      id: number;
      completed_at: string;
      cart_items: Array<{
        quantity_hundredths: number;
        actual_unit_price_cents: number;
        purchase_status: string;
      }>;
    }>) {
      const month = cart.completed_at.slice(0, 7);
      const entry = months.get(month) ?? { total_cents: 0, carts: new Set<number>() };
      entry.carts.add(Number(cart.id));
      entry.total_cents += DELIVERY_SERVICE_FEE_CENTS;
      for (const item of cart.cart_items) {
        if (item.purchase_status !== "bought") continue;
        entry.total_cents += Math.round(
          (item.actual_unit_price_cents * item.quantity_hundredths) / 100,
        );
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
    earnedCents: 0,
    paidCents: 0,
    unpaidCents: 0,
    completedThisMonth: 0,
    earnedThisMonthCents: 0,
  };
  if (viewer.role === "admin" || viewer.role === "delivery") {
    const { count, error } = await db
      .from("carts")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed");
    throwIfSupabaseError(error);
    const completedOrders = count ?? 0;
    const earnedCents = completedOrders * DELIVERY_SERVICE_FEE_CENTS;
    const paidCents = Math.min(metaInteger(metadata.get(DELIVERY_PAID_META_KEY)), earnedCents);
    const currentMonth = nowIso().slice(0, 7);
    const completedThisMonth =
      monthlyTotals.find((entry) => entry.month === currentMonth)?.carts_count ?? 0;
    deliveryWallet = {
      completedOrders,
      earnedCents,
      paidCents,
      unpaidCents: earnedCents - paidCents,
      completedThisMonth,
      earnedThisMonthCents: completedThisMonth * DELIVERY_SERVICE_FEE_CENTS,
    };
  }

  return {
    users: viewer.role === "member" ? users.filter((user) => user.id === viewer.id) : users,
    products,
    carts: visibleCarts,
    items,
    monthlyTotals,
    pendingUsers,
    deliveryServiceFeeCents: DELIVERY_SERVICE_FEE_CENTS,
    monthlyBudgetCents,
    favoriteProductIds,
    deliveryWallet,
    pushPublicKey: viewer.role === "delivery" ? getPushPublicKey() : null,
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

        const quantityById = new Map<number, number>();
        for (const raw of items) {
          const entry = raw as Record<string, unknown>;
          quantityById.set(
            asPositiveInt(entry.productId, "productId"),
            asPositiveInt(entry.quantityHundredths, "quantity"),
          );
        }
        const productIds = [...quantityById.keys()];
        let productRows: Array<{ id: number; unit_price_cents: number }> = [];
        if (productIds.length) {
          const { data, error: productsError } = await db
            .from("products")
            .select("id, unit_price_cents")
            .eq("active", true)
            .in("id", productIds);
          throwIfSupabaseError(productsError);
          productRows = data ?? [];
          if (productRows.length !== productIds.length) {
            throw new Error("Un produit du panier est indisponible.");
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
              quantity_hundredths: quantityById.get(Number(product.id)),
              requested_unit_price_cents: product.unit_price_cents,
              actual_unit_price_cents: product.unit_price_cents,
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

        const quantityById = new Map<number, number>();
        for (const raw of items) {
          const entry = raw as Record<string, unknown>;
          quantityById.set(
            asPositiveInt(entry.productId, "productId"),
            asPositiveInt(entry.quantityHundredths, "quantity"),
          );
        }
        const productIds = [...quantityById.keys()];
        let productRows: Array<{ id: number; unit_price_cents: number }> = [];
        if (productIds.length) {
          const { data, error: productsError } = await db
            .from("products")
            .select("id, unit_price_cents")
            .eq("active", true)
            .in("id", productIds);
          throwIfSupabaseError(productsError);
          productRows = data ?? [];
          if (productRows.length !== productIds.length) {
            throw new Error("Un produit du panier est indisponible.");
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
              quantity_hundredths: quantityById.get(Number(product.id)),
              requested_unit_price_cents: product.unit_price_cents,
              actual_unit_price_cents: product.unit_price_cents,
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
          .select("id, missing_products_note")
          .eq("id", cartId)
          .in("status", ACTIVE_CART_STATUSES)
          .maybeSingle();
        throwIfSupabaseError(cartError);
        if (!cart) throw new Error("Ce panier a déjà été traité.");

        const { data: rows, error } = await db
          .from("cart_items")
          .select("product_id, actual_unit_price_cents, purchase_status, products!inner(purchase_count)")
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
          const { error: productError } = await db
            .from("products")
            .update({
              unit_price_cents: item.actual_unit_price_cents,
              purchase_count: product.purchase_count + 1,
              updated_at: nowIso(),
            })
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
        const { count, error: countError } = await db
          .from("carts")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed");
        throwIfSupabaseError(countError);
        const paidCents = (count ?? 0) * DELIVERY_SERVICE_FEE_CENTS;
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
        requireRole(viewer.role, "delivery");
        if (!getPushPublicKey()) throw new Error("Les notifications ne sont pas encore configurées.");
        await saveDeliveryPushSubscription(viewer.id, body.subscription);
        break;
      }

      case "unsubscribe_push": {
        requireRole(viewer.role, "delivery");
        await removeDeliveryPushSubscription(viewer.id, body.endpoint);
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
