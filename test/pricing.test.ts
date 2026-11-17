import { describe, expect, it } from "vitest";
import { formatPesos, priceView } from "@/lib/pricing";

// The reference table in claude/landing-page-plan.md ("Precios").
describe("public prices", () => {
  it("matches the reference table for Starter", () => {
    expect(priceView("starter", "anual")).toEqual({
      monthly: 299,
      monthlyWithIva: 346.84,
      yearlyCharge: 3588,
      yearlyChargeWithIva: 4162.08,
      annualSaving: 360,
    });
    expect(priceView("starter", "mensual")).toMatchObject({ monthly: 329, monthlyWithIva: 381.64, yearlyCharge: null });
  });

  it("matches the reference table for Pro", () => {
    expect(priceView("pro", "anual")).toEqual({
      monthly: 699,
      monthlyWithIva: 810.84,
      yearlyCharge: 8388,
      yearlyChargeWithIva: 9730.08,
      annualSaving: 960,
    });
    expect(priceView("pro", "mensual")).toMatchObject({ monthly: 779, monthlyWithIva: 903.64, yearlyCharge: null });
  });

  it("writes pesos the Mexican way", () => {
    expect(formatPesos(3588)).toBe("$3,588");
    expect(formatPesos(4162.08)).toBe("$4,162.08");
    expect(formatPesos(299)).toBe("$299");
  });
});
