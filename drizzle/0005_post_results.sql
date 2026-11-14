ALTER TABLE "metrics_daily" ADD COLUMN "views" bigint;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "reach" bigint;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "likes" bigint;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "comments" bigint;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "shares" bigint;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "saves" bigint;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "interactions" bigint;--> statement-breakpoint
ALTER TABLE "metrics_daily" ADD COLUMN "fetched_at" timestamp with time zone;