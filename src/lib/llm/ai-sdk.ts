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
  constructor() {
    super('LLM_MODEL is not set. Use "<provider>:<model>", e.g. "anthropic:<model-id>".');
    this.name = "LlmNotConfiguredError";
  }
}

/** The model configured for this deployment. */
export function getLlm(): Llm {
  const modelId = process.env.LLM_MODEL;
  if (!modelId || !/^(anthropic|openai):.+/.test(modelId)) throw new LlmNotConfiguredError();
  return createAiSdkLlm(modelId);
}
