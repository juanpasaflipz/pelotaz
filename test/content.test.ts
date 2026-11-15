import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assets, brands, contentItems, drafts, jobs, plans } from "@/db/schema";
import { withTenant, type Db } from "@/db/tenant";
import { latestBrandDna, onboardBrand } from "@/lib/brand-dna/service";
import type { BrandDnaProfile } from "@/lib/brand-dna/schema";
import { checkBannedWords, checkDraftPrices } from "@/lib/content/build";
import {
  composeCopy,
  nextWeekStart,
  normalizePlan,
  type PlannedPost,
  type WeekPlan,
} from "@/lib/content/schema";
import {
  latestWeek,
  requestPlan,
  requestRewrite,
  runPlan,
  runRewrite,
  saveItem,
  type ContentLimits,
} from "@/lib/content/service";
import { localDate } from "@/lib/markets";
import { createFixtureFetcher, ORIGIN } from "./fixtures/site";
import { createTenant, createTestDb } from "./helpers/db";
import { createFakeLlm, faithfulLlm } from "./helpers/llm";

let db: Db;
let close: () => Promise<void>;
let tenantId: string;
let otherTenantId: string;
let profile: BrandDnaProfile;

const LIMITS: ContentLimits = { plansPerDay: 50, rewritesPerDay: 50, learnPerDay: 50 };

const post = (overrides: Partial<PlannedPost> = {}): PlannedPost => ({
  day: "tue",
  channel: "instagram",
  format: "post",
  pillar: "promotion",
  topic: "Martes de 2x1",
  angle: "El martes rinde el doble.",
  offerName: "Taco al pastor",
  callToAction: "Pide hoy",
  imageNumber: null,
  occasion: null,
  ...overrides,
});

const PLAN: WeekPlan = {
  rationale: "Mezcla de promoción, producto y comunidad para vender más entre semana.",
  posts: [
    post({ imageNumber: 1 }),
    post({ day: "thu", format: "story", pillar: "product", topic: "Arrachera al mezquite", offerName: "Taco de arrachera", imageNumber: 1 }),
    post({ day: "sat", channel: "facebook", pillar: "community", topic: "Chapultepec", offerName: null }),
  ],
};

const DRAFT = {
  caption: "Martes de 2x1 en tacos al pastor 🌮\nDe 6 a 10 pm. Taco al pastor a $24.\nPide hoy.",
  hashtags: ["tacos", "#Guadalajara", "comida mexicana", "x", "tacos"],
};

/** The first post gets DRAFT; the others a caption of their own, as a real week would. */
function draftFor(prompt: string) {
  const topic = /Topic: (.+?)\.\n/.exec(prompt)?.[1] ?? "";
  return topic === "Martes de 2x1" ? DRAFT : { caption: `${topic}, hecho aquí mismo.\nPide hoy.`, hashtags: [] };
}

function contentLlm(overrides: Record<string, (request: { prompt: string }) => unknown> = {}) {
  return createFakeLlm({
    "content.plan": () => PLAN,
    "content.draft": (request) => draftFor(request.prompt),
    "content.rewrite": () => ({ ...DRAFT, caption: "Versión más corta. Pide hoy.", title: "Martes de 2x1" }),
    "content.critique": () => ({ flags: [] }),
    ...overrides,
  });
}

async function readyBrand(owner = tenantId): Promise<string> {
  const brandId = await withTenant(db, owner, async (tx) => {
    const [row] = await tx
      .insert(brands)
      .values({ tenantId: owner, name: "labrasa.example", sourceUrl: ORIGIN })
      .returning();
    return row.id;
  });
  await onboardBrand({ db, fetcher: createFixtureFetcher(), llm: faithfulLlm() }, owner, brandId);
  return brandId;
}

async function plannedBrand(llm = contentLlm()) {
  const brandId = await readyBrand();
  const request = await requestPlan(db, tenantId, brandId, LIMITS);
  if (request.state !== "started") throw new Error(`plan not started: ${request.state}`);
  const outcome = await runPlan({ db, llm }, tenantId, request.planId);
  return { brandId, planId: request.planId, outcome, llm };
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  tenantId = await createTenant(db, "La Brasa");
  otherTenantId = await createTenant(db, "Otra empresa");
  const brandId = await readyBrand();
  profile = (await latestBrandDna(db, tenantId, brandId))!.profile;
});

