import { createPublicKey, verify, type JsonWebKey as NodeJsonWebKey } from "node:crypto";

import { notifyMembersOfShoppingReminder } from "@/lib/push-notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUDIENCE = "family-expense-tracker-reminders";
const TRUSTED_REPOSITORY = "oryxavelis/family-expense-tracker";
const TRUSTED_WORKFLOW =
  "oryxavelis/family-expense-tracker/.github/workflows/shopping-reminders.yml@refs/heads/main";

type GitHubClaims = {
  aud?: string | string[];
  event_name?: string;
  exp?: number;
  iss?: string;
  nbf?: number;
  ref?: string;
  repository?: string;
  workflow_ref?: string;
};

function decodeJsonPart<T>(part: string) {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

async function isTrustedGitHubWorkflow(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const header = decodeJsonPart<{ alg?: string; kid?: string }>(parts[0]);
    const claims = decodeJsonPart<GitHubClaims>(parts[1]);
    if (header.alg !== "RS256" || !header.kid) return false;

    const response = await fetch(`${GITHUB_OIDC_ISSUER}/.well-known/jwks`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return false;
    const keySet = await response.json() as { keys?: Array<NodeJsonWebKey & { kid?: string }> };
    const key = keySet.keys?.find((candidate) => candidate.kid === header.kid);
    if (!key) return false;
    const verified = verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(parts[2], "base64url"),
    );
    if (!verified) return false;

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    return (
      claims.iss === GITHUB_OIDC_ISSUER &&
      audiences.includes(GITHUB_OIDC_AUDIENCE) &&
      typeof claims.exp === "number" && claims.exp >= now - 30 &&
      (claims.nbf === undefined || claims.nbf <= now + 30) &&
      claims.repository?.toLowerCase() === TRUSTED_REPOSITORY &&
      claims.workflow_ref?.toLowerCase() === TRUSTED_WORKFLOW &&
      claims.ref === "refs/heads/main" &&
      (claims.event_name === "schedule" || claims.event_name === "workflow_dispatch")
    );
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || !(await isTrustedGitHubWorkflow(token))) {
    return Response.json({ error: "Accès refusé." }, { status: 401 });
  }

  const delivered = await notifyMembersOfShoppingReminder();
  return Response.json(
    { sent: true, delivered, createdAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
