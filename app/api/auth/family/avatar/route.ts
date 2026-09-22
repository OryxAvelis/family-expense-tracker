import {
  LEGACY_FAMILY_ID,
  resolveFamilyAccess,
} from "@/lib/family-auth";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PROFILE_IMAGE_BUCKET = "product-images";

function profileImageKey(familyId: string, userId: number) {
  return `profile-images/${familyId}/user-${userId}`;
}

function legacyProfileImageKey(userId: number) {
  return `profile-images/user-${userId}`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const familyCode = url.searchParams.get("familyCode") ?? "";
    const userId = Number(url.searchParams.get("userId"));
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return Response.json({ error: "Profil invalide." }, { status: 400 });
    }

    const access = await resolveFamilyAccess(familyCode);
    if (access.status !== "active") {
      return Response.json({ error: "Famille introuvable." }, { status: 404 });
    }
    const familyId = access.familyId;
    if (!familyId) return Response.json({ error: "Famille introuvable." }, { status: 404 });

    const db = getSupabaseAdmin();
    const { data: member, error: memberError } = await db
      .from("family_users")
      .select("id")
      .eq("family_id", familyId)
      .eq("id", userId)
      .eq("active", true)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) return Response.json({ error: "Profil invalide." }, { status: 404 });

    let { data, error } = await db.storage
      .from(PROFILE_IMAGE_BUCKET)
      .download(profileImageKey(familyId, userId));
    if ((error || !data) && familyId === LEGACY_FAMILY_ID) {
      const legacy = await db.storage
        .from(PROFILE_IMAGE_BUCKET)
        .download(legacyProfileImageKey(userId));
      data = legacy.data;
      error = legacy.error;
    }
    if (error || !data) return Response.json({ error: "Photo introuvable." }, { status: 404 });

    return new Response(data, {
      headers: {
        "content-type": data.type || "application/octet-stream",
        "content-length": String(data.size),
        "cache-control": "private, max-age=60",
        "content-disposition": "inline",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Photo indisponible." }, { status: 500 });
  }
}
