import { getRequestFamilyUser } from "@/lib/family-auth";
import { readFamilyMeta } from "@/lib/family-meta";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";
import { effectivePlan, parseServicesState, serviceFeeForPlan, SERVICES_META_KEY } from "@/lib/family-services";

export const dynamic = "force-dynamic";

const RECEIPT_META_PREFIX = "cart_receipt_";

function receiptMeta(value?: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const key = typeof parsed.key === "string" ? parsed.key : "";
    return /^cart-receipts\/(?:[0-9a-f-]{36}\/)?\d+\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(key)
      ? { uploadedAt: typeof parsed.uploadedAt === "string" ? parsed.uploadedAt : null }
      : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });
  if (viewer.role !== "admin") return Response.json({ error: "Accès réservé à l’administrateur." }, { status: 403 });
  try {
    const parameters = new URL(request.url).searchParams;
    const page = Math.max(1, Math.min(100000, Number(parameters.get("page")) || 1));
    if (!Number.isInteger(page)) return Response.json({ error: "Page invalide." }, { status: 400 });
    const db = getSupabaseAdmin();
    let query = db.from("carts").select(
      "id, member_id, status, created_at, submitted_at, completed_at, missing_products_note, family_users!inner(name), cart_items(id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status, products!inner(name_fr, name_ar, name_en, unit, package_size))",
      { count: "exact" },
    ).eq("family_id", viewer.familyId);
    const memberId = Number(parameters.get("memberId"));
    if (memberId > 0 && Number.isSafeInteger(memberId)) query = query.eq("member_id", memberId);
    const status = parameters.get("status");
    if (status && ["pending", "ready", "shopping", "completed", "cancelled"].includes(status)) query = query.eq("status", status);
    const { data, error, count } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
    throwIfSupabaseError(error);
    const keys = (data ?? []).flatMap((cart) => [
      `cart_service_fee_${cart.id}`,
      `offline_purchase_${cart.id}`,
      `cart_created_by_${cart.id}`,
      `cart_wallet_scope_${cart.id}`,
      `${RECEIPT_META_PREFIX}${cart.id}`,
    ]);
    const meta = await readFamilyMeta(viewer.familyId, [SERVICES_META_KEY, ...keys]);
    const metadata = new Map((meta ?? []).map((entry) => [entry.key, entry.value]));
    const plans = parseServicesState(metadata.get(SERVICES_META_KEY));
    const carts = (data ?? []).map((cart) => {
      const receipt = receiptMeta(metadata.get(`${RECEIPT_META_PREFIX}${cart.id}`));
      return {
        ...cart,
        created_by: metadata.get(`cart_created_by_${cart.id}`) ?? null,
        offline_purchase: metadata.get(`offline_purchase_${cart.id}`) === "1",
        wallet_scope: metadata.get(`cart_wallet_scope_${cart.id}`) === "family" ? "family" : "personal",
        receipt_url: receipt ? `/api/receipts?cartId=${cart.id}` : null,
        receipt_uploaded_at: receipt?.uploadedAt ?? null,
        service_fee_cents: cart.status === "cancelled" ? 0 : cart.status === "completed"
          ? Number(metadata.get(`cart_service_fee_${cart.id}`) ?? 50)
          : serviceFeeForPlan(effectivePlan(plans, Number(cart.member_id))),
      };
    });
    return Response.json({ carts, total: count ?? 0, page, pageSize: 20 });
  } catch {
    return Response.json({ error: "Impossible de charger l’historique." }, { status: 500 });
  }
}
