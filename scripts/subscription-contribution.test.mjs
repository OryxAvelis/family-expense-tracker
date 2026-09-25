import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFamilyContributionRequest,
  contributionFieldCopy,
  normalizeSubscriptionLanguage,
  parseContributionAmount,
} from "../lib/subscription-contribution.ts";

test("contribution field copy includes a persistent label and guidance in every supported language", () => {
  assert.equal(contributionFieldCopy.fr.label, "Montant de la contribution");
  assert.equal(contributionFieldCopy.en.label, "Contribution amount");
  assert.equal(contributionFieldCopy.ar.label, "مبلغ المساهمة");
  for (const language of ["fr", "en", "ar"]) {
    assert.match(contributionFieldCopy[language].guidance, /DH/);
  }
  assert.equal(normalizeSubscriptionLanguage("ar"), "ar");
  assert.equal(normalizeSubscriptionLanguage("unknown"), "fr");
});

test("valid contribution fixtures preserve cent precision in the mocked request", () => {
  assert.deepEqual(buildFamilyContributionRequest("0.01", "plus"), {
    ok: true,
    body: { action: "contribute_family", plan: "plus", amountCents: 1 },
  });
  assert.deepEqual(buildFamilyContributionRequest("5,50", "pro"), {
    ok: true,
    body: { action: "contribute_family", plan: "pro", amountCents: 550 },
  });
  assert.deepEqual(buildFamilyContributionRequest("1000", "plus"), {
    ok: true,
    body: { action: "contribute_family", plan: "plus", amountCents: 100_000 },
  });
});

test("invalid contribution fixtures are rejected before any submission", () => {
  assert.deepEqual(parseContributionAmount(""), { ok: false, error: "required" });
  assert.deepEqual(parseContributionAmount("0"), { ok: false, error: "minimum" });
  assert.deepEqual(parseContributionAmount("5.555"), { ok: false, error: "format" });
  assert.deepEqual(parseContributionAmount("1000.01"), { ok: false, error: "maximum" });
  assert.deepEqual(parseContributionAmount("not-a-number"), { ok: false, error: "format" });
});
