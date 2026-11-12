import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { withTenant, type Db } from "../src/db/tenant";
import { onboardBrand } from "../src/lib/brand-dna/service";
import { createFixtureFetcher, ORIGIN } from "../test/fixtures/site";
import { createFakeLlm, FAITHFUL_DRAFT } from "../test/helpers/llm";
import { loadEnv, requireDatabaseUrl } from "./env";

/**
 * Adds a finished demo brand to the dev tenant so the profile editor can be
 * seen without an API key or network access. It runs the real onboarding
 * service over an invented site held in memory, with a canned model answer
 * that includes one made-up price so the review flags show up too.
 */
async function main() {
  loadEnv();
  const tenantId = process.env.DEV_TENANT_ID;
  if (!tenantId) {
    console.error("Set DEV_TENANT_ID in .env.local first (npm run db:seed prints it).");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 2 });
  const db = drizzle(pool, { schema }) as unknown as Db;

  try {
    const brandId = await withTenant(db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(schema.brands)
        .values({ tenantId, name: "labrasa.example", sourceUrl: ORIGIN })
        .returning();
      return row.id;
    });
    const llm = createFakeLlm({
      "brand_dna.build": () => ({
        ...FAITHFUL_DRAFT,
        offers: [
          ...FAITHFUL_DRAFT.offers,
          { name: "Combo familiar", description: "Diez tacos y dos aguas.", price: "$199", proofPoints: [] },
        ],
      }),
      "brand_dna.critique": () => ({ flags: [] }),
    });
    const outcome = await onboardBrand({ db, fetcher: createFixtureFetcher(), llm }, tenantId, brandId);
    console.log("Demo brand:", outcome, `\nOpen /brands/${brandId}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
