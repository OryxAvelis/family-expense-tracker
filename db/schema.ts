import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appMeta = sqliteTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const familyUsers = sqliteTable(
  "family_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull().default(""),
    role: text("role", { enum: ["admin", "delivery", "member"] }).notNull(),
    initials: text("initials").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_family_users_username").on(table.username)],
);

export const familySessions = sqliteTable(
  "family_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id").notNull().references(() => familyUsers.id),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_family_sessions_user_id").on(table.userId),
    index("idx_family_sessions_expires_at").on(table.expiresAt),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nameFr: text("name_fr").notNull(),
    nameAr: text("name_ar").notNull().default(""),
    nameEn: text("name_en").notNull().default(""),
    category: text("category").notNull(),
    unit: text("unit", { enum: ["L", "kg", "pièce"] }).notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    imagePosition: text("image_position").notNull().default("0% 0%"),
    purchaseCount: integer("purchase_count").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_products_name_fr").on(table.nameFr),
    index("idx_products_category_active").on(table.category, table.active),
  ],
);

export const carts = sqliteTable(
  "carts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    memberId: integer("member_id").notNull().references(() => familyUsers.id),
    status: text("status", {
      enum: ["pending", "ready", "shopping", "completed", "cancelled"],
    }).notNull().default("pending"),
    priority: text("priority", { enum: ["urgent", "normal"] }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    approvedAt: text("approved_at"),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("idx_carts_member_status").on(table.memberId, table.status),
    index("idx_carts_queue").on(table.status, table.priority, table.submittedAt),
    index("idx_carts_completed_at").on(table.completedAt),
  ],
);

export const cartItems = sqliteTable(
  "cart_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cartId: integer("cart_id").notNull().references(() => carts.id),
    productId: integer("product_id").notNull().references(() => products.id),
    quantityHundredths: integer("quantity_hundredths").notNull(),
    requestedUnitPriceCents: integer("requested_unit_price_cents").notNull(),
    actualUnitPriceCents: integer("actual_unit_price_cents").notNull(),
    purchaseStatus: text("purchase_status", {
      enum: ["requested", "bought", "unbought"],
    }).notNull().default("requested"),
  },
  (table) => [
    index("idx_cart_items_cart_id").on(table.cartId),
    index("idx_cart_items_product_id").on(table.productId),
  ],
);
