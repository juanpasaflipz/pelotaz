import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { systemDb } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { createGraphClient, metaConfigFromEnv } from "@/lib/meta/graph";
import { verify } from "@/lib/meta/secrets";
import { saveConnections } from "@/lib/publishing/service";
import { metaRedirectUri } from "@/lib/publishing/runtime";

const NONCE_COOKIE = "pz_meta_nonce";

const sameText = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Facebook sends the owner back here after they approve (or cancel) the connection. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (brandId: string | null, result: string) =>
    Response.redirect(new URL(brandId ? `/brands/${brandId}/semana?meta=${result}` : "/", request.url), 303);

  const jar = await cookies();
  const nonce = jar.get(NONCE_COOKIE)?.value ?? "";
  jar.delete({ name: NONCE_COOKIE, path: "/api/connect/meta" });

  const state = verify<{ tenantId: string; brandId: string; nonce: string }>(url.searchParams.get("state") ?? "");
  if (!state || !nonce || !sameText(state.nonce, nonce)) return back(null, "error");

  const session = await getSession();
  if (!session || session.tenantId !== state.tenantId) return back(null, "error");
  if (url.searchParams.get("error")) return back(state.brandId, "cancelled");

  const code = url.searchParams.get("code");
  const config = metaConfigFromEnv();
  if (!code || !config) return back(state.brandId, "error");

  try {
    const graph = createGraphClient(config);
    const userToken = await graph.userToken(code, metaRedirectUri());
    const pages = await graph.pages(userToken);
    if (pages.length === 0) {
      console.warn("meta connect: no pages granted", { brandId: state.brandId });
      return back(state.brandId, "no_pages");
    }
    const saved = await saveConnections(systemDb(), session.tenantId, state.brandId, pages);
    return back(state.brandId, saved.active ? "connected" : "choose");
  } catch (error) {
    console.error("meta connect failed", { error: error instanceof Error ? error.message : error });
    return back(state.brandId, "error");
  }
}
