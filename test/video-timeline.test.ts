import { describe, expect, it } from "vitest";
import { buildTimeline, type Storyboard } from "../video/src/kit/timeline";
import storyboard from "../video/storyboards/trabaja-en-pelotaz.json";
import durations from "../video/src/generated/trabaja-en-pelotaz.durations.json";

const sb = storyboard as Storyboard;

describe("video timeline", () => {
  const tl = buildTimeline(sb, durations, 30);

  it("lays the beats end to end and ends after the end card's voice line", () => {
    expect(tl.beats.map((b) => [b.id, b.start, b.end])).toEqual([
      ["hook", 0, 145],
      ["whip", 145, 180],
      ["reveal", 180, 250],
      ["punch", 250, 362],
    ]);
    expect(tl.endStart).toBe(378);
    expect(tl.total).toBe(600);
  });

  it("starts each voice line after its lead-in and skips silent beats", () => {
    expect(tl.beats.map((b) => b.voAt)).toEqual([20, null, 186, 250]);
  });

  it("shows one caption across consecutive beats that share it", () => {
    expect(tl.captions).toHaveLength(3);
    expect(tl.captions[0]).toMatchObject({ from: 15, to: 180 });
  });

  it("stretches a beat when its voice line is longer than the minimum", () => {
    const longer = buildTimeline(sb, { ...durations, reveal: 4 }, 30);
    expect(longer.beats[2].end - longer.beats[2].start).toBe(6 + 120 + 6);
    expect(longer.total).toBe(tl.total + 62);
  });

  it("has a pronunciation entry for the brand name, so the voice does not stress the last syllable", () => {
    expect(sb.brand.pronunciation[sb.brand.name]).toBeTruthy();
  });
});
