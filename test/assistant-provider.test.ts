import { MockLanguageModelV4 } from "ai/test";
import { APICallError, tool } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AssistantProviderUnavailableError, createAssistantProvider } from "@/lib/assistant/provider";
import { AssistantNotConfiguredError, assistantConfigFromEnv, isAssistantEnabled } from "@/lib/assistant/config";
import type { AssistantConfig } from "@/lib/assistant/config";
import type { AssistantRole } from "@/lib/assistant/types";

const BASE_CONFIG: AssistantConfig = {
  baseUrl: "https://api.deepinfra.com/v1/openai",
  apiKey: "test-key",
  modelFast: "deepseek-ai/DeepSeek-V4.1-Flash",
  modelStrong: "zai-org/GLM-5.2",
  mode: "routed",
  maxToolSteps: 4,
  timeoutMs: 1000,
};

function textResult(text: string, finishReason: "stop" | "error" = "stop", reasoningTokens?: number) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: finishReason, raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 6, cacheRead: 4, cacheWrite: undefined },
      outputTokens: { total: 20, text: 20, reasoning: reasoningTokens },
    },
    warnings: [],
  };
}

/** A model that answers from a role-keyed table and records every request it saw. */
function fakeModels(byRole: Partial<Record<AssistantRole, ReturnType<typeof textResult> | Error>>) {
  const requests: Array<{ role: AssistantRole; messages: unknown }> = [];
  const resolveModel = (role: AssistantRole) => {
    const outcome = byRole[role];
    return new MockLanguageModelV4({
      doGenerate: async (options) => {
        requests.push({ role, messages: options.prompt });
        if (outcome instanceof Error) throw outcome;
        return outcome ?? textResult("(no fixture for this role)");
      },
    });
  };
  return { resolveModel, requests };
}

describe("createAssistantProvider: role routing", () => {
  it("routed uses the request's own role", async () => {
    const { resolveModel } = fakeModels({ fast: textResult("respuesta rápida"), strong: textResult("respuesta fuerte") });
    const provider = createAssistantProvider(BASE_CONFIG, resolveModel);
    const fast = await provider.chat({ purpose: "chat.answer", role: "fast", messages: [{ role: "user", content: "hola" }] });
    const strong = await provider.chat({ purpose: "chat.answer", role: "strong", messages: [{ role: "user", content: "hola" }] });
    expect(fast.text).toBe("respuesta rápida");
    expect(fast.role).toBe("fast");
    expect(strong.text).toBe("respuesta fuerte");
    expect(strong.role).toBe("strong");
  });

  it("fast_only always answers with the fast model, regardless of the request's role", async () => {
    const { resolveModel, requests } = fakeModels({ fast: textResult("siempre rápida") });
    const provider = createAssistantProvider({ ...BASE_CONFIG, mode: "fast_only" }, resolveModel);
    const result = await provider.chat({ purpose: "chat.answer", role: "strong", messages: [{ role: "user", content: "hola" }] });
    expect(result.role).toBe("fast");
    expect(result.usage.model).toBe(BASE_CONFIG.modelFast);
    expect(requests.every((r) => r.role === "fast")).toBe(true);
  });

  it("strong_only always answers with the strong model, regardless of the request's role", async () => {
    const { resolveModel } = fakeModels({ strong: textResult("siempre fuerte") });
    const provider = createAssistantProvider({ ...BASE_CONFIG, mode: "strong_only" }, resolveModel);
    const result = await provider.chat({ purpose: "chat.answer", role: "fast", messages: [{ role: "user", content: "hola" }] });
    expect(result.role).toBe("strong");
    expect(result.usage.model).toBe(BASE_CONFIG.modelStrong);
  });
});

