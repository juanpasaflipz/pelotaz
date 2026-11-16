import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// Text segments; a segment marked `brand` is drawn in Pelotaz red.
export type Seg = { text: string; brand?: boolean };

export const RED = "var(--brand, #E3262B)";

export const Caption: React.FC<{ segs: Seg[]; from: number; to: number; size?: number }> = ({
  segs,
  from,
  to,
  size = 68,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < from || frame >= to) return null;
  const s = spring({ frame: frame - from, fps, config: { damping: 14, stiffness: 180 } });
  const out = interpolate(frame, [to - 6, to], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        top: 270,
        left: 70,
        right: 70,
        textAlign: "center",
        transform: `scale(${0.85 + 0.15 * s}) translateY(${(1 - s) * 30}px)`,
        opacity: Math.min(s, out),
      }}
    >
      <span
        style={{
          fontFamily: "Inter",
          fontWeight: 900,
          fontSize: size,
          lineHeight: 1.42,
          color: "#141414",
          background: "#fff",
          padding: "4px 22px",
          borderRadius: 18,
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
          boxShadow: "0 6px 0 rgba(0,0,0,0.12)",
        }}
      >
        {segs.map((sg, i) => (
          <span key={i} style={{ color: sg.brand ? RED : undefined }}>
            {sg.text}
          </span>
        ))}
      </span>
    </div>
  );
};
