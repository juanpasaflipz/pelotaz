CREATE TYPE "public"."access_request_billing" AS ENUM('anual', 'mensual');--> statement-breakpoint
CREATE TYPE "public"."access_request_plan" AS ENUM('starter', 'pro');--> statement-breakpoint
CREATE TYPE "public"."access_request_source" AS ENUM('beta', 'empieza');--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "plan_interest" "access_request_plan";--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "billing_interest" "access_request_billing";--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "source" "access_request_source";--> statement-breakpoint
ALTER TABLE "access_requests" ADD COLUMN "utm" jsonb;