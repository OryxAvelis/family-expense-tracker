// Exercise the real API handlers against an isolated in-memory database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
let viewer = { id: 1, role: 'admin', name: 'Admin' };
const tables = {
  family_users: [{ id: 1, role: 'admin', name: 'Admin', active: true }, { id: 2, role: 'delivery', name: 'Josef', active: true }, { id: 3, role: 'member', name: 'Mohamed', active: true }, { id: 4, role: 'member', name: 'Other', active: true }],
  products: [{ id: 1, name_fr: 'Pain', name_en: 'Bread', name_ar: 'خبز', unit: 'pièce', unit_price_cents: 150, purchase_count: 0, active: true }],
  carts: [], cart_items: [],
  app_meta: [{ key: 'member_wallet_3', value: JSON.stringify([{ id: 'deposit', type: 'deposit', amount_cents: 20000, cart_id: null, actor_name: 'Admin', created_at: new Date().toISOString() }]) }],
};
const notifications = [];
const db = { from(table) {
  let operation = 'read', values, single = false, offset = 0, end = Infinity, fields = '', counting = false;
  const filters = [], sorting = [];
  const q = {
    select(value, options) { fields = value; counting = !!options?.count; return q; },
    eq(key, value) { filters.push(row => get(row, key) === value); return q; },
    neq(key, value) { filters.push(row => get(row, key) !== value); return q; },
    in(key, values) { filters.push(row => values.includes(get(row, key))); return q; },
    not(key, operator, value) { filters.push(row => get(row, key) !== value); return q; },
    order(key, options = {}) { sorting.push([key, options.ascending !== false]); return q; },
    limit(value) { end = value - 1; return q; },
    range(start, stop) { offset = start; end = stop; return q; },
    insert(value) { operation = 'insert'; values = value; return q; },
    upsert(value) { operation = 'upsert'; values = value; return q; },
    update(value) { operation = 'update'; values = value; return q; },
    delete() { operation = 'delete'; return q; },
    maybeSingle() { single = true; return q; }, single() { single = true; return q; },
    then(resolve, reject) { return Promise.resolve().then(() => {
      let rows = tables[table].filter(row => filters.every(filter => filter(join(row))));
      if (operation === 'insert' || operation === 'upsert') {
        rows = (Array.isArray(values) ? values : [values]).map(value => {
          const existing = operation === 'upsert' && tables[table].find(row => row.key === value.key);
          if (existing) { Object.assign(existing, value); return existing; }
          const row = { id: Math.max(0, ...tables[table].map(row => row.id || 0)) + 1, ...value };
          tables[table].push(row); return row;
        });
      } else if (operation === 'update') rows.forEach(row => Object.assign(row, values));
      else if (operation === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row));
      const count = rows.length;
      rows = rows.map(join).sort((a, b) => { for (const [key, asc] of sorting) { const diff = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0; if (diff) return asc ? diff : -diff; } return 0; }).slice(offset, end + 1);
      return { data: single ? rows[0] ?? null : rows, error: null, count: counting ? count : undefined };
    }).then(resolve, reject); },
  };
  function join(row) {
    const result = { ...row };
    if (table === 'carts') {
      result.family_users = tables.family_users.find(user => user.id === row.member_id);
      result.cart_items = tables.cart_items.filter(item => item.cart_id === row.id).map(item => ({ ...item, products: tables.products.find(product => product.id === item.product_id) }));
    }
    if (table === 'cart_items') {
      result.products = tables.products.find(product => product.id === row.product_id);
      result.carts = tables.carts.find(cart => cart.id === row.cart_id);
    }
    if (table === 'products' && fields.includes('cart_items')) result.cart_items = tables.cart_items.filter(item => item.product_id === row.id);
    return result;
  }
  return q;
} };
function get(row, key) { return key.split('.').reduce((value, part) => value?.[part], row); }
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const testModule = { exports: {} };
  cache.set(file, testModule.exports);
  const source = ts.transpileModule(fs.readFileSync(path.resolve(file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const customRequire = (name) => {
    if (name === '@/lib/family-auth') return { ARCHIVED_DEFAULT_MEMBER_USERNAMES: [], getRequestFamilyUser: async () => viewer };
    if (name === '@/lib/supabase-server') return { getSupabaseAdmin: () => db, throwIfSupabaseError: error => { if (error) throw error; } };
    if (name === '@/lib/push-notifications') return { getPushPublicKey: () => null, notifyDeliveryOfNewOrder: async value => notifications.push(value) };
    if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
    throw new Error(`Unexpected dependency: ${name}`);
  };
  vm.runInNewContext(source, { module: testModule, exports: testModule.exports, require: customRequire, Response, Request, URL, console, crypto: globalThis.crypto, Date, Intl }, { filename: file });
  return testModule.exports;
}
async function run() {
  const api = load('app/api/family/route.ts');
  const history = load('app/api/family/history/route.ts');
  const post = async body => {
    const response = await api.POST(new Request('http://localhost/api/family', { method: 'POST', body: JSON.stringify(body) }));
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload)); return payload;
  };
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const body = { action: 'create_member_order', memberId: 3, purchasedDate: date, items: [{ productId: 1, quantityHundredths: 300, actualUnitPriceCents: 150 }] };
  viewer = { id: 3, role: 'member', name: 'Mohamed' };
  assert.notEqual((await api.POST(new Request('http://localhost/api/family', { method: 'POST', body: JSON.stringify(body) }))).status, 200);
  assert.equal((await history.GET(new Request('http://localhost/api/family/history'))).status, 403);
  assert.equal(tables.carts.length, 0);
  viewer = { id: 1, role: 'admin', name: 'Admin' };
  const initial = await post(body);
  const cartId = tables.carts[0].id;
  assert.equal(tables.carts[0].status, 'pending');
  assert.equal(tables.carts[0].completed_at, null);
  assert.equal(tables.cart_items[0].purchase_status, 'requested');
  assert.equal(initial.memberWallets[0].balance_cents, 20000);
  assert.equal(notifications[0].memberName, 'Mohamed');
  viewer = { id: 2, role: 'delivery', name: 'Josef' };
  const queue = await (await api.GET(new Request('http://localhost/api/family'))).json();
  assert(queue.carts.some(cart => cart.id === cartId && cart.status === 'pending'));
  await post({ action: 'update_item', itemId: tables.cart_items[0].id, purchaseStatus: 'bought', actualUnitPriceCents: 150 });
  const completed = await post({ action: 'finish_cart', cartId });
  assert.equal(tables.carts[0].status, 'completed');
  assert.equal(completed.memberWallets[0].balance_cents, 19500);
  assert.equal(completed.deliveryWallet.earnedCents, 50);
  const repeatedFinish = await api.POST(new Request('http://localhost/api/family', { method: 'POST', body: JSON.stringify({ action: 'finish_cart', cartId }) }));
  assert.equal(repeatedFinish.status, 400);
  assert.equal(JSON.parse(tables.app_meta.find(entry => entry.key === 'member_wallet_3').value).filter(entry => entry.id === `order-${cartId}`).length, 1);
  tables.app_meta.push({ key: 'family_services_state_v1', value: JSON.stringify({ memberships: [{ scope: 'personal', member_id: 3, plan: 'pro', starts_at: '2020-01-01', ends_at: '2099-01-01' }] }) });
  viewer = { id: 1, role: 'admin', name: 'Admin' };
  await post({ ...body, action: 'record_offline_purchase' });
  const proCart = tables.carts.at(-1);
  assert.equal(proCart.status, 'pending');
  viewer = { id: 2, role: 'delivery', name: 'Josef' };
  await post({ action: 'update_item', itemId: tables.cart_items.at(-1).id, purchaseStatus: 'bought', actualUnitPriceCents: 150 });
  const proCompleted = await post({ action: 'finish_cart', cartId: proCart.id });
  assert.equal(proCompleted.carts.find(cart => cart.id === proCart.id).service_fee_cents, 0);
  assert.equal(proCompleted.memberWallets[0].balance_cents, 19050);
  assert.equal(proCompleted.deliveryWallet.earnedCents, 50);
  viewer = { id: 1, role: 'admin', name: 'Admin' };
  for (let id = 3; id <= 105; id++) tables.carts.push({ id, member_id: 3, status: id === 105 ? 'cancelled' : 'completed', created_at: new Date().toISOString(), submitted_at: new Date().toISOString(), completed_at: new Date().toISOString() });
  const archive = await (await history.GET(new Request('http://localhost/api/family/history?page=1'))).json();
  assert.equal(archive.total, 105); assert.equal(archive.carts.length, 20);
  assert.equal((await (await history.GET(new Request('http://localhost/api/family/history?page=6'))).json()).carts.length, 5);
  assert.equal((await (await history.GET(new Request('http://localhost/api/family/history?status=cancelled'))).json()).total, 1);
  assert.equal((await (await history.GET(new Request('http://localhost/api/family/history?memberId=4'))).json()).total, 0);
  viewer = { id: 4, role: 'member', name: 'Other' };
  assert.equal((await (await api.GET(new Request('http://localhost/api/family'))).json()).carts.length, 0);
  console.log('PASS: admin authorization, pending order, delivery visibility, notification, deferred wallet debit, completion/retry, Free/Pro fees, old-form compatibility, history pagination beyond 80 carts, filters, and member isolation.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
