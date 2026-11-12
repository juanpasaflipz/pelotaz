"use client";

import { useTransition } from "react";
import { restartOnboarding } from "@/app/actions";

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
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => restartOnboarding(brandId, recrawl))}
      className={`button ${primary ? "button-primary" : "button-quiet"}`}
    >
      {label}
    </button>
  );
}
