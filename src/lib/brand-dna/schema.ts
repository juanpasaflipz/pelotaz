import { z } from "zod";

/**
 * Brand DNA is the profile every later prompt reads. It has three sources:
 *
 * - `brandDnaDraftSchema`: what the model infers from the crawled text.
 * - `visual`: computed from the site's markup and CSS, never by the model.
 * - `goal`, `country`, `locale`: chosen by the user at onboarding.
 *
 * The draft schema keeps every field required (nullable where unknown) and
 * avoids length constraints, because strict structured-output modes reject
 * optional fields and some constraint keywords. Bounds are applied in code by
 * `normalizeDraft`.
 */

export const registerSchema = z
  .enum(["tu", "usted", "vos", "mixed"])
  .describe(
    "How the brand addresses its customers in Spanish. 'tu' for tú, 'usted' for formal, 'vos' for voseo, 'mixed' if the site is inconsistent or not in Spanish.",
  );

export const voiceSchema = z.object({
  tone: z
    .array(z.string())
    .describe("Three to five adjectives for the brand's tone, in the site's language."),
  register: registerSchema,
  readingLevel: z.enum(["simple", "standard", "technical"]),
  sentenceLength: z.enum(["short", "medium", "long"]),
  emojiUse: z.enum(["none", "light", "heavy"]),
  exampleSentences: z
    .array(z.string())
    .describe(
      "Three sentences quoted or closely adapted from the site that show the voice.",
    ),
  bannedWords: z
    .array(z.string())
    .describe("Words or phrases this brand would not use. Empty if nothing is evident."),
});

export const audienceSchema = z.object({
  segments: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    }),
  ),
  pains: z.array(z.string()),
  buyingTriggers: z.array(z.string()),
  objections: z.array(z.string()),
});

export const offerSchema = z.object({
  name: z.string(),
  description: z.string(),
  price: z
    .string()
    .nullable()
    .describe(
      "Price exactly as written on the site, with currency symbol. Null if the site does not state one. Never estimate.",
    ),
  proofPoints: z.array(z.string()),
});

export const rulesSchema = z.object({
  neverClaim: z
    .array(z.string())
    .describe("Claims the brand must not make, e.g. health or legal claims in its category."),
  constraints: z
    .array(z.string())
    .describe("Category or legal constraints on its marketing."),
});

export const businessSchema = z.object({
  name: z.string(),
  category: z.string().describe("What kind of business this is, in a few words."),
  summary: z.string().describe("Two or three sentences on what it sells and to whom."),
  languages: z.array(z.string()).describe("BCP 47 tags of the languages the site uses."),
});

/** What the model produces. */
export const brandDnaDraftSchema = z.object({
  business: businessSchema,
  voice: voiceSchema,
  audience: audienceSchema,
  offers: z.array(offerSchema),
  promotions: z
    .array(z.string())
    .describe("Promotions currently advertised on the site. Empty if none."),
  rules: rulesSchema,
});
export type BrandDnaDraft = z.infer<typeof brandDnaDraftSchema>;

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Usa el formato #rrggbb");

export const visualSchema = z.object({
  palette: z.array(hexColor).max(8),
  fonts: z.array(z.string().max(80)).max(6),
  logoUrl: z.url().nullable(),
  imageStyle: z.string().max(500),
  referenceImages: z.array(z.url()).max(12),
});

export const goalSchema = z.enum(["sales", "followers", "leads", "traffic"]);

/** The stored profile: model draft plus computed visuals plus user choices. */
export const brandDnaProfileSchema = brandDnaDraftSchema.extend({
  visual: visualSchema,
  goal: goalSchema,
  country: z.string().length(2),
  locale: z.string().min(2).max(12),
});
export type BrandDnaProfile = z.infer<typeof brandDnaProfileSchema>;

/** Bounds applied by `normalizeDraft` to model drafts and to edits made by a person. */
export const LIMITS = {
  listItems: 12,
  shortText: 160,
  longText: 800,
  // A restaurant menu with drinks reached 30 on the first real site.
  offers: 60,
} as const;

/** One finding from the critic model. */
export const criticFindingSchema = z.object({
  field: z
    .string()
    .describe("Dotted path of the profile field, e.g. 'offers.2.price' or 'business.summary'."),
  claim: z.string().describe("The specific statement in the profile that lacks support."),
  reason: z.string().describe("Why the crawled pages do not support it."),
});

export const critiqueSchema = z.object({
  flags: z.array(criticFindingSchema),
});

/**
 * A stored warning on a profile version.
 * - `critic`: the second model pass could not find support for a claim.
 * - `price_check`: code could not find an offer's price in the crawled text.
 * - `system`: the automatic review itself did not run.
 */
export interface ReviewFlag {
  field: string;
  claim: string;
  reason: string;
  source: "critic" | "price_check" | "system";
}

const clampText = (value: string, max: number) =>
  value.trim().replace(/\s+/g, " ").slice(0, max);

const clampList = (values: string[], max: number = LIMITS.listItems) =>
  [...new Set(values.map((v) => clampText(v, LIMITS.shortText)).filter(Boolean))].slice(0, max);

/** Trim, dedupe and bound a model draft so one bad generation cannot bloat every later prompt. */
export function normalizeDraft(draft: BrandDnaDraft): BrandDnaDraft {
  return {
    business: {
      name: clampText(draft.business.name, LIMITS.shortText),
      category: clampText(draft.business.category, LIMITS.shortText),
      summary: clampText(draft.business.summary, LIMITS.longText),
      languages: clampList(draft.business.languages, 5),
    },
    voice: {
      ...draft.voice,
      tone: clampList(draft.voice.tone, 5),
      exampleSentences: draft.voice.exampleSentences
        .map((s) => clampText(s, LIMITS.longText))
        .filter(Boolean)
        .slice(0, 5),
      bannedWords: clampList(draft.voice.bannedWords),
    },
    audience: {
      segments: draft.audience.segments
        .map((s) => ({
          name: clampText(s.name, LIMITS.shortText),
          description: clampText(s.description, LIMITS.longText),
        }))
        .filter((s) => s.name)
        .slice(0, 6),
      pains: clampList(draft.audience.pains),
      buyingTriggers: clampList(draft.audience.buyingTriggers),
      objections: clampList(draft.audience.objections),
    },
    offers: draft.offers
      .map((o) => ({
        name: clampText(o.name, LIMITS.shortText),
        description: clampText(o.description, LIMITS.longText),
        price: o.price ? clampText(o.price, 60) || null : null,
        proofPoints: clampList(o.proofPoints, 6),
      }))
      .filter((o) => o.name)
      .slice(0, LIMITS.offers),
    promotions: clampList(draft.promotions, 8),
    rules: {
      neverClaim: clampList(draft.rules.neverClaim),
      constraints: clampList(draft.rules.constraints),
    },
  };
}
