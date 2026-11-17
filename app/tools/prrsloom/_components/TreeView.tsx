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

/* ------------------------------------------------------------------ text and shapes */

const FONTS: { id: string; label: string }[] = [
  { id: "Helvetica, Arial, sans-serif", label: "Helvetica / Arial" },
  { id: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { id: "Georgia, serif", label: "Georgia" },
  { id: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { id: "'Courier New', Courier, monospace", label: "Courier (monospace)" },
];

let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(s: string, size: number, font: string, bold = false, italic = false) {
  if (measureCtx === undefined) measureCtx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!measureCtx) return s.length * size * 0.6;
  measureCtx.font = `${italic ? "italic " : ""}${bold ? "700 " : ""}${size}px ${font}`;
  return measureCtx.measureText(s).width;
}

type Shape = "circle" | "square" | "triangle" | "diamond" | "inverted" | "star";
const SHAPES: Shape[] = ["circle", "triangle", "square", "diamond", "inverted", "star"];

function glyph(key: string, shape: Shape, x: number, y: number, r: number, fill: string, title?: string, stroke?: string) {
  const t = title ? <title>{title}</title> : null;
  const common = { fill, stroke, strokeWidth: stroke ? 0.8 : undefined };
  if (shape === "circle") return <circle key={key} cx={x} cy={y} r={r} {...common}>{t}</circle>;
  if (shape === "square") return <rect key={key} x={x - r * 0.9} y={y - r * 0.9} width={r * 1.8} height={r * 1.8} {...common}>{t}</rect>;
  const pts =
    shape === "triangle" ? [[0, -1.15], [1.05, 0.75], [-1.05, 0.75]]
      : shape === "inverted" ? [[0, 1.15], [1.05, -0.75], [-1.05, -0.75]]
        : shape === "diamond" ? [[0, -1.25], [1.1, 0], [0, 1.25], [-1.1, 0]]
          : Array.from({ length: 10 }, (_, k) => {
            const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? 0.5 : 1.25;
            return [rr * Math.cos(a), rr * Math.sin(a)];
          });
  return <polygon key={key} points={pts.map(([px, py]) => `${x + px * r},${y + py * r}`).join(" ")} {...common}>{t}</polygon>;
}

/** A round scale-bar length (1, 2 or 5 x 10^k) about a fifth of ``span``. */
function niceLength(span: number) {
  const target = span / 5;
  if (!(target > 0)) return 0;
  const p = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((m) => m * p).reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
}

/* ------------------------------------------------------------------ geometry */

type Kind = "rectangular" | "slanted" | "cladogram" | "circular" | "fan" | "unrooted";
const KINDS: { id: Kind; label: string; icon: ReactNode }[] = [
  { id: "rectangular", label: "Rectangular", icon: <path d="M3 12h3M6 6v12M6 6h12M6 18h5M11 15v6M11 15h7M11 21h7" transform="translate(0,-1.5)" /> },
  { id: "slanted", label: "Slanted", icon: <path d="M3 12l6-6h9M3 12l6 6M9 18l5-3h4M9 18l5 3h4" transform="translate(0,-1.5) scale(1,.9)" /> },
  { id: "cladogram", label: "Cladogram", icon: <path d="M3 12h3M6 5v14M6 5h13M6 19h4M10 16v6M10 16h9M10 22h9" transform="scale(.8) translate(2,-1)" /> },
  { id: "circular", label: "Circular", icon: <><circle cx="12" cy="12" r="1.5" /><path d="M12 12l5-5M12 12l-5 5M12 12l6 3M12 12l-2-7" /><path d="M18 6a8.5 8.5 0 1 1-12 12" /></> },
  { id: "fan", label: "Fan", icon: <><path d="M3 19a9 9 0 0 1 18 0" /><path d="M12 19l-6-7M12 19l0-9M12 19l6-7" /></> },
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
  colorBy: string;          // class for tip symbols ("" = none)
  shapeBy: string;          // class for tip symbol shapes ("" = one shape)
  tipShape: Shape;
  strips: string[];         // classes drawn as bars beside the labels
  legends: string[];        // classes with a legend
  shadeBy: string;          // class shading the tree background row by row ("" = none)
  branchByClass: boolean;
  labelByClass: boolean;
  boldUploaded: boolean;
  italic: boolean;
  font: string;
  showLabels: boolean;
  alignLabels: boolean;
  showSupport: boolean;
  supportMin: number;
  showInternal: boolean;
  scaleBar: boolean;
  title: string;
  legendPos: "right" | "bottom";
  factor: number;           // px per tip (vertical expansion)
  fontSize: number;
  tipSize: number;
  branchWidth: number;
  branchColor: string;
  openAngle: number;        // circular
  fanAngle: number;         // fan
  stripWidth: number;
};

const WIDTH = 1200;
const STRIP_GAP = 3, GAP = 10;
const ENTRY = 17, TITLE = 24, BLOCK_GAP = 14, COL_W = 210, BOTTOM_ROWS = 12;

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

export function TreeView({ tree, minHeight, units = "substitutions/site" }: { tree: TreeLayout; minHeight: number; units?: string }) {
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
    kind: "rectangular", scheme: "prrsloom", colorBy: "assign_final", shapeBy: "", tipShape: "circle",
    strips: defaultStrips, legends: ["assign_final", ...defaultStrips], shadeBy: "",
    branchByClass: false, labelByClass: false, boldUploaded: false, italic: false, font: FONTS[0].id,
    showLabels: true, alignLabels: false, showSupport: true, supportMin: 50, showInternal: true, scaleBar: true, title: "", legendPos: "right",
    factor: 15, fontSize: 11, tipSize: 4, branchWidth: 1, branchColor: "#111111", openAngle: 350, fanAngle: 180, stripWidth: 14,
  };
  const [st, setSt] = useState<Style>(initial);
  const [custom, setCustom] = useState<Record<string, Record<string, string>>>({});
  const [showPanel, setShowPanel] = useState(true);
  const svgRef = useRef<SVGSVGElement>(null);
  const set = <K extends keyof Style>(k: K, v: Style[K]) => setSt((s) => ({ ...s, [k]: v }));
  const toggle = (k: "strips" | "legends", id: string) => setSt((s) => ({ ...s, [k]: s[k].includes(id) ? s[k].filter((x) => x !== id) : [...s[k], id] }));

  // palettes per class: category -> colour, plus tip counts for the legend
  const palettes = useMemo(() => {
    const out: Record<string, { color: Record<string, string>; count: Record<string, number>; cats: string[] }> = {};
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
      out[id] = { color, count, cats };
    }
    return out;
  }, [classes, tree, st.scheme, custom]);
  const colorOf = (cls: string, t: TreeTip) => palettes[cls]?.color[tipValue(t, cls) ?? "NA"] ?? GRAY70;
  const shapeOf = (t: TreeTip): Shape => {
    if (!st.shapeBy || !palettes[st.shapeBy]) return st.tipShape;
    const k = palettes[st.shapeBy].cats.indexOf(tipValue(t, st.shapeBy) ?? "NA");
    return SHAPES[(Math.max(0, k) + SHAPES.indexOf(st.tipShape)) % SHAPES.length];
  };

  const n = tree.n_tips;
  const fontSize = st.fontSize;
  const STRIP = st.stripWidth;
  const uploaded = (t: TreeTip) => t.meta?.Source === "Uploaded";
  const labelW = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tree.tips) m.set(t.label, st.showLabels ? textWidth(t.label, fontSize, st.font, st.boldUploaded && t.meta?.Source === "Uploaded", st.italic) : 0);
    return m;
  }, [tree, fontSize, st.showLabels, st.boldUploaded, st.font, st.italic]);

  // legend blocks (colour classes, plus the shape class)
  type Block = { id: string; title: string; kind: "color" | "shape"; shape: Shape; entries: string[] };
  const legend: Block[] = st.legends.filter((id) => palettes[id]).map((id) => ({
    id, title: classLabel(id), kind: "color", shape: id === st.colorBy ? st.tipShape : "square",
    entries: palettes[id].cats,
  }));
  if (st.shapeBy && palettes[st.shapeBy]) legend.push({ id: `shape:${st.shapeBy}`, title: `${classLabel(st.shapeBy)} (shape)`, kind: "shape", shape: "circle", entries: palettes[st.shapeBy].cats });
  const radial = st.kind === "circular" || st.kind === "fan" || st.kind === "unrooted";
  const titleH = st.title.trim() ? 34 : 0;
  const scaleH = st.scaleBar && st.kind !== "cladogram" ? 26 : 0;
  // right legend: columns flowing down; bottom legend: blocks of up to BOTTOM_ROWS entries side by side
  const approxH = radial ? WIDTH - 260 : Math.max(minHeight, n * st.factor);
  const legendTotal = legend.reduce((a, b) => a + TITLE + b.entries.length * ENTRY + BLOCK_GAP, 0);
  const rightCols = st.legendPos === "right" && legend.length ? Math.max(1, Math.ceil(legendTotal / Math.max(300, approxH - 60))) : 0;
  const legendW = rightCols * COL_W + (rightCols ? 16 : 0);

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
    const top = 30 + titleH;
    if (st.kind === "circular" || st.kind === "fan" || st.kind === "unrooted") {
      const size = Math.max(640, plotW, Math.min(2400, 2 * (OFF + maxLabel + stripLead + stripsW) + n * 4));
      const half = st.kind === "fan" && st.fanAngle <= 180;
      const plotH = half ? size / 2 + 40 : size + 20;
      return { radial: true as const, top, plotH, height: top + plotH + scaleH, width: Math.max(WIDTH, size + legendW + 30), size, OFF, stripsW, stripLead, xs, maxLabel, half };
    }
    const plotH = Math.max(minHeight, n * st.factor);
    const bottom = 30;
    const rowH = (plotH - 30 - bottom) / Math.max(1, n - 1);
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
    // room on the right for the rotated bar headers
    const headerRoom = st.strips.length ? Math.max(...st.strips.map((c) => textWidth(classLabel(c), 9, st.font, true))) * 0.77 : 0;
    const width = Math.max(WIDTH, Math.ceil(stripStart + stripsW + Math.max(16, headerRoom + 8) + legendW + 12));
    return { radial: false as const, top, plotH, height: top + plotH - 30 + scaleH, width, rowH, sx, sy, s, labelX, stripStart, OFF, xs, tipX, xMax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.kind, st.tipSize, st.strips, st.alignLabels, st.factor, st.fanAngle, st.font, STRIP, topo, tree, n, minHeight, labelW, legendW, titleH, scaleH, classes]);

  // bottom legend size
  const bottomBlocks = st.legendPos === "bottom" ? legend.flatMap((b) => {
    const parts: Block[] = [];
    for (let k = 0; k < b.entries.length; k += BOTTOM_ROWS) parts.push({ ...b, title: k ? "" : b.title, entries: b.entries.slice(k, k + BOTTOM_ROWS) });
    return parts;
  }) : [];
  const perRow = Math.max(1, Math.floor((g.width - 40) / COL_W));
  const bottomRows = Math.ceil(bottomBlocks.length / perRow);
  const bottomRowH = TITLE + BOTTOM_ROWS * ENTRY + BLOCK_GAP;
  const legendH = bottomBlocks.length ? bottomRows * Math.min(bottomRowH, TITLE + Math.max(...bottomBlocks.map((b) => b.entries.length)) * ENTRY + BLOCK_GAP) + 10 : 0;
  const width = g.width;
  const height = g.height + legendH + 22;
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
  const fstyle = st.italic ? "italic" : "normal";
  const r = st.tipSize;
  const small = Math.max(7, fontSize - 3);
  const els: ReactNode[] = [];
  const back: ReactNode[] = [];
  const tipGlyph = (key: string, t: TreeTip, x: number, y: number) => (r > 0 ? glyph(key, shapeOf(t), x, y, r, tipFill(t), tipTitle(t)) : null);
  const scaleBar = (pxPerUnit: number, span: number, x0: number, y0: number) => {
    const len = niceLength(span);
    if (!len || !st.scaleBar) return;
    const w = len * pxPerUnit;
    els.push(<g key="scale">
      <line x1={x0} y1={y0} x2={x0 + w} y2={y0} stroke="#111" strokeWidth={1.5} />
      <line x1={x0} y1={y0 - 4} x2={x0} y2={y0 + 4} stroke="#111" strokeWidth={1.2} />
      <line x1={x0 + w} y1={y0 - 4} x2={x0 + w} y2={y0 + 4} stroke="#111" strokeWidth={1.2} />
      <text x={x0 + w + 8} y={y0} dominantBaseline="middle" fontSize={11} fill="#111">{`${+len.toPrecision(3)} ${units}`}</text>
    </g>);
  };

  if (g.radial && topo) {
    const size = g.size;
    const cx = size / 2 + 12;
    const R = size / 2 - 16;
    const cy = g.top + (g.half ? R + 10 : size / 2 - 10);
    const outer = g.OFF + g.maxLabel + g.stripLead + g.stripsW;
    if (st.kind === "circular" || st.kind === "fan") {
      const xs = g.xs!;
      const xMax = Math.max(1e-9, ...xs);
      const inner = 8;
      const sr = Math.max(10, R - outer - inner) / xMax;
      const rad = (x: number) => inner + sr * x;
      const deg0 = st.kind === "fan" ? st.fanAngle : st.openAngle;
      const open = (deg0 * Math.PI) / 180;
      const start = st.kind === "fan" ? -Math.PI / 2 - open / 2 : -Math.PI / 2;
      const th = (y: number) => start + ((y - 1) / Math.max(1, n - (deg0 >= 360 ? 0 : 1))) * open;
      const P = (rr: number, a: number): [number, number] => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
      const dA = open / Math.max(1, n);
      if (st.shadeBy && palettes[st.shadeBy]) topo.tipOf.forEach((t, i) => {
        if (!t) return;
        const a = th(topo.y[i]), b0 = a - dA / 2, b1 = a + dA / 2, r1 = inner + sr * xMax + g.OFF + g.maxLabel;
        const [ax, ay] = P(inner, b0), [bx, by] = P(r1, b0), [qx, qy] = P(r1, b1), [ex, ey] = P(inner, b1);
        back.push(<path key={`sh${i}`} d={`M${ax},${ay}L${bx},${by}A${r1},${r1} 0 0 1 ${qx},${qy}L${ex},${ey}Z`} fill={colorOf(st.shadeBy, t)} fillOpacity={0.16} stroke={colorOf(st.shadeBy, t)} strokeOpacity={0.16} strokeWidth={0.8} />);
      });
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
      topo.tipOf.forEach((t, i) => {
        if (!t) return;
        const a = th(topo.y[i]);
        const [px, py] = P(rad(xs[i]), a);
        els.push(tipGlyph(`p${i}`, t, px, py));
        const deg = (a * 180) / Math.PI;
        const flip = Math.cos(a) < -1e-9;
        const lr = (st.alignLabels ? inner + sr * xMax : rad(xs[i])) + g.OFF;
        const [lx, ly] = P(lr, a);
        if (st.showLabels) {
          if (st.alignLabels) {
            const [ex, ey] = P(rad(xs[i]) + r, a);
            els.push(<line key={`d${i}`} x1={ex} y1={ey} x2={lx} y2={ly} stroke="#bbb" strokeWidth={0.6} strokeDasharray="2 2" />);
          }
          els.push(<text key={`l${i}`} x={lx} y={ly} fontSize={fontSize} dominantBaseline="middle" textAnchor={flip ? "end" : "start"} fontStyle={fstyle}
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
      scaleBar(sr, xMax, 24, g.top + g.plotH + 4);
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
        if (st.shadeBy && palettes[st.shadeBy]) back.push(<circle key={`sh${i}`} cx={X(i)} cy={Y(i)} r={Math.max(6, r * 2.4)} fill={colorOf(st.shadeBy, t)} fillOpacity={0.25} />);
        els.push(tipGlyph(`p${i}`, t, X(i), Y(i)));
        const lx = X(i) + dx * g.OFF, ly = Y(i) + dy * g.OFF;
        if (st.showLabels) els.push(<text key={`l${i}`} x={lx} y={ly} fontSize={fontSize} dominantBaseline="middle" textAnchor={flip ? "end" : "start"} fontStyle={fstyle}
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
      scaleBar(s, maxX - minX, 24, g.top + g.plotH + 4);
    }
  } else if (!g.radial) {
    const { sx, sy, labelX, stripStart, xs, tipX } = g;
    if (st.shadeBy && palettes[st.shadeBy]) {
      // contiguous runs of tips sharing a class value become one shaded band behind the tree
      const ordered = [...tree.tips].sort((a, b) => b.y - a.y);
      let k = 0;
      while (k < ordered.length) {
        const v = tipValue(ordered[k], st.shadeBy) ?? "NA";
        let e = k;
        while (e + 1 < ordered.length && (tipValue(ordered[e + 1], st.shadeBy) ?? "NA") === v) e++;
        const y0 = sy(ordered[k].y) - g.rowH / 2, y1 = sy(ordered[e].y) + g.rowH / 2;
        if (!MISSING.has(v)) back.push(<rect key={`sh${k}`} x={4} y={y0} width={stripStart - 8} height={y1 - y0} fill={colorOf(st.shadeBy, ordered[k])} fillOpacity={0.14} />);
        k = e + 1;
      }
    }
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
      els.push(tipGlyph(`p${t.label}`, t, sx(x), y));
      if (st.showLabels) els.push(<text key={`l${t.label}`} x={labelX(t)} y={y} dominantBaseline="middle" fontSize={fontSize} fill={labelFill(t)} fontWeight={weight(t)} fontStyle={fstyle}>{t.label}</text>);
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
      els.push(<text key={`h${cls}`} x={x} y={g.top - 8} fontSize={9} fontWeight={700} transform={`rotate(-40 ${x} ${g.top - 8})`} fill="#333">{classLabel(cls)}</text>);
    });
    if (st.kind !== "cladogram") scaleBar(g.s, g.xMax, 18, g.top + g.plotH - 40);
  }

  // legends
  const legendEls: ReactNode[] = [];
  const drawBlock = (b: Block, x0: number, y: number, key: string) => {
    if (b.title) legendEls.push(<text key={`lt${key}`} x={x0} y={y} fontSize={12} fontWeight={700} fill="#111">{b.title}</text>);
    b.entries.forEach((name, k) => {
      const yy = y + 18 + k * ENTRY;
      const cls = b.kind === "shape" ? b.id.slice(6) : b.id;
      const count = palettes[cls]?.count[name] ?? 0;
      const sym = b.kind === "shape"
        ? glyph(`g${key}${name}`, SHAPES[(palettes[cls].cats.indexOf(name) + SHAPES.indexOf(st.tipShape)) % SHAPES.length], x0 + 6, yy, 5, "#777")
        : b.shape === "square" ? <rect key={`g${key}${name}`} x={x0} y={yy - 6} width={12} height={12} fill={palettes[cls].color[name]} />
          : glyph(`g${key}${name}`, b.shape, x0 + 6, yy, 5, palettes[cls].color[name]);
      legendEls.push(<g key={`le${key}${name}`}>{sym}
        <text x={x0 + 18} y={yy} dominantBaseline="middle" fontSize={11} fill="#222">{name}<tspan fill="#888"> ({count})</tspan></text></g>);
    });
  };
  if (st.legendPos === "right") {
    const colH = Math.max(300, g.height - 60);
    let col = 0, y = 26 + titleH;
    for (const b of legend) {
      const h = TITLE + b.entries.length * ENTRY;
      if (y > 26 + titleH && y + h > colH) { col++; y = 26 + titleH; }
      drawBlock(b, legendX + col * COL_W, y, b.id);
      y += h + BLOCK_GAP;
    }
  } else {
    bottomBlocks.forEach((b, k) => {
      const row = Math.floor(k / perRow), col = k % perRow;
      const rowH = legendH / Math.max(1, bottomRows);
      drawBlock(b, 24 + col * COL_W, g.height + 14 + row * rowH, `${b.id}${k}`);
    });
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
  const classOptions = (none: string) => [<option key="" value="">{none}</option>, ...classes.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)];

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
        {!topo && <p className="mt-2 text-xs text-slate-400">This result was computed before tree topology was stored; re-run the analysis to use the other tree styles.</p>}

        {showPanel && (
          <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Colours</p>
              <label className="block text-xs font-bold text-slate-200">Colour tips by
                <select value={st.colorBy} onChange={(e) => set("colorBy", e.target.value)} className={selectCls}>{classOptions("No class (single colour)")}</select>
              </label>
              <label className="block text-xs font-bold text-slate-200">Colour scheme
                <select value={st.scheme} onChange={(e) => { set("scheme", e.target.value as Scheme); setCustom({}); }} className={selectCls}>
                  {SCHEMES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-200">Shade background by
                <select value={st.shadeBy} onChange={(e) => set("shadeBy", e.target.value)} className={selectCls}>{classOptions("No shading")}</select>
              </label>
              <label className="flex items-center justify-between text-xs font-bold text-slate-200">Branch colour
                <input type="color" value={st.branchColor} onChange={(e) => set("branchColor", e.target.value)} className="h-7 w-12 cursor-pointer rounded border border-white/10 bg-transparent" />
              </label>
              <Toggle label="Colour branches by class" checked={st.branchByClass} onChange={(v) => set("branchByClass", v)} />
              <Toggle label="Colour tip labels by class" checked={st.labelByClass} onChange={(v) => set("labelByClass", v)} />
            </div>
            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Metadata bars &amp; legends</p>
              <div className="max-h-56 overflow-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr><th className="px-2 py-1.5 text-left">Class</th><th className="px-2">Bar</th><th className="px-2">Legend</th></tr></thead>
                  <tbody>
                    {classes.map((c) => (
                      <tr key={c.id} className="border-t border-white/5 text-slate-200">
                        <td className="px-2 py-1.5 font-semibold">{c.label}<span className="ml-1 text-slate-500">({palettes[c.id]?.cats.length ?? 0})</span></td>
                        <td className="text-center"><input type="checkbox" aria-label={`Bar for ${c.label}`} checked={st.strips.includes(c.id)} onChange={() => toggle("strips", c.id)} className="h-4 w-4 accent-cyan-400" /></td>
                        <td className="text-center"><input type="checkbox" aria-label={`Legend for ${c.label}`} checked={st.legends.includes(c.id)} onChange={() => toggle("legends", c.id)} className="h-4 w-4 accent-cyan-400" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="block text-xs font-bold text-slate-200">Legend position
                <select value={st.legendPos} onChange={(e) => set("legendPos", e.target.value as Style["legendPos"])} className={selectCls}>
                  <option value="right">Right of the tree</option>
                  <option value="bottom">Below the tree</option>
                </select>
              </label>
              <Slider label="Bar width" value={st.stripWidth} min={6} max={40} step={1} onChange={(v) => set("stripWidth", v)} format={(v) => `${v} px`} />
            </div>
            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Tips, labels &amp; text</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-bold text-slate-200">Tip symbol
                  <select value={st.tipShape} onChange={(e) => set("tipShape", e.target.value as Shape)} className={selectCls}>
                    {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold text-slate-200">Shape by class
                  <select value={st.shapeBy} onChange={(e) => set("shapeBy", e.target.value)} className={selectCls}>{classOptions("One shape")}</select>
                </label>
              </div>
              <label className="block text-xs font-bold text-slate-200">Font
                <select value={st.font} onChange={(e) => set("font", e.target.value)} className={selectCls}>
                  {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-200">Figure title
                <input value={st.title} onChange={(e) => set("title", e.target.value)} placeholder="Optional title" className={selectCls} />
              </label>
              <Toggle label="Show tip labels" checked={st.showLabels} onChange={(v) => set("showLabels", v)} />
              <Toggle label="Italic labels" checked={st.italic} onChange={(v) => set("italic", v)} />
              <Toggle label="Align tip labels (dotted leaders)" checked={st.alignLabels} onChange={(v) => set("alignLabels", v)} />
              {(tree.meta_columns ?? []).includes("Source") && <Toggle label="Bold uploaded sequences" checked={st.boldUploaded} onChange={(v) => set("boldUploaded", v)} />}
            </div>
            <div className="space-y-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Size, support &amp; scale</p>
              {!radial && <Slider label="Vertical expansion" value={st.factor} min={8} max={150} step={1} onChange={(v) => set("factor", v)} format={(v) => `${v} px/tip`} />}
              {st.kind === "circular" && <Slider label="Circle opening" value={st.openAngle} min={180} max={360} step={5} onChange={(v) => set("openAngle", v)} format={(v) => `${v}°`} />}
              {st.kind === "fan" && <Slider label="Fan angle" value={st.fanAngle} min={60} max={300} step={5} onChange={(v) => set("fanAngle", v)} format={(v) => `${v}°`} />}
              <Slider label="Label size" value={st.fontSize} min={6} max={20} step={0.5} onChange={(v) => set("fontSize", v)} />
              <Slider label="Tip symbol size" value={st.tipSize} min={0} max={10} step={0.5} onChange={(v) => set("tipSize", v)} />
              <Slider label="Branch width" value={st.branchWidth} min={0.3} max={4} step={0.1} onChange={(v) => set("branchWidth", v)} />
              <Toggle label="Show bootstrap / support values" checked={st.showSupport} onChange={(v) => set("showSupport", v)} />
              {st.showSupport && <Slider label="Show support from" value={st.supportMin} min={0} max={100} step={5} onChange={(v) => set("supportMin", v)} format={(v) => `≥ ${v}%`} />}
              <Toggle label="Show other internal labels" checked={st.showInternal} onChange={(v) => set("showInternal", v)} />
              <Toggle label="Scale bar" checked={st.scaleBar} onChange={(v) => set("scaleBar", v)} />
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
                    {palettes[id].cats.map((cat) => (
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
          aria-label={`Annotated phylogenetic tree with ${n} tips (${st.kind} layout)`} className="block" fontFamily={st.font}>
          <rect width={width} height={height} fill="#ffffff" />
          {st.title.trim() && <text x={20} y={30} fontSize={18} fontWeight={700} fill="#111">{st.title}</text>}
          {back}
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
