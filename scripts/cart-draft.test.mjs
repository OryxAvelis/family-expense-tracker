import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createCartDraftStore, draftStorageKey, emptyCartDraft, hasCartDraft, parseStoredDrafts } from "../lib/cart-draft.ts";

function memoryStorage() {
  const values = new Map();
  let blocked = false;
  return { values, block: (value) => { blocked = value; },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error("Quota exceeded"); values.set(key, value); },
  };
}
const sample = () => ({ quantities: { 1: 200, 2: 25 }, amounts: { 2: 1150 }, note: "Also buy fresh bread", walletScope: "personal", editingCartId: 7 });
const reopen = (storage, scope = "member-a") => { const store = createCartDraftStore(scope); store.connect(storage); return store; };

test("all cart details persist synchronously and survive reload without an initial empty overwrite", () => {
  const storage = memoryStorage();
  const first = reopen(storage);
  first.update(() => sample());
  const raw = storage.getItem(first.key);
  assert.deepEqual(parseStoredDrafts(raw).active, sample());
  const restored = reopen(storage);
  assert.deepEqual(restored.getSnapshot().active, sample());
  assert.equal(storage.getItem(first.key), raw);
  restored.setField("note", "Last keystroke!");
  assert.equal(reopen(storage).getSnapshot().active.note, "Last keystroke!");
});

test("member and household namespaces stay separate through switching accounts", () => {
  const storage = memoryStorage();
  reopen(storage, "family-a-member-1").update(() => sample());
  const second = reopen(storage, "family-a-member-2");
  assert.equal(hasCartDraft(second.getSnapshot().active), false);
  second.setField("note", "Second person");
  assert.equal(hasCartDraft(reopen(storage, "family-b-member-1").getSnapshot().active), false);
  assert.deepEqual(reopen(storage, "family-a-member-1").getSnapshot().active, sample());
});

test("replacing and restoring several drafts never discards the unfinished carts", () => {
  const storage = memoryStorage();
  const store = reopen(storage);
  store.update(() => sample());
  store.replace({ ...emptyCartDraft(), note: "Second cart" });
  store.replace({ ...emptyCartDraft(), note: "Third cart" });
  assert.equal(store.getSnapshot().saved.length, 2);
  store.restore(0);
  assert.deepEqual(store.getSnapshot().active, sample());
  assert.deepEqual(store.getSnapshot().saved.map((draft) => draft.note), ["Second cart", "Third cart"]);
  const submitted = store.beginSubmission();
  store.finishSubmission(submitted, true);
  const restored = reopen(storage);
  assert.equal(hasCartDraft(restored.getSnapshot().active), false);
  assert.equal(restored.getSnapshot().saved.length, 2);
});

test("malformed or unsupported saved data is not overwritten during restoration or later edits", () => {
  for (const raw of ["{broken", JSON.stringify({ version: 9 }), JSON.stringify({ version: 1, active: { ...sample(), amounts: { 9: 100 } }, saved: [] })]) {
    const storage = memoryStorage();
    storage.values.set(draftStorageKey("member-a"), raw);
    const store = reopen(storage);
    assert.equal(store.getSnapshot().ready, true);
    assert.equal(store.getSnapshot().storageError, true);
    assert.equal(storage.getItem(store.key), raw);
    store.update(() => sample());
    store.retry();
    assert.deepEqual(store.getSnapshot().active, sample());
    assert.equal(store.getSnapshot().storageError, true);
    assert.equal(storage.getItem(store.key), raw);
  }
});

test("storage failures retain edits in memory and a retry saves the current draft", () => {
  const storage = memoryStorage();
  const store = reopen(storage);
  storage.block(true);
  store.update(() => sample());
  assert.deepEqual(store.getSnapshot().active, sample());
  assert.equal(store.getSnapshot().storageError, true);
  storage.block(false);
  store.retry();
  assert.equal(store.getSnapshot().storageError, false);
  assert.deepEqual(reopen(storage).getSnapshot().active, sample());
});

test("concurrent tabs retain both drafts, and ordinary storage refreshes stay in sync", () => {
  const storage = memoryStorage();
  const a = reopen(storage), b = reopen(storage);
  a.update(() => sample());
  b.setField("note", "A separate tab's cart");
  assert.deepEqual(b.getSnapshot().saved[0], sample());
  a.refresh();
  assert.equal(a.getSnapshot().active.note, "A separate tab's cart");
  assert.deepEqual(a.getSnapshot().saved[0], sample());
});

test("successful submission does not erase a different draft written by another tab", () => {
  const storage = memoryStorage();
  const a = reopen(storage);
  a.update(() => sample());
  const b = reopen(storage);
  const submitted = a.beginSubmission();
  b.setField("note", "New work while the first tab submits");
  a.finishSubmission(submitted, true);
  const restored = reopen(storage).getSnapshot();
  assert.equal(hasCartDraft(restored.active), false);
  assert.equal(restored.saved[0].note, "New work while the first tab submits");
});

