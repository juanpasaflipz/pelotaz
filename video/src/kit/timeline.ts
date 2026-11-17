// Pure: no Remotion imports, so the app and its tests can use it too.
export type Beat = {
  id: string;
  caption?: string;
  vo?: string | null;
  camera: { from: string; to: string; ease?: string; zoom?: [number, number]; shake?: boolean };
  character?: { feet?: "wiggle"; winkAt?: number };
  notifications?: string[];
  leadIn?: number;
  frames?: number;
};
export type Storyboard = {
  id: string;
  brand: { name: string; color: string; pronunciation: Record<string, string> };
  voice: string;
  music: string;
  scene: string;
  // What the character wears. Anything headed for Facebook or paid ads needs clothes.
  character?: { outfit?: "none" | "pyjamas" };
  beats: Beat[];
  endCard: {
    id: string;
    transition: string;
    transitionFrames: number;
    tagline: string;
    cta: string;
    vo?: string;
    leadIn?: number;
    tail?: number;
  };
};
export type TimedBeat = Beat & { start: number; end: number; voAt: number | null };

// Beat lengths come from the measured voice lines, with the storyboard's
// `frames` as a minimum. Nothing here is specific to one ad.
export const buildTimeline = (sb: Storyboard, durations: Record<string, number>, fps: number) => {
  let t = 0;
  const beats: TimedBeat[] = sb.beats.map((b) => {
    const vo = durations[b.id] ? Math.ceil(durations[b.id] * fps) : 0;
    const leadIn = b.leadIn ?? 0;
    const frames = Math.max(b.frames ?? 0, vo ? leadIn + vo + 6 : 0);
    const timed = { ...b, start: t, end: t + frames, voAt: vo ? t + leadIn : null };
    t += frames;
    return timed;
  });
  const sceneEnd = t;
  const endStart = sceneEnd + sb.endCard.transitionFrames;
  const endVoAt = endStart + (sb.endCard.leadIn ?? 12);
  const endVo = durations.endCard ? Math.ceil(durations.endCard * fps) : 60;
  const total = endVoAt + endVo + (sb.endCard.tail ?? 20);

  // Consecutive beats with the same caption share one caption.
  const captions: { text: string; from: number; to: number }[] = [];
  for (const b of beats) {
    if (!b.caption) continue;
    const last = captions[captions.length - 1];
    if (last && last.text === b.caption && last.to === b.start) last.to = b.end;
    else captions.push({ text: b.caption, from: b.start + Math.max(0, (b.leadIn ?? 0) - 5), to: b.end });
  }
  return { beats, sceneEnd, endStart, endVoAt, total, captions };
};
