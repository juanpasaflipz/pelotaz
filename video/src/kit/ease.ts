import { Easing } from "remotion";

export const EASE: Record<string, (t: number) => number> = {
  linear: (t) => t,
  inOutSine: Easing.inOut(Easing.sin),
  outCubic: Easing.out(Easing.cubic),
};
