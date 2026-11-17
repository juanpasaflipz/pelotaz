import { track } from "@vercel/analytics";

/** An analytics event that also says which address the visit came in through (/, /beta, /precios). */
export function trackEvent(name: string, props: Record<string, string> = {}) {
  track(name, { ...props, entry: window.location.pathname });
}
