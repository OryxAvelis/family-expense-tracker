import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

type ActionBody = {
  action?: string;
  actorRole?: "admin" | "delivery" | "member";
  [key: string]: unknown;
};

const nowIso = () => new Date().toISOString();

function getD1() {
  if (!env.DB) throw new Error("La base de données est indisponible.");
  return env.DB;
}

function asPositiveInt(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} est invalide.`);
  }
  return parsed;
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requireRole(body: ActionBody, role: ActionBody["actorRole"]) {
  if (body.actorRole !== role) throw new Error("Action non autorisée pour ce rôle.");
}

async function seedIfNeeded(db: D1Database) {
  const seeded = await db
    .prepare("SELECT value FROM app_meta WHERE key = ?")
    .bind("starter_seed")
    .first<{ value: string }>();
  if (seeded) return;

  const current = new Date();
  const isoDaysAgo = (days: number) =>
    new Date(current.getTime() - days * 86_400_000).toISOString();

  const users = [
    [1, "Youssef", "youssef", "admin", "YO"],
    [2, "Salma", "salma", "delivery", "SA"],
    [3, "Papa", "papa", "member", "PA"],
    [4, "Maman", "maman", "member", "MA"],
    [5, "Amina", "amina", "member", "AM"],
    [6, "Yassine", "yassine", "member", "YA"],
    [7, "Sara", "sara", "member", "SR"],
    [8, "Adam", "adam", "member", "AD"],
  ] as const;

  const products = [
    [1, "Lait entier", "حليب كامل", "Whole milk", "food", "L", 850, "0% 0%", 18],
    [2, "Pain rond", "خبز دائري", "Round bread", "food", "pièce", 200, "100% 0%", 24],
    [3, "Huile d’olive", "زيت الزيتون", "Olive oil", "food", "L", 7500, "0% 100%", 8],
    [4, "Farine fine", "دقيق ناعم", "Fine flour", "food", "kg", 800, "100% 100%", 13],
    [5, "Sucre", "سكر", "Sugar", "food", "kg", 900, "100% 100%", 9],
    [6, "Œufs", "بيض", "Eggs", "food", "pièce", 140, "100% 0%", 16],
    [7, "Thé vert", "شاي أخضر", "Green tea", "food", "kg", 6800, "0% 100%", 6],
    [8, "Lessive", "مسحوق الغسيل", "Laundry detergent", "cleaning", "kg", 3200, "100% 100%", 7],
    [9, "Savon", "صابون", "Soap", "hygiene", "pièce", 650, "0% 0%", 10],
    [10, "Dentifrice", "معجون الأسنان", "Toothpaste", "hygiene", "pièce", 1800, "0% 0%", 5],
    [11, "Cahier", "دفتر", "Notebook", "school", "pièce", 1200, "100% 100%", 3],
    [12, "Papier cuisine", "ورق المطبخ", "Kitchen paper", "household", "pièce", 1500, "100% 0%", 4],
  ] as const;

  const statements = [
    ...users.map((user) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO family_users (id, name, username, role, initials, active) VALUES (?, ?, ?, ?, ?, 1)",
        )
        .bind(...user),
    ),
    ...products.map((product) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO products (id, name_fr, name_ar, name_en, category, unit, unit_price_cents, image_position, purchase_count, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        )
        .bind(...product),
    ),
    db
      .prepare(
        "INSERT OR IGNORE INTO carts (id, member_id, status, priority, created_at, submitted_at) VALUES (1, 3, 'pending', NULL, ?, ?)",
      )
      .bind(isoDaysAgo(0.15), isoDaysAgo(0.15)),
    db
      .prepare(
        "INSERT OR IGNORE INTO carts (id, member_id, status, priority, created_at, submitted_at, approved_at) VALUES (2, 4, 'ready', 'urgent', ?, ?, ?)",
      )
      .bind(isoDaysAgo(1.2), isoDaysAgo(1.2), isoDaysAgo(1)),
    db
      .prepare(
        "INSERT OR IGNORE INTO carts (id, member_id, status, priority, created_at, submitted_at, approved_at) VALUES (3, 5, 'ready', 'normal', ?, ?, ?)",
      )
      .bind(isoDaysAgo(2.1), isoDaysAgo(2.1), isoDaysAgo(2)),
    db
      .prepare(
        "INSERT OR IGNORE INTO carts (id, member_id, status, priority, created_at, submitted_at, approved_at, completed_at) VALUES (4, 6, 'completed', 'normal', ?, ?, ?, ?)",
      )
      .bind(isoDaysAgo(6), isoDaysAgo(6), isoDaysAgo(5.8), isoDaysAgo(5.5)),
    db
      .prepare(
        "INSERT OR IGNORE INTO cart_items (id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (1, 1, 1, 200, 850, 850, 'requested')",
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO cart_items (id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (2, 1, 4, 100, 800, 800, 'requested')",
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO cart_items (id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (3, 2, 2, 500, 200, 200, 'requested')",
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO cart_items (id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (4, 2, 3, 100, 7500, 7500, 'requested')",
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO cart_items (id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (5, 3, 8, 100, 3200, 3200, 'requested')",
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO cart_items (id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (6, 3, 9, 300, 650, 650, 'requested')",
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO cart_items (id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (7, 4, 6, 1200, 140, 150, 'bought')",
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO cart_items (id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (8, 4, 1, 300, 850, 850, 'bought')",
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO cart_items (id, cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (9, 4, 4, 200, 800, 800, 'unbought')",
      ),
    db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('starter_seed', '1')"),
  ];

  await db.batch(statements);
}

async function readState(db: D1Database) {
  const [users, products, carts, items, monthlyTotals] = await Promise.all([
    db
      .prepare(
        "SELECT id, name, username, role, initials FROM family_users WHERE active = 1 ORDER BY id",
      )
      .all(),
    db
      .prepare(
        "SELECT id, name_fr, name_ar, name_en, category, unit, unit_price_cents, image_position, purchase_count FROM products WHERE active = 1 ORDER BY purchase_count DESC, name_fr",
      )
      .all(),
    db
      .prepare(
        `SELECT c.id, c.member_id, c.status, c.priority, c.created_at, c.submitted_at,
                c.approved_at, c.completed_at, u.name AS member_name, u.initials AS member_initials
         FROM carts c
         JOIN family_users u ON u.id = c.member_id
         WHERE c.status != 'cancelled'
         ORDER BY
           CASE c.status WHEN 'pending' THEN 0 WHEN 'ready' THEN 1 WHEN 'shopping' THEN 2 ELSE 3 END,
           CASE c.priority WHEN 'urgent' THEN 0 ELSE 1 END,
           c.submitted_at ASC
         LIMIT 80`,
      )
      .all(),
    db
      .prepare(
        `SELECT ci.id, ci.cart_id, ci.product_id, ci.quantity_hundredths,
                ci.requested_unit_price_cents, ci.actual_unit_price_cents, ci.purchase_status,
                p.name_fr, p.name_ar, p.name_en, p.unit, p.image_position
         FROM cart_items ci
         JOIN products p ON p.id = ci.product_id
         JOIN carts c ON c.id = ci.cart_id
         WHERE c.status != 'cancelled'
         ORDER BY ci.id`,
      )
      .all(),
    db
      .prepare(
        `SELECT substr(c.completed_at, 1, 7) AS month,
                CAST(ROUND(SUM(ci.actual_unit_price_cents * ci.quantity_hundredths / 100.0)) AS INTEGER) AS total_cents,
                COUNT(DISTINCT c.id) AS carts_count
         FROM carts c
         JOIN cart_items ci ON ci.cart_id = c.id
         WHERE c.status = 'completed' AND ci.purchase_status = 'bought'
         GROUP BY substr(c.completed_at, 1, 7)
         ORDER BY month DESC
         LIMIT 12`,
      )
      .all(),
  ]);

  return {
    users: users.results,
    products: products.results,
    carts: carts.results,
    items: items.results,
    monthlyTotals: monthlyTotals.results,
  };
}

export async function GET() {
  try {
    const db = getD1();
    await seedIfNeeded(db);
    return Response.json(await readState(db));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ActionBody;
    const db = getD1();
    await seedIfNeeded(db);

    switch (body.action) {
      case "submit_cart": {
        requireRole(body, "member");
        const memberId = asPositiveInt(body.memberId, "memberId");
        const items = Array.isArray(body.items) ? body.items : [];
        if (!items.length) throw new Error("Le panier est vide.");

        const active = await db
          .prepare(
            "SELECT COUNT(*) AS count FROM carts WHERE member_id = ? AND status IN ('pending', 'ready', 'shopping')",
          )
          .bind(memberId)
          .first<{ count: number }>();
        if ((active?.count ?? 0) >= 3) {
          throw new Error("Vous avez déjà trois paniers actifs.");
        }

        const productIds = items.map((item) =>
          asPositiveInt((item as Record<string, unknown>).productId, "productId"),
        );
        const quantityById = new Map(
          items.map((item) => {
            const entry = item as Record<string, unknown>;
            return [
              asPositiveInt(entry.productId, "productId"),
              asPositiveInt(entry.quantityHundredths, "quantity"),
            ];
          }),
        );
        const placeholders = productIds.map(() => "?").join(",");
        const productRows = await db
          .prepare(
            `SELECT id, unit_price_cents FROM products WHERE active = 1 AND id IN (${placeholders})`,
          )
          .bind(...productIds)
          .all<{ id: number; unit_price_cents: number }>();
        if (productRows.results.length !== new Set(productIds).size) {
          throw new Error("Un produit du panier est indisponible.");
        }

        const timestamp = nowIso();
        const created = await db
          .prepare(
            "INSERT INTO carts (member_id, status, created_at, submitted_at) VALUES (?, 'pending', ?, ?)",
          )
          .bind(memberId, timestamp, timestamp)
          .run();
        const cartId = Number(created.meta.last_row_id);
        await db.batch(
          productRows.results.map((product) =>
            db
              .prepare(
                "INSERT INTO cart_items (cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (?, ?, ?, ?, ?, 'requested')",
              )
              .bind(
                cartId,
                product.id,
                quantityById.get(product.id),
                product.unit_price_cents,
                product.unit_price_cents,
              ),
          ),
        );
        break;
      }

      case "update_cart": {
        requireRole(body, "member");
        const cartId = asPositiveInt(body.cartId, "cartId");
        const memberId = asPositiveInt(body.memberId, "memberId");
        const items = Array.isArray(body.items) ? body.items : [];
        if (!items.length) throw new Error("Le panier est vide.");
        const cart = await db
          .prepare(
            "SELECT id FROM carts WHERE id = ? AND member_id = ? AND status IN ('pending', 'ready')",
          )
          .bind(cartId, memberId)
          .first();
        if (!cart) throw new Error("Ce panier ne peut plus être modifié.");

        const productIds = items.map((item) =>
          asPositiveInt((item as Record<string, unknown>).productId, "productId"),
        );
        const quantityById = new Map(
          items.map((item) => {
            const entry = item as Record<string, unknown>;
            return [
              asPositiveInt(entry.productId, "productId"),
              asPositiveInt(entry.quantityHundredths, "quantity"),
            ];
          }),
        );
        const placeholders = productIds.map(() => "?").join(",");
        const productRows = await db
          .prepare(
            `SELECT id, unit_price_cents FROM products WHERE active = 1 AND id IN (${placeholders})`,
          )
          .bind(...productIds)
          .all<{ id: number; unit_price_cents: number }>();
        const timestamp = nowIso();
        await db.batch([
          db.prepare("DELETE FROM cart_items WHERE cart_id = ?").bind(cartId),
          db
            .prepare(
              "UPDATE carts SET status = 'pending', priority = NULL, approved_at = NULL, submitted_at = ? WHERE id = ?",
            )
            .bind(timestamp, cartId),
          ...productRows.results.map((product) =>
            db
              .prepare(
                "INSERT INTO cart_items (cart_id, product_id, quantity_hundredths, requested_unit_price_cents, actual_unit_price_cents, purchase_status) VALUES (?, ?, ?, ?, ?, 'requested')",
              )
              .bind(
                cartId,
                product.id,
                quantityById.get(product.id),
                product.unit_price_cents,
                product.unit_price_cents,
              ),
          ),
        ]);
        break;
      }

      case "cancel_cart": {
        requireRole(body, "member");
        const cartId = asPositiveInt(body.cartId, "cartId");
        const memberId = asPositiveInt(body.memberId, "memberId");
        const result = await db
          .prepare(
            "UPDATE carts SET status = 'cancelled' WHERE id = ? AND member_id = ? AND status IN ('pending', 'ready')",
          )
          .bind(cartId, memberId)
          .run();
        if (!result.meta.changes) throw new Error("Ce panier ne peut plus être annulé.");
        break;
      }

      case "set_priority": {
        requireRole(body, "admin");
        const cartId = asPositiveInt(body.cartId, "cartId");
        const priority = body.priority === "urgent" ? "urgent" : "normal";
        const result = await db
          .prepare(
            "UPDATE carts SET status = 'ready', priority = ?, approved_at = ? WHERE id = ? AND status = 'pending'",
          )
          .bind(priority, nowIso(), cartId)
          .run();
        if (!result.meta.changes) throw new Error("Ce panier a déjà été traité.");
        break;
      }

      case "update_item": {
        requireRole(body, "delivery");
        const itemId = asPositiveInt(body.itemId, "itemId");
        const purchaseStatus =
          body.purchaseStatus === "bought" ? "bought" : "unbought";
        const actualUnitPriceCents = asPositiveInt(
          body.actualUnitPriceCents,
          "actualUnitPriceCents",
        );
        const result = await db
          .prepare(
            `UPDATE cart_items
             SET purchase_status = ?, actual_unit_price_cents = ?
             WHERE id = ? AND cart_id IN (
               SELECT id FROM carts WHERE status IN ('ready', 'shopping')
             )`,
          )
          .bind(purchaseStatus, actualUnitPriceCents, itemId)
          .run();
        if (!result.meta.changes) throw new Error("Cet article ne peut plus être modifié.");
        await db
          .prepare(
            "UPDATE carts SET status = 'shopping' WHERE id = (SELECT cart_id FROM cart_items WHERE id = ?) AND status = 'ready'",
          )
          .bind(itemId)
          .run();
        break;
      }

      case "finish_cart": {
        requireRole(body, "delivery");
        const cartId = asPositiveInt(body.cartId, "cartId");
        const rows = await db
          .prepare(
            "SELECT product_id, actual_unit_price_cents, purchase_status FROM cart_items WHERE cart_id = ?",
          )
          .bind(cartId)
          .all<{
            product_id: number;
            actual_unit_price_cents: number;
            purchase_status: string;
          }>();
        if (!rows.results.length || rows.results.some((item) => item.purchase_status === "requested")) {
          throw new Error("Marquez chaque article comme acheté ou non acheté.");
        }
        await db.batch([
          ...rows.results
            .filter((item) => item.purchase_status === "bought")
            .map((item) =>
              db
                .prepare(
                  "UPDATE products SET unit_price_cents = ?, purchase_count = purchase_count + 1, updated_at = ? WHERE id = ?",
                )
                .bind(item.actual_unit_price_cents, nowIso(), item.product_id),
            ),
          db
            .prepare(
              "UPDATE carts SET status = 'completed', completed_at = ? WHERE id = ? AND status IN ('ready', 'shopping')",
            )
            .bind(nowIso(), cartId),
        ]);
        break;
      }

      case "update_product": {
        requireRole(body, "admin");
        const productId = asPositiveInt(body.productId, "productId");
        const unitPriceCents = asPositiveInt(body.unitPriceCents, "unitPriceCents");
        await db
          .prepare(
            "UPDATE products SET unit_price_cents = ?, updated_at = ? WHERE id = ?",
          )
          .bind(unitPriceCents, nowIso(), productId)
          .run();
        break;
      }

      case "add_product": {
        requireRole(body, "admin");
        const nameFr = asText(body.nameFr);
        const nameAr = asText(body.nameAr);
        const nameEn = asText(body.nameEn);
        const category = asText(body.category);
        const unit = asText(body.unit);
        const unitPriceCents = asPositiveInt(body.unitPriceCents, "unitPriceCents");
        if (!nameFr || !category || !["L", "kg", "pièce"].includes(unit)) {
          throw new Error("Les informations du produit sont incomplètes.");
        }
        await db
          .prepare(
            "INSERT INTO products (name_fr, name_ar, name_en, category, unit, unit_price_cents, image_position, active) VALUES (?, ?, ?, ?, ?, ?, '100% 100%', 1)",
          )
          .bind(nameFr, nameAr, nameEn, category, unit, unitPriceCents)
          .run();
        break;
      }

      default:
        throw new Error("Action inconnue.");
    }

    return Response.json(await readState(db));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inattendue.";
    return Response.json({ error: message }, { status: 400 });
  }
}
