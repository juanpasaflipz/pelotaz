import { timingSafeEqual } from "node:crypto";
import { collectResults, publishDue } from "@/lib/publishing/service";
import { isPublishingConfigured, publishDeps } from "@/lib/publishing/runtime";

export const maxDuration = 300;

const matches = (given: string, expected: string | undefined) =>
  !!expected &&
  expected.length >= 32 &&
  given.length === expected.length &&
  timingSafeEqual(Buffer.from(given), Buffer.from(expected));

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; other schedulers may use the internal secret. */
function authorized(request: Request): boolean {
  const given =
    request.headers.get("x-pelotaz-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return matches(given, process.env.CRON_SECRET) || matches(given, process.env.INTERNAL_API_SECRET);
}

/**
 * Publish posts that are due. Vercel Cron calls it every 10 minutes
 * (vercel.json); any other scheduler can call it with the internal secret.
 */
async function handle(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isPublishingConfigured()) return Response.json({ error: "not_configured" }, { status: 503 });
  const deps = publishDeps();
  const results = await publishDue(deps);
  // Then the day's results for posts already out; each post is read once a day.
  const metrics = await collectResults(deps).catch((error) => {
    console.error("results run failed", { error: error instanceof Error ? error.message : error });
    return { updated: 0, failed: 0 };
  });
  return Response.json({
    published: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
    metrics,
  });
}

export const GET = handle;
export const POST = handle;
