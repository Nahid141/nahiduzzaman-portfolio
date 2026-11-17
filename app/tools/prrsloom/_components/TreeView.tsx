"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { downloadText, exportSvg, today } from "../_lib/client";
import { hcl, rSort } from "../_lib/color";
import type { TreeLayout, TreeTip } from "../_lib/types";
import { Slider } from "./ui";

/* ------------------------------------------------------------------ colours */

const GRAY70 = "#B3B3B3";
const MISSING = new Set(["not_annotated", "not_provided", "Not provided", "reference", "undetermined", "NA", ""]);
// same base colours as the backend figure (palettes.py), stretched like R's colorRampPalette
const BASE: Record<string, string[]> = {
  assign_final: ["#e76f51", "#2a9d8f", "#264653", "#f4a261", "#8ab17d", "#b56576", "#577590", "#6d597a"],
  sub_lineage: ["#1f77b4", "#ff7f0e", "#2ca02c", "#9467bd", "#8c564b", "#17becf", "#bcbd22", "#7f7f7f"],
  other: ["#7a5195", "#ef5675", "#ffa600", "#003f5c", "#bc5090", "#00a896", "#f25f5c", "#70c1b3"],
};

type Scheme = "prrsloom" | "okabe" | "tableau" | "viridis" | "rainbow" | "pastel" | "bold";
const SCHEMES: { id: Scheme; label: string }[] = [
  { id: "prrsloom", label: "PRRSLoom (R app)" },
  { id: "okabe", label: "Okabe-Ito (colour-blind safe)" },
  { id: "tableau", label: "Tableau 10" },
  { id: "viridis", label: "Viridis" },
  { id: "rainbow", label: "Rainbow (HCL)" },
  { id: "pastel", label: "Pastel" },
  { id: "bold", label: "Bold / dark" },
];
const FIXED: Record<string, string[]> = {
  okabe: ["#E69F00", "#56B4E9", "#009E73", "#F0E442", "#0072B2", "#D55E00", "#CC79A7", "#000000"],
  tableau: ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC"],
  viridis: ["#440154", "#482878", "#3E4A89", "#31688E", "#26828E", "#1F9E89", "#35B779", "#6DCD59", "#B4DE2C", "#FDE725"],
};

