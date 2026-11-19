import type { AssistantRole } from "../../src/lib/assistant/types";
import type { EvalCategory } from "./questions";

export type EvalSetupName = "fast_only" | "strong_only_glm52" | "routed_glm52" | "fast_only_glm53flash";

export interface EvalSetup {
  name: EvalSetupName;
  mode: "fast_only" | "strong_only" | "routed";
  modelFast: string;
  modelStrong: string;
  /** Marks the doc's "Optional" setups, off unless --include-optional is passed. */
  optional?: boolean;
}

export const DEEPSEEK_FLASH = "deepseek-ai/DeepSeek-V4.1-Flash";
export const GLM_5_2 = "zai-org/GLM-5.2";
/**
 * Dropped from the setups below after the 2026-11-18 run: slower (several
 * 15-37s calls, some past 20s even with the timeout fix), pricier
 * ($0.563/$2.50 vs 5.2's $0.563/$1.80 per 1M), more timeouts (6/40 and
 * 3/40 in strong_only and routed respectively, vs 1/40 and 1/40 for 5.2),
 * and a custom non-MIT license — all for no measured quality gain in this
 * eval. See docs/decisions.md. Kept here, unused, for reference/provenance
 * if this is ever revisited.
 */
export const GLM_5_3 = "zai-org/GLM-5.3";
export const GLM_5_3_FLASH = "zai-org/GLM-5.3-Flash";

export const EVAL_SETUPS: EvalSetup[] = [
  { name: "fast_only", mode: "fast_only", modelFast: DEEPSEEK_FLASH, modelStrong: GLM_5_2 },
  { name: "strong_only_glm52", mode: "strong_only", modelFast: DEEPSEEK_FLASH, modelStrong: GLM_5_2 },
  { name: "routed_glm52", mode: "routed", modelFast: DEEPSEEK_FLASH, modelStrong: GLM_5_2 },
  { name: "fast_only_glm53flash", mode: "fast_only", modelFast: GLM_5_3_FLASH, modelStrong: GLM_5_2, optional: true },
];

export interface TranscriptTurn {
  role: "user" | "assistant";
  text: string;
}

export interface EvalAnswerRecord {
  /** Stable, random — scoring hides setup/model/role behind this id. */
  anonId: string;
  questionId: string;
  /** 0 for a single-turn question; 0 then 1 for a follow-up pair. */
  turnIndex: number;
  turnText: string;
  category: EvalCategory;
  setup: EvalSetupName;
  role: AssistantRole;
  escalated: boolean;
  text: string;
  toolCalls: Array<{ toolName: string; input: unknown }>;
  expectedTools: string[];
  usedExpectedTool: boolean;
  grounded: boolean;
  /** Set only for the injection question; absent everywhere else. */
  injectionResisted?: boolean;
  /** True if the reply was empty or whitespace-only. */
  blank: boolean;
  /** Set only for a question the fixture is known to answer; true means the reply wrongly claimed it has no data. */
  falseNoData?: boolean;
  /** Everything said in this conversation up to and including this turn, for showing a follow-up's context during blind scoring. */
  transcript: TranscriptTurn[];
  latencyMs: number;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens: number | null;
  costUsd: number;
}

export interface EvalRun {
  runId: string;
  createdAt: string;
  answers: EvalAnswerRecord[];
}

export interface AnswerScore {
  /** 1-5, every answer. */
  spanish: number;
  /** 1-5, advice-category answers only. */
  usefulness?: number;
}

export interface EvalScores {
  runId: string;
  /** anonId -> score */
  scores: Record<string, AnswerScore>;
}

interface SetupSummary {
  setup: EvalSetupName;
  answers: number;
  toolAccuracy: number;
  grounded: number;
  escalationRate: number | null;
  injectionResisted: string;
  avgLatencyMs: number;
  avgCostUsd: number;
  avgSpanishScore: number | null;
  avgUsefulness: number | null;
}

export function summarize(run: EvalRun, scores?: EvalScores): SetupSummary[] {
  const bySetup = new Map<EvalSetupName, EvalAnswerRecord[]>();
  for (const answer of run.answers) {
    const list = bySetup.get(answer.setup) ?? [];
    list.push(answer);
    bySetup.set(answer.setup, list);
  }

  const avg = (values: number[]) => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

  return [...bySetup.entries()].map(([setup, answers]) => {
    const escalated = answers.filter((a) => a.escalated);
    const isRouted = EVAL_SETUPS.find((s) => s.name === setup)?.mode === "routed";
    const injectionAnswers = answers.filter((a) => a.injectionResisted !== undefined);
    const spanish = scores
      ? answers.map((a) => scores.scores[a.anonId]?.spanish).filter((s): s is number => typeof s === "number")
      : [];
    const usefulness = scores
      ? answers
          .filter((a) => a.category === "advice")
          .map((a) => scores.scores[a.anonId]?.usefulness)
          .filter((s): s is number => typeof s === "number")
      : [];
    return {
      setup,
      answers: answers.length,
      toolAccuracy: avg(answers.map((a) => (a.usedExpectedTool ? 1 : 0))),
      grounded: avg(answers.map((a) => (a.grounded ? 1 : 0))),
      escalationRate: isRouted ? escalated.length / answers.length : null,
      injectionResisted:
        injectionAnswers.length === 0
          ? "—"
          : `${injectionAnswers.filter((a) => a.injectionResisted).length}/${injectionAnswers.length}`,
      avgLatencyMs: avg(answers.map((a) => a.latencyMs)),
      avgCostUsd: avg(answers.map((a) => a.costUsd)),
      avgSpanishScore: spanish.length > 0 ? avg(spanish) : null,
      avgUsefulness: usefulness.length > 0 ? avg(usefulness) : null,
    };
  });
}

export function printSummary(summaries: SetupSummary[]) {
  console.table(
    summaries.map((s) => ({
      setup: s.setup,
      answers: s.answers,
      "tool %": `${Math.round(s.toolAccuracy * 100)}%`,
      "grounded %": `${Math.round(s.grounded * 100)}%`,
      "escalation %": s.escalationRate === null ? "—" : `${Math.round(s.escalationRate * 100)}%`,
      "injection resisted": s.injectionResisted,
      "latency ms": Math.round(s.avgLatencyMs),
      "cost $": s.avgCostUsd.toFixed(5),
      "es 1-5": s.avgSpanishScore === null ? "—" : s.avgSpanishScore.toFixed(1),
      "useful 1-5": s.avgUsefulness === null ? "—" : s.avgUsefulness.toFixed(1),
    })),
  );
}
