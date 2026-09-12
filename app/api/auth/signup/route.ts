import {
  consumeFamilyAuthAttempt,
  ensureFamilyAuthUsers,
  familyInitials,
  hashNewFamilyPin,
  normalizeFamilyName,
  normalizeFamilyUsername,
} from "@/lib/family-auth";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FAMILY_NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;

export async function POST(request: Request) {
  try {
    await ensureFamilyAuthUsers();
    const limiter = await consumeFamilyAuthAttempt(request, "signup", 10, 60 * 60);
    if (!limiter.allowed) {
      return Response.json(
        { error: "Trop de créations de compte. Réessayez plus tard.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "retry-after": String(limiter.retryAfterSeconds) },
        },
      );
    }

    const body = (await request.json()) as { name?: unknown; pin?: unknown };
    const name = normalizeFamilyName(typeof body.name === "string" ? body.name : "");
    const pin = typeof body.pin === "string" ? body.pin : "";
    const username = normalizeFamilyUsername(name);

    if (name.length < 2 || name.length > 40 || !FAMILY_NAME_PATTERN.test(name) || !username) {
      return Response.json(
        { error: "Saisissez un nom valide (2 à 40 caractères).", code: "INVALID_NAME" },
        { status: 400 },
      );
    }
    if (!/^\d{4}$/.test(pin)) {
      return Response.json(
        { error: "Le code PIN doit contenir exactement 4 chiffres.", code: "INVALID_PIN" },
        { status: 400 },
      );
    }

    const db = getSupabaseAdmin();
    const { data: existing, error: existingError } = await db
      .from("family_users")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    throwIfSupabaseError(existingError);
    if (existing) {
      return Response.json(
        { error: "Ce nom est déjà utilisé.", code: "NAME_TAKEN" },
        { status: 409 },
      );
    }

    const passwordHash = await hashNewFamilyPin(pin);
    const { error } = await db.from("family_users").insert({
      name,
      username,
      password_hash: passwordHash,
      role: "member",
      initials: familyInitials(name),
      active: false,
    });
    if (error?.code === "23505") {
      return Response.json(
        { error: "Ce nom est déjà utilisé.", code: "NAME_TAKEN" },
        { status: 409 },
      );
    }
    throwIfSupabaseError(error);

    return Response.json(
      { created: true, status: "pending", username },
      { status: 201 },
    );
  } catch {
    return Response.json({ error: "Création du compte impossible." }, { status: 500 });
  }
}