afterAll(async () => {
  await close();
});

describe("plan and copy rules", () => {
  it("keeps only offers the profile has, one post per slot, in day order", () => {
    const plan = normalizePlan(
      {
        rationale: "  ok  ",
        posts: [
          post({ day: "fri", offerName: "Taco de suadero" }),
          post({ day: "mon", offerName: "taco al pastor " }),
          post({ day: "mon", topic: "Duplicado" }),
          post({ day: "wed", topic: "   " }),
        ],
      },
      ["Taco al pastor", "Taco de arrachera"],
    );
    expect(plan.posts.map((p) => [p.day, p.offerName])).toEqual([
      ["mon", "Taco al pastor"],
      ["fri", null],
    ]);
    expect(plan.rationale).toBe("ok");
  });

  it("uses each photo once a week and drops photos that do not exist", () => {
    const plan = normalizePlan(
      {
        rationale: "",
        posts: [
          post({ day: "mon", imageNumber: 2 }),
          post({ day: "tue", imageNumber: 2 }),
          post({ day: "wed", imageNumber: 9 }),
          post({ day: "thu", imageNumber: 0 }),
        ],
      },
      [],
      3,
    );
    expect(plan.posts.map((p) => p.imageNumber)).toEqual([2, null, null, null]);
  });

  it("keeps only occasions from the calendar", () => {
    const plan = normalizePlan(
      { rationale: "", posts: [post({ day: "mon", occasion: "el buen fin" }), post({ day: "tue", occasion: "Black Friday" })] },
      [],
      0,
      ["El Buen Fin"],
    );
    expect(plan.posts.map((p) => p.occasion)).toEqual(["El Buen Fin", null]);
  });

  it("caps the week at seven posts", () => {
    const many = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].flatMap((day) =>
      (["instagram", "facebook"] as const).map((channel) => post({ day: day as PlannedPost["day"], channel })),
    );
    expect(normalizePlan({ rationale: "", posts: many }, []).posts).toHaveLength(7);
  });

  it("joins caption and clean hashtags", () => {
    expect(composeCopy(DRAFT)).toBe(`${DRAFT.caption}\n\n#tacos #Guadalajara #comidamexicana`);
    expect(composeCopy({ ...DRAFT, hashtags: [] })).toBe(DRAFT.caption);
  });

  it("plans the coming week in the brand's own time zone", () => {
    expect(nextWeekStart(new Date("2026-11-12T00:00:00Z"))).toBe("2026-11-16");
    expect(nextWeekStart(new Date("2026-11-16T00:00:00Z"))).toBe("2026-11-16");
    expect(nextWeekStart(new Date("2026-11-15T00:00:00Z"))).toBe("2026-11-16");
    // 02:00 UTC on Monday is still Sunday evening in Mexico City.
    expect(localDate("MX", new Date("2026-11-16T02:00:00Z"))).toBe("2026-11-15");
  });

  it("flags prices the business does not publish", () => {
    const site = "Taco de arrachera $38. Taco al pastor $24. Abierto hasta las 10 pm.";
    expect(checkDraftPrices("Taco al pastor a $24, 2x1 los martes", profile, site)).toEqual([]);
    const flags = checkDraftPrices("Ahora a $19.00 y envío de 45 pesos", profile, site);
    expect(flags.map((f) => f.claim).sort()).toEqual(["19", "45"]);
  });

  it("accepts a price the owner set in the profile even if the site differs", () => {
    const edited = { ...profile, offers: [{ ...profile.offers[0], price: "$40" }] };
    expect(checkDraftPrices("Arrachera a $40", edited, "Taco de arrachera $38")).toEqual([]);
  });

  it("flags banned words as whole words only", () => {
    const strict = { ...profile, voice: { ...profile.voice, bannedWords: ["fusión", "barato"] } };
    expect(checkBannedWords("Cocina de fusión", strict).map((f) => f.claim)).toEqual(["fusión"]);
    expect(checkBannedWords("Nada abaratado aquí", strict)).toEqual([]);
  });
});

