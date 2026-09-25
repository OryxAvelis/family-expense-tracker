import assert from "node:assert/strict";
import test from "node:test";

import {
  isSupportedFamilyPin,
  MAX_FAMILY_PIN_LENGTH,
  normalizeFamilyPin,
  resolveFamilyLoginFailure,
} from "../lib/family-pin.ts";

test("PIN normalization supports typing and pasted digits without retaining other characters", () => {
  assert.equal(normalizeFamilyPin("12 34"), "1234");
  assert.equal(normalizeFamilyPin("١٢34-code-567890123456"), "123456789012");
  assert.equal(normalizeFamilyPin("۱۲۳۴"), "1234");
  assert.equal(normalizeFamilyPin("1234567890129").length, MAX_FAMILY_PIN_LENGTH);
});

test("login accepts legacy four-digit PINs and modern six-to-twelve-digit PINs", () => {
  for (const pin of ["1234", "123456", "1234567", "123456789012"]) {
    assert.equal(isSupportedFamilyPin(pin), true, pin);
  }
  for (const pin of ["", "1", "123", "12345", "1234567890123", "12a4"]) {
    assert.equal(isSupportedFamilyPin(pin), false, pin);
  }
});

test("login failure fixtures preserve specific authentication guidance", () => {
  const fixtures = [
    ["INVALID_CREDENTIALS", 401, "incorrectPin"],
    ["RATE_LIMITED", 429, "rateLimited"],
    ["ACCOUNT_PENDING", 403, "accountPending"],
    ["FAMILY_PROVISIONING", 403, "familyProvisioning"],
    ["FAMILY_SUSPENDED", 403, "familySuspended"],
    [undefined, 500, "serverFailure"],
    ["UNKNOWN", 403, "serverFailure"],
  ];
  for (const [code, status, expected] of fixtures) {
    assert.equal(resolveFamilyLoginFailure(code, status), expected);
  }
});
