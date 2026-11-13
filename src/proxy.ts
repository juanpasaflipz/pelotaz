import { NextResponse, type NextRequest } from "next/server";
import { isNeonAuthConfigured, neonAuth } from "@/lib/auth/neon";

/**
 * Sends signed-out visitors to the sign-in page before any page renders.
 * This is a convenience, not the security boundary: every page, action and
 * route handler checks the session itself and reads data through row-level
 * security.
 */
let guard: ((request: NextRequest) => Promise<NextResponse>) | undefined;

export default function proxy(request: NextRequest) {
  // Local dev mode (AUTH_MODE=dev) has no sign-in to send anyone to.
  if (!isNeonAuthConfigured()) return NextResponse.next();
  guard ??= neonAuth().middleware({
    loginUrl: "/auth/sign-in",
    // /api/internal and /api/cron are called by schedulers with their own secret;
    // /api/media is fetched by Meta's servers when a post is published.
    publicRoutes: ["/auth/sign-in", "/auth/sign-up", "/api/internal", "/api/cron", "/api/media"],
  });
  return guard(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
