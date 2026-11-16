import React from "react";
import { Composition } from "remotion";
import { StoryboardVideo, StoryboardProps } from "./kit/Storyboard";
import { buildTimeline, Storyboard } from "./kit/timeline";
import storyboard from "../storyboards/trabaja-en-pelotaz.json";
import durations from "./generated/trabaja-en-pelotaz.durations.json";

const FPS = 30;
const defaultProps: StoryboardProps = {
  storyboard: storyboard as Storyboard,
  durations: durations as Record<string, number>,
};

// One composition plays any storyboard. Pass another with --props.
export const Root: React.FC = () => (
  <Composition
    id="FromStoryboard"
    component={StoryboardVideo}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={buildTimeline(defaultProps.storyboard, defaultProps.durations, FPS).total}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: buildTimeline(props.storyboard, props.durations, FPS).total,
    })}
  />
);
