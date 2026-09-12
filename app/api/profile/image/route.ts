import { getRequestFamilyUser } from "@/lib/family-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PROFILE_IMAGE_BYTES = 3 * 1024 * 1024;
const PROFILE_IMAGE_BUCKET = "product-images";

function profileImageKey(userId: number) {
  return `profile-images/user-${userId}`;
}

function requestedUserId(request: Request, fallbackUserId: number) {
  const rawUserId = new URL(request.url).searchParams.get("userId");
  if (!rawUserId) return fallbackUserId;
  const userId = Number(rawUserId);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

function detectedImageType(bytes: Uint8Array) {
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return "image/jpeg";

  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  if (isPng) return "image/png";

  const isWebp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  return isWebp ? "image/webp" : null;
}

export async function GET(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });

  const userId = requestedUserId(request, viewer.id);
  if (!userId) return Response.json({ error: "Profil invalide." }, { status: 400 });

  try {
    const db = getSupabaseAdmin();
    const { data: profile, error: profileError } = await db
      .from("family_users")
      .select("id")
      .eq("id", userId)
      .eq("active", true)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) return Response.json({ error: "Profil invalide." }, { status: 404 });

    const { data, error } = await db.storage
      .from(PROFILE_IMAGE_BUCKET)
      .download(profileImageKey(userId));
    if (error || !data) return Response.json({ error: "Photo introuvable." }, { status: 404 });

    const headers = new Headers();
    headers.set("content-type", data.type || "application/octet-stream");
    headers.set("content-length", String(data.size));
    headers.set("cache-control", "private, no-store");
    headers.set("content-disposition", "inline");
    headers.set("x-content-type-options", "nosniff");
    headers.set("vary", "Cookie");
    return new Response(data, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Photo indisponible.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });

  try {
    const formData = await request.formData();
    const image = formData.get("image");
    if (!(image instanceof File) || image.size === 0) {
      return Response.json({ error: "Choisissez une photo." }, { status: 400 });
    }
    if (image.size > MAX_PROFILE_IMAGE_BYTES) {
      return Response.json({ error: "La photo ne doit pas dépasser 3 Mo." }, { status: 413 });
    }

    const bytes = new Uint8Array(await image.arrayBuffer());
    const contentType = detectedImageType(bytes);
    if (!contentType) {
      return Response.json(
        { error: "Choisissez une photo JPG, PNG ou WebP." },
        { status: 415 },
      );
    }

    const { error } = await getSupabaseAdmin().storage
      .from(PROFILE_IMAGE_BUCKET)
      .upload(profileImageKey(viewer.id), bytes, {
        contentType,
        cacheControl: "0",
        upsert: true,
      });
    if (error) throw new Error(error.message);

    return Response.json({ saved: true, version: Date.now() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Envoi de la photo impossible.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const viewer = await getRequestFamilyUser(request);
  if (!viewer) return Response.json({ error: "Connexion requise." }, { status: 401 });

  try {
    const { error } = await getSupabaseAdmin().storage
      .from(PROFILE_IMAGE_BUCKET)
      .remove([profileImageKey(viewer.id)]);
    if (error) throw new Error(error.message);
    return Response.json({ removed: true, version: Date.now() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suppression impossible.";
    return Response.json({ error: message }, { status: 500 });
  }
}
