-- TrailsTV database tables.
-- Paste this whole file into the Neon console → SQL Editor and click Run.
-- It's written as ONE command so it works in any SQL editor, and it's safe to run
-- more than once: it only creates what's missing and never deletes anything.
-- Vercel also runs this automatically before each build when DATABASE_URL is set.
-- (Same result as `npm run db:push`.)

DO $trailstv$BEGIN
  CREATE TABLE IF NOT EXISTS "access_grants" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "grant" text NOT NULL,
    "park_code" text,
    "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
    "expires_at" timestamp with time zone,
    "note" text,
    "granted_by" text,
    "revoked_at" timestamp with time zone,
    "revoked_by" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "account" (
    "id" text PRIMARY KEY NOT NULL,
    "account_id" text NOT NULL,
    "provider_id" text NOT NULL,
    "user_id" text NOT NULL,
    "access_token" text,
    "refresh_token" text,
    "id_token" text,
    "access_token_expires_at" timestamp with time zone,
    "refresh_token_expires_at" timestamp with time zone,
    "scope" text,
    "password" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "actor_id" text,
    "actor_email" text,
    "action" text NOT NULL,
    "target_user_id" text,
    "details" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "completions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "kind" text NOT NULL,
    "ref_id" text NOT NULL,
    "park_code" text NOT NULL,
    "completed_on" date NOT NULL,
    "activity" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "condition_snapshots" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "park_code" text NOT NULL,
    "source" text NOT NULL,
    "payload" jsonb NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "customers" (
    "stripe_customer_id" text PRIMARY KEY NOT NULL,
    "user_id" text,
    "email" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "customers_user_id_unique" UNIQUE("user_id")
  );
  CREATE TABLE IF NOT EXISTS "purchases" (
    "checkout_session_id" text PRIMARY KEY NOT NULL,
    "stripe_customer_id" text NOT NULL,
    "payment_intent_id" text,
    "product_slug" text NOT NULL,
    "park_code" text,
    "amount_total" integer,
    "currency" text,
    "refunded" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "session" (
    "id" text PRIMARY KEY NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "token" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "ip_address" text,
    "user_agent" text,
    "user_id" text NOT NULL,
    CONSTRAINT "session_token_unique" UNIQUE("token")
  );
  CREATE TABLE IF NOT EXISTS "stripe_events" (
    "id" text PRIMARY KEY NOT NULL,
    "type" text NOT NULL,
    "received_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" text PRIMARY KEY NOT NULL,
    "stripe_customer_id" text NOT NULL,
    "status" text NOT NULL,
    "lookup_key" text,
    "current_period_end" timestamp with time zone,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "trip_reports" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text,
    "author_name" text NOT NULL,
    "park_code" text NOT NULL,
    "trail_id" text,
    "activity" text NOT NULL,
    "rating" integer NOT NULL,
    "trip_date" date,
    "condition_tags" text[] DEFAULT '{}' NOT NULL,
    "body" text NOT NULL,
    "hidden" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "trip_stops" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "trip_id" uuid NOT NULL,
    "day" integer DEFAULT 1 NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "kind" text NOT NULL,
    "ref_id" text,
    "park_code" text,
    "name" text NOT NULL,
    "lat" double precision,
    "lon" double precision,
    "time" text,
    "notes" text
  );
  CREATE TABLE IF NOT EXISTS "trips" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "start_date" date,
    "end_date" date,
    "notes" text,
    "is_public" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "email_verified" boolean DEFAULT false NOT NULL,
    "image" text,
    "role" text DEFAULT 'user' NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "user_email_unique" UNIQUE("email")
  );
  CREATE TABLE IF NOT EXISTS "user_items" (
    "user_id" text NOT NULL,
    "kind" text NOT NULL,
    "ref_id" text NOT NULL,
    "park_code" text NOT NULL,
    "name" text NOT NULL,
    "lat" double precision,
    "lon" double precision,
    "favorite" boolean DEFAULT false NOT NULL,
    "saved" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "user_items_user_id_kind_ref_id_pk" PRIMARY KEY("user_id","kind","ref_id")
  );
  CREATE TABLE IF NOT EXISTS "verification" (
    "id" text PRIMARY KEY NOT NULL,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  );
  BEGIN ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_granted_by_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "completions" ADD CONSTRAINT "completions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "trip_reports" ADD CONSTRAINT "trip_reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER TABLE "user_items" ADD CONSTRAINT "user_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END;
  CREATE INDEX IF NOT EXISTS "access_grants_user_idx" ON "access_grants" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "account_user_idx" ON "account" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "audit_log_created_idx" ON "audit_log" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "audit_log_target_idx" ON "audit_log" USING btree ("target_user_id");
  CREATE INDEX IF NOT EXISTS "completions_user_idx" ON "completions" USING btree ("user_id","kind","ref_id");
  CREATE INDEX IF NOT EXISTS "snapshots_lookup_idx" ON "condition_snapshots" USING btree ("park_code","source","fetched_at");
  CREATE INDEX IF NOT EXISTS "purchases_customer_idx" ON "purchases" USING btree ("stripe_customer_id");
  CREATE INDEX IF NOT EXISTS "purchases_pi_idx" ON "purchases" USING btree ("payment_intent_id");
  CREATE INDEX IF NOT EXISTS "session_user_idx" ON "session" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "subscriptions_customer_idx" ON "subscriptions" USING btree ("stripe_customer_id");
  CREATE INDEX IF NOT EXISTS "trip_reports_park_idx" ON "trip_reports" USING btree ("park_code","created_at");
  CREATE INDEX IF NOT EXISTS "trip_reports_trail_idx" ON "trip_reports" USING btree ("trail_id","created_at");
  CREATE INDEX IF NOT EXISTS "trip_stops_trip_idx" ON "trip_stops" USING btree ("trip_id","day","position");
  CREATE INDEX IF NOT EXISTS "trips_user_idx" ON "trips" USING btree ("user_id","start_date");
  CREATE INDEX IF NOT EXISTS "user_items_user_idx" ON "user_items" USING btree ("user_id","updated_at");
END
$trailstv$;
