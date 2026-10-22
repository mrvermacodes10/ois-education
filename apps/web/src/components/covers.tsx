// Original cover illustrations for the six games, drawn as SVG (no external images or third-party assets).
import type { GameId } from "@ois/shared";

const frame = { viewBox: "0 0 320 200", preserveAspectRatio: "xMidYMid slice" as const, role: "img" };

function RallyCover() {
  return (
    <svg {...frame} aria-label="A low-poly car racing along a winding road through faceted hills">
      <rect width="320" height="200" fill="#dce8e2" />
      <polygon points="0,96 60,58 112,92 170,48 236,90 290,62 320,80 320,200 0,200" fill="#8fae86" />
      <polygon points="60,58 112,92 40,110" fill="#6e8f6a" />
      <polygon points="170,48 236,90 150,104" fill="#4f7356" />
      <polygon points="290,62 320,80 320,120 262,104" fill="#6e8f6a" />
      <polygon points="0,120 90,104 160,130 230,108 320,128 320,200 0,200" fill="#5f8460" />
      <polygon points="90,104 160,130 70,150" fill="#4f7356" />
      <polygon points="230,108 320,128 320,160 250,150" fill="#3e5e47" />
      {/* road */}
      <polygon points="150,200 214,200 190,150 214,118 184,98 168,98 186,118 156,150" fill="#3a3f44" />
      <polygon points="179,200 185,200 176,170 172,170" fill="#f2f1e8" />
      <polygon points="182,150 186,150 192,130 189,130" fill="#f2f1e8" />
      {/* checkpoint gate */}
      <rect x="160" y="84" width="3" height="20" fill="#f2c14e" />
      <rect x="190" y="84" width="3" height="20" fill="#f2c14e" />
      <rect x="160" y="82" width="33" height="6" fill="#f2c14e" />
      {/* car */}
      <polygon points="150,176 162,160 196,160 210,176 210,186 150,186" fill="#e2603b" />
      <polygon points="162,160 170,150 190,150 196,160" fill="#b8472a" />
      <polygon points="166,160 172,153 188,153 192,160" fill="#2b3a44" />
      <polygon points="150,176 162,160 168,176" fill="#c9502f" />
      <rect x="154" y="184" width="12" height="7" rx="2" fill="#1d2226" />
      <rect x="194" y="184" width="12" height="7" rx="2" fill="#1d2226" />
    </svg>
  );
}

function PokerCover() {
  const card = (x: number, y: number, r: number, rank: string, red: boolean) => (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <rect width="62" height="88" rx="7" fill="#fbfaf5" stroke="#d6d2c4" />
      <text x="9" y="22" fontSize="18" fontWeight="700" fill={red ? "#c0392b" : "#1e2a25"} fontFamily="Georgia, serif">{rank}</text>
      {red
        ? <path d="M31 62 C18 52 14 44 20 38 C25 33 31 37 31 41 C31 37 37 33 42 38 C48 44 44 52 31 62Z" fill="#c0392b" />
        : <path d="M31 34 C42 44 48 50 43 56 C39 60 34 58 32 55 L35 64 L27 64 L30 55 C28 58 23 60 19 56 C14 50 20 44 31 34Z" fill="#1e2a25" />}
    </g>
  );
  const stack = (x: number, n: number, c: string) => Array.from({ length: n }, (_, i) => (
    <g key={i}>
      <ellipse cx={x} cy={170 - i * 5} rx="17" ry="6" fill={c} stroke="#0e2a1d" strokeOpacity="0.35" />
      <ellipse cx={x} cy={170 - i * 5} rx="9" ry="3" fill="none" stroke="#fbfaf5" strokeOpacity="0.6" strokeDasharray="3 3" />
    </g>
  ));
  return (
    <svg {...frame} aria-label="Two playing cards, an ace and a king, beside chip stacks on green felt">
      <rect width="320" height="200" fill="#2e6b4f" />
      <ellipse cx="160" cy="210" rx="230" ry="150" fill="#2a6248" />
      <ellipse cx="160" cy="210" rx="230" ry="150" fill="none" stroke="#24563f" strokeWidth="6" />
      {[0, 1, 2].map((i) => <rect key={i} x={40 + i * 38} y="30" width="30" height="42" rx="4" fill="#1e3b2f" stroke="#b9c9ae" strokeOpacity="0.5" />)}
      {card(150, 52, -10, "A", true)}
      {card(200, 46, 8, "K", false)}
      {stack(60, 5, "#c0392b")}
      {stack(98, 3, "#1f3a5f")}
      {stack(270, 4, "#e8e4d8")}
    </svg>
  );
}

