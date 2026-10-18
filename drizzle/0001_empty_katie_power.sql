CREATE TYPE "public"."dispatch_kind" AS ENUM('invite', 'reminder_d7', 'reminder_d1');--> statement-breakpoint
CREATE TYPE "public"."dispatch_status" AS ENUM('scheduled', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "message_dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guest_id" uuid NOT NULL,
	"kind" "dispatch_kind" NOT NULL,
	"status" "dispatch_status" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"provider_message_id" text,
	"admin_id" uuid,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "reminder_d7_text" text DEFAULT 'Olá, {nome}! Falta uma semana para os 15 anos da Isabella. Domingo, 27/12, às 10h, no Sítio Lua Azul (Cantá–RR). Traje livre e roupa de banho para a piscina. Seu convite: {link}' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "reminder_d1_text" text DEFAULT 'Olá, {nome}! É amanhã: 15 anos da Isabella, domingo às 10h no Sítio Lua Azul. Como chegar e todos os detalhes: {link}' NOT NULL;--> statement-breakpoint
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_dispatches" ADD CONSTRAINT "message_dispatches_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_dispatches_status_scheduled_for_idx" ON "message_dispatches" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "message_dispatches_guest_kind_uniq" ON "message_dispatches" USING btree ("guest_id","kind") WHERE "message_dispatches"."kind" <> 'invite';