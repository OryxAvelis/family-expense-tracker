export const LEGACY_FAMILY_PIN_LENGTH = 4;
export const MIN_FAMILY_PIN_LENGTH = 6;
export const MAX_FAMILY_PIN_LENGTH = 12;

export type FamilyLoginFailureKey =
  | "incorrectPin"
  | "rateLimited"
  | "accountPending"
  | "familyProvisioning"
  | "familySuspended"
  | "serverFailure";

export function normalizeFamilyPin(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - "٠".charCodeAt(0)))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - "۰".charCodeAt(0)))
    .replace(/\D/g, "")
    .slice(0, MAX_FAMILY_PIN_LENGTH);
}

export function isSupportedFamilyPin(value: string) {
  return /^\d+$/.test(value) && (
    value.length === LEGACY_FAMILY_PIN_LENGTH ||
    (value.length >= MIN_FAMILY_PIN_LENGTH && value.length <= MAX_FAMILY_PIN_LENGTH)
  );
}

export function resolveFamilyLoginFailure(code: unknown, status: number): FamilyLoginFailureKey {
  if (code === "RATE_LIMITED" || status === 429) return "rateLimited";
  if (code === "ACCOUNT_PENDING") return "accountPending";
  if (code === "FAMILY_PROVISIONING") return "familyProvisioning";
  if (code === "FAMILY_SUSPENDED") return "familySuspended";
  if (code === "INVALID_CREDENTIALS" || status === 401) return "incorrectPin";
  return "serverFailure";
}
