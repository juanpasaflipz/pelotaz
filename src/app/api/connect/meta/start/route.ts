import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { getBrandWithDna } from "@/lib/data";
import { isUuid } from "@/lib/ids";
import { loginUrl, metaConfigFromEnv } from "@/lib/meta/graph";
import { sign } from "@/lib/meta/secrets";
import { isPublishingConfigured, metaRedirectUri } from "@/lib/publishing/runtime";

export const NONCE_COOKIE = "pz_meta_nonce";

/** Send the owner to Facebook to connect the brand's Page and Instagram account. */
export async function GET(request: Request) {
  const brandId = new URL(request.url).searchParams.get("brand") ?? "";
  const session = await getSession();
  if (!session) return Response.redirect(new URL("/auth/sign-in", request.url), 303);
  if (!isUuid(brandId) || !(await getBrandWithDna(session.tenantId, brandId))) {
    return new Response("Not found", { status: 404 });
  }
  const config = metaConfigFromEnv();
  if (!config || !isPublishingConfigured()) return new Response("Publishing is not configured", { status: 503 });

  // The nonce ties the round trip to this browser; the signed state ties it to this tenant and brand.
  const nonce = randomBytes(16).toString("base64url");
  (await cookies()).set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/connect/meta",
    maxAge: 600,
  });
  const state = sign({ tenantId: session.tenantId, brandId, nonce });
  return Response.redirect(loginUrl(config, metaRedirectUri(), state), 303);
}
