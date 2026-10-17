CREATE TYPE "public"."rsvp_status" AS ENUM('pending', 'yes', 'no');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"plus_ones_limit" integer DEFAULT 0 NOT NULL,
	"rsvp_status" "rsvp_status" DEFAULT 'pending' NOT NULL,
	"plus_ones" integer DEFAULT 0 NOT NULL,
	"message" text,
	"responded_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guests_token_unique" UNIQUE("token"),
	CONSTRAINT "plus_ones_limit_range" CHECK ("guests"."plus_ones_limit" between 0 and 6),
	CONSTRAINT "plus_ones_non_negative" CHECK ("guests"."plus_ones" >= 0)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"rsvp_deadline" date DEFAULT '2026-12-13' NOT NULL,
	"contact_info" text,
	"closing_message" text,
	"whatsapp_invite_template" text DEFAULT 'Olá, {nome}! A Isabella vai fazer 15 anos e preparou um convite especial para você. Abra a carta: {link}' NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
INSERT INTO "settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
