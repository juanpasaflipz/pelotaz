import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brandDna, brands, suggestions } from "@/db/schema";
import { withTenant, type Db } from "@/db/tenant";
import { latestBrandDna, onboardBrand, saveProfileEdit } from "@/lib/brand-dna/service";
import type { BrandDnaProfile } from "@/lib/brand-dna/schema";
import { latestWeek, requestPlan, runPlan, saveItem, type ContentLimits } from "@/lib/content/service";
import { applyChange, applyChanges, type ProfileChange } from "@/lib/learning/changes";
import { decideProposal, hasNewEdits, pendingProposal, proposeFromEdits } from "@/lib/learning/service";
import { createFixtureFetcher, ORIGIN } from "./fixtures/site";
import { createTenant, createTestDb } from "./helpers/db";
import { createFakeLlm, faithfulLlm, FAITHFUL_DRAFT } from "./helpers/llm";

let db: Db;
let close: () => Promise<void>;
let tenantId: string;
let otherTenantId: string;

const LIMITS: ContentLimits = { plansPerDay: 50, rewritesPerDay: 50, learnPerDay: 50 };

const change = (overrides: Partial<ProfileChange>): ProfileChange => ({
  target: "audience.buyingTriggers",
  op: "add",
  offerName: null,
  oldValue: null,
  newValue: "4.8★ en Google con 190 reseñas",
  reason: "Lo corregiste en dos publicaciones.",
  evidence: "4.9★ → 4.8★ con 190 reseñas",
  ...overrides,
});

const PROFILE = {
  ...FAITHFUL_DRAFT,
  visual: { palette: [], fonts: [], logoUrl: null, imageStyle: "", referenceImages: [] },
  goal: "sales",
  country: "MX",
  locale: "es-MX",
} as BrandDnaProfile;

const PLAN = {
  rationale: "Semana de prueba.",
  posts: [
    { day: "tue", channel: "instagram", format: "post", pillar: "promotion", topic: "Martes de 2x1", angle: "x", offerName: "Taco al pastor", callToAction: "Pide", imageNumber: null },
    { day: "thu", channel: "instagram", format: "post", pillar: "offer", topic: "Arrachera", angle: "x", offerName: "Taco de arrachera", callToAction: "Pide", imageNumber: null },
  ],
};

async function brandWithEdits(owner = tenantId) {
  const brandId = await withTenant(db, owner, async (tx) => {
    const [row] = await tx.insert(brands).values({ tenantId: owner, name: "labrasa", sourceUrl: ORIGIN }).returning();
    return row.id;
  });
  await onboardBrand({ db, fetcher: createFixtureFetcher(), llm: faithfulLlm() }, owner, brandId);
  const request = await requestPlan(db, owner, brandId, LIMITS);
  if (request.state !== "started") throw new Error(request.state);
  const writer = createFakeLlm({
    "content.plan": () => PLAN,
    "content.draft": (r) => ({
      caption: r.prompt.includes("Arrachera") ? "Arrachera al carbón, $38. Calificación 4.9★." : "Martes de 2x1 al pastor 🌮",
      hashtags: [],
    }),
    "content.critique": () => ({ flags: [] }),
  });
  await runPlan({ db, llm: writer }, owner, request.planId);
  const week = (await latestWeek(db, owner, brandId))!;
  return { brandId, week };
}

async function editAll(brandId: string, owner = tenantId) {
  const week = (await latestWeek(db, owner, brandId))!;
  for (const { item, draft } of week.items) {
    await saveItem(db, owner, item.id, {
      copy: draft!.copy.replace("4.9★", "4.8★ con 190 reseñas").replace(" 🌮", "") + "\nPide hoy.",
      assetId: null,
      decision: "approve",
    });
  }
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  tenantId = await createTenant(db, "La Brasa");
  otherTenantId = await createTenant(db, "Otra");
});

afterAll(async () => {
  await close();
});

describe("profile changes", () => {
  it("adds, replaces and removes list items, and refuses ones that no longer fit", () => {
    const added = applyChange(PROFILE, change({}))!;
    expect(added.audience.buyingTriggers).toContain("4.8★ en Google con 190 reseñas");
    expect(applyChange(added, change({}))).toBeNull(); // already there

    const replaced = applyChange(
      PROFILE,
      change({ op: "replace", oldValue: "promociones entre semana ", newValue: "Martes de 2x1" }),
    )!;
    expect(replaced.audience.buyingTriggers).toEqual(["Martes de 2x1"]);
    expect(applyChange(PROFILE, change({ op: "remove", oldValue: "No existe" }))).toBeNull();

    // The input is never changed in place.
    expect(PROFILE.audience.buyingTriggers).toEqual(["Promociones entre semana"]);
  });

  it("changes an offer only by its exact name, and choices only to allowed values", () => {
    const priced = applyChange(
      PROFILE,
      change({ target: "offer.price", op: "replace", offerName: "Taco de arrachera", newValue: "$42" }),
    )!;
    expect(priced.offers.find((o) => o.name === "Taco de arrachera")?.price).toBe("$42");
    expect(
      applyChange(PROFILE, change({ target: "offer.price", op: "replace", offerName: "Taco de suadero", newValue: "$1" })),
    ).toBeNull();
    expect(applyChange(PROFILE, change({ target: "voice.emojiUse", op: "replace", newValue: "light" }))?.voice.emojiUse).toBe(
      "light",
    );
    expect(applyChange(PROFILE, change({ target: "voice.emojiUse", op: "replace", newValue: "muchos" }))).toBeNull();
    expect(applyChange(PROFILE, change({ target: "offer.price", op: "add", offerName: "Taco de arrachera" }))).toBeNull();
  });

  it("applies a list of changes in order and reports which fit", () => {
    const { profile, applied } = applyChanges(PROFILE, [
      change({}),
      change({ op: "remove", oldValue: "No existe" }),
      change({ target: "voice.bannedWords", newValue: "barato" }),
    ]);
    expect(applied).toEqual([0, 2]);
    expect(profile.voice.bannedWords).toEqual(["barato"]);
  });
});

