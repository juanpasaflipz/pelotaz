import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { createProviderRegistry, generateText, Output, type LanguageModel } from "ai";
import type { Llm } from "./types";

const registry = createProviderRegistry({ anthropic, openai });

type RegistryModelId = Parameters<typeof registry.languageModel>[0];

/**
 * `Llm` backed by the AI SDK. `modelId` is "<provider>:<model>", for example
 * "anthropic:<model>" or "openai:<model>". The matching API key is read from
 * the environment by the provider package.
 */
export function createAiSdkLlm(modelId: string, model?: LanguageModel): Llm {
  const resolved = model ?? registry.languageModel(modelId as RegistryModelId);
  return {
    async generateObject({ purpose, schema, instructions, prompt }) {
      const result = await generateText({
        model: resolved,
        instructions,
        prompt,
        output: Output.object({ schema }),
      });
      return {
        object: result.output,
        usage: {
          purpose,
          model: modelId,
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
        },
      };
    },
  };
}

export class LlmNotConfiguredError extends Error {
  constructor(variable: string) {
    super(`${variable} must be "<provider>:<model>", e.g. "anthropic:<model-id>".`);
    this.name = "LlmNotConfiguredError";
  }
}

const MODEL_ID = /^(anthropic|openai):.+/;

/** The main model for this deployment: the one that writes. */
export function getLlm(): Llm {
  const modelId = process.env.LLM_MODEL;
  if (!modelId || !MODEL_ID.test(modelId)) throw new LlmNotConfiguredError("LLM_MODEL");
  return createAiSdkLlm(modelId);
}

/**
 * The model for review passes, which read much more than they write and suit
 * a smaller, cheaper model. Falls back to the main model when
 * LLM_MODEL_CRITIC is unset. A value that is set but malformed is an error,
 * not a silent fallback to the more expensive model.
 */
export function getCriticLlm(): Llm {
  const modelId = process.env.LLM_MODEL_CRITIC;
  if (!modelId) return getLlm();
  if (!MODEL_ID.test(modelId)) throw new LlmNotConfiguredError("LLM_MODEL_CRITIC");
  return createAiSdkLlm(modelId);
}
