import { createHmac } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const FAMILY_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/;

export class FamilyCodeConfigurationError extends Error {
  constructor() {
    super("Family-code hashing is not configured");
    this.name = "FamilyCodeConfigurationError";
  }
}

function familyCodePepper() {
  const configured = process.env.FAMILY_CODE_PEPPER?.trim();
  if (configured && configured.length >= 32) return configured;

  // Transitional fallback for deployments that already protect a Supabase
  // server key. A dedicated pepper should still be configured so it can be
  // rotated independently from database access.
  const fallback = process.env.SUPABASE_SECRET_KEY?.trim() ?? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (fallback && fallback.length >= 32) return fallback;
  throw new FamilyCodeConfigurationError();
}

function hmacBytes(pepper: string, purpose: string, value: string) {
  return createHmac("sha256", pepper).update(`${purpose}:${value}`, "utf8").digest();
}

function charactersFrom(bytes: Uint8Array, length: number) {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += CODE_ALPHABET[bytes[index] & 31];
  }
  return value;
}

export function normalizeFamilyCode(value: string) {
  const compact = value.normalize("NFKC").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 12) return "";
  const formatted = `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
  return FAMILY_CODE_PATTERN.test(formatted) ? formatted : "";
}

export function familyCodeForRequest(requestId: string) {
  const compact = charactersFrom(hmacBytes(familyCodePepper(), "family-code-source", requestId), 12);
  return `${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}`;
}

export function supportRefForRequest(requestId: string) {
  return `DF-${charactersFrom(hmacBytes(familyCodePepper(), "support-ref", requestId), 8)}`;
}

export function digestFamilyCode(value: string) {
  const normalized = normalizeFamilyCode(value);
  if (!normalized) return "";
  return createHmac("sha256", familyCodePepper())
    .update(`family-code-lookup:${normalized.replaceAll("-", "")}`, "utf8")
    .digest("hex");
}
