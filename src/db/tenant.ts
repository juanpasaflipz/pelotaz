import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Any Postgres driver Drizzle supports: node-postgres in the app, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** A transaction that is already scoped to one tenant. */
export type TenantTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidTenantIdError extends Error {
  constructor() {
    super("withTenant requires a tenant id in UUID form");
    this.name = "InvalidTenantIdError";
  }
}

/**
 * Run `fn` as one tenant. Inside the callback the connection has the
 * `app_tenant` role and `app.tenant_id` set, both scoped to this transaction,
 * so row-level security applies to every statement regardless of its WHERE
 * clause.
 *
 * Keep the callback short: it holds a transaction open. Do network calls
 * (crawling, model calls) outside and use several `withTenant` blocks.
 */
export async function withTenant<T>(
  db: Db,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!UUID.test(tenantId)) throw new InvalidTenantIdError();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`set local role app_tenant`);
    return fn(tx);
  });
}
