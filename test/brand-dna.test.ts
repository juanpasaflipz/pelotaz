import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { brandDna, brands, crawlPages } from "@/db/schema";
import { withTenant, type Db } from "@/db/tenant";
import { checkPrices, renderPages } from "@/lib/brand-dna/build";
import {
  latestBrandDna,
  onboardBrand,
  ProfileValidationError,
  saveProfileEdit,
} from "@/lib/brand-dna/service";
import { crawlSite } from "@/lib/crawl/crawl";
import { extractPage } from "@/lib/crawl/extract";
import { createGuardedFetcher } from "@/lib/crawl/fetcher";
import { createFixtureFetcher, ORIGIN, ROUTES } from "./fixtures/site";
import { createTenant, createTestDb } from "./helpers/db";
import { createFakeLlm, FAITHFUL_DRAFT, faithfulLlm } from "./helpers/llm";

let db: Db;
let close: () => Promise<void>;
let tenantId: string;
let otherTenantId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  tenantId = await createTenant(db, "La Brasa");
  otherTenantId = await createTenant(db, "Otra empresa");
});

afterAll(async () => {
  await close();
});

async function createBrand(sourceUrl = ORIGIN, name = "labrasa.example") {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx.insert(brands).values({ tenantId, name, sourceUrl }).returning();
    return row.id;
  });
}

const brandRow = async (brandId: string) => {
  const [row] = await db.select().from(brands).where(eq(brands.id, brandId));
  return row;
};

