import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { loadEnv, requireDatabaseUrl } from "./env";

async function main() {
  loadEnv();
  const pool = new Pool({ connectionString: requireDatabaseUrl(), max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
