"use client";

import Link from "next/link";
import PhotoDeck from "./_components/PhotoDeck";
import { EmailButton } from "./_components/ProtectedEmail";
import ProfileReveal from "./_components/ProfileReveal";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  H_INDEX,
  NCBI_GROUPS,
  NCBI_RECORD_COUNT,
  PUBLICATIONS,
  TOOLS,
  TOTAL_CITATIONS,
  type NcbiRecord,
  type Publication,
} from "./_data/profile";

/* -------------------------------------------------------------------------- */
/*  Hooks                                                                     */
/* -------------------------------------------------------------------------- */

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false
  );
}

function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

function useCountUp(target: number, run: boolean, reduced: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run || reduced) return;
    let frame = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / 1400, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, run, reduced]);
  return reduced ? target : value;
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

const FOCUS = [
  "antimicrobial resistance",
  "whole-genome sequencing",
  "vaccine development",
  "molecular epidemiology",
  "One Health and microplastics",
];

function RotatingFocus() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const word = FOCUS[index];
    const done = chars >= word.length;
    const id = setTimeout(
      () => {
        if (done) {
          setChars(0);
          setIndex((i) => (i + 1) % FOCUS.length);
        } else {
          setChars((c) => c + 1);
        }
      },
      done ? 2200 : 45
    );
    return () => clearTimeout(id);
  }, [chars, index, reduced]);

  const text = reduced ? FOCUS[0] : FOCUS[index].slice(0, chars);
  return (
    <span className="text-aspen">
      {text}
      <span aria-hidden="true" className="ml-0.5 inline-block w-[2px] animate-pulse bg-aspen align-[-0.1em]">
        &nbsp;
      </span>
    </span>
  );
}

function StatCard({ value, label, run, reduced }: { value: number; label: string; run: boolean; reduced: boolean }) {
  const n = useCountUp(value, run, reduced);
  return (
    <div className="glass p-4 transition duration-300 hover:border-aspen/70 hover:bg-aspen/10">
      <p className="font-display text-3xl font-bold tabular-nums text-cyan-200">{n}</p>
      <p className="mt-1 text-xs font-semibold text-mist">{label}</p>
    </div>
  );
}

function Hero() {
  const reduced = useReducedMotion();
  const [statsRef, seen] = useInView<HTMLDivElement>(0.2);
  const stats = [
    { value: PUBLICATIONS.length, label: "Publications" },
    { value: TOTAL_CITATIONS, label: "Citations" },
    { value: H_INDEX, label: "h-index" },
    { value: NCBI_RECORD_COUNT, label: "NCBI datasets" },
  ];

  return (
    <section className="px-4 sm:px-6">
      <div className="mx-auto grid min-h-[min(calc(100svh-6rem),860px)] max-w-7xl items-center gap-14 py-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="hero-rise">
          <p className="text-sm font-bold tracking-[0.3em] text-aspen">MICROBIOLOGY • GENOMICS • EPIDEMIOLOGY</p>
          <h1 className="mt-6 font-display text-[clamp(3rem,8vw,6.5rem)] font-bold leading-[0.95] tracking-tight text-white">
            Nahiduzzaman
          </h1>
          <p className="mt-6 max-w-2xl font-display text-2xl font-semibold leading-snug text-cyan-100 md:text-3xl">
            Veterinary researcher working on
            <br />
            <RotatingFocus />
          </p>
          <p className="mt-6 inline-flex items-center gap-2 border border-aspen/25 bg-aspen/10 px-4 py-2 text-sm font-bold text-cyan-100 backdrop-blur">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            PhD student, College of Veterinary Medicine, University of Minnesota
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/research"
              className="border border-aspen bg-aspen px-7 py-4 font-bold text-lake transition duration-300 hover:bg-white"
            >
              Research
            </Link>
            <Link
              href="/publications"
              className="border border-white/20 bg-white/5 px-7 py-4 font-bold backdrop-blur transition duration-300 hover:border-aspen hover:text-cyan-200"
            >
              Publications
            </Link>
            <Link
              href="/tools"
              className="border border-white/20 px-7 py-4 font-bold transition duration-300 hover:border-aspen hover:bg-aspen/10"
            >
              Tools
            </Link>
            <a
              href="#research-tree"
              className="border border-aspen/25 bg-aspen/5 px-7 py-4 font-bold text-cyan-100 transition duration-300 hover:border-aspen hover:bg-aspen/15"
            >
              Explore my work
            </a>
          </div>
          <div ref={statsRef} className="mt-10 grid max-w-2xl grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map((s) => (
              <StatCard key={s.label} value={s.value} label={s.label} run={seen} reduced={reduced} />
            ))}
          </div>
        </div>
        <PhotoDeck />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Research tree: a cladogram of every paper, dataset and tool               */
