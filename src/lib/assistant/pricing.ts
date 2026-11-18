import type { AssistantUsage } from "./types";

interface ModelPrice {
  /** USD per 1M input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
  /** USD per 1M cached input tokens. Falls back to `inputPerM` when a model has no published cached rate. */
  cachedInputPerM?: number;
}

/**
 * DeepInfra's own listed prices, confirmed on their model pages on
 * 2026-11-17 (see docs/decisions.md for the source links). Re-check on any
 * provider or price change, the same "decide, test, decide again" spirit the
 * build doc uses for caps.
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "deepseek-ai/DeepSeek-V4.1-Flash": { inputPerM: 0.14, outputPerM: 0.42, cachedInputPerM: 0.004 },
  "zai-org/GLM-5.2": { inputPerM: 0.563, outputPerM: 1.8, cachedInputPerM: 0.105 },
  // No cached-input rate published yet for GLM-5.3; falls back to the standard input rate.
  "zai-org/GLM-5.3": { inputPerM: 0.563, outputPerM: 2.5 },
};

export class UnknownModelPriceError extends Error {
  constructor(model: string) {
    super(`No price on record for "${model}". Add it to MODEL_PRICES before using it.`);
    this.name = "UnknownModelPriceError";
  }
}

/** Cost in USD for one call's usage. All arithmetic lives here, not in a prompt. */
export function costUsd(usage: Pick<AssistantUsage, "model" | "inputTokens" | "outputTokens">, cachedInputTokens = 0): number {
  const price = MODEL_PRICES[usage.model];
  if (!price) throw new UnknownModelPriceError(usage.model);
  const nonCachedInput = Math.max(0, (usage.inputTokens ?? 0) - cachedInputTokens);
  const cachedRate = price.cachedInputPerM ?? price.inputPerM;
  return (
    (nonCachedInput / 1_000_000) * price.inputPerM +
    (cachedInputTokens / 1_000_000) * cachedRate +
    ((usage.outputTokens ?? 0) / 1_000_000) * price.outputPerM
  );
}
