import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type FamilyRole = "admin" | "delivery" | "member";

export type FamilySessionUser = {
  id: number;
  name: string;
  username: string;
  role: FamilyRole;
  initials: string;
};

export const FAMILY_USERS = [
  { id: 1, name: "Youssef", username: "youssef", role: "admin", initials: "YO" },
  { id: 2, name: "Salma", username: "salma", role: "delivery", initials: "SA" },
  { id: 3, name: "Papa", username: "papa", role: "member", initials: "PA" },
  { id: 4, name: "Maman", username: "maman", role: "member", initials: "MA" },
  { id: 5, name: "Amina", username: "amina", role: "member", initials: "AM" },
  { id: 6, name: "Yassine", username: "yassine", role: "member", initials: "YA" },
  { id: 7, name: "Sara", username: "sara", role: "member", initials: "SR" },
  { id: 8, name: "Adam", username: "adam", role: "member", initials: "AD" },
] as const;

export const FAMILY_SESSION_COOKIE = "family_expense_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function getD1() {
  if (!env.DB) throw new Error("La base de données est indisponible.");
  return env.DB;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hashFamilyPassword(username: string, password: string) {
  return sha256(`family-expense:${username.toLocaleLowerCase()}:${password}`);
}

async function hashSessionToken(token: string) {
  return sha256(`family-session:${token}`);
}

function createOpaqueToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export async function ensureFamilyAuthUsers(db: D1Database) {
  const initialPassword = env.FAMILY_INITIAL_PASSWORD?.trim();
  const passwordRows = await Promise.all(
    FAMILY_USERS.map(async (user) => ({
      ...user,
      passwordHash: initialPassword
        ? await hashFamilyPassword(user.username, initialPassword)
        : "",
    })),
  );

  await db.batch(
    passwordRows.flatMap((user) => {
      const statements = [
        db
        .prepare(
          "INSERT OR IGNORE INTO family_users (id, name, username, role, initials, password_hash, active) VALUES (?, ?, ?, ?, ?, ?, 1)",
        )
        .bind(user.id, user.name, user.username, user.role, user.initials, user.passwordHash),
      ];
      if (initialPassword) {
        statements.push(
          db
            .prepare("UPDATE family_users SET password_hash = ? WHERE id = ? AND password_hash = ''")
            .bind(user.passwordHash, user.id),
        );
      }
      return statements;
    }),
  );
}

export async function authenticateFamilyUser(username: string, password: string) {
  const normalizedUsername = username.trim().toLocaleLowerCase();
  if (!normalizedUsername || !password) return null;

  const db = getD1();
  await ensureFamilyAuthUsers(db);
  const user = await db
    .prepare(
      "SELECT id, name, username, role, initials, password_hash FROM family_users WHERE username = ? AND active = 1",
    )
    .bind(normalizedUsername)
    .first<FamilySessionUser & { password_hash: string }>();
  if (!user) return null;

  const submittedHash = await hashFamilyPassword(user.username, password);
  if (submittedHash !== user.password_hash) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    initials: user.initials,
  };
}

export async function createFamilySession(userId: number) {
  const db = getD1();
  const token = createOpaqueToken();
  const tokenHash = await hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const now = new Date().toISOString();

  await db.batch([
    db.prepare("DELETE FROM family_sessions WHERE expires_at <= ?").bind(now),
    db
      .prepare(
        "INSERT INTO family_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
      )
      .bind(tokenHash, userId, expiresAt, now),
  ]);

  return { token, expiresAt };
}

async function findUserByToken(token: string | undefined) {
  if (!token) return null;
  const tokenHash = await hashSessionToken(token);
  return getD1()
    .prepare(
      `SELECT u.id, u.name, u.username, u.role, u.initials
       FROM family_sessions s
       JOIN family_users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<FamilySessionUser>();
}

function cookieValue(header: string | null, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...valueParts] = part.trim().split("=");
    if (key === name) return decodeURIComponent(valueParts.join("="));
  }
  return undefined;
}

export async function getRequestFamilyUser(request: Request) {
  return findUserByToken(cookieValue(request.headers.get("cookie"), FAMILY_SESSION_COOKIE));
}

export async function getPageFamilyUser() {
  const cookieStore = await cookies();
  return findUserByToken(cookieStore.get(FAMILY_SESSION_COOKIE)?.value);
}

export async function requireFamilyRole(role: FamilyRole, returnTo: string) {
  const user = await getPageFamilyUser();
  if (!user) redirect(`/connexion?returnTo=${encodeURIComponent(returnTo)}`);
  if (user.role !== role) redirect(familyRolePath(user.role));
  return user;
}

export function familyRolePath(role: FamilyRole) {
  if (role === "admin") return "/admin";
  if (role === "delivery") return "/livreur";
  return "/membre";
}

export function familySessionCookie(token: string, request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${FAMILY_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function clearFamilySessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${FAMILY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function revokeRequestFamilySession(request: Request) {
  const token = cookieValue(request.headers.get("cookie"), FAMILY_SESSION_COOKIE);
  if (!token) return;
  const tokenHash = await hashSessionToken(token);
  await getD1().prepare("DELETE FROM family_sessions WHERE token_hash = ?").bind(tokenHash).run();
}
