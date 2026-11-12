import { desc, eq } from "drizzle-orm";
import { systemDb } from "@/db/client";
import { brandDna, brands } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { isUuid } from "@/lib/ids";

export async function listBrands(tenantId: string) {
  return withTenant(systemDb(), tenantId, (tx) =>
    tx
      .select({
        id: brands.id,
        name: brands.name,
        sourceUrl: brands.sourceUrl,
        status: brands.status,
        createdAt: brands.createdAt,
      })
      .from(brands)
      .orderBy(desc(brands.createdAt)),
  );
}

export async function getBrandWithDna(tenantId: string, brandId: string) {
  if (!isUuid(brandId)) return null;
  return withTenant(systemDb(), tenantId, async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId));
    if (!brand) return null;
    const [dna] = await tx
      .select()
      .from(brandDna)
      .where(eq(brandDna.brandId, brandId))
      .orderBy(desc(brandDna.version))
      .limit(1);
    return { brand, dna: dna ?? null };
  });
}
