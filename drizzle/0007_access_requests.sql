CREATE TYPE "public"."access_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"business_name" text NOT NULL,
	"website" text NOT NULL,
	"status" "access_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text
);
--> statement-breakpoint
ALTER TABLE "access_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_email" ON "access_requests" USING btree ("email");--> statement-breakpoint
CREATE INDEX "access_requests_status_created" ON "access_requests" USING btree ("status","created_at");