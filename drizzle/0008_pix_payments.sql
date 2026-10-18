CREATE TYPE "public"."pix_status" AS ENUM('pending', 'paid', 'expired', 'cancelled', 'failed');--> statement-breakpoint
CREATE TABLE "pix_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid,
	"amount_cents" integer NOT NULL,
	"asaas_payment_id" text,
	"status" "pix_status" DEFAULT 'pending' NOT NULL,
	"qr_image" text,
	"copy_paste" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pix_payments_asaas_payment_id_unique" UNIQUE("asaas_payment_id"),
	CONSTRAINT "pix_payments_amount_minimum" CHECK ("pix_payments"."amount_cents" >= 7000)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payment_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "asaas_customer_id" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "asaas_customer_id" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "pix_thanks_message" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "pix_receiver_name" text DEFAULT 'Felipe Oliveira Souza';--> statement-breakpoint
ALTER TABLE "pix_payments" ADD CONSTRAINT "pix_payments_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pix_payments_guest_status_idx" ON "pix_payments" USING btree ("guest_id","status");--> statement-breakpoint
-- the existing settings row (created before this column) gets the receiver name too; ADD COLUMN ... DEFAULT
-- already fills it, this keeps the backfill explicit and idempotent
UPDATE "settings" SET "pix_receiver_name" = 'Felipe Oliveira Souza' WHERE "pix_receiver_name" IS NULL;
