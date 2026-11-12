"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { saveProfile, type SaveProfileResult } from "@/app/actions";
import { es } from "@/i18n/es";
import type { BrandDnaProfile } from "@/lib/brand-dna/schema";
import { MARKETS } from "@/lib/markets";

const t = es.editor;
const f = t.fields;

const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      {children({ id, describedBy: hint ? hintId : undefined })}
      {hint && (
        <p id={hintId} className="mt-1 text-sm text-tinta-suave">
          {hint}
        </p>
      )}
    </div>
  );
}

function Text({
  label,
  hint,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) =>
        multiline ? (
          <textarea id={id} aria-describedby={describedBy} className="field" value={value} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input id={id} aria-describedby={describedBy} className="field" type="text" value={value} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

/** A list edited as one item per line: quick on a phone, no add/remove controls to fight. */
function Lines({
  label,
  hint = t.onePerLine,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  // Keep the raw text while typing so a trailing newline is not eaten mid-edit.
  const [draft, setDraft] = useState(value.join("\n"));
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          className="field"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(lines(e.target.value));
          }}
        />
      )}
    </Field>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <Field label={label}>
      {({ id }) => (
        <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as T)}>
          {(Object.keys(options) as T[]).map((key) => (
            <option key={key} value={key}>
              {options[key]}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-tinta pt-5">
      <h2 className="display text-3xl">{title}</h2>
      <div className="mt-5 grid gap-5">{children}</div>
    </section>
  );
}

export function DnaEditor({
  brandId,
  version,
  initial,
}: {
  brandId: string;
  version: number;
  initial: BrandDnaProfile;
}) {
  const [profile, setProfile] = useState(initial);
  const [result, setResult] = useState<SaveProfileResult | null>(null);
  const [pending, startTransition] = useTransition();

  // The server sends a new version after every save and after every re-read of
  // the site. Our own save must keep the form (and its confirmation) as it is;
  // a version that came from elsewhere replaces what is on screen.
  const [seenVersion, setSeenVersion] = useState(version);
  const [generation, setGeneration] = useState(0);
  if (version !== seenVersion) {
    setSeenVersion(version);
    const ownSave = result?.ok === true && result.version === version;
    if (!ownSave) {
      setProfile(initial);
      setResult(null);
      setGeneration((n) => n + 1);
    }
  }

  type Group = "business" | "voice" | "audience" | "rules" | "visual";
  const patch = <K extends Group>(key: K, change: Partial<BrandDnaProfile[K]>) => {
    setResult(null);
    setProfile((current) => ({ ...current, [key]: { ...current[key], ...change } }));
  };
  const set = <K extends keyof BrandDnaProfile>(key: K, value: BrandDnaProfile[K]) => {
    setResult(null);
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const offers = profile.offers;
  const setOffer = (index: number, change: Partial<BrandDnaProfile["offers"][number]>) =>
    set("offers", offers.map((offer, i) => (i === index ? { ...offer, ...change } : offer)));

  const segments = profile.audience.segments;
  const setSegment = (index: number, change: Partial<(typeof segments)[number]>) =>
    patch("audience", {
      segments: segments.map((segment, i) => (i === index ? { ...segment, ...change } : segment)),
    });

  const save = () =>
    startTransition(async () => {
      setResult(await saveProfile(brandId, profile));
    });

  return (
    <form
      // Fields keep their own draft text; a new generation discards it.
      key={generation}
      className="mt-10 grid gap-12"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <Section title={t.sections.business}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Text label={f.businessName} value={profile.business.name} onChange={(name) => patch("business", { name })} />
          <Text label={f.category} value={profile.business.category} onChange={(category) => patch("business", { category })} />
        </div>
        <Text label={f.summary} multiline value={profile.business.summary} onChange={(summary) => patch("business", { summary })} />
      </Section>

      <Section title={t.sections.voice}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Choice label={f.register} value={profile.voice.register} options={t.options.register} onChange={(register) => patch("voice", { register })} />
          <Choice label={f.readingLevel} value={profile.voice.readingLevel} options={t.options.readingLevel} onChange={(readingLevel) => patch("voice", { readingLevel })} />
          <Choice label={f.sentenceLength} value={profile.voice.sentenceLength} options={t.options.sentenceLength} onChange={(sentenceLength) => patch("voice", { sentenceLength })} />
          <Choice label={f.emojiUse} value={profile.voice.emojiUse} options={t.options.emojiUse} onChange={(emojiUse) => patch("voice", { emojiUse })} />
        </div>
        <Lines label={f.tone} value={profile.voice.tone} onChange={(tone) => patch("voice", { tone })} />
        <Lines label={f.exampleSentences} value={profile.voice.exampleSentences} onChange={(exampleSentences) => patch("voice", { exampleSentences })} />
        <Lines label={f.bannedWords} value={profile.voice.bannedWords} onChange={(bannedWords) => patch("voice", { bannedWords })} />
      </Section>

      <Section title={t.sections.audience}>
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-sm font-semibold">{f.segments}</legend>
          {segments.map((segment, index) => (
            <div key={index} className="grid gap-3 rounded-md bg-raya p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <Text label={f.segmentName} value={segment.name} onChange={(name) => setSegment(index, { name })} />
              <Text label={f.segmentDescription} value={segment.description} onChange={(description) => setSegment(index, { description })} />
              <button type="button" className="button button-quiet" onClick={() => patch("audience", { segments: segments.filter((_, i) => i !== index) })}>
                {t.remove}
              </button>
            </div>
          ))}
          <div>
            <button type="button" className="button button-quiet" onClick={() => patch("audience", { segments: [...segments, { name: "", description: "" }] })}>
              {t.add}
            </button>
          </div>
        </fieldset>
        <Lines label={f.pains} value={profile.audience.pains} onChange={(pains) => patch("audience", { pains })} />
        <Lines label={f.buyingTriggers} value={profile.audience.buyingTriggers} onChange={(buyingTriggers) => patch("audience", { buyingTriggers })} />
        <Lines label={f.objections} value={profile.audience.objections} onChange={(objections) => patch("audience", { objections })} />
      </Section>

      <Section title={t.sections.offers}>
        {offers.map((offer, index) => (
          <div key={index} className="grid gap-3 rounded-md bg-raya p-4">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-start">
              <Text label={f.offerName} value={offer.name} onChange={(name) => setOffer(index, { name })} />
              <Text label={f.offerPrice} hint={f.offerPriceHint} value={offer.price ?? ""} onChange={(price) => setOffer(index, { price: price.trim() ? price : null })} />
              <button type="button" className="button button-quiet sm:mt-[1.65rem]" onClick={() => set("offers", offers.filter((_, i) => i !== index))}>
                {t.remove}
              </button>
            </div>
            <Text label={f.offerDescription} value={offer.description} onChange={(description) => setOffer(index, { description })} />
            <Lines label={f.offerProof} value={offer.proofPoints} onChange={(proofPoints) => setOffer(index, { proofPoints })} />
          </div>
        ))}
        <div>
          <button type="button" className="button button-quiet" onClick={() => set("offers", [...offers, { name: "", description: "", price: null, proofPoints: [] }])}>
            {t.add}
          </button>
        </div>
        <Lines label={f.promotions} value={profile.promotions} onChange={(promotions) => set("promotions", promotions)} />
      </Section>

      <Section title={t.sections.rules}>
        <Lines label={f.neverClaim} value={profile.rules.neverClaim} onChange={(neverClaim) => patch("rules", { neverClaim })} />
        <Lines label={f.constraints} value={profile.rules.constraints} onChange={(constraints) => patch("rules", { constraints })} />
      </Section>

      <Section title={t.sections.visual}>
        {profile.visual.palette.length > 0 && (
          <ul className="flex flex-wrap gap-3" aria-label={f.palette}>
            {profile.visual.palette.map((hex) => (
              <li key={hex} className="flex items-center gap-2 text-sm">
                <span className="h-9 w-9 rounded border border-borde" style={{ background: hex }} aria-hidden />
                <span>{hex}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Lines label={f.palette} hint={f.paletteHint} value={profile.visual.palette} onChange={(palette) => patch("visual", { palette })} />
          <Lines label={f.fonts} value={profile.visual.fonts} onChange={(fonts) => patch("visual", { fonts })} />
        </div>
        <Text label={f.logoUrl} value={profile.visual.logoUrl ?? ""} onChange={(logoUrl) => patch("visual", { logoUrl: logoUrl.trim() || null })} />
        <Text label={f.imageStyle} hint={f.imageStyleHint} multiline value={profile.visual.imageStyle} onChange={(imageStyle) => patch("visual", { imageStyle })} />
      </Section>

      <Section title={t.sections.market}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Choice label={f.goal} value={profile.goal} options={es.goals} onChange={(goal) => set("goal", goal)} />
          <Field label={f.country}>
            {({ id }) => (
              <select
                id={id}
                className="field"
                value={profile.country}
                onChange={(e) => {
                  const market = MARKETS.find((m) => m.country === e.target.value);
                  if (!market) return;
                  setResult(null);
                  setProfile((current) => ({ ...current, country: market.country, locale: market.locale }));
                }}
              >
                {MARKETS.map((market) => (
                  <option key={market.country} value={market.country}>
                    {market.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-5 border-t-2 border-tinta bg-cal px-5 py-4">
        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={pending} className="button button-primary">
            {pending ? t.saving : t.save}
          </button>
          <div role="status" aria-live="polite" className="min-w-0 text-sm">
            {result?.ok && <p className="font-semibold text-cancha-profunda">{t.saved(result.version)}</p>}
            {result && !result.ok && result.error === "not_found" && (
              <p className="font-semibold text-chapa">{t.notFound}</p>
            )}
            {result && !result.ok && result.error === "invalid" && (
              <div className="text-chapa">
                <p className="font-semibold">{t.invalid}</p>
                <ul className="list-disc pl-5">
                  {result.issues.slice(0, 5).map((issue) => (
                    <li key={issue.path}>
                      {issue.path}: {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
