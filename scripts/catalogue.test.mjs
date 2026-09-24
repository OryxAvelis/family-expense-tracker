import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as catalogue from "../lib/catalogue.ts";

const pack = { unit: "pièce", package_size: "500 g", unit_price_cents: 1200 };
const loose = { unit: "kg", package_size: null, unit_price_cents: 4600 };

test("sealed products use whole packs, including legacy milk and imported measured packs", () => {
  for (const product of [pack, { ...pack, unit: "L", package_size: "0.5 L" }, { ...pack, external_source: "bringo", package_size: "1kg" }]) {
    assert.equal(catalogue.quantityStep(product), 100);
    assert.equal(catalogue.canPurchaseByAmount(product), false);
    assert.throws(() => catalogue.validateOrderUnit(product, 50));
    assert.throws(() => catalogue.validateOrderUnit(product, 100, 500));
    assert.doesNotThrow(() => catalogue.validateOrderUnit(product, 200));
  }
});

test("loose goods support measured quantities and spending amounts; pieces do not", () => {
  assert.equal(catalogue.quantityStep(loose), 50);
  assert.equal(catalogue.canPurchaseByAmount(loose), true);
  assert.doesNotThrow(() => catalogue.validateOrderUnit(loose, 25));
  assert.doesNotThrow(() => catalogue.validateOrderUnit(loose, 100, 500));
  assert.equal(catalogue.canPurchaseByAmount({ ...loose, unit_price_cents: 0 }), false);
  assert.throws(() => catalogue.validateOrderUnit({ unit: "pièce" }, 50));
});

test("pack labels count sellable packs instead of silently multiplying into litres", () => {
  assert.equal(catalogue.formatQuantity(200, { ...pack, unit: "L", package_size: "0.5 L" }), "2 × 0.5 L");
  assert.equal(catalogue.formatQuantity(200, { ...pack, package_size: "6 × 125 g" }, "en"), "2 × 6 × 125 g");
  assert.match(catalogue.saleLabel(loose), /En vrac/);
  assert.match(catalogue.saleLabel(pack, "en"), /Pack/);
  assert.equal(catalogue.saleLabel({ unit: "pièce" }, "ar"), "بالقطعة");
});

test("new pack descriptions are required and legacy payloads preserve existing sizes", () => {
  assert.deepEqual(catalogue.parseProductSale({ unit: "pièce", saleMode: "pack", packageSize: " 6  × 125 g " }), { unit: "pièce", package_size: "6 × 125 g" });
  assert.throws(() => catalogue.parseProductSale({ unit: "pièce", saleMode: "pack", packageSize: " " }));
  assert.throws(() => catalogue.parseProductSale({ unit: "kg", saleMode: "bulk", packageSize: "500 g" }));
  assert.throws(() => catalogue.parseProductSale({ unit: "pièce", packageSize: 123 }));
  assert.throws(() => catalogue.parseProductSale({ unit: "pièce", packageSize: "x".repeat(81) }));
  assert.deepEqual(catalogue.parseProductSale({ unit: "pièce" }, pack), { unit: "pièce", package_size: "500 g" });
});

test("explicit name sizes and multipacks are extracted without guessing unknown sizes", () => {
  for (const [name, expected] of [["Chocolat 90 g", "90 g"], ["Café en Capsules x20 – Intensité 12", "20 capsules"], ["8 Serviette hygiénique", "8 Serviette"], ["Thon 3x80g", "3x80g"], ["Yaourt 6 × 125 g", "6 × 125 g"], ["Thé vert", null], ["Lentilles", null]]) {
    assert.equal(catalogue.extractPackageSize(name), expected);
  }
});

test("foods stay in food despite supplier maison tags; non-food cinnamon products stay separate", () => {
  for (const name of [...catalogue.MISCLASSIFIED_FOODS, "Crème fraîche 20cl", "Riz 1kg"]) {
    assert.equal(catalogue.inferCatalogCategory(name, "Maison"), "food");
  }
  assert.equal(catalogue.inferCatalogCategory("Bougie parfum cannelle"), "household");
  assert.equal(catalogue.inferCatalogCategory("Savon à la cannelle"), "hygiene");
  assert.equal(catalogue.inferCatalogCategory("Lessive"), "cleaning");
  assert.equal(catalogue.inferCatalogCategory("Cahier"), "school");
});

