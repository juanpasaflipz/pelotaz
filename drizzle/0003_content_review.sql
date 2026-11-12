ALTER TABLE "plans" ALTER COLUMN "status" SET DEFAULT 'planning';--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "alt" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "source" text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "instruction" text;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "review_flags" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "status_detail" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "brand_dna_version" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "llm_usage" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "assets_brand_url" ON "assets" USING btree ("brand_id","storage_url");