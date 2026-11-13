import { timingSafeEqual } from "node:crypto";
import { publishDue } from "@/lib/publishing/service";
import { isPublishingConfigured, publishDeps } from "@/lib/publishing/runtime";

export const maxDuration = 300;

function authorized(request: Request): boolean {
  const expected = process.env.INTERNAL_API_SECRET ?? "";
  if (expected.length < 32) return false;
  const given =
    request.headers.get("x-pelotaz-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Publish posts that are due. Call every 5 to 15 minutes from a scheduler
 * (n8n, or any cron) with the internal secret.
 */
async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isPublishingConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });
  const results = await publishDue(publishDeps());
  return Response.json({ published: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
}

export const GET = handle;
export const POST = handle;
