"use client";

import { useState, useTransition } from "react";
import { planWeekAction } from "@/app/brands/[id]/semana/actions";
import { es } from "@/i18n/es";

export function PlanButton({ brandId, label, primary = false }: { brandId: string; label: string; primary?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await planWeekAction(brandId);
            setError(result.ok ? null : es.week.errors[result.error]);
          })
        }
        className={`button ${primary ? "button-primary" : "button-quiet"}`}
      >
        {label}
      </button>
      {error && (
        <p role="alert" className="mt-2 max-w-sm text-sm font-medium text-chapa">
          {error}
        </p>
      )}
    </div>
  );
}
