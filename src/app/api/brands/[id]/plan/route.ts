import { systemDb } from "@/db/client";
import { AuthNotConfiguredError, getSession } from "@/lib/auth/session";
import { planProgress } from "@/lib/content/service";
import { isUuid } from "@/lib/ids";

/** Polled by the week page while a plan or a rewrite is running. */
export async function GET(_request: Request, context: RouteContext<"/api/brands/[id]/plan">) {
  const { id } = await context.params;
  let session;
  try {
    session = await getSession();
  } catch (error) {
    if (error instanceof AuthNotConfiguredError) {
      return Response.json({ error: "auth_not_configured" }, { status: 503 });
    }
    throw error;
  }
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(id)) return Response.json({ error: "not_found" }, { status: 404 });
  const progress = await planProgress(systemDb(), session.tenantId, id);
  if (!progress) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(progress, { headers: { "cache-control": "no-store" } });
}
