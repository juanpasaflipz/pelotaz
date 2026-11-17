import React from "react";
import { FONT } from "./font";
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Caption, RED, Seg } from "./Caption";
import { Ball } from "./scenes/MessyLivingRoom";
import { SCENES } from "./scenes";
import { EASE } from "./ease";
import { buildTimeline, Storyboard } from "./timeline";

// Kit rule: the brand name is always highlighted in captions.
const segments = (text: string, brand: string): Seg[] =>
  text
    .split(new RegExp(`(${brand})`))
    .filter(Boolean)
    .map((t) => ({ text: t, brand: t === brand }));
// Kit rule: shorter captions are set larger.
const captionSize = (text: string) => (text.length <= 25 ? 84 : text.length <= 50 ? 76 : 68);

const Notification: React.FC<{ brand: string; text: string; at: number; y: number }> = ({ brand, text, at, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at) return null;
  const s = spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 200 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 40,
        top: y,
        width: 400,
        padding: "18px 22px",
        background: "#fff",
        borderRadius: 26,
        boxShadow: "0 14px 30px rgba(0,0,0,0.22)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        transform: `translateX(${(1 - s) * -460}px)`,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 27,
          background: RED,
          color: "#fff",
          fontSize: 34,
          fontWeight: 900,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        ✓
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#888" }}>{brand}</div>
        <div style={{ fontSize: 29, fontWeight: 800, color: "#141414", lineHeight: 1.15 }}>{text}</div>
      </div>
    </div>
  );
};

const BallDropEndCard: React.FC<{ brand: string; tagline: string; cta: string; start: number }> = ({
  brand,
  tagline,
  cta,
  start,
}) => {
  const frame = useCurrentFrame() - start;
  const { fps } = useVideoConfig();
  const drop = interpolate(frame, [0, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bounce,
  });
  const ballY = interpolate(drop, [0, 1], [-260, 640]);
  const squash = frame > 10 && frame < 16 ? 0.9 : 1;
  const word = spring({ frame: frame - 22, fps, config: { damping: 13 } });
  const tag = spring({ frame: frame - 34, fps, config: { damping: 15 } });
  const ctaS = spring({ frame: frame - 48, fps, config: { damping: 12 } });
  return (
    <AbsoluteFill style={{ background: RED, alignItems: "center", fontFamily: FONT }}>
      <svg width={1080} height={1920} style={{ position: "absolute" }}>
        <g transform={`translate(540 ${ballY}) scale(${1 / squash} ${squash})`}>
          <Ball cx={0} cy={0} r={150} fill="#fff" seam={RED} />
        </g>
      </svg>
      <div
        style={{
          position: "absolute",
          top: 860,
          fontSize: 190,
          fontWeight: 900,
          color: "#fff",
          letterSpacing: -6,
          transform: `scale(${0.6 + 0.4 * word})`,
          opacity: word,
        }}
      >
        {brand}
      </div>
      <div
        style={{
          position: "absolute",
          top: 1110,
          fontSize: 54,
          fontWeight: 800,
          color: "#fff",
          opacity: tag,
          transform: `translateY(${(1 - tag) * 30}px)`,
        }}
      >
        {tagline}
      </div>
      <div
        style={{
          position: "absolute",
          top: 1250,
          fontSize: 46,
          fontWeight: 900,
          color: RED,
          background: "#fff",
          padding: "22px 46px",
          borderRadius: 60,
          transform: `scale(${ctaS})`,
        }}
      >
        {cta}
      </div>
    </AbsoluteFill>
  );
};

export type StoryboardProps = { storyboard: Storyboard; durations: Record<string, number> };

// Plays any storyboard: it knows nothing about this particular ad.
export const StoryboardVideo: React.FC<StoryboardProps> = ({ storyboard: sb, durations }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tl = buildTimeline(sb, durations, fps);
  const scene = SCENES[sb.scene];
  const Scene = scene.component;

  // Camera: position and zoom come from the current beat's named anchors.
  const beat = tl.beats.find((b) => frame < b.end) ?? tl.beats[tl.beats.length - 1];
  const p = Math.min(1, Math.max(0, (frame - beat.start) / (beat.end - beat.start)));
  const eased = (EASE[beat.camera.ease ?? "linear"] ?? EASE.linear)(p);
  const camX = -(scene.anchors[beat.camera.from] + (scene.anchors[beat.camera.to] - scene.anchors[beat.camera.from]) * eased);
  const [z0, z1] = beat.camera.zoom ?? [1, 1];
  const zoom = z0 + (z1 - z0) * p;
  const shake = beat.camera.shake && frame < beat.end ? Math.sin(frame / 7) * 5 : 0;

  // Character state switches on at the beat that asks for it.
  const feetBeat = tl.beats.find((b) => b.character?.feet === "wiggle");
  const winkBeat = tl.beats.find((b) => b.character?.winkAt !== undefined);
  const revealAt = feetBeat ? feetBeat.start : Infinity;
  const winkAt = winkBeat ? winkBeat.start + (winkBeat.character!.winkAt as number) : Infinity;

  const notifications = tl.beats.flatMap((b) =>
    (b.notifications ?? []).map((text, i) => ({ text, at: b.start + (b.leadIn ?? 0) + 18 + i * 26, y: 920 + i * 150 })),
  );

  const wipeR = interpolate(frame, [tl.sceneEnd, tl.endStart], [0, 2300], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ background: "#000", ["--brand" as string]: sb.brand.color } as React.CSSProperties}>
      {frame < tl.endStart && (
        <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: `${scene.focus[0]}px ${scene.focus[1]}px` }}>
          <div style={{ position: "absolute", left: camX, top: shake }}>
            <Scene frame={frame} revealAt={revealAt} winkAt={winkAt} outfit={sb.character?.outfit} />
          </div>
        </AbsoluteFill>
      )}

      {tl.captions.map((c) => (
        <Caption key={c.from} segs={segments(c.text, sb.brand.name)} from={c.from} to={c.to} size={captionSize(c.text)} />
      ))}
      {frame < tl.sceneEnd &&
        notifications.map((n) => <Notification key={n.text} brand={sb.brand.name} text={n.text} at={n.at} y={n.y} />)}

      {frame >= tl.sceneEnd && frame < tl.endStart && (
        <svg width={1080} height={1920} style={{ position: "absolute" }}>
          <circle cx={scene.focus[0]} cy={scene.focus[1]} r={wipeR} fill={RED} />
        </svg>
      )}
      {frame >= tl.endStart && (
        <BallDropEndCard brand={sb.brand.name} tagline={sb.endCard.tagline} cta={sb.endCard.cta} start={tl.endStart} />
      )}

      <Audio src={staticFile(sb.music)} volume={(f) => (f > tl.endStart ? 0.55 : 0.32)} />
      {tl.beats
        .filter((b) => b.voAt !== null)
        .map((b) => (
          <Sequence key={b.id} from={b.voAt as number}>
            <Audio src={staticFile(`vo/${sb.id}/${b.id}.wav`)} />
          </Sequence>
        ))}
      <Sequence from={tl.endStart + 11}>
        <Audio src={staticFile("boing.wav")} volume={0.6} />
      </Sequence>
      <Sequence from={tl.endVoAt}>
        <Audio src={staticFile(`vo/${sb.id}/endCard.wav`)} />
      </Sequence>
    </AbsoluteFill>
  );
};