describe("weekly plan", () => {
  it("plans the week and drafts every post for approval", async () => {
    const { brandId, planId, outcome, llm } = await plannedBrand();
    expect(outcome).toEqual({ state: "ready", posts: 3, drafted: 3, corrected: 0 });

    const week = await latestWeek(db, tenantId, brandId);
    expect(week?.plan.id).toBe(planId);
    expect(week?.plan.status).toBe("ready");
    expect(week?.plan.rationale).toContain("vender más");
    expect(week?.items.map((i) => i.item.status)).toEqual(["needs_approval", "needs_approval", "needs_approval"]);
    // Tuesday, Thursday and Saturday of the coming week.
    const monday = nextWeekStart(new Date(`${localDate("MX")}T00:00:00Z`));
    expect(week?.plan.weekStart).toBe(monday);
    expect(week?.items.map((i) => new Date(`${i.brief.date}T00:00:00Z`).getUTCDay())).toEqual([2, 4, 6]);

    const [first, story] = week!.items;
    expect(first.draft?.copy).toContain("#tacos #Guadalajara #comidamexicana");
    // Stories carry no hashtags; the second post asked for the first post's photo and gets none.
    expect(story.item.format).toBe("story");
    expect(story.draft?.copy).not.toContain("#");
    expect(story.draft?.assetIds).toEqual([]);
    expect(first.draft?.reviewFlags).toEqual([]);
    expect(first.draft?.llmUsage.map((u) => u.purpose)).toEqual(["content.draft", "content.critique"]);

    // Photos come from the site; logos, icons and tracking pixels do not.
    const urls = week!.images.map((image) => image.url);
    expect(urls.some((url) => url.endsWith("/img/tacos-arrachera.jpg"))).toBe(true);
    expect(urls.some((url) => /logo|icono|pixel/.test(url))).toBe(false);
    expect(first.draft?.assetIds).toEqual([week!.images[0].id]);

    // The profile is in every prompt; the site's raw pages are not.
    const planCall = llm.calls.find((call) => call.purpose === "content.plan")!;
    expect(planCall.prompt).toContain("Taco al pastor");
    expect(planCall.instructions).toContain("Never invent discounts");
    expect(planCall.prompt).toContain("tacos-arrachera.jpg");
    expect(planCall.prompt).toContain("Calendar (the only dates you may use):");
    // The draft is told which photo it goes with.
    const draftCall = llm.calls.find((call) => call.purpose === "content.draft" && call.prompt.includes("Martes de 2x1"))!;
    expect(draftCall.prompt).toContain(`The post's photo: `);
  });

  it("records an invented price on the draft for the owner to see", async () => {
    const llm = contentLlm({
      "content.draft": () => ({ ...DRAFT, caption: "Taco al pastor a solo $15 esta semana." }),
    });
    const { brandId } = await plannedBrand(llm);
    const week = await latestWeek(db, tenantId, brandId);
    expect(week!.items[0].draft!.reviewFlags).toContainEqual(
      expect.objectContaining({ source: "price_check", claim: "15" }),
    );
  });

  it("keeps the plan when one draft fails, and says the check did not run when the critic fails", async () => {
    let drafts = 0;
    const llm = contentLlm({
      "content.draft": (request) => {
        drafts += 1;
        if (drafts === 2) throw new Error("model down");
        return draftFor(request.prompt);
      },
      "content.critique": () => {
        throw new Error("critic down");
      },
    });
    const { brandId, outcome } = await plannedBrand(llm);
    expect(outcome).toEqual({ state: "ready", posts: 3, drafted: 2, corrected: 0 });
    const week = await latestWeek(db, tenantId, brandId);
    expect(week!.items.map((i) => i.item.status).sort()).toEqual(["failed", "needs_approval", "needs_approval"]);
    const drafted = week!.items.find((i) => i.draft)!;
    expect(drafted.draft!.reviewFlags).toContainEqual(expect.objectContaining({ reason: "review_unavailable" }));
  });

  it("marks the plan failed when planning fails", async () => {
    const llm = contentLlm({
      "content.plan": () => {
        throw new Error("model down");
      },
    });
    const { outcome, planId } = await plannedBrand(llm);
    expect(outcome).toEqual({ state: "failed", reason: "llm_error" });
    const [plan] = await db.select().from(plans).where(eq(plans.id, planId));
    expect(plan.status).toBe("failed");
  });

  it("runs once even when triggered twice", async () => {
    const brandId = await readyBrand();
    const request = await requestPlan(db, tenantId, brandId, LIMITS);
    if (request.state !== "started") throw new Error();
    expect(await requestPlan(db, tenantId, brandId, LIMITS)).toEqual({
      state: "running",
      planId: request.planId,
    });
    const llm = contentLlm();
    const [a, b] = await Promise.all([
      runPlan({ db, llm }, tenantId, request.planId),
      runPlan({ db, llm }, tenantId, request.planId),
    ]);
    expect([a.state, b.state].sort()).toEqual(["ready", "skipped"]);
    expect(llm.calls.filter((call) => call.purpose === "content.plan")).toHaveLength(1);
  });

  it("replaces an unapproved plan but never one with approved posts", async () => {
    const { brandId, planId } = await plannedBrand();
    const again = await requestPlan(db, tenantId, brandId, LIMITS);
    expect(again).toEqual({ state: "started", planId });
    const items = await db.select().from(contentItems).where(eq(contentItems.planId, planId));
    expect(items).toHaveLength(0);

    await runPlan({ db, llm: contentLlm() }, tenantId, planId);
    const week = await latestWeek(db, tenantId, brandId);
    const first = week!.items[0];
    await saveItem(db, tenantId, first.item.id, {
      copy: first.draft!.copy,
      assetId: null,
      decision: "approve",
    });
    expect(await requestPlan(db, tenantId, brandId, LIMITS)).toEqual({ state: "has_approved", planId });

    // Scheduled and published posts count as approved too.
    for (const status of ["scheduled", "published"] as const) {
      await db.update(contentItems).set({ status }).where(eq(contentItems.id, first.item.id));
      expect(await requestPlan(db, tenantId, brandId, LIMITS)).toEqual({ state: "has_approved", planId });
    }
  });

  it("refuses a brand whose profile is not ready, and enforces the daily limit", async () => {
    const pendingBrand = await withTenant(db, tenantId, async (tx) => {
      const [row] = await tx.insert(brands).values({ tenantId, name: "x", sourceUrl: ORIGIN }).returning();
      return row.id;
    });
    expect(await requestPlan(db, tenantId, pendingBrand, LIMITS)).toEqual({ state: "not_ready" });

    const limitedTenant = await createTenant(db, "Limitada");
    const brandId = await readyBrand(limitedTenant);
    const tight = { plansPerDay: 1, rewritesPerDay: 1, learnPerDay: 1 };
    expect((await requestPlan(db, limitedTenant, brandId, tight)).state).toBe("started");
    await db.update(plans).set({ status: "failed" }).where(eq(plans.brandId, brandId));
    expect(await requestPlan(db, limitedTenant, brandId, tight)).toEqual({ state: "daily_limit" });
    const runs = await db.select().from(jobs).where(eq(jobs.tenantId, limitedTenant));
    expect(runs.filter((run) => run.kind === "plan")).toHaveLength(1);
  });
});