describe("onboardBrand", () => {
  let brandId: string;
  beforeEach(async () => {
    brandId = await createBrand();
  });

  it("crawls the site and stores Brand DNA version 1", async () => {
    const llm = faithfulLlm();
    const outcome = await onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, tenantId, brandId);
    expect(outcome).toEqual({ state: "ready", version: 1 });

    const dna = await latestBrandDna(db, tenantId, brandId);
    expect(dna?.source).toBe("crawl");
    expect(dna?.profile.business.name).toBe("Taquería La Brasa");
    expect(dna?.profile.offers.map((o) => o.price)).toEqual(["$38", "$24"]);
    // Visual identity comes from the crawl, and market settings from the brand row.
    expect(dna?.profile.visual.palette).toEqual(["#b3261e", "#f2a900"]);
    expect(dna?.profile.visual.logoUrl).toBe(`${ORIGIN}/img/logo-labrasa.png`);
    expect(dna?.profile).toMatchObject({ goal: "sales", country: "MX", locale: "es-MX" });
    expect(dna?.reviewFlags).toEqual([]);
  });

  it("records token usage for both model calls", async () => {
    await onboardBrand({ db, fetcher: createFixtureFetcher(), llm: faithfulLlm() }, tenantId, brandId);
    const dna = await latestBrandDna(db, tenantId, brandId);
    expect(dna?.llmUsage.map((u) => u.purpose)).toEqual(["brand_dna.build", "brand_dna.critique"]);
    expect(dna?.llmUsage[0]).toMatchObject({ model: "fake:model", inputTokens: 1200, outputTokens: 300 });
  });

  it("runs the audit on the critic model when one is given", async () => {
    const writer = createFakeLlm({ "brand_dna.build": () => FAITHFUL_DRAFT });
    const critic = createFakeLlm({ "brand_dna.critique": () => ({ flags: [] }) });
    const outcome = await onboardBrand(
      { db, fetcher: createFixtureFetcher(), llm: writer, critic },
      tenantId,
      brandId,
    );
    expect(outcome.state).toBe("ready");
    expect(writer.calls.map((c) => c.purpose)).toEqual(["brand_dna.build"]);
    expect(critic.calls.map((c) => c.purpose)).toEqual(["brand_dna.critique"]);
  });

  it("stores the crawled pages without their raw CSS and marks the brand ready", async () => {
    await onboardBrand({ db, fetcher: createFixtureFetcher(), llm: faithfulLlm() }, tenantId, brandId);
    const pages = await db.select().from(crawlPages).where(eq(crawlPages.brandId, brandId));
    expect(pages.length).toBe(6);
    expect(pages.every((p) => p.assets.inlineCss === "")).toBe(true);
    const brand = await brandRow(brandId);
    expect(brand.status).toBe("ready");
    // The hostname placeholder was replaced by the name the site uses.
    expect(brand.name).toBe("Taquería La Brasa");
  });

  it("keeps a name the user typed", async () => {
    const named = await createBrand(ORIGIN, "La Brasa Chapultepec");
    await onboardBrand({ db, fetcher: createFixtureFetcher(), llm: faithfulLlm() }, tenantId, named);
    expect((await brandRow(named)).name).toBe("La Brasa Chapultepec");
  });

  it("sends the site text to the model as fenced, untrusted data", async () => {
    const llm = faithfulLlm();
    await onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, tenantId, brandId);
    const [build] = llm.calls;
    expect(build.instructions).toMatch(/untrusted website content/);
    expect(build.instructions).toMatch(/Never invent/);
    expect(build.prompt).toContain(`<page url="${ORIGIN}/">`);
    expect(build.prompt).toContain("Taco de arrachera — $38");
    // Boilerplate never reaches the model.
    expect(build.prompt).not.toContain("no-debe-aparecer");
  });

  it("flags a price that is not on the site, without help from the critic", async () => {
    const llm = createFakeLlm({
      "brand_dna.build": () => ({
        ...FAITHFUL_DRAFT,
        offers: [
          ...FAITHFUL_DRAFT.offers,
          { name: "Combo familiar", description: "Inventado.", price: "$199", proofPoints: [] },
        ],
      }),
      "brand_dna.critique": () => ({ flags: [] }),
    });
    await onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, tenantId, brandId);
    const dna = await latestBrandDna(db, tenantId, brandId);
    expect(dna?.reviewFlags).toEqual([
      {
        field: "offers.2.price",
        claim: "Combo familiar: $199",
        reason: "price_not_found_in_pages",
        source: "price_check",
      },
    ]);
  });

  it("stores what the critic could not find support for", async () => {
    const llm = createFakeLlm({
      "brand_dna.build": () => FAITHFUL_DRAFT,
      "brand_dna.critique": () => ({
        flags: [{ field: "audience.segments.0", claim: "Piden a domicilio entre semana.", reason: "No aparece en las páginas." }],
      }),
    });
    await onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, tenantId, brandId);
    const dna = await latestBrandDna(db, tenantId, brandId);
    expect(dna?.reviewFlags).toEqual([
      expect.objectContaining({ field: "audience.segments.0", source: "critic" }),
    ]);
  });

  it("still delivers a profile when the critic fails, and says the review did not run", async () => {
    const llm = createFakeLlm({
      "brand_dna.build": () => FAITHFUL_DRAFT,
      "brand_dna.critique": () => {
        throw new Error("rate limited");
      },
    });
    const outcome = await onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, tenantId, brandId);
    expect(outcome.state).toBe("ready");
    const dna = await latestBrandDna(db, tenantId, brandId);
    expect(dna?.reviewFlags).toEqual([
      { field: "", claim: "", reason: "review_unavailable", source: "system" },
    ]);
  });

  it("marks the brand failed when the model cannot produce a profile", async () => {
    const llm = createFakeLlm({
      "brand_dna.build": () => {
        throw new Error("model unavailable");
      },
    });
    const outcome = await onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, tenantId, brandId);
    expect(outcome).toEqual({ state: "failed", reason: "llm_error" });
    expect(await brandRow(brandId)).toMatchObject({ status: "failed", statusDetail: "llm_error" });
    expect(await latestBrandDna(db, tenantId, brandId)).toBeNull();
  });

  it("rejects a model answer that does not match the schema", async () => {
    const llm = createFakeLlm({ "brand_dna.build": () => ({ business: { name: "x" } }) });
    const outcome = await onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, tenantId, brandId);
    expect(outcome).toEqual({ state: "failed", reason: "llm_error" });
  });

  it("stops before calling the model when the site has almost no text", async () => {
    const llm = faithfulLlm();
    const fetcher = createFixtureFetcher({
      "/": { contentType: "text/html", body: "<html><body><div id='root'></div><script src='/app.js'></script></body></html>" },
    });
    const outcome = await onboardBrand({ db, fetcher, llm }, tenantId, brandId);
    expect(outcome).toEqual({ state: "failed", reason: "thin_content" });
    expect(llm.calls).toEqual([]);
  });

  it("reports an unreachable site", async () => {
    const outcome = await onboardBrand(
      { db, fetcher: createFixtureFetcher({}), llm: faithfulLlm() },
      tenantId,
      brandId,
    );
    expect(outcome).toEqual({ state: "failed", reason: "home_unreachable" });
  });

  it("refuses a brand whose URL points into a private network, using the real fetcher", async () => {
    const internal = await createBrand("http://169.254.169.254/latest/meta-data/");
    const llm = faithfulLlm();
    const outcome = await onboardBrand({ db, fetcher: createGuardedFetcher(), llm }, tenantId, internal);
    expect(outcome).toEqual({ state: "failed", reason: "unsafe_url" });
    expect(llm.calls).toEqual([]);
  });

  it("runs once when triggered twice at the same time", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const llm = createFakeLlm({
      "brand_dna.build": async () => {
        await gate;
        return FAITHFUL_DRAFT;
      },
      "brand_dna.critique": () => ({ flags: [] }),
    });
    const first = onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, tenantId, brandId);
    // Let the first run claim the brand and reach the model call.
    await expect.poll(() => llm.calls.length).toBe(1);
    const second = await onboardBrand({ db, fetcher: createFixtureFetcher(), llm: faithfulLlm() }, tenantId, brandId);
    expect(second).toEqual({ state: "skipped", reason: "already_running" });
    release();
    expect(await first).toEqual({ state: "ready", version: 1 });
    const versions = await db.select().from(brandDna).where(eq(brandDna.brandId, brandId));
    expect(versions.length).toBe(1);
  });

  it("does not redo a finished brand unless forced, and a forced run adds a version", async () => {
    const deps = { db, fetcher: createFixtureFetcher(), llm: faithfulLlm() };
    await onboardBrand(deps, tenantId, brandId);
    expect(await onboardBrand(deps, tenantId, brandId)).toEqual({ state: "skipped", reason: "already_ready" });
    expect(await onboardBrand(deps, tenantId, brandId, { force: true })).toEqual({ state: "ready", version: 2 });
  });

  it("can be retried after a failure", async () => {
    const failing = createFakeLlm({ "brand_dna.build": () => { throw new Error("down"); } });
    await onboardBrand({ db, fetcher: createFixtureFetcher(), llm: failing }, tenantId, brandId);
    const retry = await onboardBrand({ db, fetcher: createFixtureFetcher(), llm: faithfulLlm() }, tenantId, brandId);
    expect(retry).toEqual({ state: "ready", version: 1 });
  });

  it("cannot be triggered for another tenant's brand", async () => {
    const llm = faithfulLlm();
    const outcome = await onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, otherTenantId, brandId);
    expect(outcome).toEqual({ state: "skipped", reason: "not_found" });
    expect((await brandRow(brandId)).status).toBe("pending");
  });
});

