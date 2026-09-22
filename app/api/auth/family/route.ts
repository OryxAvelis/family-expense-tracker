import {
  ARCHIVED_DEFAULT_MEMBER_USERNAMES,
  LEGACY_FAMILY_ID,
  resolveFamilyAccess,
} from "@/lib/family-auth";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type FamilyDirectoryRequest = {
  familyCode?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FamilyDirectoryRequest;
    const familyCode = typeof body.familyCode === "string" ? body.familyCode : "";
    const access = await resolveFamilyAccess(familyCode);

    if (access.status === "provisioning") {
      return Response.json(
        { error: "Cette famille est encore en préparation.", code: "FAMILY_PROVISIONING" },
        { status: 409 },
      );
    }
    if (access.status === "suspended") {
      return Response.json(
        { error: "Cet espace familial est temporairement suspendu.", code: "FAMILY_SUSPENDED" },
        { status: 403 },
      );
    }
    if (access.status !== "active") {
      return Response.json(
        { error: "Cette famille est introuvable.", code: "FAMILY_NOT_FOUND" },
        { status: 404 },
      );
    }
    const familyId = access.familyId;
    if (!familyId) {
      return Response.json(
        { error: "Cette famille est introuvable.", code: "FAMILY_NOT_FOUND" },
        { status: 404 },
      );
    }

    const db = getSupabaseAdmin();
    const [familyResult, usersResult] = await Promise.all([
      db
        .from("families")
        .select("display_name, default_locale")
        .eq("id", familyId)
        .single(),
      db
        .from("family_users")
        .select("id, name, initials, username")
        .eq("family_id", familyId)
        .eq("active", true)
        .order("id"),
    ]);
    throwIfSupabaseError(familyResult.error);
    throwIfSupabaseError(usersResult.error);
    if (!familyResult.data) {
      return Response.json(
        { error: "Cette famille est introuvable.", code: "FAMILY_NOT_FOUND" },
        { status: 404 },
      );
    }

    const members = (usersResult.data ?? [])
      .filter(
        (member) =>
          familyId !== LEGACY_FAMILY_ID ||
          !ARCHIVED_DEFAULT_MEMBER_USERNAMES.includes(
            member.username as typeof ARCHIVED_DEFAULT_MEMBER_USERNAMES[number],
          ),
      )
      .map((member) => ({
        id: Number(member.id),
        name: String(member.name),
        initials: String(member.initials),
      }));

    return Response.json(
      {
        familyName: familyResult.data.display_name,
        locale: familyResult.data.default_locale,
        members,
      },
      {
        headers: {
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      return Response.json({
        familyName: "Famille Youssef",
        locale: "fr",
        members: [
          { id: 1, name: "Youssef", initials: "YO" },
          { id: 2, name: "Josef", initials: "JO" },
          { id: 3, name: "Mohamed", initials: "M" },
          { id: 4, name: "Fatiha", initials: "F" },
          { id: 5, name: "Hamid", initials: "H" },
        ],
        preview: true,
      });
    }
    console.error("Family directory error", error);
    return Response.json(
      {
        error: "Impossible d’ouvrir cet espace familial.",
      },
      { status: 500 },
    );
  }
}
