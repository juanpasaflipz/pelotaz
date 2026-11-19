import type { ModelMessage, ToolSet } from "ai";

/** Fast answers every chat question first; strong writes what gets published and takes escalations. */
export type AssistantRole = "fast" | "strong";

/**
 * `routed` (default) lets `chat()` use either role as asked. `fast_only` and
 * `strong_only` pin every call to one role regardless of the request, so the
 * eval and production can compare setups without code changes.
 */
export type AssistantMode = "routed" | "fast_only" | "strong_only";

export interface AssistantToolCall {
  toolName: string;
  input: unknown;
}

export interface AssistantToolResult {
  toolName: string;
  output: unknown;
}

/** Token usage for one `chat()` call. Stored next to what the call produced. */
export interface AssistantUsage {
  purpose: string;
  role: AssistantRole;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
}

export interface ChatRequest {
  /** Short label for cost accounting, e.g. "chat.answer" or "weekly_insights.critique". */
  purpose: string;
  role: AssistantRole;
  /**
   * Keep this and `tools` byte-identical between calls so the provider's
   * prompt cache applies. `chat()` does not rewrite either; that is the
   * caller's responsibility. Put the system prompt as the first message
   * (role "system") rather than a separate option, so there is exactly one
   * array to keep identical.
   */
  messages: ModelMessage[];
  tools?: ToolSet;
  /** Overrides `ASSISTANT_MAX_TOOL_STEPS` for this call. */
  maxToolSteps?: number;
  /** Overrides `ASSISTANT_MAX_TOOL_CALLS` for this call. */
  maxToolCalls?: number;
  /**
   * Forwarded as `providerOptions.openai.reasoningEffort`, which DeepInfra's
   * OpenAI-compatible endpoint serializes to the request body's top-level
   * `reasoning_effort`. Only meaningful for reasoning models (GLM-5.2); the
   * fast model ignores it. Omit to use the model's default.
   */
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
}

export interface ChatResult {
  text: string;
  toolCalls: AssistantToolCall[];
  toolResults: AssistantToolResult[];
  usage: AssistantUsage;
  latencyMs: number;
  /** Which role actually answered. Equals the request's role unless `ASSISTANT_MODE` overrode it. */
  role: AssistantRole;
}
