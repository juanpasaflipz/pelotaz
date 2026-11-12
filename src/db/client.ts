import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import type { Db } from "./tenant";

let cached: Db | undefined;

/**
 * The connection's own role. It owns the tables, so row-level security does
 * not apply to it. Use it only for work that is cross-tenant by nature
 * (creating a tenant, scheduled jobs that scan every brand) and reach tenant
 * data through `withTenant(systemDb(), tenantId, ...)` everywhere else.
 */
export function systemDb(): Db {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  const pool = new Pool({ connectionString: url, max: 5 });
  cached = drizzle(pool, { schema });
  return cached;
}
