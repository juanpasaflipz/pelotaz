/**
 * Dates a small business may want to post about, by country. The planner may
 * mention only dates from here, so everything in this file is either a fixed
 * rule (a date, the nth weekday of a month, an offset from Easter) or a dated
 * entry checked against a published source, with that source noted.
 *
 * Coverage is deliberately the main dates, not every regional or religious
 * observance. Sports beyond the Super Bowl are left out until their dates are
 * published and checked each season.
 */

export type EventKind = "holiday" | "commercial" | "cultural" | "sports" | "payday";

export interface CalendarEvent {
  /** First day, YYYY-MM-DD. */
  date: string;
  /** Last day for events that span several, YYYY-MM-DD. */
  endDate?: string;
  name: string;
  kind: EventKind;
  /** What it usually means for a business that sells to the public. For the model. */
  note: string;
}

type Rule =
  | { on: "fixed"; month: number; day: number }
  | { on: "nth"; month: number; weekday: number; n: number } // n = -1 for the last
  | { on: "easter"; offset: number }
  | { on: "dated"; dates: Record<number, [string, string?]> }; // year → [start, end]

interface Entry {
  rule: Rule;
  name: string;
  kind: EventKind;
  note: string;
  /** Days, for fixed-rule events that span several. */
  days?: number;
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));

