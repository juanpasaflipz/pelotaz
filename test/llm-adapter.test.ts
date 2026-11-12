import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { critiqueSchema } from "@/lib/brand-dna/schema";
import { createAiSdkLlm, getLlm, LlmNotConfiguredError } from "@/lib/llm/ai-sdk";

/** The adapter is exercised through the AI SDK's own mock model, so the SDK's request building and output parsing are real. */
function mockModel(text: string) {
  const requests: unknown[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      requests.push(options);
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  return { model, requests };
}

const request = {
  purpose: "brand_dna.critique",
  schema: critiqueSchema,
  instructions: "Audit the profile.",
  prompt: "Profile and pages go here.",
};

describe("AI SDK adapter", () => {
  it("returns the parsed object and token usage", async () => {
    const { model } = mockModel(
      JSON.stringify({ flags: [{ field: "offers.0.price", claim: "$99", reason: "not on the page" }] }),
    );
    const result = await createAiSdkLlm("anthropic:test-model", model).generateObject(request);
    expect(result.object.flags[0].field).toBe("offers.0.price");
    expect(result.usage).toEqual({
      purpose: "brand_dna.critique",
      model: "anthropic:test-model",
      inputTokens: 10,
      outputTokens: 20,
    });
  });

  it("sends instructions, prompt and a JSON schema to the model", async () => {
    const { model, requests } = mockModel(JSON.stringify({ flags: [] }));
    await createAiSdkLlm("anthropic:test-model", model).generateObject(request);
    const sent = JSON.stringify(requests[0]);
    expect(sent).toContain("Audit the profile.");
    expect(sent).toContain("Profile and pages go here.");
    expect(requests[0]).toMatchObject({ responseFormat: { type: "json" } });
    expect(sent).toContain('"flags"');
  });

  it("rejects output that does not match the schema", async () => {
    const { model } = mockModel(JSON.stringify({ flags: "none" }));
    await expect(
      createAiSdkLlm("anthropic:test-model", model).generateObject(request),
    ).rejects.toThrow();
  });
});

describe("getLlm", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses to run without a configured model", () => {
    vi.stubEnv("LLM_MODEL", "");
    expect(() => getLlm()).toThrow(LlmNotConfiguredError);
  });

  it("refuses a model id without a known provider prefix", () => {
    vi.stubEnv("LLM_MODEL", "some-model");
    expect(() => getLlm()).toThrow(LlmNotConfiguredError);
  });
});
