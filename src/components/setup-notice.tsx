import { es } from "@/i18n/es";

/** Shown instead of data when no auth provider is configured. */
export function SetupNotice() {
  return (
    <div className="mt-6 max-w-prose border-l-4 border-chapa bg-chapa-fondo px-4 py-3">
      <p className="font-semibold">{es.setup.title}</p>
      <p className="mt-1 text-sm">{es.setup.body}</p>
    </div>
  );
}
