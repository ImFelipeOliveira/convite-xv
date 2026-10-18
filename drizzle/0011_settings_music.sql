ALTER TABLE "settings" ADD COLUMN "music_key" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "music_start_seconds" integer DEFAULT 0 NOT NULL;