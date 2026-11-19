import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { brands, creditLedger, tenants } from "@/db/schema";
import { withTenant, type Db } from "@/db/tenant";
import { CREDIT_USD, recordAssistantUsage } from "@/lib/assistant/ledger";
import type { AssistantUsage } from "@/lib/assistant/types";
import { createTenant, createTestDb } from "./helpers/db";

let db: Db;
let close: () => Promise<void>;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(async () => {
  await close();
});
afterEach(() => vi.restoreAllMocks());

const usage = (over: Partial<AssistantUsage> = {}): AssistantUsage => ({
  purpose: "chat.answer",
  role: "fast",
  model: "deepseek-ai/DeepSeek-V4.1-Flash",
  inputTokens: 6000,
  outputTokens: 400,
  cachedInputTokens: null,
  reasoningTokens: null,
  ...over,
});

const balanceOf = async (tenantId: string) => {
  const [row] = await db.select({ balance: tenants.creditBalance }).from(tenants).where(eq(tenants.id, tenantId));
  return row.balance;
};

describe("recordAssistantUsage: no balance yet", () => {
  it("does not throw and does not insert a row when the tenant has zero credit", async () => {
    const tenantId = await createTenant(db, "Sin saldo");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await withTenant(db, tenantId, (tx) =>
      recordAssistantUsage(tx, tenantId, { purpose: "chat.answer", usage: usage(), costUsd: 0.001 }),
    );
    expect(result).toEqual({ recorded: false, costUsd: 0.001, amount: -10 });
    expect(warn).toHaveBeenCalledOnce();
    const rows = await withTenant(db, tenantId, (tx) => tx.select().from(creditLedger));
    expect(rows).toEqual([]);
    expect(await balanceOf(tenantId)).toBe(0);
  });

  it("leaves the surrounding transaction free to continue after the skipped debit", async () => {
    const tenantId = await createTenant(db, "Sin saldo pero sigue");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const brandName = await withTenant(db, tenantId, async (tx) => {
      await recordAssistantUsage(tx, tenantId, { purpose: "chat.answer", usage: usage(), costUsd: 0.001 });
      const [row] = await tx
        .insert(brands)
        .values({ tenantId, name: "Sigue funcionando", sourceUrl: "https://x.example" })
        .returning();
      return row.name;
    });
    expect(brandName).toBe("Sigue funcionando");
  });
});

describe("recordAssistantUsage: funded tenant", () => {
  it("records the debit and moves the balance when there is enough credit", async () => {
    const tenantId = await createTenant(db, "Con saldo");
    await withTenant(db, tenantId, (tx) =>
      tx.insert(creditLedger).values({ tenantId, kind: "grant_monthly", amount: 1000 }),
    );
    const result = await withTenant(db, tenantId, (tx) =>
      recordAssistantUsage(tx, tenantId, { purpose: "chat.answer", usage: usage(), costUsd: 0.001 }),
    );
    expect(result).toEqual({ recorded: true, costUsd: 0.001, amount: -10 });
    expect(await balanceOf(tenantId)).toBe(990);
    const rows = await withTenant(db, tenantId, (tx) => tx.select().from(creditLedger).where(eq(creditLedger.kind, "debit")));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenantId, kind: "debit", amount: -10, refType: "assistant_message" });
  });

  it("debits at least one credit even for a near-zero cost", async () => {
    const tenantId = await createTenant(db, "Centavos");
    await withTenant(db, tenantId, (tx) => tx.insert(creditLedger).values({ tenantId, kind: "grant_monthly", amount: 10 }));
    const result = await withTenant(db, tenantId, (tx) =>
      recordAssistantUsage(tx, tenantId, { purpose: "chat.answer", usage: usage(), costUsd: 0.0000001 }),
    );
    expect(result.amount).toBe(-1);
    expect(result.recorded).toBe(true);
  });
});

describe("recordAssistantUsage: errors other than overdraft still propagate", () => {
  it("does not swallow a foreign-key violation from a tenant id that does not exist", async () => {
    const fakeTenantId = "00000000-0000-0000-0000-000000000000";
    await expect(
      withTenant(db, fakeTenantId, (tx) =>
        recordAssistantUsage(tx, fakeTenantId, { purpose: "chat.answer", usage: usage(), costUsd: 0.001 }),
      ),
    ).rejects.toThrow();
  });
});

describe("CREDIT_USD", () => {
  it("is the provisional $0.0001-per-credit rate recorded in docs/decisions.md", () => {
    expect(CREDIT_USD).toBe(0.0001);
  });
});