/* -------------------------------------------------------------------------- */

type LeafKind = "paper" | "data" | "tool";

type Leaf = {
  kind: LeafKind;
  label: string;
  title: string;
  meta: string;
  href: string;
  external: boolean;
  accessions?: { label: string; id: string; href: string }[];
};

type Clade = { id: string; label: string; blurb: string; children: TreeItem[] };
type TreeItem = Clade | (Leaf & { id: string });

const isClade = (n: TreeItem): n is Clade => "children" in n;

const pub = (fragment: string, label: string): Leaf & { id: string } => {
  const p = PUBLICATIONS.find((x) => x.title.includes(fragment)) as Publication;
  return {
    id: `p-${label}`,
    kind: "paper",
    label,
    title: p.title,
    meta: `${p.venue}, ${p.year}${p.citations ? `. ${p.citations} citation${p.citations === 1 ? "" : "s"}` : ""}${
      p.quartile ? `. ${p.quartile}` : ""
    }`,
    href: p.url,
    external: true,
  };
};

const NCBI = "https://www.ncbi.nlm.nih.gov";

const data = (r: NcbiRecord, label: string): Leaf & { id: string } => {
  const accessions = [
    r.bioproject && { label: "BioProject", id: r.bioproject, href: `${NCBI}/bioproject/${r.bioproject}` },
    r.biosample && { label: "BioSample", id: r.biosample, href: `${NCBI}/biosample/${r.biosample}` },
    r.sra && { label: "SRA", id: r.sra, href: `${NCBI}/sra/${r.sra}` },
    ...(r.genbank ?? []).map((id) => ({ label: "GenBank", id, href: `${NCBI}/nuccore/${id}` })),
  ].filter(Boolean) as Leaf["accessions"];
  return {
    id: `d-${label}`,
    kind: "data",
    label,
    title: `${r.organism}`,
    meta: `${r.source}, ${r.year}`,
    href: accessions![0].href,
    external: true,
    accessions,
  };
};

const tool = (t: (typeof TOOLS)[number]): Leaf & { id: string } => ({
  id: `t-${t.name}`,
  kind: "tool",
  label: t.name,
  title: t.name,
  meta: t.summary,
  href: t.href,
  external: false,
});

const [genomes, meta, partial] = [NCBI_GROUPS[0].records, NCBI_GROUPS[1].records, NCBI_GROUPS[2].records];

