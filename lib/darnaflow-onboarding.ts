import { hash } from "@node-rs/argon2";

import {
  digestFamilyCode,
  FamilyCodeConfigurationError,
  familyCodeForRequest,
  supportRefForRequest,
} from "@/lib/family-code";
import {
  familyInitials,
  normalizeFamilyName,
  normalizeFamilyUsername,
} from "@/lib/family-auth";
import { getSupabaseAdmin, throwIfSupabaseError } from "@/lib/supabase-server";

export type DarnaFlowLocale = "fr" | "ar" | "en";

export type CreateFamilyInput = {
  requestId: string;
  familyName: string;
  ownerName: string;
  username: string;
  pin: string;
  locale: DarnaFlowLocale;
};

export type CreateFamilyResult = {
  supportRef: string;
  familyCode: string;
  status: "active";
};

export class FamilyOnboardingError extends Error {
  constructor(
    public readonly code:
      | "INVALID_FAMILY_NAME"
      | "INVALID_OWNER_NAME"
      | "INVALID_USERNAME"
      | "INVALID_PIN"
      | "INVALID_LOCALE"
      | "INVALID_REQUEST_ID"
      | "ONBOARDING_NOT_READY"
      | "ONBOARDING_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "FamilyOnboardingError";
  }
}

const FAMILY_NAME_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .’'&-]*$/u;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateInput(input: CreateFamilyInput) {
  const familyName = normalizeFamilyName(input.familyName);
  const ownerName = normalizeFamilyName(input.ownerName);
  const username = normalizeFamilyUsername(input.username);

  if (!REQUEST_ID_PATTERN.test(input.requestId)) {
    throw new FamilyOnboardingError("INVALID_REQUEST_ID", "La demande n’est pas valide.");
  }
  if (familyName.length < 2 || familyName.length > 80 || !FAMILY_NAME_PATTERN.test(familyName)) {
    throw new FamilyOnboardingError(
      "INVALID_FAMILY_NAME",
      "Saisissez un nom de famille valide (2 à 80 caractères).",
    );
  }
  if (ownerName.length < 2 || ownerName.length > 80 || !FAMILY_NAME_PATTERN.test(ownerName)) {
    throw new FamilyOnboardingError(
      "INVALID_OWNER_NAME",
      "Saisissez un nom de propriétaire valide (2 à 80 caractères).",
    );
  }
  if (username.length < 2 || username.length > 40) {
    throw new FamilyOnboardingError(
      "INVALID_USERNAME",
      "Le nom d’utilisateur doit contenir entre 2 et 40 caractères.",
    );
  }
  if (!/^\d{6,12}$/.test(input.pin)) {
    throw new FamilyOnboardingError(
      "INVALID_PIN",
      "Le code PIN doit contenir entre 6 et 12 chiffres.",
    );
  }
  if (!(["fr", "ar", "en"] as string[]).includes(input.locale)) {
    throw new FamilyOnboardingError("INVALID_LOCALE", "La langue choisie n’est pas valide.");
  }

  return { familyName, ownerName, username };
}

export async function createDarnaFlowFamily(input: CreateFamilyInput): Promise<CreateFamilyResult> {
  const clean = validateInput(input);
  let familyCode: string;
  let supportRef: string;
  try {
    familyCode = familyCodeForRequest(input.requestId);
    supportRef = supportRefForRequest(input.requestId);
  } catch (error) {
    if (error instanceof FamilyCodeConfigurationError) {
      throw new FamilyOnboardingError(
        "ONBOARDING_NOT_READY",
        "La création de famille est en cours de configuration.",
      );
    }
    throw error;
  }
  const pinHash = await hash(input.pin, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    outputLen: 32,
  });

  const { data, error } = await getSupabaseAdmin().rpc("create_darnaflow_family", {
    p_request_id: input.requestId,
    p_display_name: clean.familyName,
    p_owner_name: clean.ownerName,
    p_normalized_username: clean.username,
    p_initials: familyInitials(clean.ownerName).slice(0, 4),
    p_pin_hash: pinHash,
    p_code_hmac: digestFamilyCode(familyCode),
    p_support_ref: supportRef,
    p_locale: input.locale,
  });

  if (error) {
    if (error.code === "PGRST202" || error.code === "42P01" || error.code === "42883") {
      throw new FamilyOnboardingError(
        "ONBOARDING_NOT_READY",
        "La création de famille est en cours de configuration.",
      );
    }
    if (error.code === "23505") {
      throw new FamilyOnboardingError(
        "ONBOARDING_CONFLICT",
        "Cette demande existe déjà. Réessayez avec le même formulaire.",
      );
    }
    throwIfSupabaseError(error);
  }

  const row = (data as Array<{
    created_support_ref?: unknown;
    invitation_public_id?: unknown;
  }> | null)?.[0];

  if (!row || row.created_support_ref !== supportRef || typeof row.invitation_public_id !== "string") {
    throw new Error("Invalid family onboarding response");
  }

  return { supportRef, familyCode, status: "active" };
}