describe("createAssistantProvider: usage and tokens", () => {
  it("maps tokens, cached tokens, latency and purpose onto the usage record", async () => {
    const { resolveModel } = fakeModels({ fast: textResult("ok") });
    const provider = createAssistantProvider(BASE_CONFIG, resolveModel);
    const result = await provider.chat({ purpose: "chat.answer", role: "fast", messages: [{ role: "user", content: "hola" }] });
    expect(result.usage).toEqual({
      purpose: "chat.answer",
      role: "fast",
      model: BASE_CONFIG.modelFast,
      inputTokens: 10,
      outputTokens: 20,
      cachedInputTokens: 4,
      reasoningTokens: null,
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("maps reasoning tokens onto the usage record when the model reports them", async () => {
    const { resolveModel } = fakeModels({ strong: textResult("ok", "stop", 137) });
    const provider = createAssistantProvider(BASE_CONFIG, resolveModel);
    const result = await provider.chat({ purpose: "chat.answer", role: "strong", messages: [{ role: "user", content: "hola" }] });
    expect(result.usage.reasoningTokens).toBe(137);
  });

  it("forwards reasoningEffort to providerOptions.openai for the underlying call", async () => {
    const seen: unknown[] = [];
    const resolveModel = () =>
      new MockLanguageModelV4({
        doGenerate: async (options) => {
          seen.push(options.providerOptions);
          return textResult("ok");
        },
      });
    const provider = createAssistantProvider(BASE_CONFIG, resolveModel);
    await provider.chat({
      purpose: "eval.chat",
      role: "strong",
      messages: [{ role: "user", content: "hola" }],
      reasoningEffort: "none",
    });
    expect(seen).toEqual([{ openai: { reasoningEffort: "none" } }]);
  });
});

describe("createAssistantProvider: timeout and retry", () => {
  it("retries once and succeeds if the second attempt works", async () => {
    let attempts = 0;
    const resolveModel = () =>
      new MockLanguageModelV4({
        doGenerate: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("socket hang up");
          return textResult("segundo intento");
        },
      });
    const provider = createAssistantProvider(BASE_CONFIG, resolveModel);
    const result = await provider.chat({ purpose: "chat.answer", role: "fast", messages: [{ role: "user", content: "hola" }] });
    expect(result.text).toBe("segundo intento");
    expect(attempts).toBe(2);
  });

  it("gives up after one retry and throws a typed, no-fallback error", async () => {
    let attempts = 0;
    const resolveModel = () =>
      new MockLanguageModelV4({
        doGenerate: async () => {
          attempts += 1;
          throw new Error("provider is down");
        },
      });
    const provider = createAssistantProvider(BASE_CONFIG, resolveModel);
    await expect(
      provider.chat({ purpose: "chat.answer", role: "fast", messages: [{ role: "user", content: "hola" }] }),
    ).rejects.toThrow(AssistantProviderUnavailableError);
    expect(attempts).toBe(2);
  });

  it("does not let the AI SDK's own retry stack on top of chat()'s one retry", async () => {
    // A retryable APICallError (e.g. DeepInfra 429/5xx) would otherwise make
    // the AI SDK retry internally (default maxRetries: 2, so 3 attempts)
    // inside each of chat()'s own two callOnce attempts — up to 6 total.
    // maxRetries: 0 on the generateText call keeps it at exactly 2.
    let attempts = 0;
    const resolveModel = () =>
      new MockLanguageModelV4({
        doGenerate: async () => {
          attempts += 1;
          throw new APICallError({
            message: "rate limited",
            url: "https://api.deepinfra.com/v1/openai/chat/completions",
            requestBodyValues: {},
            statusCode: 429,
            isRetryable: true,
          });
        },
      });
    const provider = createAssistantProvider(BASE_CONFIG, resolveModel);
    await expect(
      provider.chat({ purpose: "chat.answer", role: "fast", messages: [{ role: "user", content: "hola" }] }),
    ).rejects.toThrow(AssistantProviderUnavailableError);
    expect(attempts).toBe(2);
  });

  it("bounds the whole call even when the underlying request ignores the abort signal", async () => {
    // Reproduces what DeepInfra calls measured in practice: a multi-step
    // tool-calling run that took 120-292 real seconds despite a 20s
    // abortSignal timeout. This mock never checks `options.abortSignal` at
    // all, the same way that slow call effectively never stopped — so the
    // only thing that can bound this test is callOnce's own Promise.race.
    const resolveModel = () =>
      new MockLanguageModelV4({
        doGenerate: () => new Promise((resolve) => setTimeout(() => resolve(textResult("tarde")), 400)),
      });
    const provider = createAssistantProvider({ ...BASE_CONFIG, timeoutMs: 30 }, resolveModel);
    const started = Date.now();
    await expect(
      provider.chat({ purpose: "chat.answer", role: "fast", messages: [{ role: "user", content: "hola" }] }),
    ).rejects.toThrow(AssistantProviderUnavailableError);
    // Two timeouts (~30ms each) should settle this well before the mock's
    // 400ms delay would have resolved it on its own.
    expect(Date.now() - started).toBeLessThan(400);
  });
});

describe("createAssistantProvider: tool calls", () => {
  it("passes tool calls and results through to the caller", async () => {
    const getBrandProfile = tool({
      description: "Brand DNA for the current brand.",
      inputSchema: z.object({}),
      execute: async () => ({ name: "La Brasa", offers: [] }),
    });

    let step = 0;
    const resolveModel = () =>
      new MockLanguageModelV4({
        doGenerate: async () => {
          step += 1;
          if (step === 1) {
            return {
              content: [{ type: "tool-call" as const, toolCallId: "call_1", toolName: "get_brand_profile", input: "{}" }],
              finishReason: { unified: "tool-calls", raw: undefined },
              usage: {
                inputTokens: { total: 8, noCache: 8, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 5, text: 5, reasoning: undefined },
              },
              warnings: [],
            };
          }
          return textResult("La Brasa vende tacos al carbón.");
        },
      });

    const provider = createAssistantProvider(BASE_CONFIG, resolveModel);
    const result = await provider.chat({
      purpose: "chat.answer",
      role: "fast",
      messages: [{ role: "user", content: "¿qué vende la marca?" }],
      tools: { get_brand_profile: getBrandProfile },
    });

    expect(result.toolCalls).toEqual([{ toolName: "get_brand_profile", input: {} }]);
    expect(result.toolResults).toEqual([{ toolName: "get_brand_profile", output: { name: "La Brasa", offers: [] } }]);
    expect(result.text).toBe("La Brasa vende tacos al carbón.");
  });
});

describe("createAssistantProvider: prompt cache contract", () => {
  it("sends the exact same messages and tools to both roles when the caller does", async () => {
    const { resolveModel, requests } = fakeModels({ fast: textResult("a"), strong: textResult("b") });
    const provider = createAssistantProvider(BASE_CONFIG, resolveModel);
    const messages = [
      { role: "system" as const, content: "Eres La Pelota." },
      { role: "user" as const, content: "hola" },
    ];
    await provider.chat({ purpose: "chat.answer", role: "fast", messages });
    await provider.chat({ purpose: "chat.answer", role: "strong", messages });
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(requests[0].messages)).toBe(JSON.stringify(requests[1].messages));
  });
});

describe("assistantConfigFromEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses to run without every required variable", () => {
    vi.stubEnv("ASSISTANT_BASE_URL", "");
    expect(() => assistantConfigFromEnv()).toThrow(AssistantNotConfiguredError);
  });

  it("refuses an unknown ASSISTANT_MODE instead of silently defaulting", () => {
    vi.stubEnv("ASSISTANT_BASE_URL", "https://api.deepinfra.com/v1/openai");
    vi.stubEnv("ASSISTANT_API_KEY", "key");
    vi.stubEnv("ASSISTANT_MODEL_FAST", "a");
    vi.stubEnv("ASSISTANT_MODEL_STRONG", "b");
    vi.stubEnv("ASSISTANT_MODE", "sometimes");
    expect(() => assistantConfigFromEnv()).toThrow(AssistantNotConfiguredError);
  });

  it("defaults to routed, 4 tool steps and a 20s timeout", () => {
    vi.stubEnv("ASSISTANT_BASE_URL", "https://api.deepinfra.com/v1/openai");
    vi.stubEnv("ASSISTANT_API_KEY", "key");
    vi.stubEnv("ASSISTANT_MODEL_FAST", "a");
    vi.stubEnv("ASSISTANT_MODEL_STRONG", "b");
    vi.stubEnv("ASSISTANT_MODE", "");
    vi.stubEnv("ASSISTANT_MAX_TOOL_STEPS", "");
    vi.stubEnv("ASSISTANT_TIMEOUT_MS", "");
    const config = assistantConfigFromEnv();
    expect(config.mode).toBe("routed");
    expect(config.maxToolSteps).toBe(4);
    expect(config.timeoutMs).toBe(20_000);
  });
});

describe("isAssistantEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off by default", () => {
    vi.stubEnv("ASSISTANT_ENABLED", "");
    expect(isAssistantEnabled("any-tenant")).toBe(false);
  });

  it("fails closed when enabled but the allowlist is empty, not open to everyone", () => {
    vi.stubEnv("ASSISTANT_ENABLED", "true");
    vi.stubEnv("ASSISTANT_TENANTS", "");
    expect(isAssistantEnabled("any-tenant")).toBe(false);
  });

  it("allows only tenants on the list once enabled", () => {
    vi.stubEnv("ASSISTANT_ENABLED", "true");
    vi.stubEnv("ASSISTANT_TENANTS", "tenant-a, tenant-b");
    expect(isAssistantEnabled("tenant-a")).toBe(true);
    expect(isAssistantEnabled("tenant-c")).toBe(false);
  });
});
