import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { brands, contentItems } from "@/db/schema";
import type { Db } from "@/db/tenant";
import { caseStudyCounts } from "@/lib/case-study";
import { createTenant, createTestDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});

describe("case study counts", () => {
  it("counts planned, approved and published posts for one brand only", async () => {
    const tenantId = await createTenant(db, "Juanberto's");
    const [brand, other] = await db
      .insert(brands)
      .values([
        { tenantId, name: "Juanberto's", sourceUrl: "https://juanbertos.com/" },
        { tenantId, name: "Otra", sourceUrl: "https://otra.mx/" },
      ])
      .returning();
    const item = (brandId: string, status: (typeof contentItems.$inferInsert)["status"]) => ({
      tenantId,
      brandId,
      channel: "instagram",
      format: "post",
      status,
    });
    await db
      .insert(contentItems)
      .values([
        item(brand.id, "planned"),
        item(brand.id, "rejected"),
        item(brand.id, "approved"),
        item(brand.id, "scheduled"),
        item(brand.id, "published"),
        item(other.id, "published"),
      ]);
    expect(await caseStudyCounts(db, brand.id)).toEqual({ planned: 5, approved: 3, published: 1 });
  });
});
