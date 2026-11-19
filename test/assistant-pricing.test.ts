import { describe, expect, it } from "vitest";
import { costUsd, UnknownModelPriceError } from "@/lib/assistant/pricing";

describe("costUsd", () => {
  it("prices a fast-model answer from input and output tokens", () => {
    const cost = costUsd({ model: "deepseek-ai/DeepSeek-V4.1-Flash", inputTokens: 6000, outputTokens: 400 });
    // 6000/1e6 * 0.14 + 400/1e6 * 0.42
    expect(cost).toBeCloseTo(0.00084 + 0.000168, 10);
  });

  it("prices cached input tokens at the cached rate, the rest at the standard rate", () => {
    const cost = costUsd({ model: "deepseek-ai/DeepSeek-V4.1-Flash", inputTokens: 6000, outputTokens: 400 }, 1000);
    // (6000-1000)/1e6*0.14 + 1000/1e6*0.004 + 400/1e6*0.42
    expect(cost).toBeCloseTo(0.0007 + 0.000004 + 0.000168, 10);
  });

  it("falls back to the standard input rate when a model has no published cached rate", () => {
    const withCache = costUsd({ model: "zai-org/GLM-5.3", inputTokens: 1000, outputTokens: 0 }, 1000);
    const withoutCache = costUsd({ model: "zai-org/GLM-5.3", inputTokens: 1000, outputTokens: 0 }, 0);
    expect(withCache).toBeCloseTo(withoutCache, 10);
  });

  it("treats missing token counts as zero rather than throwing", () => {
    expect(costUsd({ model: "zai-org/GLM-5.2", inputTokens: null, outputTokens: null })).toBe(0);
  });

  it("refuses an unpriced model instead of silently returning zero", () => {
    expect(() => costUsd({ model: "some/unknown-model", inputTokens: 100, outputTokens: 100 })).toThrow(
      UnknownModelPriceError,
    );
  });
});
