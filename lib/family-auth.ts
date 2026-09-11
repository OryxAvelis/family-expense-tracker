import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

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

export async function ensureFamilyAuthUsers() {
  const db = getSupabaseAdmin();
  const initialPassword = process.env.FAMILY_INITIAL_PASSWORD?.trim();
  const passwordRows = await Promise.all(
    FAMILY_USERS.map(async (user) => ({
      ...user,
      passwordHash: initialPassword
        ? await hashFamilyPassword(user.username, initialPassword)
        : "",
    })),
  );

  const { error: insertError } = await db.from("family_users").upsert(
    passwordRows.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      initials: user.initials,
      password_hash: user.passwordHash,
      active: true,
    })),
    { onConflict: "id", ignoreDuplicates: true },
  );
  throwIfSupabaseError(insertError);

  if (initialPassword) {
    const updates = await Promise.all(
      passwordRows.map((user) =>
        db
          .from("family_users")
          .update({ password_hash: user.passwordHash })
          .eq("id", user.id)
          .eq("password_hash", ""),
      ),
    );
    for (const result of updates) throwIfSupabaseError(result.error);
  }
}

export async function authenticateFamilyUser(username: string, password: string) {
  const normalizedUsername = username.trim().toLocaleLowerCase();
  if (!normalizedUsername || !password) return null;

  const db = getSupabaseAdmin();
  await ensureFamilyAuthUsers();
  const { data: user, error } = await db
    .from("family_users")
    .select("id, name, username, role, initials, password_hash")
    .eq("username", normalizedUsername)
    .eq("active", true)
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!user) return null;

  const submittedHash = await hashFamilyPassword(user.username, password);
  if (submittedHash !== user.password_hash) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role as FamilyRole,
    initials: user.initials,
  };
}

export async function createFamilySession(userId: number) {
  const db = getSupabaseAdmin();
  const token = createOpaqueToken();
  const tokenHash = await hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const now = new Date().toISOString();

  const { error: cleanupError } = await db
    .from("family_sessions")
    .delete()
    .lte("expires_at", now);
  throwIfSupabaseError(cleanupError);
  const { error: insertError } = await db.from("family_sessions").insert({
    token_hash: tokenHash,
    user_id: userId,
    expires_at: expiresAt,
    created_at: now,
  });
  throwIfSupabaseError(insertError);

  return { token, expiresAt };
}

async function findUserByToken(token: string | undefined) {
  if (!token) return null;
  const tokenHash = await hashSessionToken(token);
  const { data, error } = await getSupabaseAdmin()
    .from("family_sessions")
    .select("family_users!inner(id, name, username, role, initials, active)")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .eq("family_users.active", true)
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!data) return null;

  const user = data.family_users as unknown as FamilySessionUser & { active: boolean };
  return {
    id: Number(user.id),
    name: user.name,
    username: user.username,
    role: user.role,
    initials: user.initials,
  };
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
  const { error } = await getSupabaseAdmin()
    .from("family_sessions")
    .delete()
    .eq("token_hash", tokenHash);
  throwIfSupabaseError(error);
}
