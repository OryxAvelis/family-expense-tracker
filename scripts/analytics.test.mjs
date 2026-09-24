import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { AMOUNT_REQUEST_SENTINEL_CENTS, monthlySpending, purchasedLineTotal } from "../lib/spending.ts";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
function execute(code, context) {
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context);
  return context;
}
function loadFunctions(path, names, context) {
  const text = source(path), ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text));
  assert.equal(functions.length, names.length);
  return execute(functions.map((node) => node.getText(ast).replace(/^export /, "")).join("\n") + `\nglobalThis.functions = { ${names.join(", ")} };`, context).functions;
}
const { calculateSavingsInsights } = loadFunctions("../lib/savings-insights.ts", ["calculateSavingsInsights"], { AMOUNT_REQUEST_SENTINEL_CENTS });
const from = "2026-04-01T00:00:00Z", to = "2026-09-30T23:59:59Z";
const row = (id, price = 400, date = `2026-09-${String(id).padStart(2, "0")}T12:00:00Z`) => ({
  id, cart_id: id, product_id: 1, requested_unit_price_cents: 400, actual_unit_price_cents: price, quantity_hundredths: 100,
  carts: { completed_at: date }, products: { name_fr: "Lait", unit_price_cents: 600, unit: "L", package_size: "0.5 L" },
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test("line totals distinguish spend-based purchases, measured quantities, and whole packs", () => {
  assert.equal(purchasedLineTotal(row(1)), 400);
  assert.equal(purchasedLineTotal({ ...row(1), quantity_hundredths: 25 }), 100);
  assert.equal(purchasedLineTotal({ ...row(1), quantity_hundredths: 200 }), 800);
  assert.equal(purchasedLineTotal({ ...row(1, 1150), requested_unit_price_cents: AMOUNT_REQUEST_SENTINEL_CENTS, quantity_hundredths: 1150 }), 1150);
});

test("monthly totals include over 1000 orders, exclude unbought items, and preserve free delivery", () => {
  const carts = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1, member_id: 1, status: "completed", completed_at: "2026-09-01T12:00:00Z", service_fee_cents: index % 2 ? 0 : 50 }));
  const items = carts.map((cart) => ({ ...row(cart.id, 100), cart_id: cart.id, purchase_status: "bought" }));
  items.push({ ...row(1, 99999), purchase_status: "unavailable" });
  items.push({ ...row(1, 1150), requested_unit_price_cents: AMOUNT_REQUEST_SENTINEL_CENTS, quantity_hundredths: 1150, purchase_status: "bought" });
  assert.deepEqual(monthlySpending(carts, items), [{ month: "2026-09", carts_count: 1001, total_cents: 126300 }]);
  carts.push({ ...carts[0], id: 1002, status: "shopping" });
  assert.equal(monthlySpending(carts, items)[0].carts_count, 1001);
});

test("savings comparisons use all comparable historical prices regardless of input order", () => {
  const rows = [row(1, 300), row(2, 500), row(3, 400)];
  const result = calculateSavingsInsights(rows, from, to);
  assert.deepEqual(plain(result), plain(calculateSavingsInsights([...rows].reverse(), from, to)));
  assert.equal(result.expensive[0].average_cents, 400);
  assert.equal(result.expensive[0].increase_percent, 50);
  assert.equal(result.savings[0].possible_cents, 300);
  assert.equal(result.savings[0].samples, 3);
  assert.equal(result.savings[0].package_size, "0.5 L");
});

test("spend-based rows cannot create a false rise or savings alert, but can inform purchase frequency", () => {
  const rows = [row(1, 600), row(2, 600), { ...row(3, 50), quantity_hundredths: 50, requested_unit_price_cents: AMOUNT_REQUEST_SENTINEL_CENTS }];
  const result = calculateSavingsInsights(rows, from, to);
  assert.equal(result.expensive.length, 0);
  assert.equal(result.savings.length, 0);
  assert.equal(result.window.price_samples, 2);
  assert.equal(result.window.excluded_amount_purchases, 1);
  assert.equal(result.predictions[0].purchases, 3);
  assert.equal(result.predictions[0].next_date, "2026-09-04");
});

test("invalid data, out-of-window purchases and duplicate same-order rows do not inflate the sample", () => {
  const duplicate = { ...row(2), cart_id: 1 };
  const invalid = [row(3, 0), row(4, -1), row(5, 500, "bad-date"), row(6, 500, "2025-01-01T00:00:00Z"), row(7, 500, "2027-01-01T00:00:00Z")];
  const result = calculateSavingsInsights([row(1), duplicate, ...invalid], from, to);
  assert.equal(result.window.price_samples, 1);
  assert.equal(result.window.purchases, 1);
  assert.equal(result.expensive.length, 0);
  assert.equal(result.savings.length, 0);
});