const TREE: Clade = {
  id: "root",
  label: "My research",
  blurb: "Everything I have published, sequenced or built, grouped by the question behind it.",
  children: [
    {
      id: "onehealth",
      label: "One Health and AMR",
      blurb: "How antibiotics, climate and pollutants move resistance and harm between animals, people and the environment.",
      children: [
        {
          id: "environment",
          label: "Environment",
          blurb: "Reviews on climate-driven resistance, antibiotic use in farming and microplastics.",
          children: [
            pub("climate change", "Climate change and AMR"),
            pub("Economic and Environmental", "Antibiotics in livestock"),
            pub("microplastics", "Microplastics in livestock"),
          ],
        },
        {
          id: "food",
          label: "Food safety",
          blurb: "Field studies of street food and fresh-cut fruit in Bangladesh.",
          children: [pub("Hygienic Practices", "Street-food hygiene"), pub("fresh cut fruits", "Fresh-cut fruit RCT")],
        },
      ],
    },
    {
      id: "vaccine",
      label: "Vaccines",
      blurb: "An inactivated Brucella abortus vaccine for cattle, and the metagenome of an aborted cow behind it.",
      children: [pub("Brucella abortus", "Brucella vaccine"), data(meta[0], "Placental metagenome")],
    },
    {
      id: "genomics",
      label: "Genomics",
      blurb: "Bacterial genomes and marker-gene sequences deposited on NCBI.",
      children: [
        {
          id: "wgs",
          label: "Whole genomes",
          blurb: `${genomes.length} multidrug-resistant bacterial genomes from meat, eggs, manure and produce.`,
          children: [
            pub("Enterococcus faecium", "E. faecium genome paper"),
            data(genomes[0], "E. coli, cucumber"),
            data(genomes[1], "Salmonella, poultry"),
            data(genomes[2], "Proteus, manure"),
            data(genomes[3], "S. haemolyticus, broiler"),
            data(genomes[4], "E. faecalis, cloaca"),
            data(genomes[5], "E. faecalis, egg"),
            data(genomes[6], "E. faecium, chicken"),
          ],
        },
        {
          id: "markers",
          label: "Marker genes",
          blurb: "rRNA, ITS and viral gene sequences used for identification and molecular epidemiology.",
          children: [
            data(partial[0], "Cryptosporidium"),
            data(partial[1], "Pseudomonas 16S"),
            data(partial[2], "Lumpy skin disease virus"),
          ],
        },
      ],
    },
    {
      id: "tools",
      label: "Software",
      blurb: "Browser tools: EGStat-N and QI-GeneX-N are mine; PRRSLooM is the V-EPI Lab's tool, which I converted to Python.",
      children: TOOLS.map(tool),
    },
  ],
};

const KIND_STYLE: Record<LeafKind, { name: string; color: string }> = {
  paper: { name: "Papers", color: "#67e8f9" },
  data: { name: "NCBI data", color: "#5eead4" },
  tool: { name: "Tools", color: "#a5b4fc" },
};

type Placed = {
  item: TreeItem;
  x: number;
  y: number;
  parent: Placed | null;
  children: Placed[];
  leafCount: number;
};

const ROW = 30;
const STEP = 92;
const TIP_X = STEP * 4;

function layout(root: Clade, collapsed: Set<string>) {
  let row = 0;
  const all: Placed[] = [];
  const place = (item: TreeItem, depth: number, parent: Placed | null): Placed => {
    const node: Placed = { item, x: 0, y: 0, parent, children: [], leafCount: 0 };
    all.push(node);
    if (isClade(item) && !collapsed.has(item.id)) {
      node.x = depth * STEP;
      node.children = item.children.map((c) => place(c, depth + 1, node));
      node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2;
      node.leafCount = node.children.reduce((n, c) => n + c.leafCount, 0);
    } else {
      node.x = isClade(item) ? depth * STEP : TIP_X;
      node.y = row * ROW + ROW / 2;
      row += 1;
      node.leafCount = isClade(item) ? countLeaves(item) : 1;
    }
    return node;
  };
  const top = place(root, 0, null);
  return { top, all, height: row * ROW };
}

function countLeaves(c: Clade): number {
  return c.children.reduce((n, x) => n + (isClade(x) ? countLeaves(x) : 1), 0);
}

function leavesOf(item: TreeItem): Leaf[] {
  return isClade(item) ? item.children.flatMap(leavesOf) : [item];
}

