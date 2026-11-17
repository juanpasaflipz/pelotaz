import { es } from "@/i18n/es";
import type { ModuleStatus } from "./modules";

const STYLE: Record<ModuleStatus, string> = {
  beta: "bg-ok text-raya",
  building: "bg-tinta text-raya",
  soon: "border border-tinta-suave text-tinta-suave",
};

/** One honest label per module: in the beta, being built, or coming. */
export function StatusChip({ status, note }: { status: ModuleStatus; note?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLE[status]}`}>
      {es.marketing.status[status]}
      {note && <span className="font-normal">&nbsp;· {note}</span>}
    </span>
  );
}
