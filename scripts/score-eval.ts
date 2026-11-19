import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { printSummary, summarize, type EvalRun, type EvalScores } from "./eval/report";

/**
 * Walks Juan through one eval run's answers, one at a time, in a random
 * order, with the setup/model/role/escalated hidden so the 1-5
 * Spanish-naturalness score (docs/pelota-assistant.md's "Juan scores... 1 to
 * 5") can't be biased by knowing which model answered. Advice-category
 * answers get a second blind score, usefulness 1-5. Never shown during
 * scripts/eval-assistant.ts's run itself — this is the separate step.
 *
 *   npm run score:assistant                      scores the most recent run
 *   npm run score:assistant -- --run=<runId>      scores a specific run
 */

function flag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg?.slice(name.length + 3);
}

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function latestRunId(dir: string): Promise<string> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && !f.endsWith(".scores.json"));
  if (files.length === 0) throw new Error(`No eval runs found in ${dir}. Run npm run eval:assistant first.`);
  files.sort();
  return files[files.length - 1].replace(/\.json$/, "");
}

async function loadScores(file: string): Promise<EvalScores["scores"]> {
  try {
    const raw = await readFile(file, "utf8");
    return (JSON.parse(raw) as EvalScores).scores;
  } catch {
    return {};
  }
}

async function askScore(rl: ReturnType<typeof createInterface>, prompt: string): Promise<number> {
  for (;;) {
    const raw = (await rl.question(prompt)).trim();
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 5) return n;
    console.log("Escribe un número del 1 al 5.");
  }
}

async function main() {
  const dir = path.resolve("eval-runs");
  const runId = flag("run") ?? (await latestRunId(dir));
  const runFile = path.join(dir, `${runId}.json`);
  const scoresFile = path.join(dir, `${runId}.scores.json`);

  const run = JSON.parse(await readFile(runFile, "utf8")) as EvalRun;
  const scores = await loadScores(scoresFile);
  const needsScore = (answer: EvalRun["answers"][number]) => {
    const score = scores[answer.anonId];
    if (!score) return true;
    return answer.category === "advice" && score.usefulness === undefined;
  };
  const unscored = shuffled(run.answers.filter(needsScore));

  if (unscored.length === 0) {
    console.log("Every answer in this run already has a score.");
  } else {
    console.log(`Scoring ${unscored.length} of ${run.answers.length} answers (already-scored ones are skipped).`);
    console.log("Setup, model and role are hidden on purpose. Ctrl+C to stop; your scores so far are kept.\n");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      for (const [index, answer] of unscored.entries()) {
        console.log(`\n--- ${index + 1}/${unscored.length} ---`);
        for (const turn of answer.transcript) console.log(`${turn.role === "user" ? "Dueño" : "Asistente"}: ${turn.text}`);
        console.log(`Respuesta a calificar: ${answer.text}`);

        const spanish = await askScore(rl, "Qué tan natural es el español, 1-5: ");
        const usefulness =
          answer.category === "advice" ? await askScore(rl, "Qué tan útil es el consejo, 1-5: ") : undefined;
        scores[answer.anonId] = { spanish, ...(usefulness !== undefined ? { usefulness } : {}) };
        await writeFile(scoresFile, JSON.stringify({ runId, scores } satisfies EvalScores, null, 2));
      }
    } finally {
      rl.close();
    }
  }

  console.log(`\nScores saved to ${scoresFile}\n`);
  printSummary(summarize(run, { runId, scores }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