/** Western Easter Sunday (anonymous Gregorian algorithm). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** The nth (1-based) given weekday (0 = Sunday) of a month, or the last when n = -1. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  if (n === -1) {
    const last = utc(year, month + 1, 0);
    last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
    return last;
  }
  const first = utc(year, month, 1);
  first.setUTCDate(1 + ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
  return first;
}

function resolve(entry: Entry, year: number): CalendarEvent | null {
  const { rule } = entry;
  let start: Date;
  let end: Date | undefined;
  switch (rule.on) {
    case "fixed":
      start = utc(year, rule.month, rule.day);
      break;
    case "nth":
      start = nthWeekday(year, rule.month, rule.weekday, rule.n);
      break;
    case "easter":
      start = easterSunday(year);
      start.setUTCDate(start.getUTCDate() + rule.offset);
      break;
    case "dated": {
      const dates = rule.dates[year];
      if (!dates) return null;
      return { date: dates[0], endDate: dates[1], name: entry.name, kind: entry.kind, note: entry.note };
    }
  }
  if (entry.days && entry.days > 1) {
    end = new Date(start);
    end.setUTCDate(end.getUTCDate() + entry.days - 1);
  }
  return { date: iso(start), endDate: end && iso(end), name: entry.name, kind: entry.kind, note: entry.note };
}

const SUN = 0;
const MON = 1;

// Shared across the Spanish-speaking markets.
const COMMON: Entry[] = [
  { rule: { on: "fixed", month: 1, day: 1 }, name: "Año Nuevo", kind: "holiday", note: "Día feriado; mucha gente descansa en casa." },
  { rule: { on: "fixed", month: 2, day: 14 }, name: "Día del Amor y la Amistad (San Valentín)", kind: "commercial", note: "Parejas y amigos salen o piden algo especial." },
  { rule: { on: "easter", offset: -3 }, name: "Jueves Santo", kind: "holiday", note: "Semana Santa: vacaciones, ciudades más vacías, en algunos lugares se evita la carne." },
  { rule: { on: "easter", offset: -2 }, name: "Viernes Santo", kind: "holiday", note: "Semana Santa: muchas personas evitan la carne roja este día." },
  { rule: { on: "fixed", month: 10, day: 31 }, name: "Halloween", kind: "cultural", note: "Disfraces y fiestas, sobre todo entre jóvenes y familias." },
  { rule: { on: "fixed", month: 12, day: 24 }, name: "Nochebuena", kind: "holiday", note: "Cena familiar en casa; muchos negocios cierran temprano." },
  { rule: { on: "fixed", month: 12, day: 25 }, name: "Navidad", kind: "holiday", note: "Día feriado familiar." },
  { rule: { on: "fixed", month: 12, day: 31 }, name: "Fin de año", kind: "holiday", note: "Cena y fiestas; muchos negocios cierran temprano." },
];

const SUPER_BOWL: Entry = {
  // Super Bowl LXI, SoFi Stadium (NFL, announced). Super Bowl LX was 8 Feb 2026.
  rule: { on: "dated", dates: { 2026: ["2026-02-08"], 2027: ["2027-02-14"] } },
  name: "Super Bowl",
  kind: "sports",
  note: "Reuniones para ver el partido; día fuerte de pedidos a domicilio para compartir.",
};

const MARKETS: Record<string, Entry[]> = {
  MX: [
    ...COMMON,
    { rule: { on: "fixed", month: 1, day: 6 }, name: "Día de Reyes", kind: "cultural", note: "Rosca de Reyes; regalos para niños." },
    { rule: { on: "nth", month: 2, weekday: MON, n: 1 }, name: "Día de la Constitución (puente)", kind: "holiday", note: "Lunes feriado; fin de semana largo." },
    { rule: { on: "fixed", month: 2, day: 2 }, name: "Día de la Candelaria", kind: "cultural", note: "Quien sacó el niño en la rosca invita los tamales." },
    { rule: { on: "nth", month: 3, weekday: MON, n: 3 }, name: "Natalicio de Benito Juárez (puente)", kind: "holiday", note: "Lunes feriado; fin de semana largo." },
    { rule: { on: "fixed", month: 3, day: 31 }, name: "Día del Taco", kind: "commercial", note: "Fecha comercial; taquerías y negocios de comida la aprovechan." },
    { rule: { on: "fixed", month: 4, day: 30 }, name: "Día del Niño", kind: "cultural", note: "Planes y regalos para niños." },
    { rule: { on: "fixed", month: 5, day: 1 }, name: "Día del Trabajo", kind: "holiday", note: "Día feriado." },
    { rule: { on: "fixed", month: 5, day: 10 }, name: "Día de las Madres", kind: "commercial", note: "De los días más fuertes del año para restaurantes; reservaciones y comida familiar." },
    { rule: { on: "fixed", month: 5, day: 15 }, name: "Día del Maestro", kind: "cultural", note: "Festejos en escuelas." },
    { rule: { on: "nth", month: 6, weekday: SUN, n: 3 }, name: "Día del Padre", kind: "commercial", note: "Comida familiar; carnes y antojos para papá." },
    { rule: { on: "fixed", month: 9, day: 15 }, name: "Noche Mexicana (Grito de Independencia)", kind: "holiday", note: "Fiestas patrias: pozole, antojitos, reuniones." },
    { rule: { on: "fixed", month: 9, day: 16 }, name: "Día de la Independencia", kind: "holiday", note: "Día feriado; desfile." },
    { rule: { on: "fixed", month: 11, day: 1 }, name: "Día de Muertos", kind: "cultural", note: "Ofrendas y pan de muerto, 1 y 2 de noviembre.", days: 2 },
    {
      // Buen Fin 2026: 13 to 17 November (Expansión, 7 Oct 2026).
      rule: { on: "dated", dates: { 2026: ["2026-11-13", "2026-11-17"] } },
      name: "El Buen Fin",
      kind: "commercial",
      note: "Fin de semana de ofertas nacional. Solo aplica si el negocio tiene una promoción real en su perfil.",
    },
    { rule: { on: "nth", month: 11, weekday: MON, n: 3 }, name: "Día de la Revolución (puente)", kind: "holiday", note: "Lunes feriado; fin de semana largo." },
    { rule: { on: "fixed", month: 12, day: 12 }, name: "Día de la Virgen de Guadalupe", kind: "cultural", note: "Peregrinaciones; en CDMX hay cierres cerca de la Basílica." },
    { rule: { on: "fixed", month: 12, day: 16 }, name: "Posadas", kind: "cultural", note: "Del 16 al 24 de diciembre: reuniones y fiestas de fin de año.", days: 9 },
    SUPER_BOWL,
  ],
  CO: [
    ...COMMON,
    { rule: { on: "nth", month: 5, weekday: SUN, n: 2 }, name: "Día de la Madre", kind: "commercial", note: "De los días más fuertes del año para restaurantes." },
    { rule: { on: "nth", month: 6, weekday: SUN, n: 3 }, name: "Día del Padre", kind: "commercial", note: "Comida familiar." },
    { rule: { on: "fixed", month: 7, day: 20 }, name: "Día de la Independencia", kind: "holiday", note: "Día feriado." },
    { rule: { on: "fixed", month: 12, day: 7 }, name: "Noche de las Velitas", kind: "cultural", note: "Reuniones familiares con velas y faroles." },
  ],
  AR: [
    ...COMMON,
    { rule: { on: "fixed", month: 5, day: 25 }, name: "Revolución de Mayo", kind: "holiday", note: "Feriado; locro y empanadas." },
    { rule: { on: "nth", month: 6, weekday: SUN, n: 3 }, name: "Día del Padre", kind: "commercial", note: "Asado y comida familiar." },
    { rule: { on: "fixed", month: 7, day: 9 }, name: "Día de la Independencia", kind: "holiday", note: "Feriado; locro." },
    { rule: { on: "fixed", month: 7, day: 20 }, name: "Día del Amigo", kind: "cultural", note: "Juntadas con amigos; restaurantes llenos." },
    { rule: { on: "nth", month: 10, weekday: SUN, n: 3 }, name: "Día de la Madre", kind: "commercial", note: "De los días más fuertes del año para restaurantes." },
  ],
  CL: [
    ...COMMON,
    { rule: { on: "nth", month: 5, weekday: SUN, n: 2 }, name: "Día de la Madre", kind: "commercial", note: "De los días más fuertes del año para restaurantes." },
    { rule: { on: "nth", month: 6, weekday: SUN, n: 3 }, name: "Día del Padre", kind: "commercial", note: "Comida familiar." },
    { rule: { on: "fixed", month: 9, day: 18 }, name: "Fiestas Patrias", kind: "holiday", note: "18 y 19 de septiembre: fondas, asados y empanadas.", days: 2 },
  ],
  PE: [
    ...COMMON,
    { rule: { on: "nth", month: 5, weekday: SUN, n: 2 }, name: "Día de la Madre", kind: "commercial", note: "De los días más fuertes del año para restaurantes." },
    { rule: { on: "nth", month: 6, weekday: SUN, n: 3 }, name: "Día del Padre", kind: "commercial", note: "Comida familiar." },
    { rule: { on: "fixed", month: 7, day: 28 }, name: "Fiestas Patrias", kind: "holiday", note: "28 y 29 de julio: feriado largo.", days: 2 },
  ],
  ES: [
    ...COMMON,
    { rule: { on: "fixed", month: 1, day: 6 }, name: "Día de Reyes", kind: "cultural", note: "Roscón de Reyes y regalos." },
    { rule: { on: "fixed", month: 3, day: 19 }, name: "Día del Padre", kind: "commercial", note: "Comida familiar." },
    { rule: { on: "nth", month: 5, weekday: SUN, n: 1 }, name: "Día de la Madre", kind: "commercial", note: "De los días más fuertes del año para restaurantes." },
    { rule: { on: "fixed", month: 10, day: 12 }, name: "Fiesta Nacional", kind: "holiday", note: "Día festivo nacional." },
  ],
  US: [
    ...COMMON,
    { rule: { on: "fixed", month: 5, day: 5 }, name: "Cinco de Mayo", kind: "cultural", note: "Muy celebrado en EE. UU.; comida y bebida mexicana." },
    { rule: { on: "nth", month: 5, weekday: SUN, n: 2 }, name: "Mother's Day / Día de las Madres (EE. UU.)", kind: "commercial", note: "De los días más fuertes del año para restaurantes. Muchas familias mexicanas también celebran el 10 de mayo." },
    { rule: { on: "nth", month: 6, weekday: SUN, n: 3 }, name: "Father's Day / Día del Padre", kind: "commercial", note: "Comida familiar." },
    { rule: { on: "fixed", month: 7, day: 4 }, name: "Independence Day", kind: "holiday", note: "Feriado; parrilladas." },
    { rule: { on: "nth", month: 11, weekday: 4, n: 4 }, name: "Thanksgiving", kind: "holiday", note: "Cena familiar en casa." },
    SUPER_BOWL,
  ],
};

// Mexico pays most salaries on the 15th and the last day of the month.
function quincenas(country: string, year: number): CalendarEvent[] {
  if (country !== "MX") return [];
  const events: CalendarEvent[] = [];
  for (let month = 1; month <= 12; month += 1) {
    for (const day of [15, new Date(Date.UTC(year, month, 0)).getUTCDate()]) {
      events.push({
        date: iso(utc(year, month, day)),
        name: "Quincena",
        kind: "payday",
        note: "Día de pago para muchos asalariados; el gasto en antojos y comida sube ese día y el fin de semana siguiente.",
      });
    }
  }
  return events;
}

/** Events that overlap [start, end] (inclusive, YYYY-MM-DD), in date order. */
export function eventsBetween(country: string, start: string, end: string): CalendarEvent[] {
  const entries = MARKETS[country.toUpperCase()] ?? COMMON;
  const firstYear = Number(start.slice(0, 4));
  const lastYear = Number(end.slice(0, 4));
  const events: CalendarEvent[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (const entry of entries) {
      const event = resolve(entry, year);
      if (event) events.push(event);
    }
    events.push(...quincenas(country.toUpperCase(), year));
  }
  return events
    .filter((event) => (event.endDate ?? event.date) >= start && event.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
