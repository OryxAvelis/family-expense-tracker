import {
  authenticateFamilyUser,
  consumeFamilyAuthAttempt,
  createFamilySession,
  ensureFamilyAuthUsers,
  familyRolePath,
  familySessionCookie,
} from "@/lib/family-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
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

    const result = await authenticateFamilyUser(username, password);

    if (result.status === "invalid") {
      return Response.json(
        { error: "Nom ou code PIN incorrect.", code: "INVALID_CREDENTIALS" },
        { status: 401 },
      );
    }

    if (result.status === "pending") {
      return Response.json(
        { error: "Votre compte attend l’approbation de Youssef.", code: "ACCOUNT_PENDING" },
        { status: 403 },
      );
    }

    const session = await createFamilySession(result.user.id);
    return Response.json(
      { user: result.user, route: familyRolePath(result.user.role) },
      { headers: { "set-cookie": familySessionCookie(session.token, request) } },
    );
  } catch {
    return Response.json({ error: "Connexion impossible." }, { status: 500 });
  }
}
