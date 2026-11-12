import { eq } from "drizzle-orm";
import { systemDb } from "@/db/client";
import { brands } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { AuthNotConfiguredError, getSession } from "@/lib/auth/session";

/** Polled by the brand page while onboarding runs. */
export async function GET(_request: Request, context: RouteContext<"/api/brands/[id]/status">) {
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
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "not_found" }, { status: 404 });

  const brand = await withTenant(systemDb(), session.tenantId, async (tx) => {
    const [row] = await tx
      .select({ status: brands.status, statusDetail: brands.statusDetail })
      .from(brands)
      .where(eq(brands.id, id));
    return row ?? null;
  });
  if (!brand) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(brand, { headers: { "cache-control": "no-store" } });
}
