/**
 * Markets a brand can be set up for. Mexico is first and the default. Adding a
 * country here is the first step of a locale pack; regional voice defaults,
 * the holiday calendar and payment methods hang off `country` in later phases.
 */
export const MARKETS = [
  { country: "MX", timeZone: "America/Mexico_City", locale: "es-MX", name: "México" },
  { country: "CO", timeZone: "America/Bogota", locale: "es-CO", name: "Colombia" },
  { country: "AR", timeZone: "America/Argentina/Buenos_Aires", locale: "es-AR", name: "Argentina" },
  { country: "CL", timeZone: "America/Santiago", locale: "es-CL", name: "Chile" },
  { country: "PE", timeZone: "America/Lima", locale: "es-PE", name: "Perú" },
  { country: "ES", timeZone: "Europe/Madrid", locale: "es-ES", name: "España" },
  { country: "US", timeZone: "America/Chicago", locale: "es-US", name: "Estados Unidos" },
] as const;

export type Market = (typeof MARKETS)[number];

/** Today's calendar date where the brand is, as YYYY-MM-DD. */
export function localDate(country: string, now: Date = new Date()): string {
  const timeZone = MARKETS.find((m) => m.country === country)?.timeZone ?? "America/Mexico_City";
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
