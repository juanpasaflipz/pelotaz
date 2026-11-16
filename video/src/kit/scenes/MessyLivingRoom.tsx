import React from "react";
import { RED } from "../Caption";

// The whole room is one wide strip; the camera pans across it.
export const WORLD_W = 3000;
export const WORLD_H = 1920;

const SKIN = "#E9B48C";
const SKIN_D = "#C98A63";
const LINE = "#5B3424";

const Ball: React.FC<{ cx: number; cy: number; r: number; fill?: string; seam?: string }> = ({
  cx,
  cy,
  r,
  fill = RED,
  seam = "#fff",
}) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill={fill} />
    <path
      d={`M ${cx - r * 0.95} ${cy - r * 0.3} Q ${cx} ${cy + r * 0.25} ${cx + r * 0.95} ${cy - r * 0.3}`}
      stroke={seam}
      strokeWidth={r * 0.12}
      fill="none"
      strokeLinecap="round"
    />
    <path
      d={`M ${cx - r * 0.35} ${cy - r * 0.93} Q ${cx - r * 0.05} ${cy} ${cx - r * 0.35} ${cy + r * 0.93}`}
      stroke={seam}
      strokeWidth={r * 0.12}
      fill="none"
      strokeLinecap="round"
    />
  </g>
);
export { Ball };

const PaperBall: React.FC<{ x: number; y: number; r?: number }> = ({ x, y, r = 26 }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill="#F4F1EA" stroke="#C9C2B4" strokeWidth={3} />
    <path
      d={`M ${x - r * 0.6} ${y - r * 0.1} l ${r * 0.4} ${r * 0.3} l ${r * 0.3} ${-r * 0.5} l ${r * 0.4} ${r * 0.4}`}
      stroke="#C9C2B4"
      strokeWidth={3}
      fill="none"
    />
  </g>
);

const Sticky: React.FC<{ x: number; y: number; rot: number; text: string; color?: string }> = ({
  x,
  y,
  rot,
  text,
  color = "#FFE36E",
}) => (
  <g transform={`translate(${x} ${y}) rotate(${rot})`}>
    <rect x={-80} y={-70} width={160} height={140} fill={color} />
    <rect x={-80} y={-70} width={160} height={22} fill="rgba(0,0,0,0.06)" />
    <text
      x={0}
      y={20}
      textAnchor="middle"
      fontFamily="Inter"
      fontWeight={700}
      fontSize={26}
      fill="#3B3B3B"
      style={{ fontStyle: "italic" }}
    >
      {text}
    </text>
  </g>
);

