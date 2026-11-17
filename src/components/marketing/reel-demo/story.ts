import pijama from "../../../../video/storyboards/trabaja-en-pelotaz-pijama.json";
import durations from "../../../../video/src/generated/trabaja-en-pelotaz-pijama.durations.json";
import type { Storyboard } from "../../../../video/src/kit/timeline";
import { es } from "@/i18n/es";

export const REEL_FPS = 30;
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;
export { durations as reelDurations };

/** Colours a visitor can pick. All carry white text at a readable contrast. */
export const REEL_COLORS = ["#F40A0A", "#EA580C", "#15803D", "#1D4ED8", "#7E22CE", "#1F2937"] as const;
export const NAME_MAX = 24;

const t = es.marketing.tryIt.reel;

/**
 * The approved pyjamas reel (video/storyboards), retold for the visitor's
 * business: same scene, camera and timing, their name in the captions and
 * on the end card, their colour throughout. Silent on the page.
 */
export function demoStoryboard(rawName: string, color: string): Storyboard {
  const name = rawName.trim().slice(0, NAME_MAX) || t.placeholder;
  const base = pijama as Storyboard;
  const captions: Record<string, string> = {
    hook: t.captions.hook,
    whip: t.captions.hook,
    reveal: t.captions.reveal(name),
    punch: t.captions.punch(name),
    wink: t.captions.wink,
  };
  return {
    ...base,
    id: "demo",
    brand: { ...base.brand, name, color },
    beats: base.beats.map((beat) => ({ ...beat, caption: captions[beat.id] ?? beat.caption })),
    endCard: { ...base.endCard, tagline: t.endTagline, cta: t.endCta },
  };
}
