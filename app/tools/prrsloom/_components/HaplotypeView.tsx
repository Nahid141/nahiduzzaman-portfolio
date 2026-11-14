"use client";

import { useMemo, useRef, useState } from "react";
import { exportSvg, today } from "../_lib/client";
import { piePalette, rSort } from "../_lib/color";
import type { HapRow, HaplotypeResult } from "../_lib/types";
import { Checkbox, DataTable, GhostButton, Notice, Select, Slider, Tabs } from "./ui";

const CAPTION = "Generated with PRRS-Loom developed by the V-EPI Lab, University of Minnesota";
const MISSING = "NA / missing";

const norm = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" || s === "NA" ? MISSING : s;
};

function collapse(values: (string | null)[], max: number, sep = ", ") {
  const vals = rSort([...new Set(values.map(norm))]);
  if (vals.length === 0) return MISSING;
  return vals.length <= max ? vals.join(sep) : `${vals.slice(0, max).join(sep)}${sep}+${vals.length - max} more`;
}

/** build_group_matrix() from the R app */
function groupMatrix(rows: HapRow[], hapIds: string[], column: string, excludeRef: boolean) {
  const hasSource = rows.some((r) => "variant_source" in r);
  const pieRows = excludeRef && hasSource ? rows.filter((r) => r.variant_source !== "reference") : rows;
  let groups = rSort([...new Set(pieRows.map((r) => norm(r[column] as string | null)))]);
  const counts = new Map<string, Map<string, number>>();
  for (const id of hapIds) counts.set(id, new Map());
  for (const r of pieRows) {
    const m = counts.get(r.HaplotypeId);
    if (!m) continue;
    const g = norm(r[column] as string | null);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  if (excludeRef && hasSource) {
    const userHaps = new Set(pieRows.map((r) => r.HaplotypeId));
    const refOnly = [...new Set(rows.map((r) => r.HaplotypeId))].filter((h) => !userHaps.has(h));
    if (refOnly.length) {
      if (!groups.includes("Reference")) groups = [...groups, "Reference"];
      for (const h of refOnly) counts.get(h)?.set("Reference", 1);
    }
  }
  const legend = groups.map((g) => (g === "NA(ref)" ? "Reference" : g));
  for (const m of counts.values()) {
    if (m.has("NA(ref)")) { m.set("Reference", (m.get("Reference") ?? 0) + (m.get("NA(ref)") ?? 0)); m.delete("NA(ref)"); }
  }
  const uniqLegend = [...new Set(legend)];
  return { legend: uniqLegend, counts, colors: piePalette(uniqLegend.length) };
}

function piePaths(cx: number, cy: number, r: number, values: number[], colors: string[]) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return [<circle key="empty" cx={cx} cy={cy} r={r} fill="#d9d9d9" />];
  const nonzero = values.filter((v) => v > 0).length;
  if (nonzero === 1) {
    const i = values.findIndex((v) => v > 0);
    return [<circle key="full" cx={cx} cy={cy} r={r} fill={colors[i]} />];
  }
  const out = [];
  let angle = -Math.PI / 2;
  for (let i = 0; i < values.length; i++) {
    if (values[i] <= 0) continue;
    const a2 = angle + (values[i] / total) * 2 * Math.PI;
    const large = a2 - angle > Math.PI ? 1 : 0;
    const d = `M ${cx} ${cy} L ${cx + r * Math.cos(angle)} ${cy + r * Math.sin(angle)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)} Z`;
    out.push(<path key={i} d={d} fill={colors[i]} />);
    angle = a2;
  }
  return out;
}