describe("saveProfileEdit", () => {
  let brandId: string;
  let profile: NonNullable<Awaited<ReturnType<typeof latestBrandDna>>>["profile"];

  beforeEach(async () => {
    brandId = await createBrand();
    const llm = createFakeLlm({
      "brand_dna.build": () => FAITHFUL_DRAFT,
      "brand_dna.critique": () => ({ flags: [{ field: "business.summary", claim: "x", reason: "y" }] }),
    });
    await onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, tenantId, brandId);
    profile = (await latestBrandDna(db, tenantId, brandId))!.profile;
  });

  it("saves an edit as a new version and keeps the old one", async () => {
    const edited = { ...profile, voice: { ...profile.voice, tone: ["juguetón", "  juguetón ", "cálido"] } };
    expect(await saveProfileEdit(db, tenantId, brandId, edited)).toEqual({ version: 2 });

    const versions = await db.select().from(brandDna).where(eq(brandDna.brandId, brandId));
    expect(versions.map((v) => [v.version, v.source]).sort()).toEqual([[1, "crawl"], [2, "user_edit"]]);
    const latest = await latestBrandDna(db, tenantId, brandId);
    // Trimmed and deduplicated.
    expect(latest?.profile.voice.tone).toEqual(["juguetón", "cálido"]);
    // A person has reviewed it, so the automatic flags are cleared.
    expect(latest?.reviewFlags).toEqual([]);
  });

  it("keeps goal, market and locale on the brand in step with the profile", async () => {
    await saveProfileEdit(db, tenantId, brandId, { ...profile, goal: "followers", country: "co", locale: "es-CO" });
    expect(await brandRow(brandId)).toMatchObject({ goal: "followers", country: "CO", locale: "es-CO" });
  });

  it("rejects a malformed profile and says where", async () => {
    const broken = { ...profile, visual: { ...profile.visual, palette: ["rojo"] }, goal: "fama" };
    const error = await saveProfileEdit(db, tenantId, brandId, broken).catch((e) => e);
    expect(error).toBeInstanceOf(ProfileValidationError);
    expect(error.issues.map((i: { path: string }) => i.path).sort()).toEqual(["goal", "visual.palette.0"]);
    expect((await latestBrandDna(db, tenantId, brandId))?.version).toBe(1);
  });

  it("does nothing for another tenant", async () => {
    expect(await saveProfileEdit(db, otherTenantId, brandId, profile)).toBeNull();
    expect(await latestBrandDna(db, otherTenantId, brandId)).toBeNull();
  });
});

