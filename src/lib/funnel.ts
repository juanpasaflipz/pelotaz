import { sql } from "drizzle-orm";
import type { Db } from "@/db/tenant";

/**
 * The sign-up funnel, counted from what the tables already hold: one row per
 * way people arrived, and how far each group got. A request is matched to its
 * workspace through `tenants.owner_email`, so workspaces opened before that
 * column existed count only as requests.
 *
 * Cross-tenant by nature: callers pass `systemDb()` and must be admins.
 */
export interface FunnelRow {
  /** "beta", "empieza", or "directo" for the root page; with the utm_source when there was one. */
  origin: string;
  requests: number;
  approved: number;
  /** Approved by the daily quota, not by a person. */
  automatic: number;
  accounts: number;
  profiles: number;
  plans: number;
  approvedPost: number;
  publishedPost: number;
}

export async function signupFunnel(db: Db, days: number): Promise<FunnelRow[]> {
  const window = Math.min(Math.max(Math.trunc(days), 1), 365);
  const result = await db.execute(sql`
    select
      coalesce(r.source::text, 'directo') || coalesce(' · ' || nullif(r.utm->>'utm_source', ''), '') as origin,
      count(*)::int as requests,
      count(*) filter (where r.status = 'approved')::int as approved,
      count(*) filter (where r.status = 'approved' and r.decided_by = 'auto')::int as automatic,
      count(t.id)::int as accounts,
      count(t.id) filter (where exists (
        select 1 from brands b where b.tenant_id = t.id and b.status = 'ready'))::int as profiles,
      count(t.id) filter (where exists (
        select 1 from plans p where p.tenant_id = t.id))::int as plans,
      count(t.id) filter (where exists (
        select 1 from content_items c where c.tenant_id = t.id
          and c.status in ('approved', 'scheduled', 'publishing', 'published')))::int as approved_post,
      count(t.id) filter (where exists (
        select 1 from content_items c where c.tenant_id = t.id and c.status = 'published'))::int as published_post
    from access_requests r
    left join lateral (
      select id from tenants where owner_email = r.email order by created_at limit 1
    ) t on true
    where r.created_at >= now() - make_interval(days => ${window})
    group by 1
    order by requests desc, origin
  `);
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    origin: String(row.origin),
    requests: Number(row.requests),
    approved: Number(row.approved),
    automatic: Number(row.automatic),
    accounts: Number(row.accounts),
    profiles: Number(row.profiles),
    plans: Number(row.plans),
    approvedPost: Number(row.approved_post),
    publishedPost: Number(row.published_post),
  }));
}

export function funnelTotals(rows: FunnelRow[]): FunnelRow {
  const total: FunnelRow = {
    origin: "",
    requests: 0,
    approved: 0,
    automatic: 0,
    accounts: 0,
    profiles: 0,
    plans: 0,
    approvedPost: 0,
    publishedPost: 0,
  };
  for (const row of rows) {
    for (const key of Object.keys(total) as Array<keyof FunnelRow>) {
      if (key !== "origin") total[key] += row[key];
    }
  }
  return total;
}
