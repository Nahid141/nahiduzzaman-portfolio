"use client";

import type { BoardProps } from "./Boards";
import { LUDO, SEAT } from "./meta";

type Base = { turn: number | null; outcome: { winners: number[] } | null; out: boolean[] };
const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
/** Keyboard support for SVG pieces that act as buttons. */
const pressable = (fn: (() => void) | undefined) =>
  fn
    ? {
        role: "button",
        tabIndex: 0,
        onClick: fn,
        onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fn()),
      }
    : {};
const rollBtn = "rounded-2xl bg-cyan-300 px-6 py-3 text-lg font-black text-slate-950 transition hover:bg-white disabled:opacity-40";

/* ---------------------------------------------- Ludo ---------------------------------------------- */

/** The 52 shared squares, clockwise, starting at colour 0's start square (row, column on a 15 × 15 grid). */
const TRACK: [number, number][] = (() => {
  const t: [number, number][] = [];
  const seg = (r: number, c: number, dr: number, dc: number, n: number) => {
    for (let i = 0; i < n; i++) t.push([r + dr * i, c + dc * i]);
  };
  seg(6, 1, 0, 1, 5);
  seg(5, 6, -1, 0, 6);
  seg(0, 7, 0, 0, 1);
  seg(0, 8, 1, 0, 6);
  seg(6, 9, 0, 1, 6);
  seg(7, 14, 0, 0, 1);
  seg(8, 14, 0, -1, 6);
  seg(9, 8, 1, 0, 6);
  seg(14, 7, 0, 0, 1);
  seg(14, 6, -1, 0, 6);
  seg(8, 5, 0, -1, 6);
  seg(7, 0, 0, 0, 1);
  seg(6, 0, 0, 0, 1);
  return t;
})();
const HOME_COL: [number, number][][] = [
  [1, 2, 3, 4, 5].map((c) => [7, c]),
  [1, 2, 3, 4, 5].map((r) => [r, 7]),
  [13, 12, 11, 10, 9].map((c) => [7, c]),
  [13, 12, 11, 10, 9].map((r) => [r, 7]),
];
const YARD: [number, number][] = [
  [0, 0],
  [0, 9],
  [9, 9],
  [9, 0],
];
const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
const CENTER: [number, number][] = [
  [7, 6.3],
  [6.3, 7],
  [7, 7.7],
  [7.7, 7],
];

/** Centre point (x, y) of a token of `color` at progress `p` (token index `i` for the yard spots). */
function ludoXY(color: number, p: number, i: number): [number, number] {
  if (p === -1) {
    const [r, c] = YARD[color]!;
    return [c + 1.5 + (i % 2) * 3, r + 1.5 + Math.floor(i / 2) * 3];
  }
  if (p >= 56) {
    const [y, x] = CENTER[color]!;
    return [x + 0.5, y + 0.5];
  }
  const [r, c] = p <= 50 ? TRACK[(color * 13 + p) % 52]! : HOME_COL[color]![p - 51]!;
  return [c + 0.5, r + 0.5];
}

type LudoS = Base & { colors: number[]; tokens: number[][]; phase: "roll" | "move"; dice: number | null; legal: number[]; last: { seat: number; dice: number; captured: number } | null };

