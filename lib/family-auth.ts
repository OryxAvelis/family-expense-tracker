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
  { id: 2, name: "Josef", username: "josef", role: "delivery", initials: "JO" },
] as const;

export const ARCHIVED_DEFAULT_MEMBER_USERNAMES = [
  "amina",
  "papa",
  "maman",
  "yassine",
  "sara",
  "adam",
] as const;

export const FAMILY_SESSION_COOKIE = "family_expense_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const FAMILY_AUTH_VERSION = "3";
const PIN_HASH_ITERATIONS = 210_000;
let ensureUsersPromise: Promise<void> | null = null;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hashFamilyPassword(username: string, password: string) {
  return sha256(`family-expense:${username.toLocaleLowerCase()}:${password}`);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePinHash(pin: string, salt: Uint8Array, iterations: number) {
  const saltBuffer = new Uint8Array(salt).buffer;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashNewFamilyPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePinHash(pin, salt, PIN_HASH_ITERATIONS);
  return `pbkdf2$${PIN_HASH_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

async function verifyStoredPin(
  user: { id: number; username: string; password_hash: string },
  pin: string,
) {
  const parts = user.password_hash.split("$");
  if (parts.length === 4 && parts[0] === "pbkdf2") {
    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) {
      return false;
    }
    try {
      const expected = base64UrlToBytes(parts[3]);
      const actual = await derivePinHash(pin, base64UrlToBytes(parts[2]), iterations);
      return sameBytes(actual, expected);
    } catch {
      return false;
    }
  }

  const candidates = [await hashFamilyPassword(user.username, pin)];
  // The original delivery hash used "salma". Supporting it preserves the same PIN
  // while the public account name changes to Josef.
  if (user.id === 2 && user.username === "josef") {
    candidates.push(await hashFamilyPassword("salma", pin));
  }
  return candidates.some((candidate) => candidate === user.password_hash);
}

export function normalizeFamilyName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeFamilyUsername(value: string) {
  return normalizeFamilyName(value)
    .toLocaleLowerCase()
    .replace(/[’']/gu, "")
    .replace(/\s+/gu, "-")
    .replace(/[^\p{L}\p{N}._-]/gu, "")
    .replace(/[-_.]{2,}/gu, "-")
    .replace(/^[-_.]+|[-_.]+$/gu, "")
    .slice(0, 40);
}

export function familyInitials(name: string) {
  return normalizeFamilyName(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}

function authClientAddress(request: Request) {
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "local"
  ).trim();
}

export async function consumeFamilyAuthAttempt(
  request: Request,
  scope: "login" | "signup",
  limit: number,
  windowSeconds: number,
) {
  const fingerprint = await sha256(`${scope}:${authClientAddress(request)}`);
  const key = `family-auth-rate:${scope}:${fingerprint.slice(0, 40)}:`;
  const db = getSupabaseAdmin();
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000).toISOString();

  // Each limiter slot is a unique family_sessions primary key. Concurrent requests
  // race for different slots, so the database—not a read-then-write counter—enforces
  // the limit atomically without requiring a new production table.
  const { error: cleanupError } = await db
    .from("family_sessions")
    .delete()
    .like("token_hash", `${key}%`)
    .lte("expires_at", now.toISOString());
  throwIfSupabaseError(cleanupError);

  for (let slot = 1; slot <= limit; slot += 1) {
    const { error } = await db.from("family_sessions").insert({
      token_hash: `${key}${slot}`,
      user_id: 1,
      expires_at: resetAt,
      created_at: now.toISOString(),
    });
    if (!error) return { allowed: true as const, key };
    if (error.code !== "23505") throw new Error(error.message);
  }

  return { allowed: false as const, retryAfterSeconds: windowSeconds };
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

async function syncFamilyAuthUsers() {
  const db = getSupabaseAdmin();
  const { data: version, error: versionError } = await db
    .from("app_meta")
    .select("value")
    .eq("key", "family_auth_version")
    .maybeSingle();
  throwIfSupabaseError(versionError);
  if (version?.value === FAMILY_AUTH_VERSION) return;

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

  // This intentionally updates only the delivery account. Youssef's admin account
  // and every other existing family account remain untouched.
  const { error: deliveryError } = await db
    .from("family_users")
    .update({ name: "Josef", username: "josef", initials: "JO", role: "delivery", active: true })
    .eq("id", 2)
    .eq("role", "delivery");
  throwIfSupabaseError(deliveryError);

  const { data: archivedUsers, error: archiveError } = await db
    .from("family_users")
    .update({ active: false })
    .in("username", [...ARCHIVED_DEFAULT_MEMBER_USERNAMES])
    .eq("role", "member")
    .select("id");
  throwIfSupabaseError(archiveError);

  const archivedUserIds = (archivedUsers ?? []).map((user) => Number(user.id));
  if (archivedUserIds.length) {
    const { error: sessionError } = await db
      .from("family_sessions")
      .delete()
      .in("user_id", archivedUserIds);
    throwIfSupabaseError(sessionError);
  }

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

  const { count: blankPasswordCount, error: blankPasswordError } = await db
    .from("family_users")
    .select("id", { count: "exact", head: true })
    .in("id", FAMILY_USERS.map((user) => user.id))
    .eq("password_hash", "");
  throwIfSupabaseError(blankPasswordError);
  if ((blankPasswordCount ?? 0) > 0) return;

  const { error: metaError } = await db
    .from("app_meta")
    .upsert({ key: "family_auth_version", value: FAMILY_AUTH_VERSION });
  throwIfSupabaseError(metaError);
}

export async function ensureFamilyAuthUsers() {
  if (!ensureUsersPromise) ensureUsersPromise = syncFamilyAuthUsers();
  try {
    await ensureUsersPromise;
  } catch (error) {
    ensureUsersPromise = null;
    throw error;
  }
}

export async function authenticateFamilyUser(username: string, password: string) {
  const normalizedUsername = normalizeFamilyUsername(username);
  if (!normalizedUsername || username.length > 80 || !/^\d{4}$/.test(password)) {
    return { status: "invalid" as const };
  }

  const db = getSupabaseAdmin();
  await ensureFamilyAuthUsers();
  const { data: user, error } = await db
    .from("family_users")
    .select("id, name, username, role, initials, password_hash, active")
    .eq("username", normalizedUsername)
    .maybeSingle();
  throwIfSupabaseError(error);
  if (!user) return { status: "invalid" as const };

  if (ARCHIVED_DEFAULT_MEMBER_USERNAMES.includes(user.username as typeof ARCHIVED_DEFAULT_MEMBER_USERNAMES[number])) {
    return { status: "invalid" as const };
  }

  if (!(await verifyStoredPin(user, password))) return { status: "invalid" as const };
  if (!user.active) return { status: "pending" as const };
  return {
    status: "authenticated" as const,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role as FamilyRole,
      initials: user.initials,
    },
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
  await ensureFamilyAuthUsers();
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