export function HaplotypeView({ result }: { result: HaplotypeResult }) {
  const panels = result.networks.map((n) => n.panel);
  const [panel, setPanel] = useState(panels[0]);
  const [column, setColumn] = useState(result.default_color_column ?? "");
  const [excludeRef, setExcludeRef] = useState(true);
  const [nodeSize, setNodeSize] = useState(1);
  const [scale, setScale] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState<"network" | "haplotypes" | "classification">("network");
  const svgRef = useRef<SVGSVGElement>(null);

  const net = result.networks.find((n) => n.panel === panel) ?? result.networks[0];
  const rows = useMemo(() => result.hap_summary.filter((r) => r.Network === net.panel), [result, net]);
  const pies = useMemo(() => (column ? groupMatrix(rows, net.hap_ids, column, excludeRef) : null), [rows, net, column, excludeRef]);

  const nodes = useMemo(() => {
    const counts = net.hap_ids.map((id) => Math.max(1, rows.filter((r) => r.HaplotypeId === id).length));
    const lo = Math.min(...counts), hi = Math.max(...counts);
    return net.hap_ids.map((id, i) => {
      const hr = rows.filter((r) => r.HaplotypeId === id);
      const size = 12 + (hi === lo ? 0.5 : (counts[i] - lo) / (hi - lo)) * 46; // visNetwork scaling min 12, max 58
      return {
        id, label: net.labels[i], n: hr.length,
        r: (size / 2) * Math.sqrt(nodeSize) + 4,
        x: net.layout[i][0] * 46 * scale, y: net.layout[i][1] * 46 * scale,
        haplotype: hr[0]?.Haplotype ?? id,
        sequences: collapse(hr.map((r) => r.SequenceName), 14, "\n"),
        variants: collapse(hr.map((r) => r.network_variant), 8),
        years: collapse(hr.map((r) => r.Year), 8),
        groups: column ? collapse(hr.map((r) => r[column] as string | null), 10) : "",
      };
    });
  }, [net, rows, nodeSize, scale, column]);

  const pad = 90;
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad + 40;
  const w = Math.max(400, maxX - minX), h = Math.max(320, maxY - minY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const vb = [cx - w / (2 * zoom), cy - h / (2 * zoom), w / zoom, h / zoom];

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const tableCols = result.summary_columns;
  const selectedRows = rows.filter((r) => selected.includes(r.HaplotypeId));

  return (
    <div className="space-y-5">
      <Notice tone="ok">{result.status_message}</Notice>
      <Tabs label="Haplotype results" value={tab} onChange={setTab}
        tabs={[{ id: "network", label: "Interactive network" }, { id: "haplotypes", label: "Haplotype table" }, { id: "classification", label: "Classification table" }]} />
      {tab === "network" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {panels.length > 1 && <Select label="Choose the network" value={panel} onChange={(v) => { setPanel(v); setSelected([]); }} options={panels.map((p) => ({ value: p, label: p }))} />}
            {result.user_metadata_columns.length > 0 ? (
              <Select label="Choose the metadata column" value={column} onChange={setColumn}
                options={result.user_metadata_columns.map((c) => ({ value: c, label: c }))} />
            ) : <Notice tone="info">No extra metadata columns are available for dynamic coloring.</Notice>}
            <div className="flex items-end pb-2"><Checkbox label="Exclude reference sequences from pies" checked={excludeRef} onChange={setExcludeRef} /></div>
            <Slider label="Node size multiplier" value={nodeSize} min={0.2} max={10} step={0.1} onChange={setNodeSize} format={(v) => v.toFixed(1)} />
            <Slider label="Scale ratio" value={scale} min={0.2} max={10} step={0.1} onChange={setScale} format={(v) => v.toFixed(1)} />
            <div className="flex items-end gap-2 pb-1">
              <GhostButton onClick={() => setZoom((z) => Math.min(8, z * 1.25))}>Zoom in</GhostButton>
              <GhostButton onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))}>Zoom out</GhostButton>
              <GhostButton onClick={() => setZoom(1)}>Reset</GhostButton>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
            <svg ref={svgRef} viewBox={vb.join(" ")} width="100%" height="620" role="group" aria-label={`Haplotype network ${net.panel}: ${nodes.length} haplotypes, ${net.links.length} links`}>
              <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="#fff" />
              {net.links.map(([a, b, step], i) => {
                const A = nodes[a], B = nodes[b];
                return (
                  <g key={i}>
                    <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#333" strokeWidth={2} />
                    <text x={(A.x + B.x) / 2} y={(A.y + B.y) / 2} textAnchor="middle" dominantBaseline="middle" fontSize={15}
                      fill="#333" stroke="#fff" strokeWidth={5} paintOrder="stroke">{step}</text>
                    <title>{`${step} ${step === 1 ? "mutational step" : "mutational steps"}`}</title>
                  </g>
                );
              })}
              {nodes.map((n) => {
                const values = pies ? pies.legend.map((g) => pies.counts.get(n.id)?.get(g) ?? 0) : [n.n];
                const colors = pies ? pies.colors : ["#d9d9d9"];
                const isSel = selected.includes(n.id);
                return (
                  <g key={n.id} role="button" tabIndex={0} aria-pressed={isSel} aria-label={`Haplotype ${n.label}, ${n.n} sequences`}
                    onClick={() => toggle(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(n.id); } }}
                    className="cursor-pointer focus:outline-none">
                    {piePaths(n.x, n.y, n.r, values, colors)}
                    <circle cx={n.x} cy={n.y} r={n.r} fill="none" stroke={isSel ? "#06b6d4" : "#6b0618"} strokeWidth={isSel ? 4 : 1.6} />
                    <text x={n.x} y={n.y + n.r + 15} textAnchor="middle" fontSize={16} fontWeight={700} fill="#222" stroke="#fff" strokeWidth={4} paintOrder="stroke">{n.label}</text>
                    <title>{`${n.haplotype}\nSequences: ${n.n}\nVariant: ${n.variants}\nYear: ${n.years}${column ? `\n${column}: ${n.groups}` : ""}\n\nSequence IDs\n${n.sequences}`}</title>
                  </g>
                );
              })}
              <text x={vb[0] + vb[2] - 10} y={vb[1] + vb[3] - 10} textAnchor="end" fontSize={13} fontStyle="italic" fill="#595959">{CAPTION}</text>
            </svg>
          </div>
          {pies && pies.legend.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-200">
              <span className="font-black">Pies: {column}</span>
              {pies.legend.map((g, i) => (
                <span key={g} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-3.5 w-3.5 rounded-full border border-white/30" style={{ background: pies.colors[i] }} />{g}
                </span>
              ))}
            </div>
          )}
          <GhostButton onClick={() => svgRef.current && exportSvg(svgRef.current, `prrsloom_haplotype_network_${today()}.jpg`, 4200, Math.round(4200 * (vb[3] / vb[2])), "image/jpeg")}>
            ↓ Download network (JPG)
          </GhostButton>
          <div className="space-y-2">
            <h3 className="text-sm font-black text-cyan-200">Selected haplotypes</h3>
            {selected.length === 0 ? <p className="text-sm text-slate-400">Click one or more nodes (or focus a node and press Enter) to list their sequences.</p> : (
              <DataTable caption="Selected haplotypes" rows={selectedRows} columns={tableCols} pageSize={10} />
            )}
          </div>
        </div>
      )}
      {tab === "haplotypes" && <DataTable caption="Haplotype summary" rows={result.hap_summary} columns={tableCols} pageSize={20} />}
      {tab === "classification" && (
        <DataTable caption="Classification table" rows={result.classification}
          columns={["SequenceName", "assign.final", "assign.top", "prob.top", "assign.2", "prob.2", "num.gaps.amb"]} pageSize={20} />
      )}
    </div>
  );
}