function ResearchTree() {
  const reduced = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>(0.15);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("p-Microplastics in livestock");
  const [hidden, setHidden] = useState<Set<LeafKind>>(new Set());

  const { top, all, height } = useMemo(() => layout(TREE, collapsed), [collapsed]);
  const byId = useMemo(() => new Map(all.map((n) => [n.item.id, n])), [all]);

  const focusId = hovered ?? selected;
  const focus = byId.get(focusId) ?? top;

  const lineage = useMemo(() => {
    const ids = new Set<string>();
    for (let n: Placed | null = focus; n; n = n.parent) ids.add(n.item.id);
    return ids;
  }, [focus]);

  const inFocusClade = (n: Placed): boolean => {
    for (let p: Placed | null = n; p; p = p.parent) if (p.item.id === focus.item.id) return true;
    return false;
  };
  const lit = (n: Placed) => lineage.has(n.item.id) || (isClade(focus.item) && inFocusClade(n));

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleKind = (k: LeafKind) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const edges = all.filter((n) => n.parent);
  const draw = seen || reduced;
  const width = TIP_X + 250;

  const detail = focus.item;
  const detailLeaves = isClade(detail) ? leavesOf(detail) : [];

  return (
    <section id="research-tree" className="scroll-mt-20 px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold tracking-[0.3em] text-aspen">RESEARCH PHYLOGENY</p>
            <h2 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-tight md:text-5xl">
              Every paper, genome and tool, on one tree
            </h2>
            <p className="mt-4 max-w-2xl text-mist">
              Hover a tip to trace it back to the root, click it to open the details, and click a clade&rsquo;s node to
              collapse it.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Show on the tree">
            {(Object.keys(KIND_STYLE) as LeafKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={!hidden.has(k)}
                onClick={() => toggleKind(k)}
                className={`flex items-center gap-2 border px-4 py-2 text-sm font-semibold transition ${
                  hidden.has(k) ? "border-white/10 text-mist/60" : "border-aspen/30 bg-aspen/5 text-birch"
                }`}
              >
                <LeafMark kind={k} size={5} faded={hidden.has(k)} />
                {KIND_STYLE[k].name}
              </button>
            ))}
          </div>
        </div>

        <div ref={ref} className="mt-10 grid gap-6 lg:grid-cols-[1.45fr_1fr]">
          <div className="glass overflow-x-auto p-4 sm:p-6">
            <svg
              viewBox={`-14 -6 ${width + 20} ${height + 12}`}
              className="min-w-[560px]"
              role="tree"
              aria-label="Research tree"
              onMouseLeave={() => setHovered(null)}
            >
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.4" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {edges.map((n, i) => {
                const p = n.parent!;
                const on = lit(n);
                const leafHidden = !isClade(n.item) && hidden.has(n.item.kind);
                return (
                  <path
                    key={n.item.id}
                    d={`M${p.x},${p.y}V${n.y}H${n.x}`}
                    pathLength={1}
                    fill="none"
                    stroke={on ? "#67e8f9" : "rgba(125,211,252,0.28)"}
                    strokeWidth={on ? 2.2 : 1.2}
                    filter={on ? "url(#glow)" : undefined}
                    opacity={leafHidden ? 0.15 : 1}
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: draw ? 0 : 1,
                      transition: `stroke-dashoffset 900ms ease ${reduced ? 0 : (n.x / STEP) * 160 + i * 6}ms, stroke 250ms, stroke-width 250ms`,
                    }}
                  />
                );
              })}

              {all.map((n) => {
                const item = n.item;
                const on = lit(n);
                if (isClade(item)) {
                  const closed = collapsed.has(item.id);
                  return (
                    <g
                      key={item.id}
                      role="treeitem"
                      aria-expanded={!closed}
                      tabIndex={0}
                      className="cursor-pointer outline-none"
                      onMouseEnter={() => setHovered(item.id)}
                      onFocus={() => setHovered(item.id)}
                      onBlur={() => setHovered(null)}
                      onClick={() => item.id !== "root" && toggle(item.id)}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && item.id !== "root") {
                          e.preventDefault();
                          toggle(item.id);
                        }
                      }}
                    >
                      {closed && (
                        <path
                          d={`M${n.x},${n.y}L${TIP_X - 8},${n.y - 10}L${TIP_X - 8},${n.y + 10}Z`}
                          fill="rgba(103,232,249,0.12)"
                          stroke="rgba(103,232,249,0.5)"
                        />
                      )}
                      <circle cx={n.x} cy={n.y} r={14} fill="transparent" />
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={on ? 5.5 : 4.5}
                        fill={closed ? "#020617" : on ? "#67e8f9" : "#bae6fd"}
                        stroke="#67e8f9"
                        strokeWidth={closed ? 1.6 : 0}
                        filter={on ? "url(#glow)" : undefined}
                      />
                      {item.id !== "root" && (
                        <text
                          x={n.x + 8}
                          y={n.y - 8}
                          className="font-sans"
                          fontSize={11.5}
                          fontWeight={600}
                          stroke="#0b1324"
                          strokeWidth={5}
                          strokeLinejoin="round"
                          paintOrder="stroke"
                          fill={on ? "#cffafe" : "#94a3b8"}
                        >
                          {item.label}
                        </text>
                      )}
                      {closed && (
                        <text x={TIP_X + 4} y={n.y + 4} fontSize={12.5} fill="#cffafe" className="font-sans">
                          {item.label} ({n.leafCount})
                        </text>
                      )}
                    </g>
                  );
                }

                const faded = hidden.has(item.kind);
                const active = item.id === selected;
                return (
                  <g
                    key={item.id}
                    role="treeitem"
                    tabIndex={faded ? -1 : 0}
                    aria-selected={active}
                    className={`outline-none ${faded ? "" : "cursor-pointer"}`}
                    opacity={faded ? 0.18 : 1}
                    onMouseEnter={() => !faded && setHovered(item.id)}
                    onFocus={() => setHovered(item.id)}
                    onBlur={() => setHovered(null)}
                    onClick={() => !faded && setSelected(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(item.id);
                      }
                    }}
                  >
                    <rect x={n.x - 6} y={n.y - ROW / 2} width={250} height={ROW} fill="transparent" />
                    {active && !reduced && (
                      <circle cx={n.x} cy={n.y} r={6} fill="none" stroke={KIND_STYLE[item.kind].color}>
                        <animate attributeName="r" values="6;16" dur="1.6s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.9;0" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <g transform={`translate(${n.x},${n.y})`} filter={on ? "url(#glow)" : undefined}>
                      <LeafShape kind={item.kind} size={on ? 6 : 5} />
                    </g>
                    <text
                      x={n.x + 14}
                      y={n.y + 4}
                      fontSize={12.5}
                      className="font-sans"
                      fill={on ? "#ffffff" : "#cbd5e1"}
                      fontWeight={on ? 600 : 400}
                    >
                      {item.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <aside
            key={detail.id}
            aria-live="polite"
            className="glass relative self-start overflow-hidden p-6 motion-safe:animate-[rise_0.45s_ease_both] md:p-8 lg:sticky lg:top-24"
          >
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-300/10 blur-3xl" />
            {isClade(detail) ? (
              <>
                <p className="text-sm font-semibold text-aspen">
                  Clade of {detailLeaves.length} item{detailLeaves.length === 1 ? "" : "s"}
                </p>
                <h3 className="mt-3 font-display text-3xl font-bold">{detail.label}</h3>
                <p className="mt-4 leading-relaxed text-birch/80">{detail.blurb}</p>
                <ul className="mt-6 flex flex-wrap gap-2">
                  {(Object.keys(KIND_STYLE) as LeafKind[]).map((k) => {
                    const c = detailLeaves.filter((l) => l.kind === k).length;
                    return c ? (
                      <li key={k} className="flex items-center gap-2 border border-white/10 px-3 py-1.5 text-sm">
                        <LeafMark kind={k} size={4} />
                        {c} {KIND_STYLE[k].name.toLowerCase()}
                      </li>
                    ) : null;
                  })}
                </ul>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: KIND_STYLE[detail.kind].color }}>
                  <LeafMark kind={detail.kind} size={4} />
                  {detail.kind === "paper" ? "Publication" : detail.kind === "data" ? "NCBI record" : "Web tool"}
                </p>
                <h3 className={`mt-3 font-display text-2xl font-bold leading-snug md:text-[1.7rem] ${detail.kind === "data" ? "italic" : ""}`}>
                  {detail.title}
                </h3>
                <p className="mt-3 leading-relaxed text-mist">{detail.meta}</p>
                {detail.accessions && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {detail.accessions.map((a) => (
                      <a
                        key={a.id}
                        href={a.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border border-lichen/30 px-3 py-1 text-sm transition hover:border-lichen hover:bg-lichen/10"
                      >
                        <span className="text-mist">{a.label}</span> <span className="text-lichen">{a.id}</span>
                      </a>
                    ))}
                  </div>
                )}
                {detail.external ? (
                  <a
                    href={detail.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-7 inline-block border border-aspen bg-aspen px-6 py-3 font-bold text-lake transition hover:bg-white"
                  >
                    {detail.kind === "paper" ? "Read the paper" : "Open on NCBI"}
                  </a>
                ) : (
                  <Link
                    href={detail.href}
                    className="mt-7 inline-block border border-aspen bg-aspen px-6 py-3 font-bold text-lake transition hover:bg-white"
                  >
                    Open {detail.title}
                  </Link>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

function LeafShape({ kind, size }: { kind: LeafKind; size: number }) {
  const color = KIND_STYLE[kind].color;
  if (kind === "data") return <rect x={-size} y={-size} width={size * 2} height={size * 2} fill={color} transform="rotate(45)" />;
  if (kind === "tool") return <rect x={-size} y={-size} width={size * 2} height={size * 2} fill={color} />;
  return <circle r={size} fill={color} />;
}

function LeafMark({ kind, size, faded }: { kind: LeafKind; size: number; faded?: boolean }) {
  const s = size * 2 + 6;
  return (
    <svg width={s} height={s} viewBox={`${-s / 2} ${-s / 2} ${s} ${s}`} aria-hidden="true" opacity={faded ? 0.35 : 1}>
      <LeafShape kind={kind} size={size} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tools                                                                     */
/* -------------------------------------------------------------------------- */

function ToolGlyph({ kind }: { kind: string }) {
  if (kind === "forest") {
    return (
      <svg viewBox="0 0 80 48" className="h-12 w-20" aria-hidden="true" stroke="currentColor" fill="currentColor">
        <line x1="40" y1="2" x2="40" y2="46" strokeOpacity="0.4" strokeDasharray="2 3" />
        {[10, 22, 34].map((y, i) => (
          <g key={y}>
            <line x1={[30, 44, 22][i]} y1={y} x2={[58, 70, 46][i]} y2={y} strokeWidth="1.5" />
            <rect x={[42, 55, 32][i]} y={y - 3} width="6" height="6" stroke="none" />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === "ring") {
    return (
      <svg viewBox="0 0 80 48" className="h-12 w-20" aria-hidden="true" fill="none" stroke="currentColor">
        <circle cx="40" cy="24" r="18" strokeOpacity="0.4" />
        <circle cx="40" cy="24" r="18" strokeWidth="4" strokeDasharray="10 6 22 9 4 12 30 20" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 80 48" className="h-12 w-20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M6 24H20M20 12V36M20 12H40M20 36H34M40 6V18M40 6H72M40 18H62M34 30V42M34 30H66M34 42H54" />
    </svg>
  );
}

function ToolsSection() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <p className="text-sm font-bold tracking-[0.3em] text-aspen">OPEN TOOLS</p>
        <h2 className="mt-3 font-display text-4xl font-bold md:text-5xl">Analysis software</h2>
        <p className="mt-3 max-w-2xl text-mist">EGStat-N and QI-GeneX-N are tools I built. PRRSLooM was developed by the V-EPI Lab at the University of Minnesota; I converted it to Python.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {TOOLS.map((t) => (
            <Link
              key={t.name}
              href={t.href}
              className="glass group relative flex flex-col overflow-hidden p-7 transition duration-300 hover:-translate-y-1 hover:border-aspen/70 hover:bg-aspen/10"
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cyan-300/0 blur-3xl transition duration-500 group-hover:bg-cyan-300/20" />
              <span className="text-aspen/70 transition group-hover:text-aspen">
                <ToolGlyph kind={t.glyph} />
              </span>
              <h3 className="mt-6 font-display text-3xl font-bold">{t.name}</h3>
              <p className="mt-3 flex-1 leading-relaxed text-mist">{t.summary}</p>
              <span className="mt-6 font-bold text-cyan-200">Open {t.name}</span>
              <span className="absolute bottom-0 left-0 h-0.5 w-0 bg-aspen transition-all duration-500 group-hover:w-full" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Recent papers                                                             */
/* -------------------------------------------------------------------------- */

function LatestWork() {
  const latest = [...PUBLICATIONS].sort((a, b) => b.year - a.year || b.citations - a.citations).slice(0, 4);
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold tracking-[0.3em] text-aspen">LATEST</p>
            <h2 className="mt-3 font-display text-4xl font-bold md:text-5xl">Recent papers</h2>
          </div>
          <Link href="/publications" className="font-bold text-cyan-200 hover:text-white">
            All {PUBLICATIONS.length} publications and NCBI data
          </Link>
        </div>
        <ol className="glass mt-10">
          {latest.map((p) => (
            <li key={p.title} className="border-b border-aspen/10 last:border-b-0">
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group grid gap-2 p-6 transition hover:bg-aspen/5 sm:grid-cols-[5rem_1fr_auto] sm:gap-8"
              >
                <span className="font-display text-2xl font-bold text-aspen">{p.year}</span>
                <span>
                  <span className="block text-lg leading-snug transition group-hover:text-cyan-100 md:text-xl">{p.title}</span>
                  <span className="mt-1 block text-sm italic text-mist">{p.venue}</span>
                </span>
                <span className="text-sm text-mist sm:text-right">
                  {p.quartile && <span className="mr-3 font-semibold text-aspen">{p.quartile}</span>}
                  {p.citations > 0 ? `${p.citations} citation${p.citations === 1 ? "" : "s"}` : p.kind}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ContactBand() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <div className="glass group relative mx-auto max-w-7xl overflow-hidden px-6 py-14 text-center md:px-12">
        <video
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 transition duration-1000 group-hover:scale-105 group-hover:opacity-45"
          src="/waterfall.mp4"
          poster="/waterfall-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 bg-slate-950/55" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-aspen/70 to-transparent" />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-cyan-300/15 blur-3xl" />
        <h2 className="relative font-display text-3xl font-bold md:text-5xl">Let&rsquo;s work together</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-mist">
          Open to collaborations on AMR, pathogen genomics and epidemiological modelling.
        </p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-3">
          <EmailButton className="border border-aspen bg-aspen px-7 py-4 font-bold text-lake transition hover:bg-white">
            Email me
          </EmailButton>
          <Link href="/about" className="border border-white/20 bg-white/5 px-7 py-4 font-bold transition hover:border-aspen hover:text-cyan-200">
            About me
          </Link>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function Home() {
  return (
    <>
      <Hero />
      <ProfileReveal />
      <ResearchTree />
      <ToolsSection />
      <LatestWork />
      <ContactBand />
    </>
  );
}
