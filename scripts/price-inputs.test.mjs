import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { reconcilePriceInputs, submittedPriceInputs } from "../lib/price-inputs.ts";

test("refresh updates untouched prices and adds/removes catalogue entries", () => {
  assert.deepEqual(reconcilePriceInputs(
    { 1: "10.00", 2: "5.00" },
    { 1: "10.00", 2: "5.00" },
    { 1: "12.00", 3: "8.00" },
  ), { 1: "12.00", 3: "8.00" });
});

test("repeated refreshes preserve unsaved edits, including a changed server price", () => {
  const first = reconcilePriceInputs({ 1: "10.01" }, { 1: "10.00" }, { 1: "11.00" });
  assert.deepEqual(first, { 1: "10.01" });
  assert.deepEqual(reconcilePriceInputs(first, { 1: "11.00" }, { 1: "12.00" }), first);
});

test("cleared and partially typed decimal inputs survive refresh", () => {
  const edits = { 1: "", 2: "12,", 3: "0." };
  const saved = { 1: "10.00", 2: "5.00", 3: "1.00" };
  assert.deepEqual(reconcilePriceInputs(edits, saved, saved), edits);
});

test("a successful save normalizes its field without erasing other edits", () => {
  const inputs = { 1: "10,01", 2: "6" };
  const submitted = submittedPriceInputs({ action: "update_product", productId: 1 }, inputs, {});
  assert.deepEqual(reconcilePriceInputs(
    inputs, { 1: "10.00", 2: "5.00" }, { 1: "10.01", 2: "5.00" }, submitted.products,
  ), { 1: "10.01", 2: "6" });
});

test("an edit made while saving survives the successful response", () => {
  const submitted = submittedPriceInputs({ action: "update_item", itemId: 4 }, {}, { 4: "12" });
  assert.deepEqual(reconcilePriceInputs(
    { 4: "13" }, { 4: "10.00" }, { 4: "12.00" }, submitted.items,
  ), { 4: "13" });
});

test("receipt saves acknowledge only their own items", () => {
  const inputs = { 4: "12,50", 5: "8", 6: "20" };
  const submitted = submittedPriceInputs({
    action: "apply_receipt_suggestions", suggestions: [{ itemId: 4 }, { itemId: 5 }],
  }, {}, inputs);
  assert.deepEqual(reconcilePriceInputs(
    inputs, { 4: "10.00", 5: "5.00", 6: "15.00" },
    { 4: "12.50", 5: "8.00", 6: "15.00" }, submitted.items,
  ), { 4: "12.50", 5: "8.00", 6: "20" });
});

test("product editor saves acknowledge the matching inline price", () => {
  assert.deepEqual(submittedPriceInputs(
    { action: "edit_product", productId: 1 }, { 1: "12", 2: "8" }, {},
  ), { products: { 1: "12" }, items: {} });
  assert.deepEqual(submittedPriceInputs(
    { action: "set_monthly_budget" }, { 1: "12" }, { 4: "8" },
  ), { products: {}, items: {} });
});

// Run the real tracker callbacks with controlled responses, without production data.
const trackerSource = readFileSync(new URL("../app/family-tracker.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("family-tracker.tsx", trackerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const tracker = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "FamilyTracker");
const callbacks = tracker.body.statements.filter((node) => ts.isVariableStatement(node) &&
  node.declarationList.declarations.some((declaration) =>
    ["applyData", "loadData", "act"].includes(declaration.name.getText(ast))));
assert.equal(callbacks.length, 3);
const callbackCode = ts.transpileModule(
  callbacks.map((node) => node.getText(ast)).join("\n") + "\nglobalThis.callbacks = { applyData, loadData, act };",
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText;

function fixture() {
  const requests = [];
  const state = {
    savedDeliveryPrices: { current: {} }, savedProductPrices: { current: {} },
    dataRequestVersion: { current: 0 }, productPrices: {}, deliveryPrices: {},
    role: "admin", data: null, error: "", busy: false,
    reconcilePriceInputs, submittedPriceInputs, useCallback: (callback) => callback,
    setData: (data) => { state.data = data; },
    setProductPrices: (update) => { state.productPrices = update(state.productPrices); },
    setDeliveryPrices: (update) => { state.deliveryPrices = update(state.deliveryPrices); },
    setLoadError: (error) => { state.error = error; },
    setBusy: (busy) => { state.busy = busy; },
    setServiceTasks: () => {}, setPendingPlanPayments: () => {}, setPlanPaymentHistory: () => {},
    toast: { success: () => {}, error: () => {} },
    window: { location: { replace: () => assert.fail("Unexpected redirect") } },
    fetch: (url, options) => new Promise((resolve) => { requests.push({ url, options, resolve }); }),
  };
  vm.runInNewContext(callbackCode, state);
  return { state, requests, ...state.callbacks };
}

function payload(product = 1000, item = 500) {
  return { products: [{ id: 1, unit_price_cents: product }], items: [{ id: 4, actual_unit_price_cents: item }] };
}

function respond(request, data, status = 200) {
  request.resolve({ status, ok: status >= 200 && status < 300, json: async () => data });
}

test("actual tracker refresh preserves admin, buyer and receipt-prefilled edits", async () => {
  const app = fixture();
  app.applyData(payload());
  app.state.productPrices[1] = "10.01";
  app.state.deliveryPrices[4] = "6,25";
  for (let cycle = 0; cycle < 2; cycle++) {
    const start = app.requests.length;
    const refresh = app.loadData();
    respond(app.requests[start], payload(1100, 550));
    respond(app.requests[start + 1], {});
    await refresh;
    assert.equal(app.state.productPrices[1], "10.01");
    assert.equal(app.state.deliveryPrices[4], "6,25");
  }
});

test("actual save clears only its acknowledged edit and ignores a stale refresh", async () => {
  const app = fixture();
  app.applyData(payload());
  app.state.productPrices[1] = "12";
  app.state.deliveryPrices[4] = "6";
  const refresh = app.loadData();
  const save = app.act({ action: "update_product", productId: 1, unitPriceCents: 1200 }, "Saved");
  respond(app.requests[2], payload(1200));
  assert.equal(await save, true);
  respond(app.requests[0], payload());
  respond(app.requests[1], {});
  await refresh;
  assert.equal(app.state.productPrices[1], "12.00");
  assert.equal(app.state.deliveryPrices[4], "6");
  assert.equal(app.state.data.products[0].unit_price_cents, 1200);
});

test("failed saves retain the draft for retry", async () => {
  const app = fixture();
  app.applyData(payload());
  app.state.productPrices[1] = "12,50";
  const save = app.act({ action: "update_product", productId: 1 }, "Saved");
  respond(app.requests[0], { error: "Temporary failure" }, 500);
  assert.equal(await save, false);
  app.applyData(payload());
  assert.equal(app.state.productPrices[1], "12,50");
  assert.equal(app.state.busy, false);
});

test("a late services response cannot revert a successfully saved price", async () => {
  const app = fixture();
  app.applyData(payload());
  let finishServices;
  const refresh = app.loadData();
  respond(app.requests[0], payload());
  app.requests[1].resolve({ status: 200, ok: true, json: () => new Promise((resolve) => { finishServices = resolve; }) });
  await new Promise((resolve) => setImmediate(resolve));
  app.state.productPrices[1] = "14";
  const save = app.act({ action: "update_product", productId: 1 }, "Saved");
  respond(app.requests[2], payload(1400));
  await save;
  finishServices({});
  await refresh;
  assert.equal(app.state.productPrices[1], "14.00");
  assert.equal(app.state.data.products[0].unit_price_cents, 1400);
});
