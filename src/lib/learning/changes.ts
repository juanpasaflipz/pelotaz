import { z } from "zod";
import type { BrandDnaProfile } from "@/lib/brand-dna/schema";

/**
 * Profile changes the model may propose from the owner's edits. A closed set
 * of targets and three operations, applied by code: the model never rewrites
 * the profile itself, so a proposal cannot quietly change anything it does not
 * list, and every listed change is shown to the owner before it is applied.
 */

/** Lists of short items. `offer.proofPoints` needs `offerName`. */
export const LIST_TARGETS = [
  "voice.tone",
  "voice.exampleSentences",
  "voice.bannedWords",
  "audience.pains",
  "audience.buyingTriggers",
  "audience.objections",
  "rules.neverClaim",
  "rules.constraints",
  "promotions",
  "offer.proofPoints",
] as const;

/** Single text values. `offer.*` needs `offerName`. */
export const TEXT_TARGETS = ["business.summary", "offer.description", "offer.price"] as const;

/** Single values from a fixed set. */
export const CHOICE_TARGETS = {
  "voice.emojiUse": ["none", "light", "heavy"],
  "voice.sentenceLength": ["short", "medium", "long"],
  "voice.readingLevel": ["simple", "standard", "technical"],
} as const;

export const TARGETS = [...LIST_TARGETS, ...TEXT_TARGETS, ...(Object.keys(CHOICE_TARGETS) as Array<keyof typeof CHOICE_TARGETS>)] as const;
export type Target = (typeof TARGETS)[number];

export const profileChangeSchema = z.object({
  target: z.enum(TARGETS as unknown as [Target, ...Target[]]),
  op: z
    .enum(["add", "remove", "replace"])
    .describe("add and remove only for lists. replace: swap one list item, or set a text or choice value."),
  offerName: z.string().nullable().describe("Exact offer name from the profile for offer.* targets, otherwise null."),
  oldValue: z
    .string()
    .nullable()
    .describe("For remove and for replacing a list item: the current item, copied exactly. Otherwise null."),
  newValue: z.string().nullable().describe("For add and replace: the new value. For remove: null."),
  reason: z.string().describe("Why, in one sentence, in the brand's language, for the owner."),
  evidence: z.string().describe("The owner's edit that shows it: what the draft said and what the owner wrote, briefly."),
});
export type ProfileChange = z.infer<typeof profileChangeSchema>;

export const proposalSchema = z.object({
  summary: z.string().describe("One or two sentences, in the brand's language, on what the edits show."),
  changes: z.array(profileChangeSchema),
});
export type Proposal = z.infer<typeof proposalSchema>;

export const MAX_CHANGES = 12;

type Lists = Record<(typeof LIST_TARGETS)[number], string[]>;

function listOf(profile: BrandDnaProfile, change: ProfileChange): string[] | null {
  switch (change.target) {
    case "voice.tone":
      return profile.voice.tone;
    case "voice.exampleSentences":
      return profile.voice.exampleSentences;
    case "voice.bannedWords":
      return profile.voice.bannedWords;
    case "audience.pains":
      return profile.audience.pains;
    case "audience.buyingTriggers":
      return profile.audience.buyingTriggers;
    case "audience.objections":
      return profile.audience.objections;
    case "rules.neverClaim":
      return profile.rules.neverClaim;
    case "rules.constraints":
      return profile.rules.constraints;
    case "promotions":
      return profile.promotions;
    case "offer.proofPoints":
      return offerOf(profile, change)?.proofPoints ?? null;
    default:
      return null;
  }
}

const offerOf = (profile: BrandDnaProfile, change: ProfileChange) =>
  change.offerName ? profile.offers.find((offer) => offer.name === change.offerName) : undefined;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const tidy = (value: string, max: number) => value.trim().replace(/\s+/g, " ").slice(0, max);

/**
 * Apply one change to a copy of the profile. Returns null when it no longer
 * fits (the item to remove is gone, the offer was renamed, the value is
 * already there), so a stale proposal skips instead of doing something else.
 */
export function applyChange(profile: BrandDnaProfile, change: ProfileChange): BrandDnaProfile | null {
  const next: BrandDnaProfile = structuredClone(profile);
  const newValue = change.newValue === null ? null : tidy(change.newValue, 600);

  if ((LIST_TARGETS as readonly string[]).includes(change.target)) {
    const list = listOf(next, change);
    if (!list) return null;
    const at = change.oldValue === null ? -1 : list.findIndex((item) => same(item, change.oldValue!));
    if (change.op === "add") {
      if (!newValue || list.some((item) => same(item, newValue))) return null;
      list.push(newValue);
    } else if (change.op === "remove") {
      if (at === -1) return null;
      list.splice(at, 1);
    } else {
      if (at === -1 || !newValue || same(list[at], newValue)) return null;
      list[at] = newValue;
    }
    return next;
  }

  if (change.op !== "replace" || newValue === null) return null;

  if (change.target in CHOICE_TARGETS) {
    const allowed = CHOICE_TARGETS[change.target as keyof typeof CHOICE_TARGETS] as readonly string[];
    if (!allowed.includes(newValue)) return null;
    const key = change.target.split(".")[1] as "emojiUse" | "sentenceLength" | "readingLevel";
    if (next.voice[key] === newValue) return null;
    (next.voice as Record<string, unknown>)[key] = newValue;
    return next;
  }

  if (change.target === "business.summary") {
    if (!newValue || next.business.summary === newValue) return null;
    next.business.summary = newValue;
    return next;
  }

  const offer = offerOf(next, change);
  if (!offer) return null;
  if (change.target === "offer.description") {
    if (!newValue || offer.description === newValue) return null;
    offer.description = newValue;
    return next;
  }
  if (change.target === "offer.price") {
    const price = newValue.slice(0, 40) || null;
    if (offer.price === price) return null;
    offer.price = price;
    return next;
  }
  return null;
}

/** Apply changes in order, keeping the ones that fit. */
export function applyChanges(profile: BrandDnaProfile, changes: ProfileChange[]) {
  let current = profile;
  const applied: number[] = [];
  changes.forEach((change, index) => {
    const result = applyChange(current, change);
    if (result) {
      current = result;
      applied.push(index);
    }
  });
  return { profile: current, applied };
}

/** What the change does, for showing before and after. */
export function currentValue(profile: BrandDnaProfile, change: ProfileChange): string | null {
  if (change.op !== "replace") return change.oldValue;
  if (change.target in CHOICE_TARGETS) {
    return profile.voice[change.target.split(".")[1] as "emojiUse" | "sentenceLength" | "readingLevel"];
  }
  if (change.target === "business.summary") return profile.business.summary;
  const offer = offerOf(profile, change);
  if (change.target === "offer.description") return offer?.description ?? null;
  if (change.target === "offer.price") return offer?.price ?? null;
  return change.oldValue;
}

export type { Lists };
