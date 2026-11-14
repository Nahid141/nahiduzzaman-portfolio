"use client";

import { useMemo, useState } from "react";
import type { TreeLayout } from "../_lib/types";
import { Slider } from "./ui";

const GRAY70 = "#B3B3B3";
const GRAY90 = "#E5E5E5";
const WIDTH = 1100;
const LEGEND_W = 230;

/** Annotated phylogram drawn from the backend layout (same geometry as the ggtree figure). */
export function TreeView({ tree, minHeight }: { tree: TreeLayout; minHeight: number }) {
  const [factor, setFactor] = useState(15);
  const height = Math.max(minHeight, tree.n_tips * factor);
  const geom = useMemo(() => {
    const longest = Math.max(1, ...tree.tips.map((t) => t.label.length));
    const labelPx = Math.min(360, longest * 6.4 + 14);
    const hm = tree.heatmap;
    const heatEnd = Math.max(hm.sub_lineage.start + hm.sub_lineage.width, hm.extra ? hm.extra.start + hm.extra.width : 0);
    const xEnd = Math.max(heatEnd, tree.x_max + 0.02, 1e-9);
    const plotRight = WIDTH - LEGEND_W - labelPx;
    const sx = (x: number) => 12 + (x / xEnd) * (plotRight - 12);
    const top = 16, bottom = 44;
    const sy = (y: number) => top + ((tree.n_tips - y) / Math.max(1, tree.n_tips - 1 || 1)) * (height - top - bottom);
    const rowH = (height - top - bottom) / Math.max(1, tree.n_tips - 1 || 1);
    return { sx, sy, rowH, labelOffsetPx: sx(0.02) - sx(0) };
  }, [tree, height]);

  const p = tree.palettes;
  const fontSize = Math.max(7, Math.min(12, geom.rowH * 0.8));
  const legendBlocks: { title: string; entries: [string, string][]; shape: "circle" | "square" }[] = [
    { title: "assign.final", entries: Object.entries(p.assign_final), shape: "circle" },
    { title: "sub_lineage", entries: Object.entries(p.sub_lineage), shape: "square" },
  ];
  if (tree.extra_column) legendBlocks.push({ title: tree.extra_column, entries: Object.entries(p.extra), shape: "square" });

  let legendY = 20;
  return (
    <div className="space-y-4">
      <Slider label="Vertical expansion of tree" value={factor} min={15} max={150} step={1} onChange={setFactor} />
      <div className="overflow-auto rounded-2xl border border-white/10 bg-white" style={{ maxHeight: "80vh" }}>
        <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" style={{ minWidth: 720 }} role="img"
          aria-label={`Annotated phylogenetic tree with ${tree.n_tips} tips`} className="block">
          <rect width={WIDTH} height={height} fill="#ffffff" />
          {tree.segments.map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={geom.sx(x1)} y1={geom.sy(y1)} x2={geom.sx(x2)} y2={geom.sy(y2)} stroke="#000" strokeWidth={0.8} />
          ))}
          {(["sub_lineage", "extra"] as const).map((key) => {
            const spec = tree.heatmap[key];
            if (!spec) return null;
            const x = geom.sx(spec.start);
            const w = Math.max(2, geom.sx(spec.start + spec.width) - x);
            return tree.tips.map((t) => {
              const v = key === "sub_lineage" ? t.sub_lineage : t.extra;
              const fill = (v !== null && p[key][v]) || GRAY90;
              return <rect key={`${key}-${t.label}`} x={x} y={geom.sy(t.y) - geom.rowH / 2} width={w} height={Math.max(1, geom.rowH)} fill={fill}><title>{`${t.label}: ${v ?? "NA"}`}</title></rect>;
            });
          })}
          {tree.tips.map((t) => (
            <g key={t.label}>
              <circle cx={geom.sx(t.x)} cy={geom.sy(t.y)} r={Math.max(2, Math.min(4.5, geom.rowH * 0.35))}
                fill={(t.assign_final !== null && p.assign_final[t.assign_final]) || GRAY70}>
                <title>{`${t.label} · assign.final: ${t.assign_final ?? "NA"} · sub_lineage: ${t.sub_lineage ?? "NA"}`}</title>
              </circle>
              <text x={geom.sx(t.x) + geom.labelOffsetPx + 3} y={geom.sy(t.y)} dominantBaseline="middle" fontSize={fontSize} fill="#111">{t.label}</text>
            </g>
          ))}
          {tree.internal_labels.map((l, i) => (
            <text key={i} x={geom.sx(l.x) + 3} y={geom.sy(l.y)} dominantBaseline="middle" fontSize={fontSize} fill="#333">{l.label}</text>
          ))}
          {legendBlocks.map((block) => {
            const startY = legendY;
            legendY += 24 + block.entries.length * 17 + 12;
            return (
              <g key={block.title} transform={`translate(${WIDTH - LEGEND_W + 20}, ${startY})`}>
                <text fontSize={12} fontWeight={700} fill="#111">{block.title}</text>
                {block.entries.map(([name, color], i) => (
                  <g key={name} transform={`translate(0, ${18 + i * 17})`}>
                    {block.shape === "circle" ? <circle cx={6} cy={0} r={5} fill={color} /> : <rect x={0} y={-6} width={12} height={12} fill={color} />}
                    <text x={18} y={0} dominantBaseline="middle" fontSize={11} fill="#222">{name}</text>
                  </g>
                ))}
              </g>
            );
          })}
          <text x={WIDTH - 12} y={height - 12} textAnchor="end" fontSize={12} fontStyle="italic" fill="#595959">{tree.caption}</text>
        </svg>
      </div>
    </div>
  );
}
