export type SubscriptionLanguage = "fr" | "en" | "ar";
export type ContributionAmountError = "required" | "format" | "minimum" | "maximum";

export const CONTRIBUTION_MIN_CENTS = 1;
export const CONTRIBUTION_MAX_CENTS = 100_000;

export const contributionFieldCopy = {
  fr: {
    label: "Montant de la contribution",
    guidance: "En dirhams marocains (DH) · de 0,01 à 1 000 DH · 2 décimales maximum.",
    errors: {
      required: "Saisissez le montant de votre contribution.",
      format: "Utilisez au maximum deux décimales, par exemple 5,50 DH.",
      minimum: "Le montant minimum est de 0,01 DH.",
      maximum: "Le montant maximum est de 1 000 DH.",
    },
  },
  en: {
    label: "Contribution amount",
    guidance: "In Moroccan dirhams (DH) · from 0.01 to 1,000 DH · up to 2 decimal places.",
    errors: {
      required: "Enter your contribution amount.",
      format: "Use no more than two decimal places, for example 5.50 DH.",
      minimum: "The minimum contribution is 0.01 DH.",
      maximum: "The maximum contribution is 1,000 DH.",
    },
  },
  ar: {
    label: "مبلغ المساهمة",
    guidance: "بالدرهم المغربي (DH) · من 0.01 إلى 1,000 درهم · منزلتان عشريتان كحد أقصى.",
    errors: {
      required: "أدخل مبلغ مساهمتك.",
      format: "استخدم منزلتين عشريتين كحد أقصى، مثل 5.50 درهم.",
      minimum: "الحد الأدنى للمساهمة هو 0.01 درهم.",
      maximum: "الحد الأقصى للمساهمة هو 1,000 درهم.",
    },
  },
} as const;

export function normalizeSubscriptionLanguage(value: string | null): SubscriptionLanguage {
  return value === "en" || value === "ar" ? value : "fr";
}

export function parseContributionAmount(value: string):
  | { ok: true; amountCents: number }
  | { ok: false; error: ContributionAmountError } {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return { ok: false, error: "required" };

  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) {
    const numericValue = Number(normalized);
    if (Number.isFinite(numericValue) && numericValue <= 0) return { ok: false, error: "minimum" };
    return { ok: false, error: "format" };
  }

  const wholeDh = Number(match[1]);
  const decimalCents = Number((match[2] ?? "").padEnd(2, "0"));
  const amountCents = wholeDh * 100 + decimalCents;
  if (!Number.isSafeInteger(amountCents) || amountCents > CONTRIBUTION_MAX_CENTS) {
    return { ok: false, error: "maximum" };
  }
  if (amountCents < CONTRIBUTION_MIN_CENTS) return { ok: false, error: "minimum" };
  return { ok: true, amountCents };
}

export function buildFamilyContributionRequest(value: string, plan: "plus" | "pro") {
  const parsed = parseContributionAmount(value);
  if (!parsed.ok) return parsed;
  return {
    ok: true as const,
    body: {
      action: "contribute_family" as const,
      plan,
      amountCents: parsed.amountCents,
    },
  };
}
