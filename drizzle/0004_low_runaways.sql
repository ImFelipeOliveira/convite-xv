CREATE TABLE "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'Outros' NOT NULL,
	"price_cents" integer,
	"image_url" text,
	"purchase_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"guest_id" uuid,
	"reserved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gifts_price_non_negative" CHECK ("gifts"."price_cents" is null or "gifts"."price_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gifts_category_sort_order_idx" ON "gifts" USING btree ("category","sort_order");