function FootballCover() {
  const px = (x: number, y: number, w: number, h: number, c: string, k?: string) => <rect key={k} x={x} y={y} width={w} height={h} fill={c} />;
  const player = (x: number, y: number, shirt: string) => (
    <g>
      {px(x + 2, y, 6, 5, "#e9c9a5")}
      {px(x, y + 5, 10, 8, shirt)}
      {px(x + 1, y + 13, 3, 5, "#2b2b2b")}
      {px(x + 6, y + 13, 3, 5, "#2b2b2b")}
    </g>
  );
  return (
    <svg {...frame} aria-label="A pixel-art football pitch with players and a goal" shapeRendering="crispEdges">
      {Array.from({ length: 10 }, (_, i) => px(i * 32, 0, 32, 200, i % 2 ? "#6baa59" : "#5e9e4e", `s${i}`))}
      {px(20, 30, 2, 150, "#eef3e6")}{px(20, 30, 280, 2, "#eef3e6")}{px(20, 178, 280, 2, "#eef3e6")}{px(160, 30, 2, 150, "#eef3e6")}
      {px(250, 70, 50, 2, "#eef3e6")}{px(250, 140, 50, 2, "#eef3e6")}{px(250, 70, 2, 72, "#eef3e6")}
      {/* goal */}
      {px(296, 84, 18, 4, "#ffffff")}{px(296, 124, 18, 4, "#ffffff")}{px(310, 84, 4, 44, "#ffffff")}
      {Array.from({ length: 5 }, (_, i) => px(298 + (i % 2) * 6, 90 + i * 7, 10, 1, "#d8dfd0", `n${i}`))}
      {player(120, 96, "#d64541")}{player(200, 70, "#d64541")}{player(230, 118, "#2f5d9e")}{player(276, 98, "#f2c14e")}
      {/* ball */}
      {px(248, 104, 6, 6, "#ffffff")}{px(250, 106, 2, 2, "#2b2b2b")}
      {/* scoreboard */}
      {px(128, 8, 64, 16, "#142a21")}
      <text x="160" y="20" textAnchor="middle" fontSize="11" fontWeight="700" fill="#f2f1e8" fontFamily="ui-monospace, monospace">2 : 1</text>
    </svg>
  );
}

function BasketballCover() {
  return (
    <svg {...frame} aria-label="A basketball arcing toward a hoop above a hardwood court">
      <rect width="320" height="200" fill="#24323f" />
      <rect y="128" width="320" height="72" fill="#d9a066" />
      {Array.from({ length: 9 }, (_, i) => <rect key={i} x={i * 38} y="128" width="1.5" height="72" fill="#c68c52" />)}
      <path d="M90 200 L110 140 L210 140 L230 200Z" fill="#2f5d7c" opacity="0.9" />
      <path d="M120 140 A40 18 0 0 0 200 140" fill="none" stroke="#f2f1e8" strokeWidth="2" />
      {/* backboard and hoop */}
      <rect x="228" y="34" width="62" height="42" rx="3" fill="#f2f1e8" />
      <rect x="248" y="50" width="22" height="16" fill="none" stroke="#e8672f" strokeWidth="2.5" />
      <rect x="256" y="76" width="4" height="60" fill="#8a99a6" />
      <ellipse cx="250" cy="80" rx="16" ry="4" fill="none" stroke="#e8672f" strokeWidth="3" />
      <path d="M236 81 L242 98 L258 98 L264 81" fill="none" stroke="#f2f1e8" strokeWidth="1.2" />
      <path d="M241 82 L250 98 L259 82" fill="none" stroke="#f2f1e8" strokeWidth="1" />
      {/* arc */}
      <path d="M70 120 Q150 0 230 70" fill="none" stroke="#f2f1e8" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" />
      <circle cx="152" cy="46" r="15" fill="#e8672f" />
      <path d="M137 46 H167 M152 31 V61" stroke="#7a3214" strokeWidth="1.6" />
      <path d="M141 35 Q152 46 141 57 M163 35 Q152 46 163 57" fill="none" stroke="#7a3214" strokeWidth="1.6" />
    </svg>
  );
}

