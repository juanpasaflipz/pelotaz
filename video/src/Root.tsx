import React from "react";
import { Composition } from "remotion";
import { StoryboardVideo, StoryboardProps } from "./kit/Storyboard";
import { buildTimeline, Storyboard } from "./kit/timeline";
import original from "../storyboards/trabaja-en-pelotaz.json";
import originalDurations from "./generated/trabaja-en-pelotaz.durations.json";
import pijama from "../storyboards/trabaja-en-pelotaz-pijama.json";
import pijamaDurations from "./generated/trabaja-en-pelotaz-pijama.durations.json";

const FPS = 30;
// One composition per storyboard; the composition id is the storyboard id.
const BOARDS: StoryboardProps[] = [
  { storyboard: original as Storyboard, durations: originalDurations },
  { storyboard: pijama as Storyboard, durations: pijamaDurations },
];

export const Root: React.FC = () => (
  <>
    {BOARDS.map((props) => (
      <Composition
        key={props.storyboard.id}
        id={props.storyboard.id}
        component={StoryboardVideo}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={buildTimeline(props.storyboard, props.durations, FPS).total}
        defaultProps={props}
        calculateMetadata={({ props: p }) => ({
          durationInFrames: buildTimeline(p.storyboard, p.durations, FPS).total,
        })}
      />
    ))}
  </>
);
