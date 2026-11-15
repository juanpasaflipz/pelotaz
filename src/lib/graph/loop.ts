/**
 * A loop makes one unit of work correct without the owner watching:
 * produce, check, correct, repeat until the checks pass or attempts run out.
 *
 * The checks are what make it a loop. They must be able to fail: code that
 * compares the output with something known (the profile, the site, the plan's
 * own rules), never "the model says it looks good". A check returns the
 * problems it found, as short sentences the producer can act on; an empty list
 * is green.
 */

export interface LoopCheck<T> {
  /** Stable name, for logs and tests. */
  name: string;
  run: (output: T) => string[] | Promise<string[]>;
}

export interface LoopFailure {
  check: string;
  problem: string;
}

export interface LoopResult<T> {
  output: T;
  /** Problems left after the last attempt. Empty when the loop ended green. */
  failures: LoopFailure[];
  attempts: number;
  green: boolean;
}

export interface LoopOptions<T> {
  /**
   * Make one attempt. `feedback` holds the previous attempt's problems, empty
   * on the first; a producer that ignores it is not a loop.
   */
  produce: (feedback: LoopFailure[], attempt: number) => Promise<T>;
  checks: LoopCheck<T>[];
  /** Total attempts, including the first. Every attempt costs a model call. */
  maxAttempts: number;
}

export async function runCheck<T>(checks: LoopCheck<T>[], output: T): Promise<LoopFailure[]> {
  const found: LoopFailure[] = [];
  for (const check of checks) {
    for (const problem of await check.run(output)) found.push({ check: check.name, problem });
  }
  return found;
}

export async function runLoop<T>({ produce, checks, maxAttempts }: LoopOptions<T>): Promise<LoopResult<T>> {
  const limit = Math.max(1, Math.floor(maxAttempts));
  let feedback: LoopFailure[] = [];
  let attempt = 0;
  for (;;) {
    attempt += 1;
    const output = await produce(feedback, attempt);
    const failures = await runCheck(checks, output);
    if (failures.length === 0 || attempt >= limit) {
      return { output, failures, attempts: attempt, green: failures.length === 0 };
    }
    feedback = failures;
  }
}

/** Problems from a previous attempt, as lines for a prompt. */
export function describeFeedback(feedback: LoopFailure[]): string {
  return feedback.map((failure) => `- ${failure.problem}`).join("\n");
}
