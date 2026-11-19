import { creditLedger } from "@/db/schema";
import type { TenantTx } from "@/db/tenant";
import type { AssistantUsage } from "./types";

/**
 * USD value of one credit. Provisional: nothing in the repo prices credits
 * yet (README: "Nothing spends credits yet; the mechanism is in place and
 * tested for phase 2"). Noted as a placeholder in docs/decisions.md — change
 * it there first, not just here, once credits are actually priced. Credits
 * are never shown to users or in the eval's reporting; `costUsd` stays the
 * source of truth everywhere else.
 */
export const CREDIT_USD = 0.0001;

export interface RecordAssistantUsageInput {
  purpose: string;
  usage: AssistantUsage;
  costUsd: number;
  /** The row this call paid for, once one exists (PR 2's assistant_messages). Omitted in PR 1. */
  refId?: string;
}

export interface RecordAssistantUsageResult {
  /** False when the debit was skipped for lack of balance; `costUsd`/`amount` are still the real figures. */
  recorded: boolean;
  costUsd: number;
  amount: number;
}

/** True only for the tenants.credit_balance non-negative CHECK — the one failure this function is allowed to swallow. */
function isOverdraft(error: unknown): boolean {
  for (let e: unknown = error; e instanceof Error; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: string }).code;
    if (code === "23514" || e.message.includes("tenants_credit_balance_nonnegative")) return true;
  }
  return false;
}

/**
 * One `credit_ledger` debit per assistant model call, inside the caller's
 * existing tenant transaction (see `withTenant` in src/db/tenant.ts — do the
 * model call outside, this write inside).
 *
 * Overdraft is not allowed to block an answer. Every tenant's
 * `credit_balance` is 0 today — nothing anywhere grants credits yet — so the
 * very first debit would otherwise hit the existing non-negative `CHECK` and
 * abort the whole surrounding transaction. The insert runs inside its own
 * savepoint (`tx.transaction()` nested in an existing transaction); a
 * failure on that specific check rolls back just the insert and is reported
 * back as `recorded: false` with the real cost still attached, instead of
 * thrown. Any other error (a dropped connection, a real bug) still
 * propagates — this only swallows the expected "no balance yet" case.
 *
 * Once PR 2 adds `assistant_messages`, persist cost and tokens on that row
 * directly too, so usage data never depends solely on this write succeeding.
 */
export async function recordAssistantUsage(
  tx: TenantTx,
  tenantId: string,
  input: RecordAssistantUsageInput,
): Promise<RecordAssistantUsageResult> {
  const amount = -Math.max(1, Math.ceil(input.costUsd / CREDIT_USD));
  try {
    await tx.transaction(async (savepoint) => {
      await savepoint.insert(creditLedger).values({
        tenantId,
        kind: "debit",
        amount,
        refType: "assistant_message",
        refId: input.refId,
        note: `${input.usage.role}:${input.usage.model} (${input.purpose})`,
      });
    });
    return { recorded: true, costUsd: input.costUsd, amount };
  } catch (error) {
    if (!isOverdraft(error)) throw error;
    console.warn("assistant ledger: debit skipped (no balance)", {
      tenantId,
      purpose: input.purpose,
      costUsd: input.costUsd,
    });
    return { recorded: false, costUsd: input.costUsd, amount };
  }
}
