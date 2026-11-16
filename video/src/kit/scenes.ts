import React from "react";
import { Room, WORLD_W } from "./scenes/MessyLivingRoom";

// A scene is a wide drawing plus named camera anchors. Storyboards refer to
// anchors by name, never by pixel.
export type SceneDef = {
  component: React.FC<{ frame: number; revealAt: number; winkAt: number }>;
  width: number;
  anchors: Record<string, number>; // camera x for each named spot
  focus: [number, number]; // screen point the camera pushes in on, and wipes start from
};

export const SCENES: Record<string, SceneDef> = {
  "messy-living-room": {
    component: Room,
    width: WORLD_W,
    anchors: { window: 0, notes: 1150, couch: WORLD_W - 1080 },
    focus: [540, 1110],
  },
};