export const Room: React.FC<{ frame: number; revealAt: number; winkAt: number }> = ({
  frame,
  revealAt,
  winkAt,
}) => {
  const sinceReveal = Math.max(0, frame - revealAt);
  const wiggle = sinceReveal > 0 ? Math.sin(sinceReveal / 3.2) * 9 : 0;
  const headTilt = Math.sin(frame / 10) * 2.2;
  const winking = frame >= winkAt && frame < winkAt + 14;
  const steam = (i: number) => 0.35 + 0.35 * Math.sin(frame / 8 + i * 2);

  return (
    <svg width={WORLD_W} height={WORLD_H} viewBox={`0 0 ${WORLD_W} ${WORLD_H}`}>
      {/* wall */}
      <rect x={0} y={0} width={WORLD_W} height={1362} fill="#EAD9C3" />
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((i) => (
        <rect key={i} x={i * 210} y={0} width={105} height={1362} fill="rgba(255,255,255,0.12)" />
      ))}
      <ellipse cx={1480} cy={1180} rx={70} ry={40} fill="rgba(120,90,50,0.08)" />
      {/* floor */}
      <rect x={0} y={1362} width={WORLD_W} height={WORLD_H - 1362} fill="#B57E52" />
      {[1440, 1540, 1665, 1815].map((y) => (
        <line key={y} x1={0} y1={y} x2={WORLD_W} y2={y} stroke="#9C6941" strokeWidth={4} />
      ))}
      <rect x={0} y={1338} width={WORLD_W} height={26} fill="#D7C2A5" />

      {/* window with crooked blinds */}
      <g>
        <rect x={110} y={560} width={460} height={560} fill="#F7F2EA" />
        <rect x={135} y={585} width={410} height={510} fill="#A8D5F0" />
        <ellipse cx={260} cy={900} rx={80} ry={30} fill="#fff" opacity={0.9} />
        <ellipse cx={320} cy={885} rx={60} ry={28} fill="#fff" opacity={0.9} />
        {Array.from({ length: 13 }).map((_, i) => (
          <rect
            key={i}
            x={130}
            y={585 + i * 22}
            width={420}
            height={16}
            fill="#F2EDE3"
            transform={i === 9 ? `rotate(-7 340 ${585 + i * 22})` : i === 11 ? `rotate(5 340 ${585 + i * 22})` : undefined}
          />
        ))}
        <line x1={540} y1={600} x2={540} y2={960} stroke="#CFC6B6" strokeWidth={4} />
      </g>

      {/* bookshelf */}
      <g>
        <rect x={690} y={720} width={280} height={640} fill="#8B5A3C" />
        <rect x={705} y={735} width={250} height={610} fill="#6E432B" />
        {[880, 1050, 1215].map((y) => (
          <rect key={y} x={705} y={y} width={250} height={14} fill="#8B5A3C" />
        ))}
        {[
          [715, 790, 30, "#3F7CAC"],
          [748, 805, 26, "#E0B23C"],
          [777, 780, 34, "#B5473A"],
          [815, 815, 22, "#5C9E6E"],
        ].map(([x, y, w, c], i) => (
          <rect key={i} x={x as number} y={y as number} width={w as number} height={880 - (y as number)} fill={c as string} />
        ))}
        <rect x={845} y={800} width={28} height={80} fill="#7B5EA7" transform="rotate(18 845 880)" />
        {[
          [720, 960, 40, "#D97B4A"],
          [764, 975, 30, "#2F5D7C"],
        ].map(([x, y, w, c], i) => (
          <rect key={i} x={x as number} y={y as number} width={w as number} height={1050 - (y as number)} fill={c as string} />
        ))}
        <rect x={820} y={1012} width={120} height={38} fill="#C9B79C" />
        <rect x={735} y={1150} width={190} height={65} fill="#AFA08A" />
        <text x={830} y={1192} textAnchor="middle" fontFamily="Inter" fontWeight={800} fontSize={22} fill="#4A4036">
          MARKETING 101
        </text>
      </g>

      {/* trash can overflowing with paper balls (pelotas de papel) */}
      <g>
        <path d="M 1010 1250 L 1150 1250 L 1135 1420 L 1025 1420 Z" fill="#8E9AA6" />
        <rect x={1000} y={1238} width={160} height={18} rx={6} fill="#A5B0BB" />
        <PaperBall x={1045} y={1222} />
        <PaperBall x={1095} y={1215} r={28} />
        <PaperBall x={1130} y={1228} r={22} />
        <PaperBall x={980} y={1452} />
        <PaperBall x={1210} y={1470} r={22} />
        <PaperBall x={1170} y={1560} r={24} />
        <PaperBall x={930} y={1600} r={20} />
      </g>

      {/* sticky notes: the content struggle */}
      <Sticky x={1290} y={780} rot={-6} text="¿post lunes?" />
      <Sticky x={1470} y={760} rot={5} text="¿hashtags?" color="#FFB3C1" />
      <Sticky x={1380} y={950} rot={3} text="¿un reel??" color="#B6E3FF" />
      <Sticky x={1560} y={940} rot={-8} text="¡¿likes?!" />


      {/* floor lamp with boxers on the shade */}
      <g>
        <ellipse cx={1760} cy={1352} rx={70} ry={14} fill="#3A3A3A" />
        <rect x={1754} y={760} width={12} height={590} fill="#3A3A3A" />
        <path d="M 1670 780 L 1700 650 L 1820 650 L 1850 780 Z" fill="#F4E4B4" />
        <ellipse cx={1760} cy={820} rx={140} ry={60} fill="rgba(255,236,170,0.25)" />
        {/* boxers */}
        <g transform="rotate(10 1800 660)">
          <path
            d="M 1745 640 L 1850 640 L 1865 760 L 1815 768 L 1800 700 L 1785 768 L 1735 760 Z"
            fill={RED}
          />
          <rect x={1745} y={632} width={105} height={18} fill="#fff" />
          {[
            [1770, 680],
            [1830, 690],
            [1760, 735],
            [1845, 740],
            [1805, 665],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={7} fill="#fff" />
          ))}
        </g>
      </g>

      {/* drooping plant */}
      <g>
        <path d="M 1560 1355 L 1600 1240 L 1680 1240 L 1700 1355 Z" fill="#C46A3E" />
        <path d="M 1640 1240 Q 1600 1130 1560 1170" stroke="#7D8F45" strokeWidth={10} fill="none" />
        <path d="M 1640 1240 Q 1680 1150 1720 1200" stroke="#8C8A42" strokeWidth={10} fill="none" />
        <ellipse cx={1556} cy={1180} rx={26} ry={12} fill="#9C9A4A" transform="rotate(40 1556 1180)" />
        <ellipse cx={1722} cy={1210} rx={26} ry={12} fill="#A69148" transform="rotate(-50 1722 1210)" />
        <ellipse cx={1600} cy={1365} rx={18} ry={6} fill="#A69148" />
      </g>

      {/* floor clutter */}
      <g>
        {/* t-shirt */}
        <path d="M 230 1520 L 300 1490 L 360 1505 L 420 1480 L 470 1530 L 430 1560 L 420 1620 L 270 1630 L 270 1570 L 220 1560 Z" fill="#4E7FB5" />
        {/* sneakers */}
        <path d="M 560 1700 Q 560 1660 600 1660 L 640 1665 Q 700 1680 710 1710 L 560 1712 Z" fill="#F2F2F2" stroke="#BDBDBD" strokeWidth={3} />
        <rect x={556} y={1706} width={158} height={14} rx={6} fill={RED} />
        {/* pizza box */}
        <rect x={620} y={1480} width={260} height={30} fill="#D9B98B" />
        <path d="M 620 1480 L 650 1380 L 900 1380 L 880 1480 Z" fill="#E6CB9F" />
        <circle cx={760} cy={1430} r={28} fill="#C1432F" opacity={0.6} />
        <path d="M 690 1478 L 760 1462 L 740 1480 Z" fill="#F0C14B" />
        {/* soda cans */}
        <rect x={1250} y={1600} width={44} height={74} rx={8} fill="#2F8F6A" />
        <rect x={1320} y={1640} width={74} height={40} rx={8} fill="#C7362F" />
        {/* laundry pile */}
        <ellipse cx={1420} cy={1470} rx={140} ry={50} fill="#6A5D8C" />
        <ellipse cx={1370} cy={1440} rx={80} ry={40} fill="#D96D4B" />
        <ellipse cx={1470} cy={1430} rx={70} ry={34} fill="#E4D2B6" />
        {/* jeans dropped by the couch */}
        <path d="M 1760 1700 Q 1820 1640 1920 1660 L 2060 1690 L 2050 1740 L 1930 1720 L 1880 1760 L 1780 1750 Z" fill="#35558A" />
        <path d="M 1800 1700 Q 1850 1690 1900 1700" stroke="#2A4470" strokeWidth={6} fill="none" />
      </g>

      {/* couch */}
      <g>
        <rect x={1980} y={830} width={960} height={360} rx={60} fill="#4F6F8F" />
        <rect x={1955} y={1000} width={150} height={330} rx={50} fill="#5A7C9D" />
        <rect x={2815} y={1000} width={150} height={330} rx={50} fill="#5A7C9D" />
        <rect x={2080} y={1140} width={760} height={130} rx={30} fill="#5E80A2" />
        <rect x={1990} y={1270} width={940} height={66} rx={14} fill="#425E7B" />
        <rect x={2010} y={1336} width={24} height={26} fill="#2F2F2F" />
        <rect x={2886} y={1336} width={24} height={26} fill="#2F2F2F" />
        {/* throw pillow */}
        <rect x={2105} y={950} width={170} height={170} rx={34} fill="#E8B34A" transform="rotate(-12 2190 1035)" />
        {/* shirt draped over the right arm */}
        <path d="M 2830 990 L 2950 985 L 2975 1080 L 2945 1150 L 2900 1160 L 2860 1060 Z" fill="#E3E3E3" />
        <path d="M 2870 990 L 2895 1030 L 2920 988" stroke="#BDBDBD" strokeWidth={4} fill="none" />
      </g>

      {/* the guy */}
      <g>
        {/* arms behind head */}
        <path d="M 2350 910 L 2262 725 L 2400 705" stroke={SKIN_D} strokeWidth={70} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 2350 910 L 2262 725 L 2400 705" stroke={SKIN} strokeWidth={60} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 2570 910 L 2658 725 L 2520 705" stroke={SKIN_D} strokeWidth={70} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 2570 910 L 2658 725 L 2520 705" stroke={SKIN} strokeWidth={60} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* torso */}
        <path
          d="M 2330 892 Q 2460 862 2590 892 L 2582 1010 Q 2590 1110 2560 1180 L 2360 1180 Q 2330 1110 2338 1010 Z"
          fill={SKIN}
          stroke={SKIN_D}
          strokeWidth={5}
        />
        <path d="M 2360 1060 Q 2460 1120 2560 1060" stroke={SKIN_D} strokeWidth={4} fill="none" opacity={0.6} />
        <circle cx={2410} cy={965} r={7} fill={SKIN_D} />
        <circle cx={2510} cy={965} r={7} fill={SKIN_D} />
        <circle cx={2460} cy={1085} r={5} fill={SKIN_D} />
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M ${2440 + i * 9} ${985 + (i % 2) * 8} q 4 -8 8 0`}
            stroke={LINE}
            strokeWidth={3}
            fill="none"
            opacity={0.55}
          />
        ))}
        {/* neck + head */}
        <rect x={2430} y={840} width={60} height={60} fill={SKIN} />
        <g transform={`rotate(${headTilt} 2460 800)`}>
          <circle cx={2365} cy={782} r={22} fill={SKIN} stroke={SKIN_D} strokeWidth={4} />
          <circle cx={2555} cy={782} r={22} fill={SKIN} stroke={SKIN_D} strokeWidth={4} />
          <circle cx={2460} cy={770} r={96} fill={SKIN} stroke={SKIN_D} strokeWidth={5} />
          {/* stubble */}
          <path d="M 2380 800 Q 2390 870 2460 872 Q 2530 870 2540 800 Q 2500 835 2460 834 Q 2420 835 2380 800 Z" fill="#6B4A3A" opacity={0.2} />
          {/* hair */}
          <path
            d="M 2366 760 Q 2352 668 2440 660 Q 2468 628 2512 660 Q 2572 668 2556 760 Q 2540 708 2500 712 Q 2462 696 2420 716 Q 2384 712 2366 760 Z"
            fill="#3A2A20"
          />
          <path d="M 2470 650 q 10 -30 30 -22" stroke="#3A2A20" strokeWidth={10} fill="none" strokeLinecap="round" />
          {/* brows */}
          <path d="M 2405 735 q 20 -10 38 0" stroke="#3A2A20" strokeWidth={8} fill="none" strokeLinecap="round" />
          <path d="M 2477 735 q 20 -10 38 0" stroke="#3A2A20" strokeWidth={8} fill="none" strokeLinecap="round" />
          {/* eyes */}
          <ellipse cx={2425} cy={768} rx={10} ry={12} fill={LINE} />
          {winking ? (
            <path d="M 2482 770 q 14 10 28 0" stroke={LINE} strokeWidth={7} fill="none" strokeLinecap="round" />
          ) : (
            <ellipse cx={2495} cy={768} rx={10} ry={12} fill={LINE} />
          )}
          {/* nose + grin */}
          <path d="M 2460 775 q -12 28 4 32" stroke={SKIN_D} strokeWidth={5} fill="none" strokeLinecap="round" />
          <path d="M 2418 818 Q 2460 858 2502 818 Q 2460 834 2418 818 Z" fill="#fff" stroke={LINE} strokeWidth={5} strokeLinejoin="round" />
        </g>
        {/* shins (knees are behind the laptop) */}
        {[2405, 2485].map((x, i) => (
          <g key={x}>
            <rect x={x} y={1225} width={58} height={95} fill={SKIN} stroke={SKIN_D} strokeWidth={4} />
            <path d={`M ${x + 14} ${1260 + i * 6} l 6 -8 M ${x + 34} ${1280} l 6 -8 M ${x + 22} ${1300} l 6 -8`} stroke={LINE} strokeWidth={3} opacity={0.5} />
          </g>
        ))}
        {/* laptop: the lid covers what needs covering */}
        <rect x={2262} y={1228} width={396} height={20} rx={10} fill="#C7CBD1" />
        <rect x={2272} y={985} width={376} height={250} rx={20} fill="#2D2E33" />
        <rect x={2282} y={995} width={356} height={12} rx={6} fill="rgba(255,255,255,0.06)" />
        <Ball cx={2460} cy={1110} r={42} />
      </g>

      {/* coffee table */}
      <g>
        <rect x={2140} y={1398} width={640} height={30} rx={6} fill="#8A5A3B" />
        <rect x={2165} y={1428} width={590} height={36} fill="#74492F" />
        <rect x={2180} y={1464} width={26} height={150} fill="#74492F" />
        <rect x={2714} y={1464} width={26} height={150} fill="#74492F" />
        {/* pizza slice on a plate */}
        <ellipse cx={2240} cy={1394} rx={70} ry={12} fill="#F3F3F3" />
        <path d="M 2195 1388 L 2290 1388 L 2250 1340 Z" fill="#F0C14B" />
        <circle cx={2245} cy={1372} r={8} fill="#C1432F" />
        {/* mug with steam */}
        <rect x={2660} y={1330} width={64} height={70} rx={10} fill={RED} />
        <path d="M 2724 1345 q 28 0 28 22 q 0 22 -28 22" stroke={RED} strokeWidth={10} fill="none" />
        {[0, 1].map((i) => (
          <path
            key={i}
            d={`M ${2680 + i * 22} 1320 q -14 -24 0 -46 q 14 -22 0 -44`}
            stroke="#fff"
            strokeWidth={6}
            fill="none"
            opacity={steam(i)}
            strokeLinecap="round"
          />
        ))}
      </g>

      {/* feet in socks, up on the table, wiggling */}
      {[
        [2434, -1],
        [2514, 1],
      ].map(([x, dir]) => (
        <g key={x} transform={`rotate(${wiggle * dir} ${x} 1325)`}>
          <rect x={x - 32} y={1300} width={64} height={30} fill="#fff" stroke="#D5D5D5" strokeWidth={3} />
          <rect x={x - 32} y={1306} width={64} height={7} fill={RED} />
          <rect x={x - 32} y={1318} width={64} height={7} fill={RED} />
          <ellipse cx={x + dir * 18} cy={1360} rx={58} ry={42} fill="#fff" stroke="#D5D5D5" strokeWidth={3} />
          <ellipse cx={x + dir * 52} cy={1362} rx={20} ry={28} fill={RED} />
        </g>
      ))}
    </svg>
  );
};