describe("learning from edits", () => {
  it("proposes changes from the owner's edits, keeping only ones that fit", async () => {
    const { brandId } = await brandWithEdits();
    await editAll(brandId);
    expect(await hasNewEdits(db, tenantId, brandId)).toBe(2);

    const llm = createFakeLlm({
      "learning.propose": () => ({
        summary: "Actualizaste la calificación y quitaste emojis.",
        changes: [
          change({}),
          change({ target: "voice.tone", op: "remove", oldValue: "no es un tono del perfil" }),
          change({ target: "offer.proofPoints", offerName: "Taco de arrachera", newValue: "4.8★ en Google" }),
        ],
      }),
    });
    const outcome = await proposeFromEdits(db, llm, tenantId, brandId, LIMITS);
    expect(outcome).toMatchObject({ state: "proposed", changes: 2 });

    const prompt = llm.calls[0].prompt;
    expect(prompt).toContain("Calificación 4.9★");
    expect(prompt).toContain("4.8★ con 190 reseñas");
    expect(llm.calls[0].instructions).toContain("A single stylistic tweak is not a pattern");

    const pending = await pendingProposal(db, tenantId, brandId);
    expect(pending?.changes.map((c) => c.target)).toEqual(["audience.buyingTriggers", "offer.proofPoints"]);
    // Those edits are now accounted for.
    expect(await hasNewEdits(db, tenantId, brandId)).toBe(0);
  });

  it("calls no model when there is nothing new to learn from", async () => {
    const { brandId } = await brandWithEdits();
    const llm = createFakeLlm({});
    expect(await proposeFromEdits(db, llm, tenantId, brandId, LIMITS)).toEqual({ state: "nothing_to_learn", edits: 0 });
    expect(llm.calls).toHaveLength(0);
  });

  it("applies the kept changes as a new profile version from feedback", async () => {
    const { brandId } = await brandWithEdits();
    await editAll(brandId);
    const llm = createFakeLlm({
      "learning.propose": () => ({
        summary: "ok",
        changes: [change({}), change({ target: "voice.bannedWords", newValue: "barato" })],
      }),
    });
    await proposeFromEdits(db, llm, tenantId, brandId, LIMITS);
    const pending = (await pendingProposal(db, tenantId, brandId))!;
    const before = (await latestBrandDna(db, tenantId, brandId))!;

    const outcome = await decideProposal(db, tenantId, brandId, pending.id, { apply: [0, 7] });
    expect(outcome).toEqual({ state: "applied", version: before.version + 1, applied: 1, skipped: 0 });

    const after = (await latestBrandDna(db, tenantId, brandId))!;
    expect(after.source).toBe("feedback");
    expect(after.profile.audience.buyingTriggers).toContain("4.8★ en Google con 190 reseñas");
    expect(after.profile.voice.bannedWords).toEqual([]);
    expect(await pendingProposal(db, tenantId, brandId)).toBeNull();
    const [row] = await db.select().from(suggestions).where(eq(suggestions.id, pending.id));
    expect(row.status).toBe("applied");
  });

  it("skips changes the owner already made by hand, and can be dismissed", async () => {
    const { brandId } = await brandWithEdits();
    await editAll(brandId);
    const llm = createFakeLlm({ "learning.propose": () => ({ summary: "ok", changes: [change({})] }) });
    await proposeFromEdits(db, llm, tenantId, brandId, LIMITS);
    const pending = (await pendingProposal(db, tenantId, brandId))!;

    // The owner adds the same trigger in the profile editor first.
    const current = (await latestBrandDna(db, tenantId, brandId))!.profile;
    await saveProfileEdit(db, tenantId, brandId, {
      ...current,
      audience: { ...current.audience, buyingTriggers: [...current.audience.buyingTriggers, "4.8★ en Google con 190 reseñas"] },
    });
    expect(await decideProposal(db, tenantId, brandId, pending.id, { apply: [0] })).toEqual({ state: "dismissed" });

    await editAll(brandId);
    await proposeFromEdits(db, createFakeLlm({ "learning.propose": () => ({ summary: "", changes: [change({ newValue: "Otra" })] }) }), tenantId, brandId, LIMITS);
    const next = (await pendingProposal(db, tenantId, brandId))!;
    expect(await decideProposal(db, tenantId, brandId, next.id, "dismiss")).toEqual({ state: "dismissed" });
    const versions = await db.select().from(brandDna).where(eq(brandDna.brandId, brandId)).orderBy(desc(brandDna.version));
    expect(versions[0].source).toBe("user_edit");
  });

  it("keeps proposals inside their tenant", async () => {
    const { brandId } = await brandWithEdits();
    await editAll(brandId);
    await proposeFromEdits(db, createFakeLlm({ "learning.propose": () => ({ summary: "", changes: [change({})] }) }), tenantId, brandId, LIMITS);
    const pending = (await pendingProposal(db, tenantId, brandId))!;
    expect(await pendingProposal(db, otherTenantId, brandId)).toBeNull();
    expect(await decideProposal(db, otherTenantId, brandId, pending.id, { apply: [0] })).toEqual({ state: "not_found" });
    const [row] = await db
      .select()
      .from(suggestions)
      .where(and(eq(suggestions.id, pending.id), eq(suggestions.status, "pending")));
    expect(row).toBeDefined();
  });
});
