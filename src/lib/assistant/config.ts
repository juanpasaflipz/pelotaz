import type { AssistantMode } from "./types";

/**
 * Everything `chat()` needs from the environment, read once and passed in,
 * the same way `limitsFromEnv()` separates parsing from the checks in
 * `src/lib/limits.ts`.
 */
export interface AssistantConfig {
  baseUrl: string;
  apiKey: string;
  modelFast: string;
  modelStrong: string;
  mode: AssistantMode;
  /** Tool round-trips `chat()` allows before it must answer. */
  maxToolSteps: number;
  /** Milliseconds before a call is retried once, then given up on. */
  timeoutMs: number;
}

export class AssistantNotConfiguredError extends Error {
  constructor(variable: string) {
    super(`${variable} must be set for the assistant provider.`);
    this.name = "AssistantNotConfiguredError";
  }
}

const MODES: AssistantMode[] = ["routed", "fast_only", "strong_only"];

const positiveInt = (raw: string | undefined, fallback: number) => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AssistantNotConfiguredError(name);
  return value;
}

/** Reads and validates `ASSISTANT_*`. Throws on anything set but malformed, never falls back silently. */
export function assistantConfigFromEnv(): AssistantConfig {
  const mode = (process.env.ASSISTANT_MODE?.trim() || "routed") as AssistantMode;
  if (!MODES.includes(mode)) {
    throw new AssistantNotConfiguredError(`ASSISTANT_MODE (got "${mode}", expected one of ${MODES.join(", ")})`);
  }
  return {
    baseUrl: required("ASSISTANT_BASE_URL"),
    apiKey: required("ASSISTANT_API_KEY"),
    modelFast: required("ASSISTANT_MODEL_FAST"),
    modelStrong: required("ASSISTANT_MODEL_STRONG"),
    mode,
    maxToolSteps: positiveInt(process.env.ASSISTANT_MAX_TOOL_STEPS, 4),
    timeoutMs: positiveInt(process.env.ASSISTANT_TIMEOUT_MS, 20_000),
  };
}

/**
 * `ASSISTANT_ENABLED` (default off) plus a per-tenant allowlist,
 * `ASSISTANT_TENANTS`. Unlike the sign-up allowlist, an empty list here means
 * nobody, not everybody: private testing ("nothing here is reachable by the
 * public until Juan says so") must fail closed if the flag is flipped on
 * before the allowlist is set, not accidentally open to every tenant.
 */
export function isAssistantEnabled(tenantId: string): boolean {
  if (process.env.ASSISTANT_ENABLED?.trim().toLowerCase() !== "true") return false;
  const allowlist = (process.env.ASSISTANT_TENANTS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return allowlist.includes(tenantId);
}
