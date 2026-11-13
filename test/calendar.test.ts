import { describe, expect, it } from "vitest";
import { easterSunday, eventsBetween, nthWeekday } from "@/lib/calendar/calendar";

const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("calendar rules", () => {
  it("computes Easter", () => {
    expect(iso(easterSunday(2026))).toBe("2026-04-05");
    expect(iso(easterSunday(2027))).toBe("2027-03-28");
    expect(iso(easterSunday(2028))).toBe("2028-04-16");
  });

  it("finds the nth and last weekday of a month", () => {
    expect(iso(nthWeekday(2026, 2, 1, 1))).toBe("2026-02-02"); // first Monday
    expect(iso(nthWeekday(2026, 3, 1, 3))).toBe("2026-03-16"); // third Monday
    expect(iso(nthWeekday(2026, 11, 1, 3))).toBe("2026-11-16");
    expect(iso(nthWeekday(2026, 6, 0, 3))).toBe("2026-06-21"); // third Sunday
    expect(iso(nthWeekday(2026, 11, 4, 4))).toBe("2026-11-26"); // fourth Thursday
    expect(iso(nthWeekday(2026, 5, 1, -1))).toBe("2026-05-25"); // last Monday
  });
});

describe("events for a week", () => {
  it("lists Mexico's dates for the week of 16 November 2026 and the next", () => {
    const names = eventsBetween("MX", "2026-11-16", "2026-11-29").map((e) => `${e.date} ${e.name}`);
    expect(names).toEqual(["2026-11-13 El Buen Fin", "2026-11-16 Día de la Revolución (puente)"]);
  });

  it("includes paydays on the 15th and the last day of the month", () => {
    const paydays = eventsBetween("MX", "2027-02-01", "2027-02-28").filter((e) => e.kind === "payday");
    expect(paydays.map((e) => e.date)).toEqual(["2027-02-15", "2027-02-28"]);
    expect(eventsBetween("CO", "2027-02-01", "2027-02-28").some((e) => e.kind === "payday")).toBe(false);
  });

  it("uses each country's own dates", () => {
    const mothers = (country: string, year: number) =>
      eventsBetween(country, `${year}-01-01`, `${year}-12-31`).find((e) => e.name.startsWith("Día de la") && e.name.includes("Madre"))?.date;
    expect(mothers("MX", 2027)).toBe("2027-05-10");
    expect(mothers("CO", 2027)).toBe("2027-05-09");
    expect(mothers("AR", 2027)).toBe("2027-10-17");
    expect(mothers("ES", 2027)).toBe("2027-05-02");
  });

  it("spans years and leaves out dated events for years not yet checked", () => {
    const turn = eventsBetween("MX", "2026-12-28", "2027-01-10").map((e) => e.name);
    expect(turn).toEqual(expect.arrayContaining(["Fin de año", "Año Nuevo", "Día de Reyes"]));
    expect(eventsBetween("MX", "2027-11-01", "2027-11-30").some((e) => e.name === "El Buen Fin")).toBe(false);
  });
});
