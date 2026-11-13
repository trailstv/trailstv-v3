import { pgTable, text, integer, timestamp, jsonb, uuid, date, index, primaryKey, boolean, doublePrecision } from "drizzle-orm/pg-core";

/**
 * Flat files hold the canonical, slow-changing catalog (parks, trails, activities).
 * Neon holds everything user-generated or time-series.
 */

/* --------------------------- Better Auth tables --------------------------- */
// Field names must match Better Auth's model (see src/lib/auth.ts).

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  /** "user" | "admin". Not settable at sign-up (see auth.ts additionalFields input:false). */
  role: text("role").default("user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/* ------------------------------ User content ------------------------------ */

/** AllTrails-style reviews / trip reports on a trail or a park activity. */
export const tripReports = pgTable(
  "trip_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    parkCode: text("park_code").notNull(),
    trailId: text("trail_id"),
    activity: text("activity").notNull(),
    rating: integer("rating").notNull(), // 1-5
    tripDate: date("trip_date"),
    /** e.g. ["icy", "muddy", "bugs", "crowded", "snow-covered", "high-water"] */
    conditionTags: text("condition_tags").array().default([]).notNull(),
    body: text("body").notNull(),
    hidden: boolean("hidden").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("trip_reports_park_idx").on(t.parkCode, t.createdAt), index("trip_reports_trail_idx").on(t.trailId, t.createdAt)],
);

/** Things a user can favorite or save. Parks and trails come from flat files;
 *  campgrounds etc. come from live APIs, so a name/location snapshot is stored. */
export const ITEM_KINDS = ["park", "trail", "campground"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Favorites (♥ "loved it") and Saves (🔖 "want to go"), one row per user + item. */
export const userItems = pgTable(
  "user_items",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ItemKind>().notNull(),
    refId: text("ref_id").notNull(),
    parkCode: text("park_code").notNull(),
    name: text("name").notNull(),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    favorite: boolean("favorite").default(false).notNull(),
    saved: boolean("saved").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind, t.refId] }), index("user_items_user_idx").on(t.userId, t.updatedAt)],
);

/**
 * Visited parks / completed trails. A log, so the same hike can be done many
 * times. Completing a trail also counts its park as visited.
 */
export const completions = pgTable(
  "completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"park" | "trail" | "campground">().notNull(),
    refId: text("ref_id").notNull(),
    parkCode: text("park_code").notNull(),
    completedOn: date("completed_on").notNull(),
    activity: text("activity"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("completions_user_idx").on(t.userId, t.kind, t.refId)],
);

/** Itineraries: a named trip with dated days and ordered stops. */
export const trips = pgTable(
  "trips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    notes: text("notes"),
    isPublic: boolean("is_public").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("trips_user_idx").on(t.userId, t.startDate)],
);

export const STOP_KINDS = ["park", "trail", "campground", "custom"] as const;

export const tripStops = pgTable(
  "trip_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    day: integer("day").notNull().default(1), // 1-based day of the trip
    position: integer("position").notNull().default(0),
    kind: text("kind").$type<(typeof STOP_KINDS)[number]>().notNull(),
    refId: text("ref_id"),
    parkCode: text("park_code"),
    name: text("name").notNull(),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    time: text("time"), // free text, e.g. "7:00 AM" or "Sunrise"
    notes: text("notes"),
  },
  (t) => [index("trip_stops_trip_idx").on(t.tripId, t.day, t.position)],
);

/**
 * Historical snapshots of live conditions (written by a Vercel Cron job).
 * Lets you chart river flow / snowpack trends and survive upstream outages.
 */
export const conditionSnapshots = pgTable(
  "condition_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parkCode: text("park_code").notNull(),
    source: text("source").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("snapshots_lookup_idx").on(t.parkCode, t.source, t.fetchedAt)],
);

/* ------------------------------ Stripe billing ------------------------------ */

/** One Stripe customer per user. */
export const customers = pgTable("customers", {
  stripeCustomerId: text("stripe_customer_id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }).unique(),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Mirror of Stripe subscriptions, kept in sync by the webhook. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(), // sub_...
    stripeCustomerId: text("stripe_customer_id").notNull(),
    status: text("status").notNull(), // active | trialing | past_due | canceled | ...
    lookupKey: text("lookup_key"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("subscriptions_customer_idx").on(t.stripeCustomerId)],
);

/** One-time purchases (e.g. offline park packs). */
export const purchases = pgTable(
  "purchases",
  {
    checkoutSessionId: text("checkout_session_id").primaryKey(), // cs_...
    stripeCustomerId: text("stripe_customer_id").notNull(),
    paymentIntentId: text("payment_intent_id"),
    productSlug: text("product_slug").notNull(),
    parkCode: text("park_code"),
    amountTotal: integer("amount_total"),
    currency: text("currency"),
    refunded: boolean("refunded").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("purchases_customer_idx").on(t.stripeCustomerId), index("purchases_pi_idx").on(t.paymentIntentId)],
);

/* ------------------------------ Admin ------------------------------ */

/**
 * Complimentary access an admin gives a user, without Stripe.
 * Counts exactly like a paid subscription / purchase while active.
 */
export const accessGrants = pgTable(
  "access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    grant: text("grant").$type<"plus" | "park-pack">().notNull(),
    parkCode: text("park_code"), // for park-pack grants
    startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = never expires
    note: text("note"),
    grantedBy: text("granted_by").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("access_grants_user_idx").on(t.userId)],
);

/** Every admin action, for accountability. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(), // grant.create | grant.revoke | role.set
    targetUserId: text("target_user_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_target_idx").on(t.targetUserId)],
);

/** Processed webhook event ids, so retries are never applied twice. */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TripReport = typeof tripReports.$inferSelect;
export type NewTripReport = typeof tripReports.$inferInsert;
export type UserItem = typeof userItems.$inferSelect;
export type Completion = typeof completions.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type AccessGrant = typeof accessGrants.$inferSelect;
export type TripStop = typeof tripStops.$inferSelect;
