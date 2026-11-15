import { describe, expect, it } from "vitest";
import { checkFormat, checkPlan, findRepeatedLines, flagToProblem, STORY_MAX_CHARS } from "@/lib/content/build";
import type { PlannedPost, WeekPlan } from "@/lib/content/schema";
import { runLoop, type LoopFailure } from "@/lib/graph/loop";
import { FAITHFUL_DRAFT } from "./helpers/llm";
import type { BrandDnaProfile } from "@/lib/brand-dna/schema";

const profile = {
  ...FAITHFUL_DRAFT,
  country: "MX",
  locale: "es-MX",
  goal: "sales",
} as unknown as BrandDnaProfile;

const post = (overrides: Partial<PlannedPost> = {}): PlannedPost => ({
  day: "tue",
  channel: "instagram",
  format: "post",
  pillar: "offer",
  topic: "Taco al pastor",
  angle: "",
  offerName: null,
  callToAction: "Pide hoy",
  imageNumber: null,
  occasion: null,
  ...overrides,
});

describe("runLoop", () => {
  it("stops at the first green attempt", async () => {
    let calls = 0;
    const result = await runLoop({
      maxAttempts: 3,
      produce: async () => ++calls,
      checks: [{ name: "any", run: () => [] }],
    });
    expect(result).toEqual({ output: 1, failures: [], attempts: 1, green: true });
  });

  it("passes the failed checks to the next attempt", async () => {
    const seen: LoopFailure[][] = [];
    const result = await runLoop({
      maxAttempts: 3,
      produce: async (feedback) => {
        seen.push(feedback);
        return feedback.length === 0 ? "precio $15" : "sin precio";
      },
      checks: [{ name: "price", run: (text: string) => (text.includes("$15") ? ["Remove $15"] : []) }],
    });
    expect(result.output).toBe("sin precio");
    expect(result.attempts).toBe(2);
    expect(seen).toEqual([[], [{ check: "price", problem: "Remove $15" }]]);
  });

  it("gives back what is still wrong when attempts run out", async () => {
    const result = await runLoop({
      maxAttempts: 2,
      produce: async () => "igual",
      checks: [{ name: "never", run: () => ["still wrong"] }],
    });
    expect(result.green).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.failures).toEqual([{ check: "never", problem: "still wrong" }]);
  });
});

describe("plan gate", () => {
  const plan = (posts: PlannedPost[]): WeekPlan => ({ rationale: "", posts });

  it("passes a mixed week", () => {
    expect(
      checkPlan(
        plan([post(), post({ day: "thu", pillar: "promotion" }), post({ day: "sat", pillar: "community" })]),
        profile,
      ),
    ).toEqual([]);
  });

  it("fails a week that only sells and repeats a pillar", () => {
    const problems = checkPlan(
      plan([post(), post({ day: "wed" }), post({ day: "fri" }), post({ day: "sat", pillar: "promotion" })]),
      profile,
    );
    expect(problems.join("\n")).toMatch(/"offer" is used 3 times/);
    expect(problems.join("\n")).toMatch(/Every post sells/);
  });

  it("fails promotions the profile does not have, and topics the owner rejected", () => {
    const problems = checkPlan(
      plan([post({ pillar: "promotion" }), post({ day: "thu", pillar: "tip", topic: "Cómo   recalentar tacos" }), post({ day: "sat", pillar: "community" })]),
      { ...profile, promotions: [] },
      [{ date: "2026-11-10", pillar: "tip", topic: "Como recalentar tacos", offerName: null, reason: "No" }],
    );
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toMatch(/no promotions/);
    expect(problems.join("\n")).toMatch(/rejected the topic "Como recalentar tacos"/);
  });

  it("fails a plan with too few posts", () => {
    expect(checkPlan(plan([post()]), profile)[0]).toMatch(/at least 3/);
  });
});

describe("week gate", () => {
  it("lets the first post keep a line and flags the later ones", () => {
    const problems = findRepeatedLines([
      { id: "a", copy: "Martes de 2x1 🌮\nTacos al carbón, como en casa.\n\n#tacos" },
      { id: "b", copy: "MARTES de 2x1!\nOtra cosa distinta.\n\n#tacos" },
      { id: "c", copy: "Nuevo jueves\nTacos al carbón, ¡como en casa!" },
      { id: "d", copy: "Pide hoy.\nNada repetido aquí, todo nuevo." },
    ]);
    expect([...problems.keys()]).toEqual(["b", "c"]);
    expect(problems.get("b")![0]).toMatch(/MARTES de 2x1!/);
    expect(problems.get("c")![0]).toMatch(/como en casa/);
  });

  it("ignores hashtags and short lines after the hook", () => {
    expect(findRepeatedLines([
      { id: "a", copy: "Primera\nPide hoy.\n#tacos #gdl" },
      { id: "b", copy: "Segunda\nPide hoy.\n#tacos #gdl" },
    ]).size).toBe(0);
  });
});

describe("draft checks as problems", () => {
  it("fails a story that is too long", () => {
    const flags = checkFormat("a".repeat(STORY_MAX_CHARS + 1), "story");
    expect(flags).toHaveLength(1);
    expect(flagToProblem(flags[0])).toMatch(/under 140/);
    expect(checkFormat("a".repeat(STORY_MAX_CHARS + 1), "post")).toEqual([]);
  });

  it("turns every fixable flag into an instruction, and the system flag into none", () => {
    expect(flagToProblem({ field: "copy", claim: "$15", reason: "price_not_found_in_pages", source: "price_check" })).toMatch(/\$15/);
    expect(flagToProblem({ field: "copy", claim: "barato", reason: "banned_word", source: "banned_words" })).toMatch(/barato/);
    expect(flagToProblem({ field: "copy", claim: "Envío gratis", reason: "No está en el perfil", source: "critic" })).toMatch(/Envío gratis/);
    expect(flagToProblem({ field: "", claim: "", reason: "review_unavailable", source: "system" })).toBeNull();
  });
});