test("the insight query paginates every row in its declared window and stays family scoped", async () => {
  const calls = [];
  const rows = Array.from({ length: 1001 }, (_, id) => row(id + 1, 400, "2026-09-01T00:00:00Z"));
  const db = { from: (table) => {
    const chain = { range: async (start, end) => { calls.push(["range", start, end]); return { data: rows.slice(start, end + 1), error: null }; } };
    for (const name of ["select", "eq", "gte", "lte", "order"]) chain[name] = (...args) => { calls.push([name, ...args]); return chain; };
    calls.push(["from", table]); return chain;
  } };
  const app = loadFunctions("../app/api/services/route.ts", ["buildInsights"], {
    getSupabaseAdmin: () => db, throwIfSupabaseError: (error) => { if (error) throw error; }, INSIGHT_WINDOW_DAYS: 180,
    calculateSavingsInsights: (data, start, end) => ({ count: data.length, start, end }),
  });
  assert.equal((await app.buildInsights("household-a", "free")).locked, true);
  assert.equal(calls.length, 0);
  const result = await app.buildInsights("household-a", "pro");
  assert.equal(result.count, 1001);
  assert.equal(Date.parse(result.end) - Date.parse(result.start), 180 * 86400000);
  assert.deepEqual(calls.filter(([name]) => name === "range"), [["range", 0, 499], ["range", 500, 999], ["range", 1000, 1499]]);
  assert.equal(calls.filter(([name, column, value]) => name === "eq" && column === "family_id" && value === "household-a").length, 3);
  assert.equal(calls.filter(([name, column]) => name === "gte" && column === "carts.completed_at").length, 3);
  assert.equal(calls.filter(([name, column]) => name === "order" && column === "id").length, 3);
});

test("actual chart aggregation agrees with monthly totals for amount items and stored service fees", () => {
  const path = "../app/admin-analytics-charts.tsx", text = source(path), ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "AdminAnalyticsCharts");
  const aggregation = component.body.statements.find((node) => ts.isVariableStatement(node) && node.getText(ast).startsWith("const { categoryData"));
  const carts = [{ id: 1, member_id: 1, member_name: "Test", member_initials: "T", status: "completed", completed_at: "2026-09-01T12:00:00Z", service_fee_cents: 0 }];
  const items = [{ ...row(1, 1150), requested_unit_price_cents: AMOUNT_REQUEST_SENTINEL_CENTS, quantity_hundredths: 1150, purchase_status: "bought" }];
  const context = { carts, items, users: [], products: [{ id: 1, category: "food" }], currentMonth: "2026-09", serviceFeeCents: 50,
    purchasedLineTotal, useMemo: (fn) => fn(), shortenedName: (name) => name, locale: "fr-MA", categoryColors: ["green"], t: { categories: { food: "Alimentation" }, other: "Autres" },
  };
  const output = execute(aggregation.getText(ast) + "\nglobalThis.chart = { categoryData, memberData, totalSpent };", context).chart;
  assert.equal(output.totalSpent, monthlySpending(carts, items)[0].total_cents);
  assert.equal(output.memberData[0].value, 1150);
  assert.equal(output.categoryData[0].value, 1150);
});

test("buyer settlement includes every completed order beyond the first database page", async () => {
  const route = source("../app/api/family/route.ts");
  const start = route.indexOf("        const completedCartIds:", route.indexOf('case "settle_delivery_wallet"'));
  const end = route.indexOf("        const accountingMeta", start);
  assert.ok(start > 0 && end > start);
  const rows = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1 }));
  const calls = [];
  const db = { from: (table) => {
    const chain = { range: async (start, end) => { calls.push(["range", start, end]); return { data: rows.slice(start, end + 1), error: null }; } };
    for (const name of ["select", "eq", "in", "order"]) chain[name] = (...args) => { calls.push([name, ...args]); return chain; };
    assert.equal(table, "carts"); return chain;
  } };
  const context = { db, viewer: { familyId: "family-a" }, memberIds: [7], throwIfSupabaseError: (error) => { if (error) throw error; } };
  execute(`globalThis.readOrders = async () => { ${route.slice(start, end)} return completedCartIds; };`, context);
  const ids = await context.readOrders();
  assert.equal(ids.length, 1001);
  assert.equal(ids.at(-1), 1001);
  assert.equal(calls.filter(([name, column, value]) => name === "eq" && column === "family_id" && value === "family-a").length, 3);
  assert.equal(calls.filter(([name, column, value]) => name === "eq" && column === "status" && value === "completed").length, 3);
  assert.equal(calls.filter(([name, column]) => name === "in" && column === "member_id").length, 3);
});
