import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, type LanguageModel, type StopCondition, type ToolSet } from "ai";
import { assistantConfigFromEnv, type AssistantConfig } from "./config";
import type { AssistantMode, AssistantRole, ChatRequest, ChatResult } from "./types";

export class AssistantProviderUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The assistant's model provider did not answer in time.");
    this.name = "AssistantProviderUnavailableError";
    this.cause = cause;
  }
}

/**
 * Which role `ASSISTANT_MODE` actually lets this request use. `fast_only`
 * and `strong_only` override the caller so the eval can compare setups by
 * env var alone; `routed` leaves the caller's choice as-is.
 */
function resolveRole(mode: AssistantMode, requested: AssistantRole): AssistantRole {
  if (mode === "fast_only") return "fast";
  if (mode === "strong_only") return "strong";
  return requested;
}

/**
 * DeepInfra's OpenAI-compatible endpoint takes the model's raw id (e.g.
 * "deepseek-ai/DeepSeek-V4.1-Flash"), unlike `LLM_MODEL`'s "<provider>:<model>"
 * registry convention in src/lib/llm/ai-sdk.ts — there is only one provider
 * behind `ASSISTANT_BASE_URL`, so there is nothing to prefix.
 */
function defaultModelFor(config: AssistantConfig, role: AssistantRole): LanguageModel {
  const openai = createOpenAI({ baseURL: config.baseUrl, apiKey: config.apiKey });
  return openai.chat(role === "fast" ? config.modelFast : config.modelStrong);
}

export interface AssistantProvider {
  /**
   * The only way application code talks to the assistant's models. Caller
   * is responsible for sending the exact same `messages` shape (system
   * prompt and tool definitions) across calls so the provider's own prompt
   * cache applies — this function does not rewrite either.
   */
  chat(request: ChatRequest): Promise<ChatResult>;
}

class CallTimedOutError extends Error {}

/**
 * `stepCountIs` alone doesn't bound the total: a single step can hold
 * several parallel tool calls, and a run was measured making 10 total tool
 * calls within a 4-step limit (see docs/decisions.md). This sums
 * `toolCalls` across every completed step and stops the loop once `limit`
 * is reached, same as `stepCountIs` but counting calls instead of steps.
 */
function toolCallCountReaches(limit: number): StopCondition<ToolSet> {
  return ({ steps }) => steps.reduce((total, step) => total + step.toolCalls.length, 0) >= limit;
}

/**
 * Bounds the whole call — every tool-calling step inside one `generateText`
 * run, not just its first request — to `config.timeoutMs`. `abortSignal`
 * alone was not enough: a run with docs/pelota-assistant.md's fixture that
 * needed several tool round-trips was measured taking 120–292 seconds
 * despite a 20s `abortSignal` timeout, so the abort is not trusted to cut
 * the underlying call off by itself. `Promise.race` guarantees this
 * function settles on time regardless of what the abort actually manages
 * to cancel; the abandoned call (and its abort, which still fires and may
 * free the connection) is left to resolve on its own in the background.
 */
async function callOnce(
  config: AssistantConfig,
  resolveModel: (role: AssistantRole) => LanguageModel,
  role: AssistantRole,
  request: ChatRequest,
) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new CallTimedOutError(`Assistant provider call exceeded ${config.timeoutMs}ms`));
    }, config.timeoutMs);
  });
  try {
    return await Promise.race([
      generateText({
        model: resolveModel(role),
        messages: request.messages,
        // The system prompt lives as the first message in `request.messages`
        // (not a separate `system` option) so there is exactly one array for
        // the caller to keep byte-identical across calls, per the doc's
        // prompt-cache contract.
        allowSystemInMessages: true,
        tools: request.tools,
        stopWhen: [
          stepCountIs(request.maxToolSteps ?? config.maxToolSteps),
          toolCallCountReaches(request.maxToolCalls ?? config.maxToolCalls),
        ],
        abortSignal: controller.signal,
        // The AI SDK's own retry (default: 2, i.e. 3 attempts) would stack
        // underneath chat()'s own single retry below, so a transient error
        // could cost far more than "one retry" and blow past timeoutMs
        // multiple times over. Disabled here so chat()'s retry is the only one.
        maxRetries: 0,
        ...(request.reasoningEffort ? { providerOptions: { openai: { reasoningEffort: request.reasoningEffort } } } : {}),
      }),
      timeout,
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Builds a provider against `config`. `resolveModel` is swappable for tests
 * (pass a function returning `ai/test`'s `MockLanguageModelV4`), the same
 * seam `createAiSdkLlm`'s optional `model` parameter gives the planner.
 */
export function createAssistantProvider(
  config: AssistantConfig,
  resolveModel: (role: AssistantRole) => LanguageModel = (role) => defaultModelFor(config, role),
): AssistantProvider {
  return {
    async chat(request) {
      const role = resolveRole(config.mode, request.role);
      const modelId = role === "fast" ? config.modelFast : config.modelStrong;
      const started = Date.now();

      let result: Awaited<ReturnType<typeof callOnce>>;
      try {
        result = await callOnce(config, resolveModel, role, request);
      } catch {
        try {
          result = await callOnce(config, resolveModel, role, request);
        } catch (secondError) {
          throw new AssistantProviderUnavailableError(secondError);
        }
      }

      return {
        text: result.text,
        toolCalls: result.toolCalls.map((call) => ({ toolName: call.toolName, input: call.input })),
        toolResults: result.toolResults.map((toolResult) => ({
          toolName: toolResult.toolName,
          output: toolResult.output,
        })),
        usage: {
          purpose: request.purpose,
          role,
          model: modelId,
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
          cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? null,
          reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens ?? null,
        },
        latencyMs: Date.now() - started,
        role,
      };
    },
  };
}

/** The provider for this deployment, configured from `ASSISTANT_*`. */
export function getAssistantProvider(): AssistantProvider {
  return createAssistantProvider(assistantConfigFromEnv());
}

export { assistantConfigFromEnv, isAssistantEnabled, AssistantNotConfiguredError } from "./config";
export type { AssistantConfig } from "./config";