const trackerSource = readFileSync(new URL("../app/family-tracker.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("family-tracker.tsx", trackerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const tracker = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "FamilyTracker");
const callbackNames = ["submitCart", "openDraft", "draftForOrder", "editCart", "repeatCart"];
const callbacks = tracker.body.statements.filter((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => callbackNames.includes(d.name.getText(ast))));
assert.equal(callbacks.length, callbackNames.length);
const callbackCode = ts.transpileModule(callbacks.map((node) => node.getText(ast)).join("\n") + `\nglobalThis.callbacks = { ${callbackNames.join(", ")} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function trackerFixture() {
  const storage = memoryStorage();
  const draftStore = reopen(storage);
  draftStore.update(() => sample());
  const requests = [];
  const state = { draftStore, hasCartDraft, myMarketBusyId: null, cartSubmitting: false, editingCartId: null,
    data: { products: [{ id: 1 }, { id: 2 }], carts: [{ id: 7, status: "pending" }] },
    currentUser: { id: 42 }, dc: { cannotSubmit: "Cannot submit" },
    useCallback: (fn) => fn, toast: { error: () => {} },
    setMissingNoteExpanded: () => {}, setCartOpen: () => {}, setMemberView: () => {},
    setPendingDraft: (next) => { state.pending = next; },
    isAmountItem: (item) => item.requested_unit_price_cents === 2147483647,
    itemsFor: () => [{ product_id: 2, quantity_hundredths: 500, catalog_unit_price_cents: 1000, requested_unit_price_cents: 2147483647 }],
    act: (body) => new Promise((resolve) => requests.push({ body, resolve })),
  };
  vm.runInNewContext(callbackCode, state);
  return { storage, state, draftStore, requests, ...state.callbacks };
}

test("the actual checkout retains a failed draft and sends every restored field on retry", async () => {
  const app = trackerFixture();
  const first = app.submitCart();
  assert.equal(app.draftStore.getSnapshot().submitting, true);
  assert.equal(await app.submitCart(), false);
  assert.equal(app.requests.length, 1);
  app.draftStore.setField("note", "Must not edit an in-flight submission");
  assert.equal(app.draftStore.getSnapshot().active.note, sample().note);
  app.requests[0].resolve(false);
  assert.equal(await first, false);
  assert.deepEqual(reopen(app.storage).getSnapshot().active, sample());
  const retry = app.submitCart();
  const body = JSON.parse(JSON.stringify(app.requests[1].body));
  assert.deepEqual(body, { action: "update_cart", actorRole: "member", memberId: 42, cartId: 7, missingProductsNote: sample().note, walletScope: "personal", items: [{ productId: 1, quantityHundredths: 200 }, { productId: 2, quantityHundredths: 25, amountCents: 1150 }] });
  app.requests[1].resolve(true);
  assert.equal(await retry, true);
  assert.equal(hasCartDraft(reopen(app.storage).getSnapshot().active), false);
});

test("unavailable products and orders already being bought cannot silently drop restored work", async () => {
  for (const kind of ["product", "order"]) {
    const app = trackerFixture();
    if (kind === "product") app.state.data.products = [{ id: 1 }];
    else app.state.data.carts[0].status = "shopping";
    assert.equal(await app.submitCart(), false);
    assert.equal(app.requests.length, 0);
    assert.deepEqual(app.draftStore.getSnapshot().active, sample());
  }
});

test("repeating an order keeps its payer and asks before replacing unfinished work", () => {
  const app = trackerFixture();
  app.repeatCart({ id: 11, wallet_scope: "personal", missing_products_note: "Repeated order" });
  assert.deepEqual(app.draftStore.getSnapshot().active, sample());
  const pending = JSON.parse(JSON.stringify(app.state.pending));
  assert.equal(pending.walletScope, "personal");
  assert.equal(pending.editingCartId, null);
  assert.equal(pending.amounts[2], 500);
  app.draftStore.replace(pending);
  assert.deepEqual(app.draftStore.getSnapshot().saved[0], sample());
});

test("server draft namespaces are stable per household/member without exposing family IDs", async () => {
  const source = readFileSync(new URL("../lib/family-auth.ts", import.meta.url), "utf8");
  const authAst = ts.createSourceFile("family-auth.ts", source, ts.ScriptTarget.Latest, true);
  const functions = authAst.statements.filter((node) => ts.isFunctionDeclaration(node) && ["sha256", "getPageFamilyUser"].includes(node.name?.text));
  const code = ts.transpileModule(functions.map((node) => node.getText(authAst).replace(/^export /, "")).join("\n") + "\nglobalThis.readUser = getPageFamilyUser;", { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let user = { id: 1, familyId: "house-a", role: "member", name: "Test" };
  const context = { crypto: globalThis.crypto, TextEncoder, FAMILY_SESSION_COOKIE: "test", cookies: async () => ({ get: () => ({ value: "test" }) }), findUserByToken: async () => user };
  vm.runInNewContext(code, context);
  const first = await context.readUser();
  assert.equal(first.familyId, undefined);
  assert.match(first.draftScope, /^[0-9a-f]{64}$/);
  assert.equal((await context.readUser()).draftScope, first.draftScope);
  user = { ...user, familyId: "house-b" };
  assert.notEqual((await context.readUser()).draftScope, first.draftScope);
  user = { ...user, familyId: "house-a", id: 2 };
  assert.notEqual((await context.readUser()).draftScope, first.draftScope);
});
