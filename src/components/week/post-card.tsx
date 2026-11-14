"use client";

import { useId, useState, useTransition } from "react";
import {
  publishNowAction,
  rewriteAction,
  saveDraftAction,
  type ItemActionResult,
} from "@/app/brands/[id]/semana/actions";
import { es } from "@/i18n/es";
import type { ReviewFlag } from "@/lib/brand-dna/schema";

const t = es.post;
const p = es.publish;

const TIMES = Array.from({ length: 31 }, (_, index) => {
  const minutes = 7 * 60 + index * 30; // 07:00 to 22:00
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

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
  publishing: {
    /** The post's channel is connected for automatic publishing. */
    connected: boolean;
    /** When it is scheduled, as the owner reads it. */
    scheduledLabel: string | null;
    /** HH:MM to preselect. */
    time: string;
    permalink: string | null;
    /** The last attempt failed with this code. */
    error: string | null;
    results: {
      day: string;
      views: number | null;
      reach: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      saves: number | null;
    } | null;
  };
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

  const [time, setTime] = useState(props.publishing.time);
  const decide = (decision: "save" | "approve" | "reject") =>
    run(() => saveDraftAction(itemId, { copy, assetId, decision, publishTime: time }));

  const image = images.find((candidate) => candidate.id === assetId) ?? null;
  const dirty = draft !== null && (copy !== draft.copy || assetId !== draft.assetId);
  const working = status === "drafting";
  const scheduled = status === "scheduled";
  const published = status === "published";
  const sending = status === "publishing";
  const approved = status === "approved" || scheduled;
  const rejected = status === "rejected";
  const { connected } = props.publishing;
  const needsPhoto = props.channel === "instagram" && assetId === null;
  const canSchedule = connected && !needsPhoto;

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
      className={`rounded-md border-2 bg-raya p-4 sm:p-5 ${approved || published ? "border-cancha" : "border-borde"} ${rejected ? "opacity-70" : ""}`}
      aria-labelledby={`${id}-title`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
          {props.dateLabel} · {t.channels[props.channel] ?? props.channel} · {t.formats[props.format] ?? props.format}
        </p>
        <p
          className={`text-sm font-semibold ${approved || published ? "text-cancha" : rejected ? "text-chapa" : "text-tinta-suave"}`}
        >
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
              disabled={pending || published || sending}
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

      {published && <Results results={props.publishing.results} />}

      {!working && !rewriting && (published || sending) && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {props.publishing.permalink && (
            <a
              href={props.publishing.permalink}
              target="_blank"
              rel="noreferrer noopener"
              className="button button-primary"
            >
              {p.view}
            </a>
          )}
          {sending && (
            <span className="flex items-center gap-2" role="status">
              <span className="ball ball-bouncing" aria-hidden /> {p.publishing}
            </span>
          )}
          <button type="button" className="button button-quiet" onClick={copyText}>
            {copied ? t.copied : t.copyText}
          </button>
        </div>
      )}

      {!working && !rewriting && !published && !sending && (
        <>
          {scheduled && props.publishing.scheduledLabel && (
            <p className="mt-4 font-semibold text-cancha">{p.scheduled(props.publishing.scheduledLabel)}</p>
          )}
          {status === "approved" && !canSchedule && (
            <p className="mt-4 text-sm text-tinta-suave">{connected && needsPhoto ? p.needsPhoto : p.manual}</p>
          )}
          {status === "approved" && props.publishing.error && (
            <p className="mt-2 text-sm font-medium text-chapa" role="alert">
              {p.errors[props.publishing.error] ?? p.errors.default}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {draft && canSchedule && (!approved || dirty || status === "approved") && (
              <label className="flex items-center gap-2 text-sm">
                {p.at}
                <select className="field w-auto py-2" value={time} onChange={(event) => setTime(event.target.value)}>
                  {TIMES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft && (!approved || (status === "approved" && canSchedule)) && (
              <button type="button" className="button button-primary" disabled={pending} onClick={() => decide("approve")}>
                {t.approve}
              </button>
            )}
            {draft && approved && dirty && (
              <button type="button" className="button button-primary" disabled={pending} onClick={() => decide("approve")}>
                {t.save}
              </button>
            )}
            {scheduled && !dirty && (
              <button
                type="button"
                className="button button-primary"
                disabled={pending}
                onClick={() => run(async () => ((await publishNowAction(itemId)).ok ? { ok: true } : { ok: false, error: "not_editable" }))}
              >
                {p.now}
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
            {!scheduled && (
              <button type="button" className="button button-quiet" disabled={pending} onClick={() => setRewriting(true)}>
                {t.rewrite}
              </button>
            )}
            {scheduled ? (
              <button type="button" className="button button-quiet" disabled={pending} onClick={() => decide("save")}>
                {p.unschedule}
              </button>
            ) : approved || rejected ? (
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
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-chapa">
          {error}
        </p>
      )}
    </article>
  );
}

const number = new Intl.NumberFormat("es-MX");

function Results({ results }: { results: PostCardProps["publishing"]["results"] }) {
  const r = p.results;
  if (!results) return <p className="mt-4 text-sm text-tinta-suave">{r.pending}</p>;
  const cells = (
    [
      ["views", r.views],
      ["reach", r.reach],
      ["likes", r.likes],
      ["comments", r.comments],
      ["shares", r.shares],
      ["saves", r.saves],
    ] as const
  ).filter(([key]) => results[key] !== null);
  return (
    <section className="mt-4" aria-label={r.title}>
      <p className="text-sm font-semibold">
        {r.title} <span className="font-normal text-tinta-suave">{r.asOf(results.day)}</span>
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {cells.map(([key, label]) => (
          <div key={key} className="rounded border border-borde bg-white/60 px-3 py-2">
            <dt className="text-xs text-tinta-suave">{label}</dt>
            <dd className="display text-2xl tabular-nums">{number.format(results[key]!)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
