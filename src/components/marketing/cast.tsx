import type { ReactNode } from "react";
import type { Outfit } from "./jonas";

/**
 * The other owners, one per trade, each "en pelotas" behind a prop of their
 * work: always covered, always cartoon. With outfit "pyjamas" (/empieza, the
 * page paid ads link to) everyone wears a shirt instead. Same skin, line and
 * cloth colours as Jonás (jonas.tsx) so they read as one cast.
 */
export type Trade = "taquera" | "barbero" | "florista" | "inmobiliaria" | "dentista";

const LINE = "#5B3424";
const CLOTH = "#FBF7EF";
const CLOTH_D = "#D8CFBF";

type Look = {
  skin: string;
  skinD: string;
  hair: string;
  long?: boolean;
  glasses?: boolean;
  moustache?: boolean;
};

const LOOKS: Record<Trade, Look> = {
  taquera: { skin: "#D9A27A", skinD: "#B9805C", hair: "#2B1D16", long: true },
  barbero: {
    skin: "#C98E68",
    skinD: "#A86F4C",
    hair: "#1E1A18",
    moustache: true,
  },
  florista: { skin: "#F0C29E", skinD: "#D09B76", hair: "#8A4B2A", long: true },
  inmobiliaria: {
    skin: "#E9B48C",
    skinD: "#C98A63",
    hair: "#4A3326",
    glasses: true,
  },
  dentista: {
    skin: "#B97E5A",
    skinD: "#9A6343",
    hair: "#141010",
    long: true,
    glasses: true,
  },
};

export function CastMember({
  trade,
  label,
  outfit = "none",
  className,
}: {
  trade: Trade;
  label: string;
  outfit?: Outfit;
  className?: string;
}) {
  const look = LOOKS[trade];
  const dressed = outfit === "pyjamas";
  return (
    <svg viewBox="0 0 160 160" role="img" aria-label={label} className={className}>
      <circle cx={80} cy={80} r={78} fill="var(--color-cal)" />
      {/* shoulders: bare, or a shirt on /empieza */}
      <path
        d="M 28 160 Q 30 104 80 100 Q 130 104 132 160 Z"
        fill={dressed ? CLOTH : look.skin}
        stroke={dressed ? CLOTH_D : look.skinD}
        strokeWidth={2}
      />
      {dressed && <path d="M 66 102 L 80 122 L 94 102" stroke={CLOTH_D} strokeWidth={4} fill="none" />}
      <rect x={71} y={84} width={18} height={20} fill={look.skin} />
      {look.long && <path d="M 50 56 Q 48 98 60 104 L 100 104 Q 112 98 110 56 Z" fill={look.hair} />}
      <circle cx={80} cy={62} r={27} fill={look.skin} stroke={look.skinD} strokeWidth={2} />
      <path d="M 53 58 Q 54 30 80 32 Q 106 30 107 58 Q 98 44 80 46 Q 62 44 53 58 Z" fill={look.hair} />
      <circle cx={70} cy={63} r={3} fill={LINE} />
      <circle cx={90} cy={63} r={3} fill={LINE} />
      {look.glasses && (
        <g stroke={LINE} strokeWidth={2} fill="none">
          <circle cx={70} cy={63} r={7} />
          <circle cx={90} cy={63} r={7} />
          <path d="M 77 63 h 6" />
        </g>
      )}
      {look.moustache && <path d="M 70 74 Q 80 69 90 74 Q 80 78 70 74 Z" fill={look.hair} />}
      <path d="M 71 77 Q 80 85 89 77" stroke={LINE} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      {PROPS[trade]}
    </svg>
  );
}

const PROPS: Record<Trade, ReactNode> = {
  // The trompo al pastor, pineapple on top.
  taquera: (
    <g>
      <rect x={78} y={86} width={4} height={74} fill="#8C8C8C" />
      <path d="M 54 104 L 106 104 L 98 160 L 62 160 Z" fill="#C2552D" />
      {[114, 126, 138, 150].map((y) => (
        <path
          key={y}
          d={`M ${58 + (y - 104) / 9} ${y} L ${102 - (y - 104) / 9} ${y}`}
          stroke="#9A3A1C"
          strokeWidth={3}
        />
      ))}
      <ellipse cx={80} cy={100} rx={14} ry={9} fill="#F2C14B" />
      <path d="M 72 94 l 4 -12 l 4 10 l 4 -12 l 4 14" fill="#4E9A3E" />
    </g>
  ),
  // A barber's towel, held up in front.
  barbero: (
    <g>
      <path d="M 36 104 L 124 104 L 128 160 L 32 160 Z" fill="#FFFFFF" stroke="#D5D5D5" strokeWidth={2} />
      <rect x={34} y={116} width={92} height={6} fill="var(--color-bola)" />
      <rect x={33} y={128} width={94} height={6} fill="var(--color-bola)" />
    </g>
  ),
  // A bouquet bigger than her.
  florista: (
    <g>
      <path d="M 62 160 L 80 120 L 98 160 Z" fill="#E7D8B9" />
      <path d="M 70 130 L 80 112 M 90 130 L 80 112" stroke="#4E9A3E" strokeWidth={3} />
      {[
        [56, 110, "#F28AB2"],
        [80, 100, "var(--color-bola)"],
        [104, 110, "#F2C14B"],
        [66, 124, "#B58AE6"],
        [94, 124, "#F28AB2"],
        [80, 118, "#FFFFFF"],
      ].map(([x, y, fill]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x as number} cy={y as number} r={13} fill={fill as string} />
          <circle cx={x as number} cy={y as number} r={4} fill="#F2C14B" />
        </g>
      ))}
    </g>
  ),
  // "Se vende".
  inmobiliaria: (
    <g>
      <rect x={30} y={102} width={100} height={46} rx={4} fill="#FFFFFF" stroke="var(--color-bola)" strokeWidth={4} />
      <text
        x={80}
        y={132}
        textAnchor="middle"
        fontSize={20}
        fontWeight={900}
        fill="var(--color-bola)"
        className="display"
      >
        SE VENDE
      </text>
      <rect x={76} y={148} width={8} height={12} fill="#8A5A3B" />
    </g>
  ),
  // A giant molar.
  dentista: (
    <path
      d="M 44 112 Q 44 96 62 98 Q 80 104 98 98 Q 116 96 116 112 Q 116 130 106 140 L 100 160 L 88 160 L 84 140 Q 80 134 76 140 L 72 160 L 60 160 L 54 140 Q 44 130 44 112 Z"
      fill="#FFFFFF"
      stroke="#CFCFCF"
      strokeWidth={2.5}
    />
  ),
};
