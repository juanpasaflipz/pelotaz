ALTER TYPE "public"."content_status" ADD VALUE 'publishing' BEFORE 'published';--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "parent_account_id" text;