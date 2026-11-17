"use client";

import { useEffect } from "react";

/**
 * Opens a short address at its section: /precios at pricing, /beta at the
 * form. A hash in the link wins, so shared deep links still work.
 */
export function ScrollOnLoad({ to }: { to: string }) {
  useEffect(() => {
    if (window.location.hash) return;
    document.getElementById(to)?.scrollIntoView({ block: "start" });
  }, [to]);
  return null;
}