describe("approval", () => {
  it("stores the owner's edit as a new version, checked, and approves it", async () => {
    const { brandId } = await plannedBrand();
    const week = await latestWeek(db, tenantId, brandId);
    const { item, draft } = week!.items[0];
    const image = week!.images.at(-1)!;

    const result = await saveItem(db, tenantId, item.id, {
      copy: "Taco al pastor a $20, solo hoy.",
      assetId: image.id,
      decision: "approve",
    });
    // Nothing is connected, so approval does not schedule.
    expect(result).toEqual({ ok: true, scheduled: false });

    const versions = await db.select().from(drafts).where(eq(drafts.contentItemId, item.id));
    expect(versions.map((v) => [v.version, v.source])).toEqual([
      [draft!.version, "generated"],
      [draft!.version + 1, "user_edit"],
    ]);
    const edited = versions.find((v) => v.source === "user_edit")!;
    expect(edited.assetIds).toEqual([image.id]);
    expect(edited.reviewFlags).toContainEqual(expect.objectContaining({ claim: "20" }));

    const [after] = await db.select().from(contentItems).where(eq(contentItems.id, item.id));
    expect(after.status).toBe("approved");
  });

  it("approving unchanged text adds no version; rejecting needs no text", async () => {
    const { brandId } = await plannedBrand();
    const week = await latestWeek(db, tenantId, brandId);
    const [first, second] = week!.items;
    await saveItem(db, tenantId, first.item.id, {
      copy: first.draft!.copy,
      assetId: first.draft!.assetIds[0] ?? null,
      decision: "approve",
    });
    expect(await db.select().from(drafts).where(eq(drafts.contentItemId, first.item.id))).toHaveLength(1);

    expect(await saveItem(db, tenantId, second.item.id, { copy: "", assetId: null, decision: "reject" })).toEqual({
      ok: true,
      scheduled: false,
    });
    expect(await saveItem(db, tenantId, second.item.id, { copy: " ", assetId: null, decision: "approve" })).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("refuses a photo that belongs to another brand", async () => {
    const { brandId } = await plannedBrand();
    const otherBrand = await readyBrand(otherTenantId);
    const [foreign] = await withTenant(db, otherTenantId, (tx) =>
      tx
        .insert(assets)
        .values({ tenantId: otherTenantId, brandId: otherBrand, kind: "site_image", storageUrl: `${ORIGIN}/x.jpg` })
        .returning(),
    );
    const week = await latestWeek(db, tenantId, brandId);
    await expect(
      saveItem(db, tenantId, week!.items[0].item.id, { copy: "Hola", assetId: foreign.id, decision: "save" }),
    ).rejects.toThrow();
  });

  it("rewrites a post with the owner's instruction", async () => {
    const llm = contentLlm();
    const { brandId } = await plannedBrand(llm);
    const week = await latestWeek(db, tenantId, brandId);
    const { item } = week!.items[0];

    // The owner swaps the photo, then asks for a rewrite: the new version keeps their photo.
    const photo = week!.images.at(-1)!;
    await saveItem(db, tenantId, item.id, { copy: week!.items[0].draft!.copy, assetId: photo.id, decision: "save" });
    expect(await requestRewrite(db, tenantId, item.id, "Más corto", LIMITS)).toEqual({ ok: true });
    // While it is being rewritten, nobody can approve the old text.
    expect(await saveItem(db, tenantId, item.id, { copy: "x", assetId: null, decision: "approve" })).toEqual({
      ok: false,
      error: "busy",
    });
    expect(await runRewrite({ db, llm }, tenantId, item.id)).toBe(true);

    const rewrite = llm.calls.find((call) => call.purpose === "content.rewrite")!;
    expect(rewrite.prompt).toContain("The owner's instruction: Más corto");
    // The instruction is the last thing the model reads, after the profile.
    expect(rewrite.prompt.indexOf("The owner's instruction")).toBeGreaterThan(rewrite.prompt.indexOf("Brand profile"));
    expect(rewrite.prompt).toContain(DRAFT.caption.split("\n")[0]);
    const after = await latestWeek(db, tenantId, brandId);
    const updated = after!.items.find((i) => i.item.id === item.id)!;
    expect(updated.item.status).toBe("needs_approval");
    expect(updated.draft?.copy).toContain("Versión más corta");
    expect(updated.draft?.instruction).toBe("Más corto");
    expect(updated.draft?.assetIds).toEqual([photo.id]);
    // The instruction does not linger in the brief once the rewrite is done.
    expect(updated.item.brief).not.toHaveProperty("rewriteInstruction");
  });

  it("rewrites the title when the owner asks, and starts from unsaved edits", async () => {
    const llm = contentLlm({
      "content.rewrite": () => ({ caption: "Pastor al carbón, martes 2x1.\nPide hoy.", hashtags: [], title: "El martes es de pastor" }),
    });
    const { brandId } = await plannedBrand(llm);
    const week = await latestWeek(db, tenantId, brandId);
    const { item } = week!.items[0];

    const onScreen = "Texto que el dueño escribió y no guardó.\nPide hoy.";
    expect(
      await requestRewrite(db, tenantId, item.id, "Cambia el título y hazlo más corto", LIMITS, {
        copy: onScreen,
        assetId: null,
        title: "Mi título",
      }),
    ).toEqual({ ok: true });
    expect(await runRewrite({ db, llm }, tenantId, item.id)).toBe(true);

    const rewrite = llm.calls.find((call) => call.purpose === "content.rewrite")!;
    expect(rewrite.prompt).toContain(onScreen);
    expect(rewrite.prompt).toContain("Current title: Mi título");
    const after = await latestWeek(db, tenantId, brandId);
    const updated = after!.items.find((i) => i.item.id === item.id)!;
    expect(updated.brief.topic).toBe("El martes es de pastor");
    expect(updated.draft?.copy).toContain("Pastor al carbón");
  });

  it("asks again when a rewrite comes back unchanged", async () => {
    let rewrites = 0;
    const llm = contentLlm({
      "content.rewrite": () => {
        rewrites += 1;
        return rewrites === 1
          ? { ...DRAFT, title: "Martes de 2x1" }
          : { ...DRAFT, caption: "Martes: pastor 2x1.\nPide hoy.", title: "Martes de 2x1" };
      },
    });
    const { brandId } = await plannedBrand(llm);
    const week = await latestWeek(db, tenantId, brandId);
    const first = week!.items.find((i) => i.brief.topic === "Martes de 2x1")!;
    await requestRewrite(db, tenantId, first.item.id, "Más corto", LIMITS);
    await runRewrite({ db, llm }, tenantId, first.item.id);

    const calls = llm.calls.filter((call) => call.purpose === "content.rewrite");
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain("You returned the current post unchanged");
    const after = await latestWeek(db, tenantId, brandId);
    expect(after!.items.find((i) => i.item.id === first.item.id)!.draft?.copy).toContain("Martes: pastor 2x1.");
  });

  it("tells the owner when a rewrite fails, until they save or rewrite again", async () => {
    const llm = contentLlm({
      "content.rewrite": () => {
        throw new Error("model down");
      },
    });
    const { brandId } = await plannedBrand(llm);
    const week = await latestWeek(db, tenantId, brandId);
    const { item, draft } = week!.items[0];
    await requestRewrite(db, tenantId, item.id, "Más corto", LIMITS);
    expect(await runRewrite({ db, llm }, tenantId, item.id)).toBe(false);
    let updated = (await latestWeek(db, tenantId, brandId))!.items.find((i) => i.item.id === item.id)!;
    expect(updated.item.status).toBe("needs_approval");
    expect(updated.brief.rewriteFailed).toBe(true);

    await saveItem(db, tenantId, item.id, { copy: draft!.copy, assetId: null, decision: "save" });
    updated = (await latestWeek(db, tenantId, brandId))!.items.find((i) => i.item.id === item.id)!;
    expect(updated.brief.rewriteFailed).toBeUndefined();
  });

  it("lets the owner rename a post", async () => {
    const { brandId } = await plannedBrand();
    const week = await latestWeek(db, tenantId, brandId);
    const { item, draft } = week!.items[0];
    await saveItem(db, tenantId, item.id, { copy: draft!.copy, assetId: null, decision: "save", title: "  Nuevo   título " });
    const updated = (await latestWeek(db, tenantId, brandId))!.items.find((i) => i.item.id === item.id)!;
    expect(updated.brief.topic).toBe("Nuevo título");
  });

  it("keeps each tenant's plans out of the other's reach", async () => {
    const { brandId } = await plannedBrand();
    expect(await latestWeek(db, otherTenantId, brandId)).toBeNull();
    const week = await latestWeek(db, tenantId, brandId);
    const itemId = week!.items[0].item.id;
    expect(await saveItem(db, otherTenantId, itemId, { copy: "x", assetId: null, decision: "approve" })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await requestRewrite(db, otherTenantId, itemId, "x", LIMITS)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("loops and the week's graph", () => {
  it("rewrites a draft that fails a check, telling the model what failed", async () => {
    let drafts = 0;
    const llm = contentLlm({
      "content.draft": (request) => {
        if (!request.prompt.includes("Topic: Martes de 2x1.")) return draftFor(request.prompt);
        drafts += 1;
        return drafts === 1 ? { ...DRAFT, caption: "Taco al pastor a solo $15 esta semana." } : DRAFT;
      },
    });
    const { brandId } = await plannedBrand(llm);
    const week = await latestWeek(db, tenantId, brandId);
    const first = week!.items.find((i) => i.brief.topic === "Martes de 2x1")!;
    expect(first.draft!.copy).toContain("$24");
    expect(first.draft!.reviewFlags).toEqual([]);
    expect(first.draft!.llmUsage.map((u) => u.purpose)).toEqual([
      "content.draft",
      "content.critique",
      "content.draft",
      "content.critique",
    ]);
    const retry = llm.calls.filter((call) => call.purpose === "content.draft" && call.prompt.includes("Topic: Martes de 2x1."))[1];
    expect(retry.prompt).toContain("A check of your previous post found these problems");
    expect(retry.prompt).toMatch(/The price \$?15\b/);
  });

  it("sends a post that repeats another post's line back to be written again", async () => {
    const llm = contentLlm({ "content.draft": () => DRAFT });
    const { brandId, outcome } = await plannedBrand(llm);
    expect(outcome).toMatchObject({ state: "ready", posts: 3, drafted: 3, corrected: 2 });
    const corrections = llm.calls.filter(
      (call) => call.purpose === "content.draft" && call.prompt.includes("Another post this week already says"),
    );
    // Two later posts, each with its own problems; the first post keeps its lines.
    expect(corrections.length).toBeGreaterThanOrEqual(2);
    const week = await latestWeek(db, tenantId, brandId);
    expect(week!.items.map((i) => i.draft!.version)).toEqual([1, 2, 2]);
    expect(week!.items.every((i) => i.item.status === "needs_approval")).toBe(true);
  });

  it("plans again when the plan fails its gate, and keeps the better plan", async () => {
    let plans = 0;
    const allSelling: WeekPlan = {
      rationale: "Solo ventas.",
      posts: [post(), post({ day: "wed", pillar: "promotion" }), post({ day: "fri", pillar: "offer", topic: "Arrachera" })],
    };
    const llm = contentLlm({
      "content.plan": () => {
        plans += 1;
        return plans === 1 ? allSelling : PLAN;
      },
    });
    const { brandId } = await plannedBrand(llm);
    const calls = llm.calls.filter((call) => call.purpose === "content.plan");
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain("Every post sells");
    const week = await latestWeek(db, tenantId, brandId);
    expect(week!.items.map((i) => i.brief.pillar)).toEqual(["promotion", "product", "community"]);
  });

  it("feeds the owner's rejection reason into the next plan, and drops it when they reopen", async () => {
    const { brandId, llm } = await plannedBrand();
    const week = await latestWeek(db, tenantId, brandId);
    const community = week!.items.find((i) => i.brief.pillar === "community")!;
    const saved = await saveItem(db, tenantId, community.item.id, {
      copy: community.draft!.copy,
      assetId: null,
      decision: "reject",
      reason: "  No hablamos de   la colonia, somos de toda la ciudad  ",
    });
    expect(saved.ok).toBe(true);

    const again = await requestPlan(db, tenantId, brandId, LIMITS);
    if (again.state !== "started") throw new Error(again.state);
    await runPlan({ db, llm }, tenantId, again.planId);
    const planCalls = llm.calls.filter((call) => call.purpose === "content.plan");
    const latestPrompt = planCalls.at(-1)!.prompt;
    expect(latestPrompt).toContain('"Chapultepec"');
    expect(latestPrompt).toContain('The owner said: "No hablamos de la colonia, somos de toda la ciudad"');
    // The same topic comes back from the fake planner, so the gate asked for another plan.
    expect(planCalls.at(-1)!.prompt).toContain('The owner rejected the topic "Chapultepec" recently');

    // The rejected post left the week but is kept, with its reason, as history.
    const [kept] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(contentItems).where(eq(contentItems.id, community.item.id)),
    );
    expect(kept.planId).toBeNull();
    expect(kept.decisionNote).toBe("No hablamos de la colonia, somos de toda la ciudad");

    await saveItem(db, tenantId, community.item.id, { copy: community.draft!.copy, assetId: null, decision: "save" });
    const [reopened] = await withTenant(db, tenantId, (tx) =>
      tx.select().from(contentItems).where(eq(contentItems.id, community.item.id)),
    );
    expect(reopened.decisionNote).toBeNull();
  });
});
