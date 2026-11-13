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

export function timeZoneOf(country: string): string {
  return MARKETS.find((m) => m.country === country)?.timeZone ?? "America/Mexico_City";
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant a wall-clock date and time (YYYY-MM-DD, HH:MM) happen in a country. */
export function localToUtc(date: string, time: string, country: string): Date {
  const timeZone = timeZoneOf(country);
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset across a daylight-saving change.
  let guess = wall - offsetAt(new Date(wall), timeZone);
  guess = wall - offsetAt(new Date(guess), timeZone);
  return new Date(guess);
}

/** Wall-clock HH:MM of an instant in a country. */
export function utcToLocalTime(instant: Date, country: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZoneOf(country),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}
