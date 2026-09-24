import {
  authenticateFamilyMemberById,
  authenticateFamilyUser,
  consumeFamilyAuthAttempt,
  createFamilySession,
  ensureFamilyAuthUsers,
  familyLoginPath,
  familySessionCookie,
} from "@/lib/family-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: unknown;
      memberId?: unknown;
      password?: unknown;
      familyCode?: unknown;
      returnTo?: unknown;
    };
    const username = typeof body.username === "string" ? body.username : "";
    const memberId = typeof body.memberId === "number" ? body.memberId : Number(body.memberId);
    const password = typeof body.password === "string" ? body.password : "";
    const familyCode = typeof body.familyCode === "string" ? body.familyCode : "";
    await ensureFamilyAuthUsers();
    const limiter = await consumeFamilyAuthAttempt(request, "login", 20, 15 * 60);
    if (!limiter.allowed) {
      return Response.json(
        { error: "Trop de tentatives. Réessayez dans quelques minutes.", code: "RATE_LIMITED" },
        {
          status: 429,
          headers: { "retry-after": String(limiter.retryAfterSeconds) },
        },
      );
    }

    const result = Number.isSafeInteger(memberId) && memberId > 0
      ? await authenticateFamilyMemberById(memberId, password, familyCode)
      : await authenticateFamilyUser(username, password, familyCode);

    if (result.status === "invalid") {
      return Response.json(
        { error: "Nom ou code PIN incorrect.", code: "INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    if (result.status === "pending") {
      return Response.json(
        { error: "Votre compte attend l’approbation du propriétaire de la famille.", code: "ACCOUNT_PENDING" },
        { status: 403 },
      );
    }

    if (result.status === "provisioning") {
      return Response.json(
        { error: "L’espace de cette famille est encore en préparation.", code: "FAMILY_PROVISIONING" },
        { status: 403 },
      );
    }

    if (result.status === "suspended") {
      return Response.json(
        { error: "Cet espace familial est temporairement suspendu.", code: "FAMILY_SUSPENDED" },
        { status: 403 },
      );
    }

    const session = await createFamilySession(result.user.id, result.user.familyId);
    return Response.json(
      {
        user: {
          id: result.user.id,
          name: result.user.name,
          username: result.user.username,
          role: result.user.role,
          initials: result.user.initials,
        },
        route: familyLoginPath(result.user.role, body.returnTo),
      },
      { headers: { "set-cookie": familySessionCookie(session.token, request) } },
    );
  } catch {
    return Response.json({ error: "Connexion impossible." }, { status: 500 });
  }
}
