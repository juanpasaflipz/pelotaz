"use client";

import { useId, useState, useTransition } from "react";
import { rewriteAction, saveDraftAction, type ItemActionResult } from "@/app/brands/[id]/semana/actions";
import { es } from "@/i18n/es";
import type { ReviewFlag } from "@/lib/brand-dna/schema";

const t = es.post;

export interface PostCardProps {
  itemId: string;
  status: string;
  channel: string;
  format: string;
  dateLabel: string;
  pillar: string;
  topic: string;
  offerName: string | null;
  occasion: string | null;
  draft: {
    version: number;
    copy: string;
    assetId: string | null;
    mine: boolean;
    flags: ReviewFlag[];
  } | null;
  images: Array<{ id: string; url: string; alt: string | null }>;
}

const flagText = (flag: ReviewFlag) => {
  const fixed = es.flags as unknown as Record<string, string>;
  return flag.source === "critic" ? flag.reason : (fixed[flag.reason] ?? flag.reason);
};

/** One planned post: its text, its photo, the checks, and the owner's decision. */
export function PostCard(props: PostCardProps) {
  const { itemId, status, draft, images } = props;
  const id = useId();
  // Keyed on the version so a new draft from the server replaces local edits.
  const [base, setBase] = useState(draft?.version ?? 0);
  const [copy, setCopy] = useState(draft?.copy ?? "");
  const [assetId, setAssetId] = useState<string | null>(draft?.assetId ?? null);
  if ((draft?.version ?? 0) !== base) {
    setBase(draft?.version ?? 0);
    setCopy(draft?.copy ?? "");
    setAssetId(draft?.assetId ?? null);
  }

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [copied, setCopied] = useState(false);

  const run = (action: () => Promise<ItemActionResult>, after?: () => void) =>
    startTransition(async () => {
      const result = await action();
      setError(result.ok ? null : (t.errors[result.error] ?? t.errors.invalid));
      if (result.ok) after?.();
    });

  const decide = (decision: "save" | "approve" | "reject") =>
    run(() => saveDraftAction(itemId, { copy, assetId, decision }));

  const image = images.find((candidate) => candidate.id === assetId) ?? null;
  const dirty = draft !== null && (copy !== draft.copy || assetId !== draft.assetId);
  const working = status === "drafting";
  const approved = status === "approved";
  const rejected = status === "rejected";

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(copy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the text is still selectable in the box.
    }
  };

  return (
    <article
      className={`rounded-md border-2 bg-raya p-4 sm:p-5 ${approved ? "border-cancha" : "border-borde"} ${rejected ? "opacity-70" : ""}`}
      aria-labelledby={`${id}-title`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
          {props.dateLabel} · {t.channels[props.channel] ?? props.channel} · {t.formats[props.format] ?? props.format}
        </p>
        <p className={`text-sm font-semibold ${approved ? "text-cancha" : rejected ? "text-chapa" : "text-tinta-suave"}`}>
          {t.status[status] ?? status}
        </p>
      </header>
      <h3 id={`${id}-title`} className="display mt-1 text-2xl">
        {props.topic}
      </h3>
      <p className="text-sm text-tinta-suave">
        {t.pillars[props.pillar] ?? props.pillar}
        {props.offerName ? ` · ${t.feature(props.offerName)}` : ""}
        {props.occasion ? ` · ${props.occasion}` : ""}
      </p>

      {working && (
        <p className="mt-4 flex items-center gap-3" role="status">
          <span className="ball ball-bouncing" aria-hidden /> {t.status.drafting}
        </p>
      )}

      {!working && !draft && <p className="mt-4 text-chapa">{t.failedBody}</p>}

      {!working && draft && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div>
            <label htmlFor={`${id}-copy`} className="text-sm font-semibold">
              {t.copy}
            </label>
            <textarea
              id={`${id}-copy`}
              className="field mt-1"
              rows={9}
              value={copy}
              onChange={(event) => setCopy(event.target.value)}
              disabled={pending}
            />
            <p className="mt-1 text-xs text-tinta-suave">{t.version(draft.version, draft.mine)}</p>
          </div>

          <div className="max-w-48 sm:max-w-none">
            <p className="text-sm font-semibold">{t.photo}</p>
            {image ? (
              <a href={image.url} target="_blank" rel="noreferrer noopener" className="mt-1 block">
                {/* Photos are on the brand's own site, on any host; next/image would need each one allow-listed. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.alt ?? ""}
                  className="aspect-square w-full rounded border border-borde object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </a>
            ) : (
              <p className="mt-1 grid aspect-square place-items-center rounded border border-dashed border-borde text-sm text-tinta-suave">
                {t.noPhoto}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-sm">
              {images.length > 0 && (
                <button type="button" className="underline underline-offset-4" onClick={() => setPicking(!picking)}>
                  {t.changePhoto}
                </button>
              )}
              {image && (
                <a href={image.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4">
                  {t.openPhoto}
                </a>
              )}
            </div>
          </div>

          {picking && (
            <fieldset className="sm:col-span-2">
              <legend className="text-sm font-semibold">{t.changePhoto}</legend>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                <label className="grid aspect-square cursor-pointer place-items-center rounded border border-dashed border-borde text-center text-xs has-[:checked]:outline has-[:checked]:outline-3 has-[:checked]:outline-cancha">
                  <input
                    type="radio"
                    name={`${id}-photo`}
                    className="sr-only"
                    checked={assetId === null}
                    onChange={() => setAssetId(null)}
                  />
                  {t.noPhoto}
                </label>
                {images.map((candidate) => (
                  <label
                    key={candidate.id}
                    className="cursor-pointer rounded has-[:checked]:outline has-[:checked]:outline-3 has-[:checked]:outline-cancha"
                  >
                    <input
                      type="radio"
                      name={`${id}-photo`}
                      className="sr-only"
                      checked={assetId === candidate.id}
                      onChange={() => setAssetId(candidate.id)}
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={candidate.url}
                      alt={candidate.alt ?? ""}
                      className="aspect-square w-full rounded border border-borde object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {!working && draft && draft.flags.length > 0 && (
        <section className="mt-4 border-l-4 border-chapa bg-chapa-fondo px-4 py-3" aria-label={t.flagsTitle}>
          <p className="font-semibold">{t.flagsTitle}</p>
          <ul className="mt-1 grid gap-1 text-sm">
            {draft.flags.map((flag, index) => (
              <li key={index}>
                {flag.claim && <span className="font-semibold">{flag.claim}: </span>}
                {flagText(flag)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!working && rewriting && (
        <div className="mt-4">
          <label htmlFor={`${id}-instruction`} className="text-sm font-semibold">
            {t.rewriteLabel}
          </label>
          <input
            id={`${id}-instruction`}
            className="field mt-1"
            value={instruction}
            maxLength={500}
            placeholder={t.rewritePlaceholder}
            onChange={(event) => setInstruction(event.target.value)}
          />
          <p className="mt-1 text-xs text-tinta-suave">{t.rewriteFresh}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="button button-primary"
              disabled={pending}
              onClick={() =>
                run(
                  () => rewriteAction(itemId, instruction),
                  () => {
                    setRewriting(false);
                    setInstruction("");
                  },
                )
              }
            >
              {t.rewriteSend}
            </button>
            <button type="button" className="button button-quiet" onClick={() => setRewriting(false)}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {!working && !rewriting && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {draft && !approved && (
            <button type="button" className="button button-primary" disabled={pending} onClick={() => decide("approve")}>
              {t.approve}
            </button>
          )}
          {draft && approved && dirty && (
            <button type="button" className="button button-primary" disabled={pending} onClick={() => decide("approve")}>
              {t.save}
            </button>
          )}
          {draft && !approved && dirty && (
            <button type="button" className="button button-quiet" disabled={pending} onClick={() => decide("save")}>
              {t.save}
            </button>
          )}
          {draft && (
            <button type="button" className="button button-quiet" onClick={copyText}>
              {copied ? t.copied : t.copyText}
            </button>
          )}
          <button type="button" className="button button-quiet" disabled={pending} onClick={() => setRewriting(true)}>
            {t.rewrite}
          </button>
          {(approved || rejected) ? (
            approved ? (
              <button type="button" className="button button-quiet" disabled={pending} onClick={() => decide("reject")}>
                {t.reject}
              </button>
            ) : (
              draft && (
                <button type="button" className="button button-quiet" disabled={pending} onClick={() => decide("save")}>
                  {t.reopen}
                </button>
              )
            )
          ) : (
            <button type="button" className="button button-quiet" disabled={pending} onClick={() => decide("reject")}>
              {t.reject}
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-chapa">
          {error}
        </p>
      )}
    </article>
  );
}