function hex(c: number[]) {
  return "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function rgb(h: string) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** grDevices::colorRampPalette(colors)(n): linear interpolation in RGB. */
function ramp(colors: string[], n: number) {
  if (n <= colors.length) return colors.slice(0, n);
  const c = colors.map(rgb);
  return Array.from({ length: n }, (_, i) => {
    const t = (i / Math.max(1, n - 1)) * (c.length - 1);
    const k = Math.min(c.length - 2, Math.floor(t));
    const f = t - k;
    return hex(c[k].map((v, j) => v + (c[k + 1][j] - v) * f));
  });
}
function schemeColors(scheme: Scheme, cls: string, n: number): string[] {
  if (scheme === "prrsloom") return ramp(BASE[cls] ?? BASE.other, n);
  if (scheme === "viridis") return ramp(FIXED.viridis, Math.max(n, 2)).slice(0, n);
  if (scheme === "rainbow") return Array.from({ length: n }, (_, k) => hcl(15 + (360 * k) / n, 100, 65));
  if (scheme === "pastel") return Array.from({ length: n }, (_, k) => hcl(15 + (360 * k) / n, 35, 85));
  if (scheme === "bold") return Array.from({ length: n }, (_, k) => hcl(15 + (360 * k) / n, 80, 42));
  const base = FIXED[scheme];
  // more classes than colours: later cycles are lightened so neighbouring classes stay distinct
  return Array.from({ length: n }, (_, k) => {
    const c = rgb(base[k % base.length]);
    const mix = Math.min(0.6, 0.3 * Math.floor(k / base.length));
    return hex(c.map((v) => v + (255 - v) * mix));
  });
}

/* ------------------------------------------------------------------ text width */

let measureCtx: CanvasRenderingContext2D | null | undefined;
const FONT = "Helvetica, Arial, sans-serif";
function textWidth(s: string, size: number, bold = false) {
  if (measureCtx === undefined) measureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s.length * size * 0.56;
  measureCtx.font = `${bold ? "700 " : ""}${size}px ${FONT}`;
  return measureCtx.measureText(s).width;
}

/* ------------------------------------------------------------------ geometry */

type Kind = "rectangular" | "slanted" | "cladogram" | "circular" | "unrooted";
const KINDS: { id: Kind; label: string; icon: ReactNode }[] = [
  { id: "rectangular", label: "Rectangular", icon: <path d="M3 12h3M6 6v12M6 6h12M6 18h5M11 15v6M11 15h7M11 21h7" transform="translate(0,-1.5)" /> },
  { id: "slanted", label: "Slanted", icon: <path d="M3 12l6-6h9M3 12l6 6M9 18l5-3h4M9 18l5 3h4" transform="translate(0,-1.5) scale(1,.9)" /> },
  { id: "cladogram", label: "Cladogram", icon: <path d="M3 12h3M6 5v14M6 5h13M6 19h4M10 16v6M10 16h9M10 22h9" transform="scale(.8) translate(2,-1)" /> },
  { id: "circular", label: "Circular", icon: <><circle cx="12" cy="12" r="1.5" /><path d="M12 12l5-5M12 12l-5 5M12 12l6 3M12 12l-2-7" /><path d="M18 6a8.5 8.5 0 1 1-12 12" /></> },
  { id: "unrooted", label: "Unrooted", icon: <path d="M12 12l-4-4-3 1M8 8l-1-4M12 12l5-2 3 2M17 10l1-5M12 12l1 6-3 3M13 18l4 2" /> },
];

type Topo = { parent: number[]; children: number[][]; x: number[]; y: number[]; label: (string | null)[]; tipOf: (TreeTip | null)[] };

function topology(tree: TreeLayout): Topo | null {
  if (!tree.nodes?.length) return null;
  const byLabel = new Map(tree.tips.map((t) => [t.label, t]));
  const parent = tree.nodes.map((n) => n[0]);
  const children: number[][] = tree.nodes.map(() => []);
  parent.forEach((p, i) => { if (p >= 0) children[p].push(i); });
  return {
    parent, children,
    x: tree.nodes.map((n) => n[1]),
    y: tree.nodes.map((n) => n[2]),
    label: tree.nodes.map((n) => n[3]),
    tipOf: tree.nodes.map((n, i) => (children[i].length === 0 && n[3] !== null ? byLabel.get(n[3]) ?? null : null)),
  };
}

/** x in cladogram mode: tips aligned at the deepest level, each node one step left of its deepest child. */
function cladogramX(t: Topo) {
  const h = new Array(t.x.length).fill(0);
  for (let i = t.x.length - 1; i >= 0; i--) for (const c of t.children[i]) h[i] = Math.max(h[i], h[c] + 1);
  return h.map((v) => h[0] - v);
}

/** Equal-angle unrooted layout (Felsenstein): each subtree gets an angular wedge proportional to its tips. */
function equalAngle(t: Topo) {
  const n = t.x.length;
  const tips = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) tips[i] = t.children[i].length ? t.children[i].reduce((a, c) => a + tips[c], 0) : 1;
  const px = new Array(n).fill(0), py = new Array(n).fill(0), ang = new Array(n).fill(0);
  const wedge: [number, number][] = new Array(n);
  wedge[0] = [0, 2 * Math.PI];
  for (let i = 0; i < n; i++) {
    let a = wedge[i][0];
    for (const c of t.children[i]) {
      const w = ((wedge[i][1] - wedge[i][0]) * tips[c]) / tips[i];
      wedge[c] = [a, a + w];
      const mid = a + w / 2;
      const len = Math.max(0, t.x[c] - t.x[i]);
      px[c] = px[i] + len * Math.cos(mid);
      py[c] = py[i] + len * Math.sin(mid);
      ang[c] = mid;
      a += w;
    }
  }
  return { px, py, ang };
}

/* ------------------------------------------------------------------ component */

type Style = {
  kind: Kind;
  scheme: Scheme;
  colorBy: string;          // class for tip points ("" = none)
  strips: string[];         // classes drawn as bars beside the labels
  legends: string[];        // classes with a legend
  branchByClass: boolean;
  labelByClass: boolean;
  boldUploaded: boolean;
  showLabels: boolean;
  alignLabels: boolean;
  showSupport: boolean;
  supportMin: number;
  showInternal: boolean;
  factor: number;           // px per tip (vertical expansion)
  fontSize: number;
  tipSize: number;
  branchWidth: number;
  branchColor: string;
  openAngle: number;
};

const WIDTH = 1200;
const STRIP = 14, STRIP_GAP = 3, GAP = 10;
const ENTRY = 17, TITLE = 24, BLOCK_GAP = 14, COL_W = 210;

function tipTitle(t: TreeTip) {
  const parts = [t.label, `assign.final: ${t.assign_final ?? "NA"}`, `sub_lineage: ${t.sub_lineage ?? "NA"}`];
  for (const [k, v] of Object.entries(t.meta ?? {})) parts.push(`${k}: ${v}`);
  return parts.join(" · ");
}

function tipValue(t: TreeTip, cls: string): string | null {
  if (cls === "assign_final") return t.assign_final;
  if (cls === "sub_lineage") return t.sub_lineage;
  if (cls === "extra") return t.extra;
  return t.meta?.[cls.slice(5)] ?? null;
}

