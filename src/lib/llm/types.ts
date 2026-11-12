import type { z } from "zod";

/** Token usage for one model call. Stored next to what the call produced. */
export interface LlmUsage {
  purpose: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface GenerateObjectRequest<T> {
  /** Short label for cost accounting, e.g. "brand_dna.build". */
  purpose: string;
  schema: z.ZodType<T>;
  instructions: string;
  prompt: string;
}

export interface GenerateObjectResult<T> {
  object: T;
  usage: LlmUsage;
}

/**
 * The only way application code talks to a language model. Keeping the surface
 * this small is what lets the vendor and model tier change per plan later.
 */
export interface Llm {
  generateObject<T>(request: GenerateObjectRequest<T>): Promise<GenerateObjectResult<T>>;
}
