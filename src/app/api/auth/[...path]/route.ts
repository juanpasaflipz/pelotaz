import { isNeonAuthConfigured, neonAuth } from "@/lib/auth/neon";

type Context = { params: Promise<{ path: string[] }> };
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Passes the browser's auth requests (session refresh, email confirmation
 * links) through to Neon Auth. Built per request so that a deployment without
 * Neon Auth settings answers 404 here instead of failing to start.
 */
const forward = (method: Method) => (request: Request, context: Context) =>
  isNeonAuthConfigured()
    ? neonAuth().handler()[method](request, context)
    : Response.json({ error: "auth_not_configured" }, { status: 404 });

export const GET = forward("GET");
export const POST = forward("POST");
export const PUT = forward("PUT");
export const PATCH = forward("PATCH");
export const DELETE = forward("DELETE");
