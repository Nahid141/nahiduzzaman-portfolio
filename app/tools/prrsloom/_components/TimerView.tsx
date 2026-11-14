"use client";

import { useMemo, useRef, useState } from "react";
import { exportSvg, today } from "../_lib/client";
import { CATEGORY_COLORS, CATEGORY_LABELS, distribution } from "../_lib/stats";
import type { TimerResult, TimerRow } from "../_lib/types";
import { DataTable, GhostButton, Notice, PrimaryButton, Select, Tabs } from "./ui";

const LEVELS = ["High probability", "Medium probability", "Low probability", "Outside expected distribution", "Unable to evaluate"];

function Legend({ includeUnable }: { includeUnable: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-200">
      <span className="font-black">Mutation count category</span>
      {LEVELS.filter((l) => includeUnable || l !== "Unable to evaluate").map((l) => (
        <span key={l} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-3.5 rounded-sm border border-white/20" style={{ background: CATEGORY_COLORS[l] }} />
          {CATEGORY_LABELS[l]}
        </span>
      ))}
    </div>
  );
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("||");
}

const val = (x: unknown, digits = 3) => (x === null || x === undefined || (typeof x === "number" && !Number.isFinite(x)) ? "" : typeof x === "number" ? x.toFixed(digits) : String(x));

