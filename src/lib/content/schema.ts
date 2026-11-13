import { z } from "zod";

/**
 * Weekly plans and post drafts. As with Brand DNA, the schemas the model fills
 * keep every field required (nullable where unknown) and leave bounds to code,
 * because strict structured-output modes reject optional fields.
 */

export const CHANNELS = ["instagram", "facebook"] as const;
export const channelSchema = z.enum(CHANNELS);
export type Channel = z.infer<typeof channelSchema>;

/** Formats that need nothing but a caption and one photo from the site. Video comes later. */
export const FORMATS = ["post", "story"] as const;
export const formatSchema = z.enum(FORMATS);
export type Format = z.infer<typeof formatSchema>;

export const PILLARS = [
  "offer",
  "promotion",
  "product",
  "behind_the_scenes",
  "community",
  "social_proof",
  "tip",
] as const;
export const pillarSchema = z
  .enum(PILLARS)
  .describe(
    "offer: one product and why to order it. promotion: a promotion listed in the profile. product: how something is made or what is in it. behind_the_scenes: the people, kitchen or process. community: the neighbourhood or customers. social_proof: something the profile says customers value. tip: useful advice related to what the business sells.",
  );
export type Pillar = z.infer<typeof pillarSchema>;

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const daySchema = z.enum(DAYS);

export const plannedPostSchema = z.object({
  day: daySchema,
  channel: channelSchema,
  format: formatSchema,
  pillar: pillarSchema,
  topic: z.string().describe("What the post is about, in a few words, in the brand's language."),
  angle: z.string().describe("The idea that makes this post worth reading. One sentence."),
  offerName: z
    .string()
    .nullable()
    .describe("Exact name of the offer from the profile this post features, or null."),
  callToAction: z.string().describe("What the reader should do, in the brand's language."),
  imageNumber: z
    .number()
    .int()
    .nullable()
    .describe("Number of the photo from the list that this post uses, or null if none fits. Each photo at most once a week."),
  occasion: z
    .string()
    .nullable()
    .describe("Exact name of the calendar date this post is tied to, or null."),
});
export type PlannedPost = z.infer<typeof plannedPostSchema>;

export const weekPlanSchema = z.object({
  rationale: z
    .string()
    .describe("Two or three sentences, in the brand's language, on why this mix serves the goal."),
  posts: z.array(plannedPostSchema),
});
export type WeekPlan = z.infer<typeof weekPlanSchema>;

export const postDraftSchema = z.object({
  caption: z.string().describe("The post text, ready to publish, without hashtags."),
  hashtags: z.array(z.string()).describe("Zero to five hashtags without the # sign."),
});
export type PostDraft = z.infer<typeof postDraftSchema>;

export const draftCritiqueSchema = z.object({
  flags: z.array(
    z.object({
      claim: z.string().describe("The statement in the post that the profile does not support."),
      reason: z.string().describe("Why, in one sentence, in the brand's language."),
    }),
  ),
});

/** What is stored in `content_items.brief`. */
export interface PostBrief {
  /** ISO date the post is suggested for. Nothing is scheduled yet. */
  date: string;
  pillar: Pillar;
  topic: string;
  angle: string;
  offerName: string | null;
  callToAction: string;
  /** The photo chosen when the week was planned, as an asset id. */
  imageAssetId?: string | null;
  /** The calendar date the post is tied to. */
  occasion?: { name: string; date: string; endDate?: string; note: string } | null;
}

export const PLAN_LIMITS = {
  minPosts: 3,
  maxPosts: 7,
  shortText: 160,
  caption: 2_000,
  hashtags: 5,
  candidateImages: 40,
} as const;

/** A photo from the brand's own site that a post may use. */
export interface CandidateImage {
  url: string;
  alt: string | null;
}

const clamp = (value: string, max: number) => value.trim().replace(/\s+/g, " ").slice(0, max);

/**
 * Bound and tidy a model plan: at most one post per day and channel, offers
 * that exist in the profile, and the plan's own length limits.
 */
export function normalizePlan(
  plan: WeekPlan,
  offerNames: string[],
  imageCount = 0,
  occasionNames: string[] = [],
): WeekPlan {
  const occasions = new Map(occasionNames.map((name) => [name.trim().toLowerCase(), name]));
  const byName = new Map(offerNames.map((name) => [name.trim().toLowerCase(), name]));
  const seen = new Set<string>();
  const usedImages = new Set<number>();
  const posts: PlannedPost[] = [];
  for (const post of plan.posts) {
    const slot = `${post.day}:${post.channel}:${post.format}`;
    if (seen.has(slot)) continue;
    const topic = clamp(post.topic, PLAN_LIMITS.shortText);
    if (!topic) continue;
    seen.add(slot);
    // A photo that does not exist, or one already used this week, becomes no photo.
    let imageNumber = post.imageNumber;
    if (imageNumber !== null && (imageNumber < 1 || imageNumber > imageCount || usedImages.has(imageNumber))) {
      imageNumber = null;
    }
    if (imageNumber !== null) usedImages.add(imageNumber);
    posts.push({
      ...post,
      topic,
      angle: clamp(post.angle, 400),
      callToAction: clamp(post.callToAction, PLAN_LIMITS.shortText),
      // A name the profile does not have is the model inventing a product.
      offerName: post.offerName ? (byName.get(post.offerName.trim().toLowerCase()) ?? null) : null,
      imageNumber,
      // Only dates from the calendar; anything else is the model's own idea of the week.
      occasion: post.occasion ? (occasions.get(post.occasion.trim().toLowerCase()) ?? null) : null,
    });
    if (posts.length === PLAN_LIMITS.maxPosts) break;
  }
  posts.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day));
  return { rationale: clamp(plan.rationale, 600), posts };
}

/** Caption and hashtags as one publishable text, which is what the owner edits. */
export function composeCopy(draft: PostDraft): string {
  const caption = draft.caption.trim().slice(0, PLAN_LIMITS.caption);
  const tags = [
    ...new Set(
      draft.hashtags
        .map((tag) => tag.trim().replace(/^#+/, "").replace(/\s+/g, ""))
        .filter((tag) => /^[\p{L}\p{N}_]{2,40}$/u.test(tag)),
    ),
  ].slice(0, PLAN_LIMITS.hashtags);
  return tags.length ? `${caption}\n\n${tags.map((tag) => `#${tag}`).join(" ")}` : caption;
}

/** The Monday on or after `from` (UTC calendar dates), as YYYY-MM-DD. */
export function nextWeekStart(from: Date): string {
  const day = from.getUTCDay(); // 0 = Sunday
  const ahead = day === 1 ? 0 : (8 - day) % 7;
  const monday = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + ahead));
  return monday.toISOString().slice(0, 10);
}

export function dateOf(weekStart: string, day: (typeof DAYS)[number]): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + DAYS.indexOf(day));
  return start.toISOString().slice(0, 10);
}