const ROUTES_PAGE = extractPage("<html><body></body></html>", `${ORIGIN}/x`, 200);

describe("prompt building", () => {
  it("cuts the least informative pages first when over budget", async () => {
    const crawl = await crawlSite(createFixtureFetcher(), ORIGIN);
    const rendered = renderPages(crawl.pages, 400);
    expect(rendered).toContain(`<page url="${ORIGIN}/">`);
    expect(rendered).not.toContain("/blog/como-asamos");
  });

  it("accepts prices that appear on the pages in any offer order", async () => {
    const crawl = await crawlSite(createFixtureFetcher(), ORIGIN);
    expect(checkPrices(FAITHFUL_DRAFT, crawl.pages)).toEqual([]);
  });

  it("does not let a price match inside a larger number", async () => {
    const crawl = await crawlSite(createFixtureFetcher(), ORIGIN);
    // "$10" must not pass because of "$105" or "a 10 pm", nor "$5" because of "5 tacos".
    const draft = {
      ...FAITHFUL_DRAFT,
      offers: [
        { name: "A", description: "", price: "$10", proofPoints: [] },
        { name: "B", description: "", price: "$5", proofPoints: [] },
        { name: "C", description: "", price: "precio a consultar", proofPoints: [] },
        { name: "D", description: "", price: "$38.00 MXN", proofPoints: [] },
      ],
    };
    expect(checkPrices(draft, crawl.pages).map((f) => f.field)).toEqual([
      "offers.0.price",
      "offers.1.price",
      "offers.2.price",
    ]);
  });

  it("recognises prices written with a currency word or thousands separators", () => {
    const page = { ...ROUTES_PAGE, text: "Paquete boda 1,250.00 pesos. Renta por hora: 300 MXN. Abrimos a las 9." };
    const draft = {
      ...FAITHFUL_DRAFT,
      offers: [
        { name: "Boda", description: "", price: "$1,250", proofPoints: [] },
        { name: "Hora", description: "", price: "300 MXN", proofPoints: [] },
        { name: "Inventado", description: "", price: "$9", proofPoints: [] },
      ],
    };
    expect(checkPrices(draft, [page]).map((f) => f.field)).toEqual(["offers.2.price"]);
  });

  it("falls back to bare numbers when a site never marks a currency", () => {
    const page = { ...ROUTES_PAGE, text: "Taco de asada 28\nQuesadilla 45" };
    const draft = {
      ...FAITHFUL_DRAFT,
      offers: [
        { name: "Taco de asada", description: "", price: "28", proofPoints: [] },
        { name: "Torta", description: "", price: "60", proofPoints: [] },
      ],
    };
    expect(checkPrices(draft, [page]).map((f) => f.field)).toEqual(["offers.1.price"]);
  });

  it("keeps route fixtures honest", () => {
    expect(ROUTES["/menu"].body).toContain("$105");
  });
});