export function TimerView({ result }: { result: TimerResult }) {
  const [tab, setTab] = useState<"matrix" | "pair" | "table">("matrix");
  const names = result.heatmap.names;
  const [s1, setS1] = useState(names[0] ?? "");
  const [s2, setS2] = useState(names[1] ?? names[0] ?? "");
  const [selected, setSelected] = useState<TimerRow | null>(result.results[0] ?? null);
  const [pairError, setPairError] = useState<string | null>(null);
  const distRef = useRef<SVGSVGElement>(null);
  const byPair = useMemo(() => new Map(result.results.map((r) => [r.pair_id, r])), [result]);

  const inspect = () => {
    if (s1 === s2) return setPairError("Choose two different sequences.");
    const row = byPair.get(pairKey(s1, s2));
    if (!row) return setPairError("This pair is not available in the current results.");
    setPairError(null);
    setSelected(row);
  };

  const s = result.summary;
  const cards = [
    ["Pairwise comparisons", s.pairs],
    ["Highly compatible", s.highly_compatible],
    ["Compatible near limit", s.near_limit],
    ["Outside / unable", s.outside + s.unable],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-bold text-slate-400">{label}</p>
            <p className="mt-1 text-3xl font-black text-cyan-200">{value}</p>
          </div>
        ))}
      </div>
      <Tabs label="TIMER results" value={tab} onChange={setTab}
        tabs={[{ id: "matrix", label: "Pairwise matrix" }, { id: "pair", label: "Check one comparison" }, { id: "table", label: "Results table" }]} />

      {tab === "matrix" && (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-slate-300">
            Only one triangle is shown. Colour separates high, medium and low probability among pairs inside the expected
            Poisson distribution; charcoal marks pairs outside it. Click a cell to inspect that comparison.
          </p>
          <Heatmap result={result} onPick={(id) => { const r = byPair.get(id); if (r) { setSelected(r); setS1(r.sequence_1); setS2(r.sequence_2); setTab("pair"); } }} />
          <Legend includeUnable />
        </div>
      )}

      {tab === "pair" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="First sequence" value={s1} onChange={setS1} options={names.map((n) => ({ value: n, label: n }))} />
            <Select label="Second sequence" value={s2} onChange={setS2} options={names.map((n) => ({ value: n, label: n }))} />
          </div>
          <div className="max-w-xs"><PrimaryButton onClick={inspect}>Check selected comparison</PrimaryButton></div>
          {pairError && <Notice tone="error">{pairError}</Notice>}
          {selected && !pairError && (
            <>
              {selected.expected_mutations_mean === null || selected.differences_observed === null ? (
                <Notice tone="warn">This pair does not have an expected or observed mutation count, so its distribution cannot be drawn.</Notice>
              ) : (
                <>
                  <DistributionPlot row={selected} svgRef={distRef} />
                  <Legend includeUnable={false} />
                  <GhostButton onClick={() => distRef.current && exportSvg(distRef.current, `pairwise_poisson_selected_comparison_${today()}.png`, 3600, 2100)}>
                    ↓ Download selected comparison plot (PNG)
                  </GhostButton>
                </>
              )}
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-sm">
                  <caption className="sr-only">Selected comparison</caption>
                  <tbody>
                    {([
                      ["Pair", selected.pair_label],
                      ["Observed mutations", val(selected.differences_observed, 0)],
                      ["Comparable sites", val(selected.comparable_sites, 0)],
                      ["Percent identity", val(selected.pct_identity_comparable_sites, 2)],
                      ["Time interval years", val(selected.time_interval_years, 3)],
                      ["Expected mutations lambda", val(selected.expected_mutations_mean, 2)],
                      ["Central 95% Poisson interval", `${val(selected.poisson_lower_expected, 0)} to ${val(selected.poisson_upper_expected, 0)}`],
                      ["Mutation timing category", selected.mutation_timing_category],
                      ["Relative Poisson probability", val(selected.poisson_compatibility_score, 3)],
                      ["Raw P(N = observed)", val(selected.probability_observed, 5)],
                      ["Two-sided tail score", val(selected.two_sided_tail_score, 3)],
                      ["Status", selected.poisson_status],
                      ["Interpretation", selected.final_interpretation],
                    ] as [string, string][]).map(([k, v]) => (
                      <tr key={k} className="border-t border-white/5">
                        <th scope="row" className="w-60 px-4 py-2 text-left font-bold text-cyan-200">{k}</th>
                        <td className="px-4 py-2 text-slate-200">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "table" && (
        <DataTable caption="Pairwise audit" rows={result.results} pageSize={15}
          columns={["pair_label", "differences_observed", "comparable_sites", "pct_identity_comparable_sites", "time_interval_years",
            "expected_mutations_mean", "poisson_lower_expected", "poisson_upper_expected", "poisson_compatibility_score",
            "mutation_timing_category", "poisson_status"]} />
      )}
    </div>
  );
}

function Heatmap({ result, onPick }: { result: TimerResult; onPick: (pairId: string) => void }) {
  const names = result.heatmap.names;
  const n = names.length;
  const cell = n <= 12 ? 74 : n <= 25 ? 46 : 26;
  const labelPad = Math.min(220, 12 + Math.max(...names.map((x) => x.length)) * 6.5);
  const size = labelPad + n * cell + 10;
  const sizeH = size + labelPad * 0.75;
  const idx = new Map(names.map((x, i) => [x, i]));
  const font = Math.max(6, Math.min(11, cell / 6.2));
  return (
    <div className="overflow-auto rounded-2xl border border-white/10 bg-white" style={{ maxHeight: "80vh" }}>
      <svg viewBox={`0 0 ${size} ${sizeH}`} width={Math.max(size, 320)} role="img" aria-label="Pairwise mutation plausibility heatmap">
        <rect width={size} height={sizeH} fill="#fff" />
        {result.heatmap.cells.map((c) => {
          const x = labelPad + (idx.get(c.x) ?? 0) * cell;
          const y = (idx.get(c.y) ?? 0) * cell + 10;
          return (
            <g key={c.pair_id} role="button" tabIndex={0} aria-label={`${c.x} versus ${c.y}: ${c.category}`}
              onClick={() => onPick(c.pair_id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(c.pair_id); } }}
              className="cursor-pointer focus:outline-none">
              <rect x={x} y={y} width={cell} height={cell} fill={c.fill} stroke="#fff" strokeWidth={1.3} />
              {cell >= 40 && c.label.map((line, i) => (
                <text key={i} x={x + cell / 2} y={y + cell / 2 + (i - 1) * font * 1.15} textAnchor="middle" dominantBaseline="middle"
                  fontSize={font} fontWeight={700} fill={c.light_text ? "#fff" : "#252525"}>{line}</text>
              ))}
              <title>{`${c.x} vs ${c.y}\n${c.label.join(" · ")}`}</title>
            </g>
          );
        })}
        {names.map((nm, i) => (
          <g key={nm}>
            <text x={labelPad - 6} y={i * cell + 10 + cell / 2} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="#2d2d2d">{nm}</text>
            <text transform={`translate(${labelPad + i * cell + cell / 2}, ${n * cell + 18}) rotate(-45)`} textAnchor="end" fontSize={11} fill="#2d2d2d">{nm}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function DistributionPlot({ row, svgRef }: { row: TimerRow; svgRef: React.RefObject<SVGSVGElement | null> }) {
  const lambda = row.expected_mutations_mean ?? 0;
  const observed = row.differences_observed ?? 0;
  const lo = row.poisson_lower_expected ?? 0;
  const hi = row.poisson_upper_expected ?? 0;
  const bars = distribution(observed, lambda, hi);
  const W = 960, H = 420, L = 64, R = 20, T = 40, B = 52;
  const maxP = Math.max(...bars.map((b) => b.p), 1e-12) * 1.24;
  const xMax = bars.length - 1;
  const sx = (k: number) => L + (k / Math.max(1, xMax)) * (W - L - R);
  const sy = (p: number) => T + (1 - p / maxP) * (H - T - B);
  const bw = Math.max(1.5, ((W - L - R) / Math.max(1, xMax)) * 0.55);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => (maxP / 1.24) * f);
  const xStep = Math.max(1, Math.ceil(xMax / 10 / 5) * 5);
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 560 }} role="img"
        aria-label={`Poisson distribution for ${row.pair_label}: expected ${lambda.toFixed(2)} mutations, observed ${observed}`}>
        <rect width={W} height={H} fill="#fff" />
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="#C9CDD1" strokeDasharray="4 4" />
            <text x={L - 8} y={sy(t)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="#333">{t.toFixed(3)}</text>
          </g>
        ))}
        {bars.map((b) => (
          <rect key={b.k} x={sx(b.k) - bw / 2} y={sy(b.p)} width={bw} height={Math.max(0, sy(0) - sy(b.p))} fill={CATEGORY_COLORS[b.zone]} />
        ))}
        {[lo, hi].map((v, i) => <line key={i} x1={sx(v)} x2={sx(v)} y1={T} y2={H - B} stroke="#2E86AB" strokeWidth={2} strokeDasharray="7 5" />)}
        <line x1={sx(observed)} x2={sx(observed)} y1={T - 8} y2={H - B} stroke="#C0392B" strokeWidth={2.5} />
        <g transform={`translate(${Math.min(Math.max(sx(observed), 90), W - 90)}, ${T - 14})`}>
          <rect x={-70} y={-12} width={140} height={22} rx={4} fill="#FDEDEC" stroke="#641E16" strokeWidth={0.6} />
          <text textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="#641E16">Observed = {observed}</text>
        </g>
        {bars.filter((b) => b.k % xStep === 0).map((b) => (
          <text key={b.k} x={sx(b.k)} y={H - B + 18} textAnchor="middle" fontSize={12} fill="#333">{b.k}</text>
        ))}
        <text x={(L + W - R) / 2} y={H - 10} textAnchor="middle" fontSize={14} fill="#111">Number of mutations</text>
        <text transform={`translate(16, ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle" fontSize={14} fill="#111">Probability</text>
      </svg>
      <p className="px-3 pb-2 text-xs text-slate-600">
        {`${row.pair_label} · expected λ = ${lambda.toFixed(2)} · central 95% interval ${lo}–${hi} mutations`}
      </p>
    </div>
  );
}