function DeductionCover() {
  const crew = (x: number, y: number, c: string, dim = false) => (
    <g opacity={dim ? 1 : 1}>
      <line x1={x + 18} y1={y - 2} x2={x + 18} y2={y - 12} stroke={dim ? "#0f1520" : c} strokeWidth="2.5" />
      <circle cx={x + 18} cy={y - 14} r="3.5" fill={dim ? "#0f1520" : c} />
      <rect x={x} y={y} width="36" height="44" rx="14" fill={dim ? "#0f1520" : c} />
      <rect x={x + 6} y={y + 40} width="9" height="9" rx="3" fill={dim ? "#0f1520" : c} />
      <rect x={x + 21} y={y + 40} width="9" height="9" rx="3" fill={dim ? "#0f1520" : c} />
      <circle cx={x + 12} cy={y + 16} r="3.2" fill={dim ? "#f2c14e" : "#fbfaf5"} />
      <circle cx={x + 24} cy={y + 16} r="3.2" fill={dim ? "#f2c14e" : "#fbfaf5"} />
    </g>
  );
  return (
    <svg {...frame} aria-label="Three round crew characters in a dim station corridor, with a pair of eyes watching from a doorway">
      <rect width="320" height="200" fill="#2b3448" />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x={i * 40} y="130" width="39" height="70" fill={i % 2 ? "#323c52" : "#2e384d"} />)}
      <rect y="122" width="320" height="8" fill="#3d4963" />
      {/* doorway */}
      <rect x="236" y="44" width="56" height="86" rx="6" fill="#0f1520" />
      <rect x="232" y="40" width="64" height="6" rx="2" fill="#4a5875" />
      {/* task panel */}
      <rect x="30" y="50" width="54" height="36" rx="4" fill="#3d4963" />
      <circle cx="44" cy="62" r="4" fill="#7fb3a3" /><circle cx="58" cy="62" r="4" fill="#f2c14e" /><circle cx="72" cy="62" r="4" fill="#e07a5f" />
      <rect x="38" y="72" width="38" height="5" rx="2" fill="#2b3448" />
      {crew(70, 108, "#f2c14e")}
      {crew(122, 118, "#7fb3a3")}
      {crew(176, 104, "#e07a5f")}
      {crew(246, 74, "#0f1520", true)}
    </svg>
  );
}

function TerritoryCover() {
  const cell = 16;
  const area = (cells: [number, number][], c: string, k: string) => cells.map(([x, y], i) => <rect key={`${k}${i}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={c} />);
  const block = (x0: number, y0: number, w: number, h: number): [number, number][] =>
    Array.from({ length: w * h }, (_, i) => [x0 + (i % w), y0 + Math.floor(i / w)]);
  const trail: [number, number][] = [[9, 4], [10, 4], [11, 4], [12, 4], [12, 5], [12, 6], [12, 7], [12, 8], [11, 8]];
  return (
    <svg {...frame} aria-label="A grid arena with three coloured territories and a trail looping out from the blue one" shapeRendering="crispEdges">
      <rect width="320" height="200" fill="#f5f3ec" />
      {area(block(2, 3, 7, 6).concat(block(4, 9, 4, 2)), "#5b8def", "b")}
      {area(block(14, 1, 5, 5).concat(block(16, 6, 3, 2)), "#f28c6b", "c")}
      {area(block(13, 9, 6, 3), "#6cc08b", "g")}
      {area(trail, "#a9c3f7", "t")}
      {Array.from({ length: 21 }, (_, i) => <rect key={`v${i}`} x={i * cell} y="0" width="1" height="200" fill="#e4e1d6" opacity="0.8" />)}
      {Array.from({ length: 13 }, (_, i) => <rect key={`h${i}`} x="0" y={i * cell} width="320" height="1" fill="#e4e1d6" opacity="0.8" />)}
      <rect x={10 * cell + 2} y={8 * cell + 2} width={cell - 4} height={cell - 4} rx="3" fill="#2f5bb8" />
      <rect x={14 * cell + 2} y={6 * cell + 2} width={cell - 4} height={cell - 4} rx="3" fill="#c8603f" />
      <rect x={15 * cell + 2} y={11 * cell + 2} width={cell - 4} height={cell - 4} rx="3" fill="#3f9a63" />
    </svg>
  );
}

export const COVERS: Record<GameId, () => React.JSX.Element> = {
  racing: RallyCover,
  poker: PokerCover,
  football: FootballCover,
  basketball: BasketballCover,
  deduction: DeductionCover,
  territory: TerritoryCover,
};

export function Cover({ id, className = "" }: { id: GameId; className?: string }) {
  const C = COVERS[id];
  return <div className={`aspect-[16/10] w-full overflow-hidden [&>svg]:h-full [&>svg]:w-full ${className}`}><C /></div>;
}
