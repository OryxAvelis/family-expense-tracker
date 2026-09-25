import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeServicesLanguage,
  servicesCopy,
  servicesViewMode,
} from "../lib/services-page-copy.ts";

test("services page selects a role-aware hierarchy", () => {
  assert.equal(servicesViewMode("delivery"), "buyer");
  assert.equal(servicesViewMode("member"), "requester");
  assert.equal(servicesViewMode("admin"), "requester");
});

test("services page accepts only supported saved languages", () => {
  assert.equal(normalizeServicesLanguage("fr"), "fr");
  assert.equal(normalizeServicesLanguage("en"), "en");
  assert.equal(normalizeServicesLanguage("ar"), "ar");
  assert.equal(normalizeServicesLanguage("es"), "fr");
  assert.equal(normalizeServicesLanguage(null), "fr");
});

test("role-aware page wording exists in French, English, and Arabic", () => {
  for (const language of ["fr", "en", "ar"]) {
    const copy = servicesCopy[language];
    for (const key of [
      "workspace",
      "buyerTitle",
      "buyerDescription",
      "nextActions",
      "requesterTitle",
      "requesterDescription",
      "whatYouWillDo",
      "noActiveBuyerTitle",
      "noActiveRequesterTitle",
    ]) {
      assert.ok(copy[key].trim().length > 0, `${language}.${key} should not be empty`);
    }
  }
  assert.equal(servicesCopy.en.buyerTitle, "Your missions");
  assert.equal(servicesCopy.fr.buyerTitle, "Vos missions");
  assert.equal(servicesCopy.ar.buyerTitle, "مهامك");
});
