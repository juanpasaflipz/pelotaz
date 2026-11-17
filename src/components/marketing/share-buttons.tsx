"use client";

import { useState } from "react";
import { es } from "@/i18n/es";
import { trackEvent } from "./analytics";

const t = es.marketing.jonas;

/** WhatsApp share and copy-link for a public page. */
export function ShareButtons({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${t.shareText} ${url}`)}`;
  return (
    <div className="flex flex-wrap gap-3">
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent("share", { via: "whatsapp" })}
        className="button button-primary"
      >
        {t.shareWhatsapp}
      </a>
      <button
        type="button"
        className="button button-quiet"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // No clipboard access (an old browser or an embedded view): the WhatsApp button still works.
          }
          trackEvent("share", { via: "copy" });
        }}
      >
        <span aria-live="polite">{copied ? t.copied : t.shareCopy}</span>
      </button>
    </div>
  );
}
