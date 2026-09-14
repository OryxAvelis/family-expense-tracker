import { getRequestFamilyUser } from "@/lib/family-auth";
import { parseServicesState, SERVICES_META_KEY } from "@/lib/family-services";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const STORAGE_BUCKET = "product-images";
const PROOF_KEY_PATTERN =
  /^payment-proofs\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;

function proofType(bytes: Uint8Array) {
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

async function loadState() {
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("app_meta").select("value").eq("key", SERVICES_META_KEY).maybeSingle();
  throwIfSupabaseError(error);
  return parseServicesState(data?.value);
}

async function saveState(value: ReturnType<typeof parseServicesState>) {
  const { error } = await getSupabaseAdmin().from("app_meta").upsert(
    { key: SERVICES_META_KEY, value: JSON.stringify(value) },
    { onConflict: "key" },
  );
  throwIfSupabaseError(error);
}

export async function GET(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });

  try {
    const paymentId = new URL(request.url).searchParams.get("paymentId")?.trim() ?? "";
    const state = await loadState();
    const payment = state.payments.find((item) => item.id === paymentId);
    if (!payment || (viewer.role !== "admin" && payment.user_id !== viewer.id)) {
      return Response.json({ error: "Justificatif introuvable." }, { status: 404 });
    }
    if (!payment.proof_key || !PROOF_KEY_PATTERN.test(payment.proof_key)) {
      return Response.json({ error: "Aucun justificatif n’a été envoyé." }, { status: 404 });
    }

    const { data, error } = await getSupabaseAdmin().storage.from(STORAGE_BUCKET).download(payment.proof_key);
    if (error || !data) return Response.json({ error: "Justificatif introuvable." }, { status: 404 });

    const extension = payment.proof_key.split(".").at(-1) ?? "bin";
    return new Response(data, {
      headers: {
        "content-type": data.type || "application/octet-stream",
        "content-disposition": `inline; filename="justificatif-${payment.id}.${extension}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Justificatif indisponible.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });

  try {
    const formData = await request.formData();
    const paymentId = String(formData.get("paymentId") ?? "").trim();
    const proof = formData.get("proof");
    if (!(proof instanceof File) || !paymentId) {
      return Response.json({ error: "Choisissez un justificatif." }, { status: 400 });
    }
    if (proof.size === 0 || proof.size > MAX_PROOF_BYTES) {
      return Response.json({ error: "Le justificatif doit faire moins de 5 Mo." }, { status: 413 });
    }

    const state = await loadState();
    const payment = state.payments.find((item) => item.id === paymentId);
    if (!payment || payment.user_id !== viewer.id) {
      return Response.json({ error: "Paiement introuvable." }, { status: 404 });
    }
    if (payment.status !== "pending") {
      return Response.json({ error: "Cette demande a déjà été traitée." }, { status: 409 });
    }
    if (payment.request_type === "trial") {
      return Response.json({ error: "Aucun justificatif n’est nécessaire pour un essai gratuit." }, { status: 400 });
    }

    const bytes = new Uint8Array(await proof.arrayBuffer());
    const type = proofType(bytes);
    if (!type) {
      return Response.json({ error: "Utilisez une image JPG, PNG ou WebP." }, { status: 415 });
    }

    const previousKey = payment.proof_key;
    const key = `payment-proofs/${payment.id}/${crypto.randomUUID()}.${type.extension}`;
    const db = getSupabaseAdmin();
    const { error: uploadError } = await db.storage.from(STORAGE_BUCKET).upload(key, bytes, {
      contentType: type.contentType,
      cacheControl: "0",
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message);

    payment.proof_key = key;
    payment.proof_name = proof.name.trim().slice(0, 120) || `justificatif.${type.extension}`;
    try {
      await saveState(state);
    } catch (error) {
      await db.storage.from(STORAGE_BUCKET).remove([key]);
      throw error;
    }
    if (previousKey && PROOF_KEY_PATTERN.test(previousKey)) {
      await db.storage.from(STORAGE_BUCKET).remove([previousKey]);
    }

    return Response.json({ uploaded: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Envoi du justificatif impossible.";
    return Response.json({ error: message }, { status: 500 });
  }
}
