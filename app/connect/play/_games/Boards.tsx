"use client";

import { useState } from "react";
import { SEAT, type GameView } from "./meta";

export type BoardProps<S> = { g: GameView; s: S; seat: number | null; myTurn: boolean; busy: boolean; send: (m: Record<string, unknown>) => void };
type Cells = (number | null)[];
type Base = { turn: number | null; outcome: { winners: number[] } | null };

const cellBtn = "relative grid min-h-0 min-w-0 place-items-center overflow-hidden transition disabled:cursor-default";

/* ---------------------------------------- Tic-tac-toe ---------------------------------------- */

export function TicTacToe({ s, myTurn, busy, send }: BoardProps<Base & { board: Cells; last: number | null }>) {
  return (
    <div className="mx-auto grid aspect-square w-full max-w-[360px] grid-cols-3 grid-rows-3 gap-2" role="grid" aria-label="Tic-tac-toe board">
      {s.board.map((c, i) => (
        <button
          key={i}
          type="button"
          disabled={!myTurn || busy || c !== null}
          onClick={() => send({ cell: i })}
          aria-label={`Square ${i + 1}${c === null ? "" : c === 0 ? ", X" : ", O"}`}
          className={`${cellBtn} rounded-2xl bg-white/5 text-6xl font-black hover:enabled:bg-white/10 ${s.last === i ? "ring-2 ring-white/30" : ""}`}
          style={{ color: c === null ? undefined : SEAT[c] }}
        >
          {c === 0 ? "✕" : c === 1 ? "◯" : ""}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------- Five in a row ---------------------------------------- */

export function Gomoku({ s, myTurn, busy, send }: BoardProps<Base & { board: Cells; last: number | null }>) {
  return (
    <div className="mx-auto w-full max-w-[540px] rounded-2xl bg-amber-200/90 p-2">
      <div className="grid aspect-square grid-cols-[repeat(15,minmax(0,1fr))] grid-rows-[repeat(15,minmax(0,1fr))]" role="grid" aria-label="Five in a row board">
        {s.board.map((c, i) => (
          <button
            key={i}
            type="button"
            disabled={!myTurn || busy || c !== null}
            onClick={() => send({ cell: i })}
            aria-label={`Row ${Math.floor(i / 15) + 1}, column ${(i % 15) + 1}${c === null ? "" : `, stone of player ${c + 1}`}`}
            className={`${cellBtn} border border-amber-900/25 hover:enabled:bg-amber-50/50`}
          >
            {c !== null && (
              <span className={`h-[80%] w-[80%] rounded-full shadow ${s.last === i ? "ring-2 ring-rose-500" : ""}`} style={{ background: c === 0 ? "#0f172a" : "#f8fafc" }} />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------- Four in a row ---------------------------------------- */

export function ConnectFour({ s, myTurn, busy, send }: BoardProps<Base & { board: Cells; last: number | null }>) {
  return (
    <div className="mx-auto grid w-full max-w-[480px] grid-cols-7 gap-1.5 rounded-2xl bg-blue-700 p-2" aria-label="Four in a row board">
      {Array.from({ length: 7 }, (_, col) => {
        const full = s.board[col] !== null;
        return (
          <button
            key={col}
            type="button"
            disabled={!myTurn || busy || full}
            onClick={() => send({ column: col })}
            aria-label={`Drop in column ${col + 1}`}
            className="grid gap-1.5 rounded-xl p-0.5 transition hover:enabled:bg-white/15"
          >
            {Array.from({ length: 6 }, (_, row) => {
              const c = s.board[row * 7 + col];
              return (
                <span
                  key={row}
                  className={`aspect-square rounded-full ${s.last === row * 7 + col ? "ring-2 ring-white" : ""}`}
                  style={{ background: c === null || c === undefined ? "#0f172a" : c === 0 ? "#fbbf24" : "#f43f5e" }}
                />
              );
            })}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------- Reversi -------------------------------------------- */

export function Reversi({ s, myTurn, busy, send }: BoardProps<Base & { board: Cells; last: number | null; legal: number[]; passed: boolean }>) {
  const count = [0, 1].map((p) => s.board.filter((c) => c === p).length);
  return (
    <div className="mx-auto w-full max-w-[480px]">
      <p className="mb-2 text-center text-sm text-slate-300">
        Black {count[0]} · White {count[1]}
        {s.passed && !s.outcome && <span className="ml-2 text-amber-200">(the other player had no move)</span>}
      </p>
      <div className="grid aspect-square grid-cols-8 grid-rows-8 gap-0.5 rounded-2xl bg-emerald-900 p-1.5" aria-label="Reversi board">
        {s.board.map((c, i) => {
          const legal = myTurn && s.legal.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={!legal || busy}
              onClick={() => send({ cell: i })}
              aria-label={`Square ${i + 1}${legal ? ", legal move" : ""}`}
              className={`${cellBtn} bg-emerald-700 hover:enabled:bg-emerald-600`}
            >
              {c !== null ? (
                <span className={`h-[82%] w-[82%] rounded-full shadow-md ${s.last === i ? "ring-2 ring-amber-300" : ""}`} style={{ background: c === 0 ? "#0f172a" : "#f8fafc" }} />
              ) : (
                legal && <span className="h-3 w-3 rounded-full bg-black/30" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------- Chess ---------------------------------------------- */

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = "abcdefgh";
type Sq = { white: boolean; type: string } | null;

function parseFen(fen: string): Sq[] {
  const out: Sq[] = [];
  for (const ch of fen.split(" ")[0]!.replace(/\//g, "")) {
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
    else out.push({ white: ch === ch.toUpperCase(), type: ch.toLowerCase() });
  }
  return out;
}
const sqName = (i: number) => `${FILES[i % 8]}${8 - Math.floor(i / 8)}`;
const sqIndex = (name: string) => (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]!);

type ChessS = Base & { fen: string; san: string[]; last: { from: string; to: string } | null; check: boolean; reason: string | null; legal: Record<string, string[]> };

export function ChessBoard({ s, seat, myTurn, busy, send }: BoardProps<ChessS>) {
  const [sel, setSel] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const board = parseFen(s.fen);
  const whiteToMove = s.fen.split(" ")[1] === "w";
  const order = Array.from({ length: 64 }, (_, i) => (seat === 1 ? 63 - i : i));
  const targets = sel && myTurn ? (s.legal[sel] ?? []) : [];

  const click = (i: number) => {
    const name = sqName(i);
    if (!myTurn || busy) return;
    if (sel && targets.includes(name)) {
      const p = board[sqIndex(sel)]; // the piece being moved
      const lastRank = name.endsWith("8") || name.endsWith("1");
      if (p?.type === "p" && lastRank) setPromo({ from: sel, to: name });
      else send({ from: sel, to: name });
      setSel(null);
      return;
    }
    setSel(s.legal[name] ? name : null);
  };

  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div className="grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-2xl border border-white/10" aria-label="Chess board">
        {order.map((i) => {
          const p = board[i];
          const name = sqName(i);
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const isTarget = targets.includes(name);
          const isLast = s.last && (s.last.from === name || s.last.to === name);
          const inCheck = s.check && p?.type === "k" && p.white === whiteToMove;
          return (
            <button
              key={i}
              type="button"
              onClick={() => click(i)}
              aria-label={`${name}${p ? `, ${p.white ? "white" : "black"} ${p.type}` : ""}`}
              className={`${cellBtn} text-[min(9vw,3rem)] leading-none ${dark ? "bg-[#7c8ca3]" : "bg-[#dfe6ee]"} ${sel === name ? "!bg-cyan-300" : ""} ${isLast ? "after:absolute after:inset-0 after:bg-amber-300/35" : ""} ${inCheck ? "!bg-rose-400" : ""}`}
            >
              {p && (
                <span className="relative z-10" style={{ color: p.white ? "#ffffff" : "#0f172a", textShadow: p.white ? "0 0 2px #0f172a, 0 0 1px #0f172a" : "0 0 2px #ffffff55" }}>
                  {GLYPH[p.type]}
                </span>
              )}
              {isTarget && <span className={`absolute z-20 rounded-full ${p ? "inset-1 border-4 border-cyan-500/70" : "h-1/4 w-1/4 bg-cyan-600/60"}`} />}
            </button>
          );
        })}
      </div>
      {promo && (
        <div className="mt-3 flex items-center justify-center gap-2" role="group" aria-label="Promote to">
          <span className="text-sm text-slate-300">Promote to:</span>
          {(["q", "r", "b", "n"] as const).map((t) => (
            <button key={t} type="button" onClick={() => (send({ ...promo, promotion: t }), setPromo(null))} className="rounded-xl bg-white/10 px-3 py-1 text-3xl hover:bg-white/20" aria-label={`Promote to ${t}`}>
              {GLYPH[t]}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-sm text-slate-300">
        {s.reason ? `Game over: ${s.reason}.` : s.check ? "Check!" : ""} {s.san.length > 0 && <span className="text-slate-500">Moves: {s.san.slice(-12).join(" ")}</span>}
      </p>
    </div>
  );
}

/* --------------------------------------------- Checkers --------------------------------------------- */

type Piece = { seat: number; king: boolean } | null;

export function Checkers({ s, seat, myTurn, busy, send }: BoardProps<Base & { board: Piece[]; chain: number | null; legal: { from: number; to: number }[]; last: { from: number; to: number } | null }>) {
  const [sel, setSel] = useState<number | null>(null);
  const order = Array.from({ length: 64 }, (_, i) => (seat === 1 ? 63 - i : i));
  const froms = new Set(myTurn ? s.legal.map((m) => m.from) : []);
  const active = s.chain ?? sel;
  const targets = myTurn && active !== null ? s.legal.filter((m) => m.from === active).map((m) => m.to) : [];
  return (
    <div className="mx-auto w-full max-w-[520px]">
      <div className="grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-2xl border border-white/10" aria-label="Checkers board">
        {order.map((i) => {
          const p = s.board[i];
          const dark = (Math.floor(i / 8) + (i % 8)) % 2 === 1;
          const isTarget = targets.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={busy || !(froms.has(i) || isTarget)}
              onClick={() => {
                if (isTarget && active !== null) {
                  send({ from: active, to: i });
                  setSel(null);
                } else setSel(i);
              }}
              aria-label={`Square ${i + 1}${p ? `, ${p.king ? "king" : "piece"} of player ${p.seat + 1}` : ""}${isTarget ? ", move here" : ""}`}
              className={`${cellBtn} ${dark ? "bg-[#5b4636]" : "bg-[#e9d8bd]"} ${s.last && (s.last.from === i || s.last.to === i) ? "ring-2 ring-inset ring-amber-300/70" : ""}`}
            >
              {p && (
                <span
                  className={`grid h-[78%] w-[78%] place-items-center rounded-full border-4 text-xl shadow-lg ${active === i ? "ring-4 ring-cyan-300" : froms.has(i) ? "ring-2 ring-cyan-300/50" : ""}`}
                  style={{ background: p.seat === 0 ? "#e11d48" : "#e2e8f0", borderColor: p.seat === 0 ? "#9f1239" : "#94a3b8", color: p.seat === 0 ? "#fff" : "#334155" }}
                >
                  {p.king ? "♛" : ""}
                </span>
              )}
              {isTarget && <span className="absolute h-1/4 w-1/4 rounded-full bg-cyan-300/70" />}
            </button>
          );
        })}
      </div>
      {s.chain !== null && myTurn && <p className="mt-2 text-center text-sm text-amber-200">Keep jumping with the same piece.</p>}
    </div>
  );
}

/* ---------------------------------------- Rock, paper, scissors ---------------------------------------- */

const RPS = [
  ["rock", "✊"],
  ["paper", "✋"],
  ["scissors", "✌️"],
] as const;
const RPS_ICON: Record<string, string> = Object.fromEntries(RPS);

export function RockPaperScissors({ g, s, seat, busy, send }: BoardProps<Base & { picks: (string | null)[]; picked: boolean[]; scores: number[]; rounds: { picks: string[]; winner: number | null }[] }>) {
  const name = (i: number) => (i === seat ? "You" : `@${g.players[i]?.username}`);
  const mine = seat !== null ? s.picks[seat] : null;
  const other = seat === null ? null : 1 - seat;
  return (
    <div className="mx-auto max-w-[520px] text-center">
      <p className="text-4xl font-black text-white">
        {s.scores[0]} : {s.scores[1]}
      </p>
      <p className="text-xs text-slate-500">
        {name(0)} vs {name(1)}, first to 3
      </p>
      {seat !== null && !s.outcome && (
        <div className="mt-5">
          {mine ? (
            <p className="text-slate-300">
              You picked {RPS_ICON[mine]}. {other !== null && s.picked[other] ? "" : `Waiting for ${name(other!)}…`}
            </p>
          ) : (
            <div className="flex justify-center gap-3" role="group" aria-label="Your pick">
              {RPS.map(([k, icon]) => (
                <button key={k} type="button" disabled={busy} onClick={() => send({ pick: k })} className="rounded-2xl bg-white/5 px-5 py-4 text-5xl transition hover:scale-105 hover:bg-white/10" aria-label={k}>
                  {icon}
                </button>
              ))}
            </div>
          )}
          {other !== null && s.picked[other] && !mine && <p className="mt-2 text-sm text-amber-200">{name(other)} has picked.</p>}
        </div>
      )}
      <ol className="mt-6 space-y-1 text-sm text-slate-300">
        {[...s.rounds].reverse().map((r, i) => (
          <li key={s.rounds.length - i}>
            Round {s.rounds.length - i}: {RPS_ICON[r.picks[0]!]} vs {RPS_ICON[r.picks[1]!]} · {r.winner === null ? "tie" : `${name(r.winner)} won`}
          </li>
        ))}
      </ol>
    </div>
  );
}
