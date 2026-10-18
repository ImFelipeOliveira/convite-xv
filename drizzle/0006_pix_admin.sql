ALTER TABLE "settings" ALTER COLUMN "pix_receiver_name" SET DEFAULT 'Felipe Oliveira Souza';--> statement-breakpoint
ALTER TABLE "pix_payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
-- the existing settings row (created before this default) gets it too
UPDATE "settings" SET "pix_receiver_name" = 'Felipe Oliveira Souza' WHERE "pix_receiver_name" IS NULL;