export function TreeView({ tree, minHeight }: { tree: TreeLayout; minHeight: number }) {
  const topo = useMemo(() => topology(tree), [tree]);
  // classes: built-in labels plus every metadata column carried by the tips
  const classes = useMemo(() => {
    const out: { id: string; label: string }[] = [{ id: "assign_final", label: "assign.final" }, { id: "sub_lineage", label: "sub_lineage" }];
    const metaCols = tree.meta_columns ?? [];
    if (tree.extra_column && !metaCols.includes(tree.extra_column)) out.push({ id: "extra", label: tree.extra_column });
    for (const c of metaCols) out.push({ id: `meta:${c}`, label: c });
    return out;
  }, [tree]);
  const classLabel = (id: string) => classes.find((c) => c.id === id)?.label ?? id;

  const extraId = tree.extra_column ? ((tree.meta_columns ?? []).includes(tree.extra_column) ? `meta:${tree.extra_column}` : "extra") : null;
  const defaultStrips = ["sub_lineage", ...(extraId ? [extraId] : [])];
  const initial: Style = {
    kind: "rectangular", scheme: "prrsloom", colorBy: "assign_final", strips: defaultStrips, legends: ["assign_final", ...defaultStrips],
    branchByClass: false, labelByClass: false, boldUploaded: false, showLabels: true, alignLabels: false,
    showSupport: true, supportMin: 50, showInternal: true, factor: 15, fontSize: 11, tipSize: 4, branchWidth: 1, branchColor: "#111111", openAngle: 350,
  };
  const [st, setSt] = useState<Style>(initial);
  const [custom, setCustom] = useState<Record<string, Record<string, string>>>({});
  const [showPanel, setShowPanel] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const set = <K extends keyof Style>(k: K, v: Style[K]) => setSt((s) => ({ ...s, [k]: v }));
  const toggle = (k: "strips" | "legends", id: string) => setSt((s) => ({ ...s, [k]: s[k].includes(id) ? s[k].filter((x) => x !== id) : [...s[k], id] }));

  // palettes per class: category -> colour, plus tip counts for the legend
  const palettes = useMemo(() => {
    const out: Record<string, { color: Record<string, string>; count: Record<string, number> }> = {};
    for (const { id } of classes) {
      const count: Record<string, number> = {};
      for (const t of tree.tips) {
        const v = tipValue(t, id) ?? "NA";
        count[v] = (count[v] ?? 0) + 1;
      }
      const cats = rSort(Object.keys(count));
      const coloured = cats.filter((c) => !MISSING.has(c));
      const backend = st.scheme !== "prrsloom" ? null
        : id === "assign_final" ? tree.palettes.assign_final : id === "sub_lineage" ? tree.palettes.sub_lineage : id === "extra" ? tree.palettes.extra : null;
      const cols = schemeColors(st.scheme, id === "assign_final" || id === "sub_lineage" ? id : "other", coloured.length);
      const color: Record<string, string> = {};
      for (const c of cats) color[c] = backend?.[c] ?? (MISSING.has(c) ? (c === "reference" ? "#D9D9D9" : GRAY70) : cols[coloured.indexOf(c)]);
      Object.assign(color, custom[id] ?? {});
      out[id] = { color, count };
    }
    return out;
  }, [classes, tree, st.scheme, custom]);
  const colorOf = (cls: string, t: TreeTip) => palettes[cls]?.color[tipValue(t, cls) ?? "NA"] ?? GRAY70;

  const n = tree.n_tips;
  const fontSize = st.fontSize;
  const uploaded = (t: TreeTip) => t.meta?.Source === "Uploaded";
  const labelW = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tree.tips) m.set(t.label, st.showLabels ? textWidth(t.label, fontSize, st.boldUploaded && t.meta?.Source === "Uploaded") : 0);
    return m;
  }, [tree, fontSize, st.showLabels, st.boldUploaded]);

  // legend blocks, flowed into as many columns as the figure height needs
  const legend = st.legends.filter((id) => palettes[id]).map((id) => ({
    id, title: classLabel(id), shape: id === st.colorBy ? "circle" : "square",
    entries: Object.keys(palettes[id].color).filter((c) => palettes[id].count[c]),
  }));
  const radial = st.kind === "circular" || st.kind === "unrooted";
  const approxH = radial ? WIDTH - 260 : Math.max(minHeight, n * st.factor);
  const legendTotal = legend.reduce((a, b) => a + TITLE + b.entries.length * ENTRY + BLOCK_GAP, 0);
  const legendCols = legend.length ? Math.max(1, Math.ceil(legendTotal / Math.max(300, approxH - 60))) : 0;
  const legendW = legendCols * COL_W + (legendCols ? 16 : 0);

  const g = useMemo(() => {
    const OFF = st.tipSize + 4;
    const stripsW = st.strips.length ? st.strips.length * STRIP + (st.strips.length - 1) * STRIP_GAP : 0;
    const stripLead = stripsW ? GAP : 0;
    const xs = topo ? (st.kind === "cladogram" ? cladogramX(topo) : topo.x) : null;
    const tipIdx = new Map<string, number>();
    topo?.tipOf.forEach((t, i) => { if (t) tipIdx.set(t.label, i); });
    const tipX = (t: TreeTip) => (xs && tipIdx.has(t.label) ? xs[tipIdx.get(t.label)!] : t.x);
    const plotW = WIDTH - legendW - 24;
    const maxLabel = Math.max(0, ...tree.tips.map((t) => labelW.get(t.label) ?? 0));
    if (st.kind === "circular" || st.kind === "unrooted") {
      const size = Math.max(640, plotW, Math.min(2400, 2 * (OFF + maxLabel + stripLead + stripsW) + n * 4));
      return { radial: true as const, height: size + 20, width: size + legendW + 30, size, OFF, stripsW, stripLead, xs, maxLabel };
    }
    const height = Math.max(minHeight, n * st.factor);
    const top = 30, bottom = 46;
    const rowH = (height - top - bottom) / Math.max(1, n - 1);
    const sy = (y: number) => top + (n - y) * rowH;
    // Automatic overlap correction: solve the x scale so that, for every tip,
    // left + s*x + offset + label width + gap + bars <= right edge of the plot.
    const left = 14, right = left + plotW;
    const xMax = Math.max(1e-9, ...(xs ?? tree.tips.map((t) => t.x)));
    let s = (right - left - stripsW - stripLead) / xMax;
    for (const t of tree.tips) {
      const x = tipX(t);
      const w = st.alignLabels ? maxLabel : labelW.get(t.label) ?? 0;
      const room = right - left - OFF - w - stripLead - stripsW;
      if (st.alignLabels) s = Math.min(s, room / xMax);
      else if (x > 0) s = Math.min(s, room / x);
    }
    s = Math.max(s, 120 / xMax); // labels wider than the plot: keep the tree readable and widen the figure
    const sx = (x: number) => left + s * x;
    const labelX = (t: TreeTip) => (st.alignLabels ? sx(xMax) : sx(tipX(t))) + OFF;
    const labelEnd = Math.max(sx(xMax), ...tree.tips.map((t) => labelX(t) + (labelW.get(t.label) ?? 0)));
    const stripStart = labelEnd + stripLead;
    const width = Math.max(WIDTH, Math.ceil(stripStart + stripsW + 16 + legendW + 12));
    return { radial: false as const, height, width, rowH, sx, sy, labelX, stripStart, OFF, xs, tipIdx, tipX, xMax };
  }, [st.kind, st.tipSize, st.strips, st.alignLabels, st.factor, topo, tree, n, minHeight, labelW, legendW]);

  const width = g.width;
  const height = g.height;
  const legendX = width - legendW + 8;

  // a branch takes the class colour when every tip below it shares that class
  const nodeColor = useMemo(() => {
    if (!topo || !st.branchByClass || !st.colorBy) return null;
    const val: (string | null)[] = new Array(topo.x.length).fill(null);
    for (let i = topo.x.length - 1; i >= 0; i--) {
      const tip = topo.tipOf[i];
      if (tip) { val[i] = tipValue(tip, st.colorBy) ?? "NA"; continue; }
      const vs = topo.children[i].map((c) => val[c]);
      val[i] = vs.length && vs.every((v) => v !== null && v === vs[0]) ? vs[0] : null;
    }
    return val.map((v) => (v && !MISSING.has(v) ? palettes[st.colorBy]?.color[v] ?? null : null));
  }, [topo, st.branchByClass, st.colorBy, palettes]);
  const bColor = (i: number) => nodeColor?.[i] ?? st.branchColor;

  const isNumber = (lab: string) => /^\d+(\.\d+)?$/.test(lab);
  const internalText = (lab: string | null) => {
    if (!lab) return null;
    if (isNumber(lab) && Number(lab) <= 100) return st.showSupport && Number(lab) >= st.supportMin ? lab : null;
    return st.showInternal ? lab : null;
  };

  const tipFill = (t: TreeTip) => (st.colorBy ? colorOf(st.colorBy, t) : st.branchColor);
  const labelFill = (t: TreeTip) => (st.labelByClass && st.colorBy ? colorOf(st.colorBy, t) : "#111");
  const weight = (t: TreeTip) => (st.boldUploaded && uploaded(t) ? 700 : 400);
  const r = st.tipSize;
  const small = Math.max(7, fontSize - 3);
  const els: ReactNode[] = [];

  if (g.radial && topo) {
    const size = g.size;
    const cx = size / 2 + 12, cy = size / 2 + 10;
    const R = size / 2 - 16;
    const outer = g.OFF + g.maxLabel + g.stripLead + g.stripsW;
    if (st.kind === "circular") {
      const xs = g.xs!;
      const xMax = Math.max(1e-9, ...xs);
      const inner = 8;
      const sr = Math.max(10, R - outer - inner) / xMax;
      const rad = (x: number) => inner + sr * x;
      const open = (st.openAngle * Math.PI) / 180;
      const th = (y: number) => -Math.PI / 2 + ((y - 1) / Math.max(1, n - (st.openAngle >= 360 ? 0 : 1))) * open;
      const P = (rr: number, a: number): [number, number] => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      for (let i = 1; i < xs.length; i++) {
        const a = th(topo.y[i]);
        const [x1, y1] = P(rad(xs[topo.parent[i]]), a), [x2, y2] = P(rad(xs[i]), a);
        els.push(<line key={`r${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={bColor(i)} strokeWidth={st.branchWidth} />);
      }
      topo.children.forEach((ch, i) => {
        if (ch.length < 2) return;
        const ys = ch.map((c) => topo.y[c]);
        const a0 = th(Math.min(...ys)), a1 = th(Math.max(...ys));
        const rr = rad(xs[i]);
        const [x1, y1] = P(rr, a0), [x2, y2] = P(rr, a1);
        els.push(<path key={`a${i}`} d={`M${x1},${y1}A${rr},${rr} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x2},${y2}`} fill="none" stroke={bColor(i)} strokeWidth={st.branchWidth} />);
      });
      const rStrip = inner + sr * xMax + g.OFF + g.maxLabel + g.stripLead;
      const dA = open / Math.max(1, n);
      topo.tipOf.forEach((t, i) => {
        if (!t) return;
        const a = th(topo.y[i]);
        const [px, py] = P(rad(xs[i]), a);
        els.push(<circle key={`p${i}`} cx={px} cy={py} r={r} fill={tipFill(t)}><title>{tipTitle(t)}</title></circle>);
        const deg = (a * 180) / Math.PI;
        const flip = Math.cos(a) < -1e-9;
        const lr = (st.alignLabels ? inner + sr * xMax : rad(xs[i])) + g.OFF;
        const [lx, ly] = P(lr, a);
        if (st.showLabels) {
          if (st.alignLabels) {
            const [ex, ey] = P(rad(xs[i]) + r, a);
            els.push(<line key={`d${i}`} x1={ex} y1={ey} x2={lx} y2={ly} stroke="#bbb" strokeWidth={0.6} strokeDasharray="2 2" />);
          }
          els.push(<text key={`l${i}`} x={lx} y={ly} fontSize={fontSize} dominantBaseline="middle" textAnchor={flip ? "end" : "start"}
            transform={`rotate(${flip ? deg + 180 : deg} ${lx} ${ly})`} fill={labelFill(t)} fontWeight={weight(t)}>{t.label}</text>);
        }
        st.strips.forEach((cls, k) => {
          const r0 = rStrip + k * (STRIP + STRIP_GAP), r1 = r0 + STRIP;
          const b0 = a - dA / 2, b1 = a + dA / 2;
          const [ax, ay] = P(r0, b0), [bx, by] = P(r1, b0), [qx, qy] = P(r1, b1), [dx, dy] = P(r0, b1);
          const c = colorOf(cls, t);
          els.push(<path key={`s${cls}${i}`} d={`M${ax},${ay}L${bx},${by}A${r1},${r1} 0 0 1 ${qx},${qy}L${dx},${dy}A${r0},${r0} 0 0 0 ${ax},${ay}Z`}
            fill={c} stroke={c} strokeWidth={0.3}><title>{`${t.label} · ${classLabel(cls)}: ${tipValue(t, cls) ?? "NA"}`}</title></path>);
        });
      });
      topo.label.forEach((lab, i) => {
        const txt = topo.tipOf[i] ? null : internalText(lab);
        if (!txt) return;
        const [x, y] = P(rad(xs[i]), th(topo.y[i]));
        els.push(<text key={`n${i}`} x={x - 2} y={y - 2} fontSize={small} textAnchor="end" fill="#666">{txt}</text>);
      });
    } else {
      const { px, py, ang } = equalAngle(topo);
      const minX = Math.min(...px), maxX = Math.max(...px), minY = Math.min(...py), maxY = Math.max(...py);
      const avail = size - 2 * outer - 30;
      const s = Math.max(5, Math.min(avail / Math.max(1e-9, maxX - minX), avail / Math.max(1e-9, maxY - minY)));
      const ox = cx - ((minX + maxX) / 2) * s, oy = cy - ((minY + maxY) / 2) * s;
      const X = (i: number) => ox + px[i] * s, Y = (i: number) => oy + py[i] * s;
      for (let i = 1; i < px.length; i++) {
        els.push(<line key={`u${i}`} x1={X(topo.parent[i])} y1={Y(topo.parent[i])} x2={X(i)} y2={Y(i)} stroke={bColor(i)} strokeWidth={st.branchWidth} strokeLinecap="round" />);
      }
      topo.tipOf.forEach((t, i) => {
        if (!t) return;
        const a = ang[i], deg = (a * 180) / Math.PI, flip = Math.cos(a) < -1e-9;
        const dx = Math.cos(a), dy = Math.sin(a);
        els.push(<circle key={`p${i}`} cx={X(i)} cy={Y(i)} r={r} fill={tipFill(t)}><title>{tipTitle(t)}</title></circle>);
        const lx = X(i) + dx * g.OFF, ly = Y(i) + dy * g.OFF;
        if (st.showLabels) els.push(<text key={`l${i}`} x={lx} y={ly} fontSize={fontSize} dominantBaseline="middle" textAnchor={flip ? "end" : "start"}
          transform={`rotate(${flip ? deg + 180 : deg} ${lx} ${ly})`} fill={labelFill(t)} fontWeight={weight(t)}>{t.label}</text>);
        const w = labelW.get(t.label) ?? 0;
        st.strips.forEach((cls, k) => {
          const d0 = g.OFF + w + g.stripLead + k * (STRIP + STRIP_GAP) + STRIP / 2;
          const sx0 = X(i) + dx * d0, sy0 = Y(i) + dy * d0;
          els.push(<rect key={`s${cls}${i}`} x={sx0 - STRIP / 2} y={sy0 - STRIP / 2} width={STRIP} height={STRIP} transform={`rotate(${deg} ${sx0} ${sy0})`}
            fill={colorOf(cls, t)}><title>{`${t.label} · ${classLabel(cls)}: ${tipValue(t, cls) ?? "NA"}`}</title></rect>);
        });
      });
      topo.label.forEach((lab, i) => {
        const txt = topo.tipOf[i] ? null : internalText(lab);
        if (txt) els.push(<text key={`n${i}`} x={X(i) + 3} y={Y(i) - 3} fontSize={small} fill="#666">{txt}</text>);
      });
    }
  } else if (!g.radial) {
    const { sx, sy, labelX, stripStart, xs, tipX } = g;
    if (topo && xs) {
      for (let i = 1; i < xs.length; i++) {
        const p = topo.parent[i];
        if (st.kind === "slanted") {
          els.push(<line key={`b${i}`} x1={sx(xs[p])} y1={sy(topo.y[p])} x2={sx(xs[i])} y2={sy(topo.y[i])} stroke={bColor(i)} strokeWidth={st.branchWidth} strokeLinecap="round" />);
        } else {
          els.push(<line key={`b${i}`} x1={sx(xs[p])} y1={sy(topo.y[i])} x2={sx(xs[i])} y2={sy(topo.y[i])} stroke={bColor(i)} strokeWidth={st.branchWidth} strokeLinecap="square" />);
        }
      }
      if (st.kind !== "slanted") topo.children.forEach((ch, i) => {
        if (ch.length < 2) return;
        const ys = ch.map((c) => topo.y[c]);
        els.push(<line key={`v${i}`} x1={sx(xs[i])} y1={sy(Math.min(...ys))} x2={sx(xs[i])} y2={sy(Math.max(...ys))} stroke={bColor(i)} strokeWidth={st.branchWidth} strokeLinecap="square" />);
      });
    } else {
      tree.segments.forEach(([x1, y1, x2, y2], i) => els.push(<line key={`g${i}`} x1={sx(x1)} y1={sy(y1)} x2={sx(x2)} y2={sy(y2)} stroke={st.branchColor} strokeWidth={st.branchWidth} />));
    }
    for (const t of tree.tips) {
      const x = tipX(t);
      const y = sy(t.y);
      if (st.alignLabels && st.showLabels) els.push(<line key={`d${t.label}`} x1={sx(x) + r + 1} y1={y} x2={labelX(t) - 2} y2={y} stroke="#bbb" strokeWidth={0.6} strokeDasharray="2 2" />);
      if (r > 0) els.push(<circle key={`p${t.label}`} cx={sx(x)} cy={y} r={r} fill={tipFill(t)}><title>{tipTitle(t)}</title></circle>);
      if (st.showLabels) els.push(<text key={`l${t.label}`} x={labelX(t)} y={y} dominantBaseline="middle" fontSize={fontSize} fill={labelFill(t)} fontWeight={weight(t)}>{t.label}</text>);
      st.strips.forEach((cls, k) => els.push(
        <rect key={`s${cls}${t.label}`} x={stripStart + k * (STRIP + STRIP_GAP)} y={y - g.rowH / 2} width={STRIP} height={Math.max(1, g.rowH)} fill={colorOf(cls, t)}>
          <title>{`${t.label} · ${classLabel(cls)}: ${tipValue(t, cls) ?? "NA"}`}</title>
        </rect>));
    }
    const internals = topo && xs
      ? topo.label.map((lab, i) => ({ lab: topo.tipOf[i] ? null : lab, x: xs[i], y: topo.y[i] }))
      : tree.internal_labels.map((l) => ({ lab: l.label, x: l.x, y: l.y }));
    internals.forEach(({ lab, x, y }, i) => {
      const txt = internalText(lab);
      if (!txt) return;
      const support = isNumber(txt);
      els.push(<text key={`n${i}`} x={sx(x) + (support ? -2 : 3)} y={sy(y) - (support ? 3 : 0)} textAnchor={support ? "end" : "start"}
        dominantBaseline={support ? "auto" : "middle"} fontSize={support ? small : fontSize} fill={support ? "#666" : "#333"}>{txt}</text>);
    });
    // headers above the annotation bars
    st.strips.forEach((cls, k) => {
      const x = stripStart + k * (STRIP + STRIP_GAP) + STRIP / 2;
      els.push(<text key={`h${cls}`} x={x} y={22} fontSize={9} fontWeight={700} transform={`rotate(-40 ${x} 22)`} fill="#333">{classLabel(cls)}</text>);
    });
  }

  // legend columns on the right
  const legendEls: ReactNode[] = [];
  {
    const colH = Math.max(300, height - 60);
    let col = 0, y = 26;
    for (const b of legend) {
      const h = TITLE + b.entries.length * ENTRY;
      if (y > 26 && y + h > colH) { col++; y = 26; }
      const x0 = legendX + col * COL_W;
      legendEls.push(<text key={`lt${b.id}`} x={x0} y={y} fontSize={12} fontWeight={700} fill="#111">{b.title}</text>);
      b.entries.forEach((name, k) => {
        const yy = y + 18 + k * ENTRY;
        const c = palettes[b.id].color[name];
        legendEls.push(
          <g key={`le${b.id}${name}`}>
            {b.shape === "circle" ? <circle cx={x0 + 6} cy={yy} r={5} fill={c} /> : <rect x={x0} y={yy - 6} width={12} height={12} fill={c} />}
            <text x={x0 + 18} y={yy} dominantBaseline="middle" fontSize={11} fill="#222">{name}<tspan fill="#888"> ({palettes[b.id].count[name]})</tspan></text>
          </g>);
      });
      y += h + BLOCK_GAP;
    }
  }

  const fileBase = `PRRSLoom_tree_${st.kind}_${today()}`;
  const exportPng = async () => {
    if (!svgRef.current) return;
    const k = Math.min(3, 16000 / Math.max(width, height), Math.sqrt(200e6 / (width * height)));
    await exportSvg(svgRef.current, `${fileBase}.png`, Math.round(width * k), Math.round(height * k));
  };
  const exportSvgFile = () => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.removeAttribute("style");
    downloadText(`${fileBase}.svg`, new XMLSerializer().serializeToString(clone), "image/svg+xml");
  };

  const kinds = topo ? KINDS : KINDS.filter((k) => k.id === "rectangular");
  const editable = st.legends.filter((id) => palettes[id]);
  const selectCls = "mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-cyan-300/50";

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Tree style</span>
          {kinds.map((k) => (
            <button key={k.id} type="button" aria-pressed={st.kind === k.id} onClick={() => set("kind", k.id)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition ${st.kind === k.id
                ? "border-cyan-300 bg-cyan-400 text-slate-950" : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-cyan-300/50"}`}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>{k.icon}</svg>
              {k.label}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowPanel((v) => !v)} className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-bold text-slate-300 hover:border-purple-300/50">
              {showPanel ? "Hide options" : "Customise"}
            </button>
            <button type="button" onClick={exportSvgFile} className="rounded-xl bg-white/10 px-3 py-1.5 text-xs font-black text-white hover:bg-white/20">Download SVG</button>
            <button type="button" onClick={exportPng} className="rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 px-3 py-1.5 text-xs font-black text-slate-950 hover:brightness-110">Download PNG (high-res)</button>
          </div>
        </div>

        {showPanel && (
          <div className="mt-4 grid gap-5 lg:grid-cols-3">
            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Colours</p>
              <label className="block text-xs font-bold text-slate-200">Colour tips by
                <select value={st.colorBy} onChange={(e) => set("colorBy", e.target.value)} className={selectCls}>
                  <option value="">No class (single colour)</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-200">Colour scheme
                <select value={st.scheme} onChange={(e) => { set("scheme", e.target.value as Scheme); setCustom({}); }} className={selectCls}>
                  {SCHEMES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="flex items-center justify-between text-xs font-bold text-slate-200">Branch colour
                <input type="color" value={st.branchColor} onChange={(e) => set("branchColor", e.target.value)} className="h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
              </label>
              <Toggle label="Colour branches by class" checked={st.branchByClass} onChange={(v) => set("branchByClass", v)} />
              <Toggle label="Colour tip labels by class" checked={st.labelByClass} onChange={(v) => set("labelByClass", v)} />
              {(tree.meta_columns ?? []).includes("Source") && <Toggle label="Bold uploaded sequences" checked={st.boldUploaded} onChange={(v) => set("boldUploaded", v)} />}
            </div>
            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Metadata bars &amp; legends</p>
              <div className="max-h-56 overflow-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr><th className="px-2 py-1.5 text-left">Class</th><th className="px-2">Bar</th><th className="px-2">Legend</th></tr></thead>
                  <tbody>
                    {classes.map((c) => (
                      <tr key={c.id} className="border-t border-white/5 text-slate-200">
                        <td className="px-2 py-1.5 font-semibold">{c.label}<span className="ml-1 text-slate-500">({Object.keys(palettes[c.id]?.count ?? {}).length})</span></td>
                        <td className="text-center"><input type="checkbox" aria-label={`Bar for ${c.label}`} checked={st.strips.includes(c.id)} onChange={() => toggle("strips", c.id)} className="h-4 w-4 accent-cyan-400" /></td>
                        <td className="text-center"><input type="checkbox" aria-label={`Legend for ${c.label}`} checked={st.legends.includes(c.id)} onChange={() => toggle("legends", c.id)} className="h-4 w-4 accent-cyan-400" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Toggle label="Show tip labels" checked={st.showLabels} onChange={(v) => set("showLabels", v)} />
              <Toggle label="Align tip labels (dotted leaders)" checked={st.alignLabels} onChange={(v) => set("alignLabels", v)} />
              <Toggle label="Show bootstrap / support values" checked={st.showSupport} onChange={(v) => set("showSupport", v)} />
              {st.showSupport && <Slider label="Show support from" value={st.supportMin} min={0} max={100} step={5} onChange={(v) => set("supportMin", v)} format={(v) => `≥ ${v}%`} />}
            </div>
            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Size &amp; shape</p>
              {!radial && <Slider label="Vertical expansion" value={st.factor} min={8} max={150} step={1} onChange={(v) => set("factor", v)} format={(v) => `${v} px/tip`} />}
              {st.kind === "circular" && <Slider label="Circle opening" value={st.openAngle} min={180} max={360} step={5} onChange={(v) => set("openAngle", v)} format={(v) => `${v}°`} />}
              <Slider label="Label size" value={st.fontSize} min={6} max={20} step={0.5} onChange={(v) => set("fontSize", v)} />
              <Slider label="Tip point size" value={st.tipSize} min={0} max={10} step={0.5} onChange={(v) => set("tipSize", v)} />
              <Slider label="Branch width" value={st.branchWidth} min={0.3} max={4} step={0.1} onChange={(v) => set("branchWidth", v)} />
              <button type="button" onClick={() => { setSt(initial); setCustom({}); }} className="w-full rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-slate-300 hover:border-cyan-300/50">Reset style</button>
            </div>
          </div>
        )}

        {showPanel && editable.length > 0 && (
          <details className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-xs font-black text-slate-200">Edit individual colours</summary>
            <div className="mt-3 max-h-72 space-y-3 overflow-auto">
              {editable.map((id) => (
                <div key={id}>
                  <p className="mb-1 text-[11px] font-bold text-slate-400">{classLabel(id)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(palettes[id].color).filter((c) => palettes[id].count[c]).map((cat) => (
                      <label key={cat} className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] py-0.5 pl-0.5 pr-2 text-[11px] text-slate-200">
                        <input type="color" value={palettes[id].color[cat]} aria-label={`${classLabel(id)} ${cat}`}
                          onChange={(e) => setCustom((c) => ({ ...c, [id]: { ...(c[id] ?? {}), [cat]: e.target.value } }))}
                          className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0" />
                        {cat}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="overflow-auto rounded-2xl border border-white/10 bg-white" style={{ maxHeight: "85vh" }}>
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width="100%" style={{ minWidth: Math.min(width, 900) }} role="img"
          aria-label={`Annotated phylogenetic tree with ${n} tips (${st.kind} layout)`} className="block" fontFamily={FONT}>
          <rect width={width} height={height} fill="#ffffff" />
          {els}
          {legendEls}
          <text x={width - 12} y={height - 8} textAnchor="end" fontSize={12} fontStyle="italic" fill="#595959">{tree.caption}</text>
        </svg>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-200">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? "bg-cyan-400" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
