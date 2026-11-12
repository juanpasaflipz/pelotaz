"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { es } from "@/i18n/es";

type Working = "pending" | "crawling" | "building";

/**
 * Shown while a site is being read. Polls the status endpoint and reloads the
 * page's server data once the run finishes or fails.
 */
export function OnboardingProgress({ brandId, initial }: { brandId: string; initial: Working }) {
  const router = useRouter();
  const [status, setStatus] = useState<Working>(initial);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      try {
        const response = await fetch(`/api/brands/${brandId}/status`, { cache: "no-store" });
        if (!response.ok || stopped) return;
        const body: { status: string } = await response.json();
        if (body.status === "pending" || body.status === "crawling" || body.status === "building") {
          setStatus(body.status);
        } else {
          stopped = true;
          router.refresh();
        }
      } catch {
        // A dropped request is retried on the next tick.
      }
    };
    const timer = setInterval(check, 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [brandId, router]);

  return (
    <div className="mt-8 flex items-start gap-4 rounded-md bg-raya p-5" role="status" aria-live="polite">
      <span className="ball ball-bouncing mt-3" aria-hidden />
      <div>
        <p className="display text-2xl">{es.status[status]}</p>
        <p className="mt-1">{es.progress[status]}</p>
        <p className="mt-1 text-sm text-tinta-suave">{es.progress.hint}</p>
      </div>
    </div>
  );
}
