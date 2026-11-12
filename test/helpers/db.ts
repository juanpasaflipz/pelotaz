import { randomBytes } from "node:crypto";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { migrate as migrateNode } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import type { Db } from "@/db/tenant";

const migrationsFolder = path.resolve(import.meta.dirname, "../../drizzle");

/**
 * A fresh Postgres with the real migrations applied, so tests exercise the
 * same roles, policies, grants and triggers production gets.
 *
 * - Default: PGlite, Postgres compiled to run in-process. No setup needed.
 * - With TEST_DATABASE_URL: a real server (for example a Neon branch). Each
 *   call creates its own `pelotaz_test_*` database and drops it on close, so
 *   the role in the URL needs CREATEDB. Use this to confirm behaviour on the
 *   server and role setup you actually deploy to.
 */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    const client = new PGlite();
    const db = drizzlePglite(client, { schema });
    await migratePglite(db, { migrationsFolder });
    return { db: db as unknown as Db, close: () => client.close() };
  }

  const name = `pelotaz_test_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: serverUrl, max: 1 });
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString(), max: 4 });
  const db = drizzleNode(pool, { schema });
  await migrateNode(db, { migrationsFolder });
  return {
    db: db as unknown as Db,
    close: async () => {
      await pool.end();
      await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await admin.end();
    },
  };
}

export async function createTenant(db: Db, name: string): Promise<string> {
  const [row] = await db.insert(schema.tenants).values({ name }).returning();
  return row.id;
}
