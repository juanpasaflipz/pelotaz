"use client";

import { useState, useTransition } from "react";
import { restartOnboarding } from "@/app/actions";
import { es } from "@/i18n/es";

export function RestartButton({
  brandId,
  recrawl,
  label,
  primary = false,
}: {
  brandId: string;
  recrawl: boolean;
  label: string;
  primary?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await restartOnboarding(brandId, recrawl);
            setError(result.ok ? null : es.limits[result.error]);
          })
        }
        className={`button ${primary ? "button-primary" : "button-quiet"}`}
      >
        {label}
      </button>
      {error && (
        <p role="alert" className="mt-2 max-w-xs text-sm font-medium text-chapa">
          {error}
        </p>
      )}
    </div>
  );
}
