import {
  authenticateFamilyUser,
  createFamilySession,
  familyRolePath,
  familySessionCookie,
} from "@/lib/family-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = await authenticateFamilyUser(username, password);

    if (!user) {
      return Response.json(
        { error: "Nom d’utilisateur ou mot de passe incorrect." },
        { status: 401 },
      );
    }

    const session = await createFamilySession(user.id);
    return Response.json(
      { user, route: familyRolePath(user.role) },
      { headers: { "set-cookie": familySessionCookie(session.token, request) } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connexion impossible.";
    return Response.json({ error: message }, { status: 500 });
  }
}
