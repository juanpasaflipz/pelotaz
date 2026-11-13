"use client";

import { useState, useTransition } from "react";
import { decideProposalAction, learnAction } from "@/app/brands/[id]/semana/actions";
import { es } from "@/i18n/es";

const t = es.learning;

export interface ProposalChangeView {
  target: string;
  op: string;
  offerName: string | null;
  before: string | null;
  after: string | null;
  reason: string;
  evidence: string;
}

export interface LearningPanelProps {
  brandId: string;
  newEdits: number;
  proposal: { id: string; summary: string; changes: ProposalChangeView[] } | null;
}

const CHOICE_LABELS: Record<string, string> = {
  ...es.editor.options.emojiUse,
  ...es.editor.options.sentenceLength,
  ...es.editor.options.readingLevel,
};
const show = (value: string | null) => (value ? (CHOICE_LABELS[value] ?? value) : "");

/**
 * Turns the owner's edits into proposed profile changes, and lets them pick
 * which to apply. Shown on the week page because that is where edits happen.
 */
export function LearningPanel({ brandId, newEdits, proposal }: LearningPanelProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<Set<number>>(() => new Set(proposal?.changes.map((_, index) => index)));
  const [shownFor, setShownFor] = useState(proposal?.id ?? null);
  if ((proposal?.id ?? null) !== shownFor) {
    setShownFor(proposal?.id ?? null);
    setKept(new Set(proposal?.changes.map((_, index) => index)));
  }

  if (!proposal && newEdits === 0 && !message) return null;

  const learn = () =>
    startTransition(async () => {
      setError(null);
      const result = await learnAction(brandId);
      if (!result.ok) setError(t.errors[result.error]);
      else setMessage(result.state === "nothing_to_learn" ? t.nothing : null);
    });

  const decide = (decision: number[] | "dismiss") =>
    startTransition(async () => {
      setError(null);
      const result = await decideProposalAction(brandId, proposal!.id, decision);
      if (!result.ok) setError(t.errors[result.error]);
      else setMessage(result.state === "applied" ? t.applied(result.version, result.skipped) : t.dismissed);
    });

  const toggle = (index: number) =>
    setKept((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <section className="mt-8 rounded-md border-2 border-pelota bg-raya p-5" aria-labelledby="learning-title">
      <h2 id="learning-title" className="display text-3xl">
        {proposal ? t.proposalTitle : t.title}
      </h2>

      {!proposal && newEdits > 0 && (
        <>
          <p className="mt-2 max-w-prose">{t.lead(newEdits)}</p>
          <button type="button" className="button button-primary mt-4" disabled={pending} onClick={learn}>
            {pending ? t.running : t.run}
          </button>
          {pending && (
            <span className="ml-3 inline-flex items-center gap-2 align-middle" role="status">
              <span className="ball ball-bouncing" aria-hidden />
            </span>
          )}
        </>
      )}

      {proposal && (
        <>
          {proposal.summary && <p className="mt-2 max-w-prose">{proposal.summary}</p>}
          <p className="mt-1 text-sm text-tinta-suave">{t.proposalLead}</p>
          <ul className="mt-4 grid gap-3">
            {proposal.changes.map((change, index) => (
              <li key={index} className="rounded border border-borde bg-white/60 p-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-5 accent-cancha"
                    checked={kept.has(index)}
                    onChange={() => toggle(index)}
                    disabled={pending}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {t.ops[change.op] ?? change.op} · {change.offerName ? `${change.offerName} › ` : ""}
                      {t.targets[change.target] ?? change.target}
                    </span>
                    {change.before && (
                      <span className="mt-1 block text-sm text-tinta-suave line-through decoration-chapa">
                        {show(change.before)}
                      </span>
                    )}
                    {change.after && <span className="mt-1 block font-medium">{show(change.after)}</span>}
                    <span className="mt-2 block text-sm">{change.reason}</span>
                    <span className="mt-1 block text-xs text-tinta-suave">
                      {t.evidence}: {change.evidence}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="button button-primary"
              disabled={pending || kept.size === 0}
              onClick={() => decide([...kept])}
            >
              {t.apply(kept.size)}
            </button>
            <button type="button" className="button button-quiet" disabled={pending} onClick={() => decide("dismiss")}>
              {t.dismiss}
            </button>
          </div>
        </>
      )}

      {message && (
        <p className="mt-3 font-medium" role="status">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-chapa">
          {error}
        </p>
      )}
    </section>
  );
}