// Execute the actual route handlers against a small in-memory query adapter.
const source = readFileSync(new URL("../app/api/family/route.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("route.ts", source, ts.ScriptTarget.Latest, true);
const names = new Set(["POST", "asPositiveInt", "asText", "asWalletScope", "asMissingProductsNote", "requireRole", "requireCatalogManager", "asProductImageUrl", "uploadedProductImageKey", "calendarDateInTimeZone", "calendarDateYearsAgo", "validCalendarDate", "syncCatalogDescriptions"]);
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
const code = ts.transpileModule(functions.map((node) => node.getText(ast).replace(/^export /, "")).join("\n") + "\nglobalThis.api = { POST, syncCatalogDescriptions };", { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(role = "admin") {
  const tables = {
    products: [{ id: 1, name_fr: "Pack", category: "food", active: true, image_url: null, ...pack }],
    family_users: [{ id: 10, name: "Test member", role: "member", family_id: "test", active: true }],
    carts: [{ id: 1, family_id: "test", member_id: 10, status: "pending", cart_items: [] }],
    cart_items: [], app_meta: [],
  };
  let writes = 0;
  const db = { from(table) {
    const filters = [];
    let operation = "read", values, single = false;
    const q = {
      select() { return q; }, eq(key, value) { filters.push((row) => row[key] === value); return q; },
      in(key, values) { filters.push((row) => values.includes(row[key])); return q; },
      is(key, value) { filters.push((row) => row[key] === value); return q; },
      limit() { return q; }, maybeSingle() { single = true; return q; }, single() { single = true; return q; },
      insert(value) { operation = "insert"; values = value; return q; },
      upsert(value) { operation = "upsert"; values = value; return q; },
      update(value) { operation = "update"; values = value; return q; },
      delete() { operation = "delete"; return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
        if (operation !== "read") writes++;
        if (operation === "update") rows.forEach((row) => Object.assign(row, values));
        if (operation === "delete") tables[table] = tables[table].filter((row) => !rows.includes(row));
        if (operation === "insert" || operation === "upsert") {
          rows = (Array.isArray(values) ? values : [values]).map((value) => {
            const existing = operation === "upsert" && tables[table].find((row) => row.key === value.key);
            if (existing) return Object.assign(existing, value);
            const row = { id: tables[table].length + 1, ...value }; tables[table].push(row); return row;
          });
        }
        return { data: single ? rows[0] ?? null : rows, error: null, count: rows.length };
      }).then(resolve, reject); },
    };
    return q;
  } };
  const context = { ...catalogue, Response, Request, URL, Intl, Date, Error,
    nowIso: () => new Date().toISOString(),
    getRequestFamilyUser: async () => ({ id: 10, familyId: "test", role }),
    getSupabaseAdmin: () => db, throwIfSupabaseError: (error) => { if (error) throw error; },
    readState: async () => ({}), LEGACY_FAMILY_ID: "test", ACTIVE_CART_STATUSES: ["pending", "ready", "shopping"],
    PRODUCT_CATEGORIES: ["food", "household"], AMOUNT_REQUEST_SENTINEL_CENTS: 2147483647, FAMILY_TIME_ZONE: "Africa/Casablanca",
  };
  vm.runInNewContext(code, context);
  return { tables, writes: () => writes, sync: context.api.syncCatalogDescriptions,
    post: (body) => context.api.POST(new Request("http://localhost/api/family", { method: "POST", body: JSON.stringify(body) })),
  };
}

test("member and assisted-order APIs reject fractional packs and amount orders before writes", async () => {
  for (const action of ["submit_cart", "update_cart", "create_member_order", "record_offline_purchase"]) {
    for (const item of [{ productId: 1, quantityHundredths: 50, actualUnitPriceCents: 1200 }, { productId: 1, quantityHundredths: 100, amountCents: 500 }]) {
      const app = fixture(action.includes("member") || action === "record_offline_purchase" ? "admin" : "member");
      const response = await app.post({ action, cartId: 1, memberId: 10, purchasedDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" }).format(new Date()), items: [item] });
      assert.equal(response.status, 400, action);
      assert.match((await response.json()).error, /paquets|vrac/, action);
      assert.equal(app.writes(), 0, action);
    }
  }
});

test("product API persists a pack size and rejects changing an ordered format across households", async () => {
  const app = fixture();
  const product = { nameFr: "Pack", category: "food", unit: "pièce", saleMode: "pack", packageSize: "6 × 125 g", unitPriceCents: 1800 };
  assert.equal((await app.post({ ...product, action: "add_product" })).status, 200);
  assert.equal(app.tables.products.at(-1).package_size, "6 × 125 g");
  app.tables.cart_items.push({ id: 1, product_id: 1, family_id: "another-family" });
  const result = await app.post({ ...product, action: "edit_product", productId: 1 });
  assert.equal(result.status, 400);
  assert.match((await result.json()).error, /première commande/);
  assert.equal(app.tables.products[0].package_size, "500 g");
});

test("catalogue cleanup corrects confirmed units and categories once without changing prices", async () => {
  const app = fixture();
  app.tables.products.push(
    { id: 2, name_fr: "Abzar", category: "household", unit: "kg", package_size: null, unit_price_cents: 12000 },
    { id: 3, name_fr: "Thé vert", category: "food", unit: "kg", package_size: null, unit_price_cents: 2000 },
    { id: 4, name_fr: "Lentilles", category: "food", unit: "pièce", package_size: null, unit_price_cents: 4600 },
    { id: 5, name_fr: "Café en Capsules x20", category: "food", unit: "pièce", package_size: null, unit_price_cents: 6500 },
  );
  const prices = app.tables.products.map((row) => row.unit_price_cents);
  await app.sync();
  assert.equal(app.tables.products[1].category, "food");
  assert.equal(app.tables.products[2].unit, "pièce");
  assert.equal(app.tables.products[3].unit, "kg");
  assert.equal(app.tables.products[4].package_size, "20 capsules");
  assert.deepEqual(app.tables.products.map((row) => row.unit_price_cents), prices);
  const writes = app.writes();
  app.tables.products[1].category = "health";
  await app.sync();
  assert.equal(app.writes(), writes);
  assert.equal(app.tables.products[1].category, "health");
});
