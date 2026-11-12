import { es } from "@/i18n/es";

type Status = keyof typeof es.status;

/** Status as words first; the mark beside it repeats the meaning, it does not carry it. */
export function StatusLabel({ status }: { status: Status }) {
  const working = status === "pending" || status === "crawling" || status === "building";
  return (
    <span className="inline-flex items-center gap-2 text-sm font-semibold">
      {working && <span className="ball" aria-hidden />}
      {status === "failed" && <span className="h-1 w-4 bg-chapa" aria-hidden />}
      {status === "ready" && <span className="h-1 w-4 bg-cancha" aria-hidden />}
      <span className={status === "failed" ? "text-chapa" : undefined}>{es.status[status]}</span>
    </span>
  );
}
