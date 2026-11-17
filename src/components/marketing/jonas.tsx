/**
 * Jonás on the couch, from the reel's living-room scene (video/src/kit,
 * PR #12): arms behind his head, feet on the table, the laptop lid covering
 * what needs covering, and the red ball doing the work. Static for now; the
 * scroll animation comes in a later pull request.
 */
const SKIN = "#E9B48C";
const SKIN_D = "#C98A63";
const LINE = "#5B3424";
const CLOTH_D = "#D8CFBF";

export type Outfit = "none" | "pyjamas";

/** `red` is the theme colour on the page; pass a literal where CSS variables do not resolve (the share image). */
export function JonasOnCouch({
  className,
  label,
  red = "var(--color-bola)",
  width,
  outfit = "none",
}: {
  className?: string;
  label: string;
  red?: string;
  /** Pixels; for the share image, where CSS sizing does not apply. */
  width?: number;
  /** "pyjamas" = the approved reel's striped pyjamas, for /empieza and anything Meta reviews. */
  outfit?: Outfit;
}) {
  const RED = red;
  const pj = outfit === "pyjamas";
  const cloth = pj ? "url(#jonas-pyjama)" : SKIN;
  const clothEdge = pj ? CLOTH_D : SKIN_D;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="1920 600 1080 1040"
      width={width}
      height={width ? Math.round((width * 1040) / 1080) : undefined}
      className={className}
      role="img"
      aria-label={label}
    >
      {pj && (
        <defs>
          <pattern id="jonas-pyjama" width={30} height={30} patternUnits="userSpaceOnUse">
            <rect width={30} height={30} fill="#FBF7EF" />
            <rect width={10} height={30} fill={RED} />
          </pattern>
        </defs>
      )}
      {/* couch */}
      <rect x={1980} y={830} width={960} height={360} rx={60} fill="#4F6F8F" />
      <rect x={1955} y={1000} width={150} height={330} rx={50} fill="#5A7C9D" />
      <rect x={2815} y={1000} width={150} height={330} rx={50} fill="#5A7C9D" />
      <rect x={2080} y={1140} width={760} height={130} rx={30} fill="#5E80A2" />
      <rect x={1990} y={1270} width={940} height={66} rx={14} fill="#425E7B" />
      <rect x={2105} y={950} width={170} height={170} rx={34} fill="#E8B34A" transform="rotate(-12 2190 1035)" />

      {/* arms behind head */}
      {["M 2350 910 L 2262 725 L 2400 705", "M 2570 910 L 2658 725 L 2520 705"].map((d) => (
        <g key={d}>
          <path d={d} stroke={clothEdge} strokeWidth={70} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} stroke={cloth} strokeWidth={60} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
      {/* torso */}
      <path
        d="M 2330 892 Q 2460 862 2590 892 L 2582 1010 Q 2590 1110 2560 1180 L 2360 1180 Q 2330 1110 2338 1010 Z"
        fill={cloth}
        stroke={clothEdge}
        strokeWidth={5}
      />
      {pj ? (
        <>
          <path d="M 2422 876 L 2460 948 L 2498 876 Z" fill={SKIN} />
          <path
            d="M 2408 874 L 2460 956 L 2512 874"
            stroke={CLOTH_D}
            strokeWidth={10}
            fill="none"
            strokeLinejoin="round"
          />
          <circle cx={2460} cy={970} r={8} fill="#fff" stroke={CLOTH_D} strokeWidth={3} />
        </>
      ) : (
        <>
          <path d="M 2360 1060 Q 2460 1120 2560 1060" stroke={SKIN_D} strokeWidth={4} fill="none" opacity={0.6} />
          <circle cx={2410} cy={965} r={7} fill={SKIN_D} />
          <circle cx={2510} cy={965} r={7} fill={SKIN_D} />
        </>
      )}
      {/* neck + head */}
      <rect x={2430} y={840} width={60} height={60} fill={SKIN} />
      <g transform="rotate(-6 2460 800)">
        <circle cx={2365} cy={782} r={22} fill={SKIN} stroke={SKIN_D} strokeWidth={4} />
        <circle cx={2555} cy={782} r={22} fill={SKIN} stroke={SKIN_D} strokeWidth={4} />
        <circle cx={2460} cy={770} r={96} fill={SKIN} stroke={SKIN_D} strokeWidth={5} />
        <path
          d="M 2380 800 Q 2390 870 2460 872 Q 2530 870 2540 800 Q 2500 835 2460 834 Q 2420 835 2380 800 Z"
          fill="#6B4A3A"
          opacity={0.2}
        />
        <path
          d="M 2366 760 Q 2352 668 2440 660 Q 2468 628 2512 660 Q 2572 668 2556 760 Q 2540 708 2500 712 Q 2462 696 2420 716 Q 2384 712 2366 760 Z"
          fill="#3A2A20"
        />
        <path d="M 2470 650 q 10 -30 30 -22" stroke="#3A2A20" strokeWidth={10} fill="none" strokeLinecap="round" />
        <path d="M 2405 735 q 20 -10 38 0" stroke="#3A2A20" strokeWidth={8} fill="none" strokeLinecap="round" />
        <path d="M 2477 735 q 20 -10 38 0" stroke="#3A2A20" strokeWidth={8} fill="none" strokeLinecap="round" />
        <ellipse cx={2425} cy={768} rx={10} ry={12} fill={LINE} />
        <path d="M 2482 770 q 14 10 28 0" stroke={LINE} strokeWidth={7} fill="none" strokeLinecap="round" />
        <path d="M 2460 775 q -12 28 4 32" stroke={SKIN_D} strokeWidth={5} fill="none" strokeLinecap="round" />
        <path
          d="M 2418 818 Q 2460 858 2502 818 Q 2460 834 2418 818 Z"
          fill="#fff"
          stroke={LINE}
          strokeWidth={5}
          strokeLinejoin="round"
        />
      </g>
      {/* shins */}
      {[2405, 2485].map((x) => (
        <rect key={x} x={x} y={1225} width={58} height={95} fill={cloth} stroke={clothEdge} strokeWidth={4} />
      ))}
      {/* laptop: the lid covers what needs covering */}
      <rect x={2262} y={1228} width={396} height={20} rx={10} fill="#C7CBD1" />
      <rect x={2272} y={985} width={376} height={250} rx={20} fill="#2D2E33" />

      {/* coffee table */}
      <rect x={2140} y={1398} width={640} height={30} rx={6} fill="#8A5A3B" />
      <rect x={2165} y={1428} width={590} height={36} fill="#74492F" />
      <rect x={2180} y={1464} width={26} height={150} fill="#74492F" />
      <rect x={2714} y={1464} width={26} height={150} fill="#74492F" />
      <ellipse cx={2240} cy={1394} rx={70} ry={12} fill="#F3F3F3" />
      <path d="M 2195 1388 L 2290 1388 L 2250 1340 Z" fill="#F0C14B" />
      <circle cx={2245} cy={1372} r={8} fill="#C1432F" />
      <rect x={2660} y={1330} width={64} height={70} rx={10} fill={RED} />
      <path d="M 2724 1345 q 28 0 28 22 q 0 22 -28 22" stroke={RED} strokeWidth={10} fill="none" />

      {/* feet in socks, up on the table */}
      {[
        [2434, -1],
        [2514, 1],
      ].map(([x, dir]) => (
        <g key={x}>
          <rect x={x - 32} y={1300} width={64} height={30} fill="#fff" stroke="#D5D5D5" strokeWidth={3} />
          <rect x={x - 32} y={1306} width={64} height={7} fill={RED} />
          <rect x={x - 32} y={1318} width={64} height={7} fill={RED} />
          <ellipse cx={x + dir * 18} cy={1360} rx={58} ry={42} fill="#fff" stroke="#D5D5D5" strokeWidth={3} />
          <ellipse cx={x + dir * 52} cy={1362} rx={20} ry={28} fill={RED} />
        </g>
      ))}

      {/* the ball, at work on the laptop lid */}
      <g className="hero-ball">
        <circle cx={2460} cy={1110} r={46} fill={RED} />
        <path d="M 2416 1096 Q 2460 1122 2504 1096" stroke="#fff" strokeWidth={6} fill="none" strokeLinecap="round" />
        <circle cx={2444} cy={1090} r={9} fill="#fff" opacity={0.85} />
      </g>
    </svg>
  );
}