export function Ludo({ g, s, seat, myTurn, busy, send }: BoardProps<LudoS>) {
  const canMove = myTurn && s.phase === "move";
  // Tokens sharing a square are fanned out a little.
  const seen = new Map<string, number>();
  const tokens = s.tokens.flatMap((list, owner) =>
    list.map((p, i) => {
      const [x, y] = ludoXY(s.colors[owner]!, p, i);
      const k = `${x},${y}`;
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return { owner, i, p, x: x + (p === -1 ? 0 : n * 0.18), y: y - (p === -1 ? 0 : n * 0.18) };
    })
  );
  const colorAt = (r: number, c: number) => {
    const t = TRACK.findIndex(([tr, tc]) => tr === r && tc === c);
    if (t >= 0 && t % 13 === 0) return LUDO[t / 13]!;
    for (let col = 0; col < 4; col++) if (HOME_COL[col]!.some(([hr, hc]) => hr === r && hc === c)) return LUDO[col]!;
    return t >= 0 ? "#f8fafc" : null;
  };
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <svg viewBox="0 0 15 15" className="w-full rounded-2xl bg-slate-100" role="img" aria-label="Ludo board">
        {YARD.map(([r, c], col) => (
          <g key={col}>
            <rect x={c} y={r} width={6} height={6} fill={LUDO[col]} />
            <rect x={c + 0.8} y={r + 0.8} width={4.4} height={4.4} rx={0.4} fill="#ffffff" />
          </g>
        ))}
        {Array.from({ length: 15 * 15 }, (_, k) => {
          const r = Math.floor(k / 15);
          const c = k % 15;
          const fill = colorAt(r, c);
          return fill ? <rect key={k} x={c} y={r} width={1} height={1} fill={fill} stroke="#94a3b8" strokeWidth={0.03} /> : null;
        })}
        {SAFE.map((t) => (
          <text key={t} x={TRACK[t]![1] + 0.5} y={TRACK[t]![0] + 0.72} fontSize={0.7} textAnchor="middle" fill="#64748b">
            ★
          </text>
        ))}
        {[0, 1, 2, 3].map((col) => {
          const pts = [
            ["6,6 7.5,7.5 6,9"],
            ["6,6 7.5,7.5 9,6"],
            ["9,6 7.5,7.5 9,9"],
            ["6,9 7.5,7.5 9,9"],
          ][col]![0];
          return <polygon key={col} points={pts} fill={LUDO[col]} />;
        })}
        {tokens.map((t) => {
          const legal = canMove && t.owner === seat && s.legal.includes(t.i);
          return (
            <g
              key={`${t.owner}-${t.i}`}
              {...pressable(legal && !busy ? () => send({ action: "move", token: t.i }) : undefined)}
              className={legal ? "cursor-pointer outline-none focus-visible:[&>circle]:stroke-cyan-500" : undefined}
              aria-label={legal ? `Move token ${t.i + 1}` : undefined}
            >
              {legal && <circle cx={t.x} cy={t.y} r={0.48} fill="none" stroke="#0f172a" strokeWidth={0.08} className="animate-pulse" />}
              <circle cx={t.x} cy={t.y} r={0.36} fill={LUDO[s.colors[t.owner]!]} stroke="#0f172a" strokeWidth={0.07} opacity={s.out[t.owner] ? 0.3 : 1} />
            </g>
          );
        })}
      </svg>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
        {s.dice !== null && <span className="text-5xl text-white" aria-label={`Dice shows ${s.dice}`}>{DIE[s.dice]}</span>}
        {myTurn && s.phase === "roll" && (
          <button type="button" disabled={busy} onClick={() => send({ action: "roll" })} className={rollBtn}>
            Roll the dice
          </button>
        )}
        {canMove && <p className="text-sm text-cyan-100">Tap a highlighted token to move it {s.dice}.</p>}
        {!myTurn && s.last && (
          <p className="text-sm text-slate-400">
            @{g.players[s.last.seat]?.username} rolled {s.last.dice}
            {s.last.captured ? " and captured a token!" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------- Snakes and ladders ---------------------------------------- */

const JUMPS: Record<number, number> = { 3: 22, 8: 30, 20: 41, 27: 56, 50: 69, 57: 76, 63: 81, 72: 91, 17: 4, 33: 12, 46: 25, 54: 34, 66: 47, 79: 58, 88: 67, 94: 71, 99: 80 };

function cellXY(n: number): [number, number] {
  const row = Math.floor((n - 1) / 10);
  const col = row % 2 === 0 ? (n - 1) % 10 : 9 - ((n - 1) % 10);
  return [col + 0.5, 9 - row + 0.5];
}

type SnakesS = Base & { pos: number[]; last: { seat: number; dice: number; from: number; to: number; jump: number | null } | null };

export function Snakes({ g, s, myTurn, busy, send }: BoardProps<SnakesS>) {
  const waiting = s.pos.map((p, i) => ({ p, i })).filter((x) => x.p === 0);
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <svg viewBox="0 0 10 10" className="w-full rounded-2xl" role="img" aria-label="Snakes and ladders board">
        {Array.from({ length: 100 }, (_, k) => {
          const n = k + 1;
          const [x, y] = cellXY(n);
          return (
            <g key={n}>
              <rect x={x - 0.5} y={y - 0.5} width={1} height={1} fill={(Math.floor(x) + Math.floor(y)) % 2 ? "#fef3c7" : "#fde68a"} />
              <text x={x - 0.42} y={y - 0.24} fontSize={0.24} fill="#92400e">
                {n}
              </text>
            </g>
          );
        })}
        {Object.entries(JUMPS).map(([a, b]) => {
          const [x1, y1] = cellXY(Number(a));
          const [x2, y2] = cellXY(b);
          if (b > Number(a)) {
            const len = Math.hypot(x2 - x1, y2 - y1);
            const [nx, ny] = [((y2 - y1) / len) * 0.14, (-(x2 - x1) / len) * 0.14];
            return (
              <g key={a} stroke="#15803d" strokeWidth={0.07} strokeLinecap="round">
                <line x1={x1 + nx} y1={y1 + ny} x2={x2 + nx} y2={y2 + ny} />
                <line x1={x1 - nx} y1={y1 - ny} x2={x2 - nx} y2={y2 - ny} />
                {Array.from({ length: Math.floor(len / 0.45) }, (_, i) => {
                  const f = (i + 1) / (Math.floor(len / 0.45) + 1);
                  const [cx, cy] = [x1 + (x2 - x1) * f, y1 + (y2 - y1) * f];
                  return <line key={i} x1={cx + nx} y1={cy + ny} x2={cx - nx} y2={cy - ny} strokeWidth={0.05} />;
                })}
              </g>
            );
          }
          const [mx, my] = [(x1 + x2) / 2 + (y2 - y1) * 0.25, (y1 + y2) / 2 - (x2 - x1) * 0.25];
          return (
            <g key={a}>
              <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke="#e11d48" strokeWidth={0.16} strokeLinecap="round" opacity={0.85} />
              <circle cx={x1} cy={y1} r={0.14} fill="#9f1239" />
            </g>
          );
        })}
        {s.pos.map((p, i) => {
          if (p === 0) return null;
          const [x, y] = cellXY(p);
          return <circle key={i} cx={x + (i % 2) * 0.24 - 0.12} cy={y + Math.floor(i / 2) * 0.24 - 0.06} r={0.2} fill={SEAT[i]} stroke="#0f172a" strokeWidth={0.05} opacity={s.out[i] ? 0.3 : 1} />;
        })}
      </svg>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-sm text-slate-300">
        {s.last && <span className="text-5xl text-white" aria-label={`Dice shows ${s.last.dice}`}>{DIE[s.last.dice]}</span>}
        {myTurn && (
          <button type="button" disabled={busy} onClick={() => send({ action: "roll" })} className={rollBtn}>
            Roll the dice
          </button>
        )}
        {s.last && (
          <p>
            @{g.players[s.last.seat]?.username} rolled {s.last.dice}
            {s.last.jump !== null ? (s.last.to > s.last.jump ? `, climbed a ladder to ${s.last.to} 🪜` : `, slid down a snake to ${s.last.to} 🐍`) : s.last.from === s.last.to ? " (needs an exact roll)" : ` to ${s.last.to}`}
          </p>
        )}
        {waiting.length > 0 && <p className="w-full text-center text-xs text-slate-500">Not on the board yet: {waiting.map((w) => `@${g.players[w.i]?.username}`).join(", ")}</p>}
      </div>
    </div>
  );
}

/* ----------------------------------------- Dots and boxes ----------------------------------------- */

const N = 5;
const H = (N + 1) * N;

type DotsS = Base & { lines: (number | null)[]; boxes: (number | null)[]; scores: number[]; last: number | null };

export function DotsAndBoxes({ g, s, myTurn, busy, send }: BoardProps<DotsS>) {
  const line = (k: number): [number, number, number, number] => {
    if (k < H) {
      const r = Math.floor(k / N);
      const c = k % N;
      return [c, r, c + 1, r];
    }
    const j = k - H;
    const r = Math.floor(j / (N + 1));
    const c = j % (N + 1);
    return [c, r, c, r + 1];
  };
  return (
    <div className="mx-auto w-full max-w-[480px]">
      <p className="mb-2 flex flex-wrap justify-center gap-3 text-sm">
        {s.scores.map((v, i) => (
          <span key={i} className="font-bold" style={{ color: SEAT[i] }}>
            @{g.players[i]?.username}: {v}
          </span>
        ))}
      </p>
      <svg viewBox="-0.4 -0.4 5.8 5.8" className="w-full rounded-2xl bg-slate-900" role="img" aria-label="Dots and boxes board">
        {s.boxes.map((o, b) =>
          o === null ? null : <rect key={b} x={(b % N) + 0.06} y={Math.floor(b / N) + 0.06} width={0.88} height={0.88} rx={0.08} fill={SEAT[o]} opacity={0.35} />
        )}
        {s.lines.map((o, k) => {
          const [x1, y1, x2, y2] = line(k);
          const free = o === null && myTurn && !busy;
          return (
            <g key={k}>
              {o !== null ? (
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={SEAT[o]} strokeWidth={s.last === k ? 0.14 : 0.1} strokeLinecap="round" />
              ) : (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeWidth={0.28}
                  strokeLinecap="round"
                  className={free ? "cursor-pointer stroke-white/5 outline-none hover:stroke-cyan-300/60 focus-visible:stroke-cyan-300" : "stroke-white/5"}
                  {...pressable(free ? () => send({ line: k }) : undefined)}
                  aria-label={free ? `Draw line ${k + 1}` : undefined}
                />
              )}
            </g>
          );
        })}
        {Array.from({ length: (N + 1) * (N + 1) }, (_, d) => (
          <circle key={d} cx={d % (N + 1)} cy={Math.floor(d / (N + 1))} r={0.08} fill="#e2e8f0" pointerEvents="none" />
        ))}
      </svg>
    </div>
  );
}
