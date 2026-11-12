import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema";
import { withTenant, type Db } from "../src/db/tenant";
import { latestBrandDna, onboardBrand } from "../src/lib/brand-dna/service";
import { latestWeek, requestPlan, runPlan } from "../src/lib/content/service";
import { crawlSite } from "../src/lib/crawl/crawl";
import { siteKey } from "../src/lib/crawl/discover";
import { createGuardedFetcher } from "../src/lib/crawl/fetcher";
import { parsePublicUrl } from "../src/lib/crawl/url-guard";
import { getCriticLlm, getLlm } from "../src/lib/llm/ai-sdk";
import { MARKETS } from "../src/lib/markets";
import { loadEnv } from "./env";

/**
 * Run real onboarding on one website and print what comes out. No database
 * to set up: it uses an in-process Postgres that is thrown away at the end.
 *
 *   npm run try -- https://example.mx              crawl + Brand DNA (needs LLM_MODEL and its key)
 *   npm run try -- https://example.mx --crawl-only what the crawler reads, no model, no cost
 *   npm run try -- https://example.mx --country CO --goal followers
 *   npm run try -- https://example.mx --json       the stored profile as JSON only
 *   npm run try -- https://example.mx --week       then plan next week and draft every post
 */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const line = (label: string, value: unknown) => console.log(`${label.padEnd(18)}${value}`);

async function main() {
  loadEnv();
  const target = process.argv[2];
  if (!target || target.startsWith("--")) {
    console.error("Usage: npm run try -- <website> [--crawl-only] [--week] [--country MX] [--goal sales] [--json]");
    process.exit(1);
  }
  const url = parsePublicUrl(target).toString();
  const market = MARKETS.find((m) => m.country === (option("country") ?? "MX").toUpperCase());
  const goal = schema.brandGoal.enumValues.find((g) => g === (option("goal") ?? "sales"));
  if (!market || !goal) {
    console.error("Unknown --country or --goal.");
    process.exit(1);
  }
  const jsonOnly = process.argv.includes("--json");
  const fetcher = createGuardedFetcher();
  const language = market.locale.slice(0, 2);

  if (process.argv.includes("--crawl-only")) {
    const crawl = await crawlSite(fetcher, url, { language });
    console.log(`\nCrawled ${crawl.pages.length} pages from ${crawl.startUrl}\n`);
    for (const page of crawl.pages) {
      console.log(`${String(page.text.length).padStart(6)} chars  ${page.url}`);
    }
    for (const failure of crawl.failures) console.log(`  skipped  ${failure.url}  (${failure.reason})`);
    console.log("");
    line("Total text", `${crawl.totalTextLength} chars`);
    line("Site languages", crawl.siteLanguages.join(", ") || "(no language prefixes)");
    line("Palette", crawl.visuals.palette.join(" ") || "(none found)");
    line("Fonts", crawl.visuals.fonts.join(", ") || "(none found)");
    line("Logo", crawl.visuals.logoUrl ?? "(none found)");
    line("Social", JSON.stringify(crawl.visuals.socialLinks));
    console.log(`\nFirst 600 characters of the home page text:\n\n${crawl.pages[0].text.slice(0, 600)}\n`);
    return;
  }

  const llm = getLlm();
  const critic = getCriticLlm();

  const client = new PGlite();
  const pglite = drizzle(client, { schema });
  await migrate(pglite, { migrationsFolder: path.resolve("drizzle") });
  const db = pglite as unknown as Db;

  try {
    const [tenant] = await db.insert(schema.tenants).values({ name: "trial" }).returning();
    const brandId = await withTenant(db, tenant.id, async (tx) => {
      const [row] = await tx
        .insert(schema.brands)
        .values({
          tenantId: tenant.id,
          name: siteKey(url),
          sourceUrl: url,
          goal,
          country: market.country,
          locale: market.locale,
        })
        .returning();
      return row.id;
    });

    const started = Date.now();
    const outcome = await onboardBrand({ db, fetcher, llm, critic }, tenant.id, brandId);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    if (outcome.state !== "ready") {
      console.error(`\nOnboarding did not finish: ${JSON.stringify(outcome)} after ${seconds}s`);
      process.exitCode = 1;
      return;
    }

    const dna = (await latestBrandDna(db, tenant.id, brandId))!;
    if (jsonOnly) {
      console.log(JSON.stringify(dna.profile, null, 2));
      return;
    }

    const pages = await db.select().from(schema.crawlPages).where(eq(schema.crawlPages.brandId, brandId));
    console.log(`\nReady in ${seconds}s. Read ${pages.length} pages:\n`);
    for (const page of pages) console.log(`${String(page.text.length).padStart(6)} chars  ${page.url}`);

    console.log("\n--- Profile ---\n");
    console.log(JSON.stringify(dna.profile, null, 2));

    console.log("\n--- Review flags ---\n");
    if (dna.reviewFlags.length === 0) console.log("None.");
    for (const flag of dna.reviewFlags) {
      console.log(`[${flag.source}] ${flag.field}: ${flag.claim}\n    ${flag.reason}`);
    }

    console.log("\n--- Model usage ---\n");
    for (const usage of dna.llmUsage) {
      console.log(
        `${usage.purpose.padEnd(22)}${usage.model.padEnd(34)}in ${usage.inputTokens ?? "?"}  out ${usage.outputTokens ?? "?"}`,
      );
    }
    console.log("");

    if (process.argv.includes("--week")) await tryWeek(db, tenant.id, brandId, { llm, critic });
  } finally {
    await client.close();
  }
}

async function tryWeek(
  db: Db,
  tenantId: string,
  brandId: string,
  models: { llm: ReturnType<typeof getLlm>; critic: ReturnType<typeof getLlm> },
) {
  const request = await requestPlan(db, tenantId, brandId, { plansPerDay: 10, rewritesPerDay: 10 });
  if (request.state !== "started") {
    console.error(`Plan not started: ${request.state}`);
    return;
  }
  const started = Date.now();
  const outcome = await runPlan({ db, ...models }, tenantId, request.planId);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n=== Week plan: ${JSON.stringify(outcome)} in ${seconds}s ===\n`);
  const week = await latestWeek(db, tenantId, brandId);
  if (!week) return;
  console.log(`Week of ${week.plan.weekStart}\n${week.plan.rationale ?? ""}\n`);
  const usage = [...week.plan.llmUsage];
  for (const { item, brief, draft } of week.items) {
    const image = week.images.find((candidate) => candidate.id === draft?.assetIds[0]);
    console.log(`--- ${brief.date} · ${item.channel} ${item.format} · ${brief.pillar} · ${item.status}`);
    console.log(`Topic: ${brief.topic}${brief.offerName ? `  [offer: ${brief.offerName}]` : ""}`);
    console.log(`Angle: ${brief.angle}`);
    console.log(`Photo: ${image ? `${image.url}${image.alt ? ` ("${image.alt}")` : ""}` : "(none)"}\n`);
    console.log(draft ? draft.copy : "(no draft)");
    for (const flag of draft?.reviewFlags ?? []) console.log(`  ! [${flag.source}] ${flag.claim}: ${flag.reason}`);
    console.log("");
    usage.push(...(draft?.llmUsage ?? []));
  }
  console.log(`Photos offered to the model: ${week.images.length}`);
  console.log("\n--- Week model usage ---\n");
  for (const entry of usage) {
    console.log(
      `${entry.purpose.padEnd(22)}${entry.model.padEnd(34)}in ${entry.inputTokens ?? "?"}  out ${entry.outputTokens ?? "?"}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
