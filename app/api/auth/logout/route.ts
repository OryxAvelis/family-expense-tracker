import {
  clearFamilySessionCookie,
  revokeRequestFamilySession,
} from "@/lib/family-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await revokeRequestFamilySession(request);
  } catch {
    // The cookie is cleared even if the stored session is already unavailable.
  }

  return Response.json(
    { ok: true },
    { headers: { "set-cookie": clearFamilySessionCookie(request) } },
  );
}
