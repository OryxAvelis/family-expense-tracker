import { getRequestFamilyUser } from "@/lib/family-auth";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const STORAGE_BUCKET = "product-images";
const RECEIPT_META_PREFIX = "cart_receipt_";
const RECEIPT_KEY_PATTERN = /^cart-receipts\/\d+\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

type ReceiptMeta = {
  key: string;
  name: string;
  uploadedAt: string;
  uploadedBy: string;
  ocrText: string;
};

function receiptType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" } as const;
  }
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { contentType: "image/png", extension: "png" } as const;
  }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", extension: "webp" } as const;
  }
  return null;
}

function parseReceiptMeta(value?: string | null): ReceiptMeta | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<ReceiptMeta>;
    if (!parsed.key || !RECEIPT_KEY_PATTERN.test(parsed.key)) return null;
    return {
      key: parsed.key,
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 120) : "ticket",
      uploadedAt: typeof parsed.uploadedAt === "string" ? parsed.uploadedAt : "",
      uploadedBy: typeof parsed.uploadedBy === "string" ? parsed.uploadedBy : "",
      ocrText: typeof parsed.ocrText === "string" ? parsed.ocrText.slice(0, 8_000) : "",
    };
  } catch {
    return null;
  }
}

async function authorizedCart(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return { error: Response.json({ error: "Connexion requise." }, { status: 401 }) };
  const cartId = Number(new URL(request.url).searchParams.get("cartId"));
  if (!Number.isSafeInteger(cartId) || cartId <= 0) {
    return { error: Response.json({ error: "Panier invalide." }, { status: 400 }) };
  }
  const db = getSupabaseAdmin();
  const { data: cart, error } = await db.from("carts").select("id, member_id, status").eq("id", cartId).maybeSingle();
  throwIfSupabaseError(error);
  if (!cart || (viewer.role === "member" && Number(cart.member_id) !== viewer.id)) {
    return { error: Response.json({ error: "Ticket introuvable." }, { status: 404 }) };
  }
  return { viewer, cartId, cart, db };
}

export async function GET(request: Request) {
  try {
    const authorization = await authorizedCart(request);
    if ("error" in authorization) return authorization.error;
    const { cartId, db } = authorization;
    const { data: row, error } = await db.from("app_meta").select("value").eq("key", `${RECEIPT_META_PREFIX}${cartId}`).maybeSingle();
    throwIfSupabaseError(error);
    const meta = parseReceiptMeta(row?.value);
    if (!meta) return Response.json({ error: "Aucun ticket enregistré." }, { status: 404 });
    const { data, error: downloadError } = await db.storage.from(STORAGE_BUCKET).download(meta.key);
    if (downloadError || !data) return Response.json({ error: "Ticket introuvable." }, { status: 404 });
    return new Response(data, {
      headers: {
        "content-type": data.type || "application/octet-stream",
        "content-disposition": `inline; filename="ticket-${cartId}.${meta.key.split(".").at(-1) ?? "jpg"}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Ticket indisponible." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authorization = await authorizedCart(request);
    if ("error" in authorization) return authorization.error;
    const { viewer, cartId, cart, db } = authorization;
    if (viewer.role !== "delivery") {
      return Response.json({ error: "Seul Josef peut enregistrer le ticket." }, { status: 403 });
    }
    if (!(["pending", "ready", "shopping"] as string[]).includes(String(cart.status))) {
      return Response.json({ error: "Cette commande est déjà terminée." }, { status: 409 });
    }
    const formData = await request.formData();
    const receipt = formData.get("receipt");
    if (!(receipt instanceof File) || receipt.size === 0) {
      return Response.json({ error: "Choisissez une photo du ticket." }, { status: 400 });
    }
    if (receipt.size > MAX_RECEIPT_BYTES) {
      return Response.json({ error: "La photo doit faire moins de 5 Mo." }, { status: 413 });
    }
    const bytes = new Uint8Array(await receipt.arrayBuffer());
    const type = receiptType(bytes);
    if (!type) return Response.json({ error: "Utilisez une image JPG, PNG ou WebP." }, { status: 415 });

    const metaKey = `${RECEIPT_META_PREFIX}${cartId}`;
    const { data: previousRow, error: previousError } = await db.from("app_meta").select("value").eq("key", metaKey).maybeSingle();
    throwIfSupabaseError(previousError);
    const previous = parseReceiptMeta(previousRow?.value);
    const key = `cart-receipts/${cartId}/${crypto.randomUUID()}.${type.extension}`;
    const { error: uploadError } = await db.storage.from(STORAGE_BUCKET).upload(key, bytes, {
      contentType: type.contentType,
      cacheControl: "0",
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

    const meta: ReceiptMeta = {
      key,
      name: receipt.name.trim().slice(0, 120) || `ticket.${type.extension}`,
      uploadedAt: new Date().toISOString(),
      uploadedBy: viewer.name,
      ocrText: String(formData.get("ocrText") ?? "").trim().slice(0, 8_000),
    };
    const { error: saveError } = await db.from("app_meta").upsert(
      { key: metaKey, value: JSON.stringify(meta) },
      { onConflict: "key" },
    );
    if (saveError) {
      await db.storage.from(STORAGE_BUCKET).remove([key]);
      throw new Error(saveError.message);
    }
    if (previous?.key) await db.storage.from(STORAGE_BUCKET).remove([previous.key]);
    return Response.json({
      receiptUrl: `/api/receipts?cartId=${cartId}&v=${encodeURIComponent(meta.uploadedAt)}`,
      receiptName: meta.name,
      uploadedAt: meta.uploadedAt,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Envoi du ticket impossible." }, { status: 500 });
  }
}
