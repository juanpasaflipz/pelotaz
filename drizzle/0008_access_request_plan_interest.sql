CREATE TYPE "public"."access_request_billing" AS ENUM('anual', 'mensual');--> statement-breakpoint
CREATE TYPE "public"."access_request_plan" AS ENUM('starter', 'pro');--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "plan_interest" "access_request_plan";--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "billing_interest" "access_request_billing";