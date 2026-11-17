import { eq, sql } from "drizzle-orm";
import { contentItems } from "@/db/schema";
import type { Db } from "@/db/tenant";

export interface CaseStudyCounts {
  planned: number;
  approved: number;
  published: number;
}

/**
 * The real numbers behind "Caso real" on the public page: every post the
 * brand has had planned, how many the owner approved, and how many went out.
 * Counts only, so nothing about the brand's content leaves its tenant.
 */
export async function caseStudyCounts(db: Db, brandId: string): Promise<CaseStudyCounts> {
  const [row] = await db
    .select({
      planned: sql<number>`count(*)::int`,
      approved: sql<number>`count(*) filter (where ${contentItems.status} in ('approved', 'scheduled', 'publishing', 'published'))::int`,
      published: sql<number>`count(*) filter (where ${contentItems.status} = 'published')::int`,
    })
    .from(contentItems)
    .where(eq(contentItems.brandId, brandId));
  return row ?? { planned: 0, approved: 0, published: 0 };
}
