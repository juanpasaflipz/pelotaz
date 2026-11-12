"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { es } from "@/i18n/es";

interface Progress {
  status: string;
  total: number;
  drafting: number;
}

/**
 * Shown while a plan or a rewrite is running. Polls, and reloads the page's
 * server data each time a post finishes so drafts appear as they are written.
 */
export function PlanProgress({ brandId, initial }: { brandId: string; initial: Progress }) {
  const router = useRouter();
  const [progress, setProgress] = useState(initial);

  useEffect(() => {
    let stopped = false;
    let last = initial;
    const check = async () => {
      try {
        const response = await fetch(`/api/brands/${brandId}/plan`, { cache: "no-store" });
        if (!response.ok || stopped) return;
        const next: Progress = await response.json();
        const changed = next.status !== last.status || next.drafting !== last.drafting || next.total !== last.total;
        last = next;
        setProgress(next);
        if (changed) router.refresh();
        if (!["queued", "planning", "drafting"].includes(next.status) && next.drafting === 0) stopped = true;
      } catch {
        // A dropped request is retried on the next tick.
      }
    };
    const timer = setInterval(() => {
      if (stopped) clearInterval(timer);
      else void check();
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [brandId, initial, router]);

  const planning = progress.status === "queued" || progress.status === "planning";
  const title = planning
    ? es.week.planning
    : es.week.drafting(progress.total - progress.drafting, progress.total);
  return (
    <div className="mt-8 flex items-start gap-4 rounded-md bg-raya p-5" role="status" aria-live="polite">
      <span className="ball ball-bouncing mt-3" aria-hidden />
      <div>
        <p className="display text-2xl">{title}</p>
        <p className="mt-1 text-sm text-tinta-suave">
          {progress.status === "queued" ? es.week.queued : es.week.hint}
        </p>
      </div>
    </div>
  );
}
