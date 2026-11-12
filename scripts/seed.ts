import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { loadEnv, requireDatabaseUrl } from "./env";

/**
 * Creates the first tenant and prints its id for DEV_TENANT_ID.
 * Safe to run again: it reuses the tenant if it already exists.
 * Usage: npm run db:seed -- "Tenant name"
 */
async function main() {
  loadEnv();
  const name = process.argv[2] ?? "Juanberto's California Burritos";
  const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 });
  const db = drizzle(pool, { schema });
  try {
    const [existing] = await db.select().from(schema.tenants).where(eq(schema.tenants.name, name));
    const tenant = existing ?? (await db.insert(schema.tenants).values({ name }).returning())[0];
    console.log(`${existing ? "Found" : "Created"} tenant "${tenant.name}".`);
    console.log(`\nAdd this to .env.local:\n\nAUTH_MODE=dev\nDEV_TENANT_ID=${tenant.id}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
