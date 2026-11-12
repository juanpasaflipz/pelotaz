import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { runOnboarding } from "@/lib/onboarding/trigger";

/** Crawling up to 20 pages plus two model calls. Platforms cap this by plan. */
export const maxDuration = 300;

const bodySchema = z.object({
  tenantId: z.uuid(),
  force: z.boolean().optional(),
});

function secretMatches(provided: string | null): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  // An unset or short secret must never authenticate anything.
  if (!expected || expected.length < 32 || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called by n8n (workflow "Onboard brand"), never by a browser. Runs the
 * crawl and Brand DNA build synchronously and returns the outcome, so n8n can
 * decide whether to retry. Safe to call twice: the second call is `skipped`.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/internal/brands/[id]/onboard">,
) {
  if (!secretMatches(request.headers.get("x-pelotaz-secret"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !z.uuid().safeParse(id).success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const outcome = await runOnboarding(body.data.tenantId, id, body.data.force ?? false);
  return Response.json(outcome);
}
