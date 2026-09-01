import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["supervisor", "usuario", "fornecedor"] })
    .notNull()
    .default("usuario"),
  canRecordDeliveries: integer("can_record_deliveries", { mode: "boolean" })
    .notNull()
    .default(true),
  canRecordPayments: integer("can_record_payments", { mode: "boolean" })
    .notNull()
    .default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  passwordIterations: integer("password_iterations"),
  passwordChangedAt: text("password_changed_at"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("session_user_email_idx").on(table.userEmail),
    index("session_expires_at_idx").on(table.expiresAt),
  ],
);

export const loginAttempts = sqliteTable("login_attempts", {
  id: text("id").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
  lockedUntil: text("locked_until"),
});

export const priceHistory = sqliteTable(
  "price_history",
  {
    id: text("id").primaryKey(),
    effectiveDate: text("effective_date").notNull(),
    priceCents: integer("price_cents").notNull(),
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("price_effective_date_idx").on(table.effectiveDate)],
);

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    deliveryDate: text("delivery_date").notNull(),
    totalWeightGrams: integer("total_weight_grams").notNull(),
    pricePerKgCents: integer("price_per_kg_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("delivery_date_idx").on(table.deliveryDate)],
);

export const deliveryItems = sqliteTable(
  "delivery_items",
  {
    id: text("id").primaryKey(),
    deliveryId: text("delivery_id")
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    weightGrams: integer("weight_grams").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [index("delivery_item_delivery_idx").on(table.deliveryId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    paymentDate: text("payment_date").notNull(),
    method: text("method", {
      enum: ["pix", "cheque", "consumo", "compensacao", "outro"],
    })
      .notNull()
      .default("pix"),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("payment_date_idx").on(table.paymentDate)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    actorName: text("actor_name").notNull(),
    action: text("action", { enum: ["criou", "alterou", "excluiu"] }).notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    summary: text("summary").notNull(),
    detailsJson: text("details_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("audit_created_at_idx").on(table.createdAt)],
);

export type AppUser = typeof users.$inferSelect;
