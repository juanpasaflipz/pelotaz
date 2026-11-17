"use client";

import { Player } from "@remotion/player";
import { useMemo } from "react";
import { StoryboardVideo } from "../../../../video/src/kit/Storyboard";
import { buildTimeline } from "../../../../video/src/kit/timeline";
import { demoStoryboard, REEL_FPS, REEL_HEIGHT, REEL_WIDTH, reelDurations } from "./story";

/**
 * The video kit itself, running in the browser: the same drawing, camera and
 * timing as the approved reel, with the visitor's name and colour. Loaded
 * only when the demo comes into view (reel-demo.tsx).
 */
export default function ReelPlayer({ name, color }: { name: string; color: string }) {
  const storyboard = useMemo(() => demoStoryboard(name, color), [name, color]);
  const total = useMemo(() => buildTimeline(storyboard, reelDurations, REEL_FPS).total, [storyboard]);
  return (
    <Player
      component={StoryboardVideo}
      inputProps={{ storyboard, durations: reelDurations, silent: true }}
      durationInFrames={total}
      fps={REEL_FPS}
      compositionWidth={REEL_WIDTH}
      compositionHeight={REEL_HEIGHT}
      style={{ width: "100%", aspectRatio: "9 / 16", borderRadius: "1rem", overflow: "hidden" }}
      controls
      loop
      autoPlay
      initiallyMuted
      acknowledgeRemotionLicense
    />
  );
}
