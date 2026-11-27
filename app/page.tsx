"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  H_INDEX,
  NCBI_GROUPS,
  NCBI_RECORD_COUNT,
  PUBLICATIONS,
  TOOLS,
  TOTAL_CITATIONS,
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
/*  Lake contours: a static bathymetric drawing behind the hero               */
/* -------------------------------------------------------------------------- */

function LakeContours() {
  const rings = Array.from({ length: 11 }, (_, i) => {
    const r = 70 + i * 46;
    const points = Array.from({ length: 48 }, (_, k) => {
      const a = (k / 48) * Math.PI * 2;
      const wobble = 1 + 0.07 * Math.sin(a * 3 + i * 0.7) + 0.04 * Math.cos(a * 5 - i);
      return [760 + Math.cos(a) * r * 1.35 * wobble, 360 + Math.sin(a) * r * wobble];
    });
    return `M${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z`;
  });

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1400 800"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      {rings.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#a3b6c2" strokeOpacity={0.05 + (i % 3 === 0 ? 0.05 : 0)} strokeWidth={1} />
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero photographs: two prints that follow the pointer and swap on click    */
/* -------------------------------------------------------------------------- */

const PHOTOS = [
  { src: "/nahid-lighthouse.jpg", alt: "Nahiduzzaman in front of Split Rock Lighthouse in autumn" },
  { src: "/nahid-shore.jpg", alt: "Nahiduzzaman standing on the rocky Lake Superior shore below Split Rock Lighthouse" },
];

function PhotoPair() {
  const [front, setFront] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    if (reduced || e.pointerType !== "mouse" || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    setTilt({
      x: ((e.clientX - box.left) / box.width - 0.5) * 2,
      y: ((e.clientY - box.top) / box.height - 0.5) * 2,
    });
  };

  return (
    <figure className="relative mx-auto w-full max-w-[460px] lg:max-w-none">
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        className="relative aspect-[4/5] w-full"
      >
        {PHOTOS.map((photo, i) => {
          const isFront = i === front;
          const depth = isFront ? 10 : -6;
          const base = isFront
            ? "left-0 top-[6%] z-20 w-[78%] -rotate-2"
            : "right-0 top-0 z-10 w-[62%] rotate-3 opacity-90 hover:opacity-100";
          return (
            <button
              key={photo.src}
              type="button"
              onClick={() => setFront(i)}
              aria-label={isFront ? photo.alt : `Bring forward: ${photo.alt}`}
              aria-pressed={isFront}
              disabled={isFront}
              className={`absolute overflow-hidden rounded-[3px] bg-deep p-2 pb-8 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] transition-[left,right,top,width,transform,opacity] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] ${base} ${
                isFront ? "cursor-default" : "cursor-pointer"
              }`}
              style={{ translate: `${tilt.x * depth}px ${tilt.y * depth}px` }}
            >
              <Image
                src={photo.src}
                alt=""
                width={700}
                height={933}
                priority
                sizes="(min-width: 1024px) 40vw, 90vw"
                className="aspect-[3/4] w-full object-cover"
              />
            </button>
          );
        })}
      </div>
      <figcaption className="mt-4 text-right text-sm italic text-mist font-display">
        Split Rock Lighthouse, Lake Superior. Tap the back photo to swap.
      </figcaption>
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/*  Record line: the numbers as one sentence that counts up once              */
/* -------------------------------------------------------------------------- */

function RecordLine() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [seen, setSeen] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true);
        obs.disconnect();
      }
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const pubs = useCountUp(PUBLICATIONS.length, seen, reduced);
  const cites = useCountUp(TOTAL_CITATIONS, seen, reduced);
  const ncbi = useCountUp(NCBI_RECORD_COUNT, seen, reduced);
  const h = useCountUp(H_INDEX, seen, reduced);

  const n = (v: number) => <span className="tabular-nums text-aspen">{v}</span>;

  return (
    <section className="border-y border-white/10 bg-deep/40">
      <p
        ref={ref}
        className="mx-auto max-w-7xl px-4 py-12 font-display text-3xl leading-snug text-birch sm:px-6 md:text-5xl md:leading-tight"
      >
        {n(pubs)} publications, {n(cites)} citations, an h-index of {n(h)}, {n(ncbi)} datasets on NCBI and{" "}
        {n(TOOLS.length)} open analysis tools.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Tools                                                                     */
/* -------------------------------------------------------------------------- */

function ToolGlyph({ kind }: { kind: string }) {
  const stroke = "currentColor";
  if (kind === "forest") {
    return (
      <svg viewBox="0 0 80 48" className="h-12 w-20" aria-hidden="true">
        <line x1="40" y1="2" x2="40" y2="46" stroke={stroke} strokeOpacity="0.4" strokeDasharray="2 3" />
        {[10, 22, 34].map((y, i) => (
          <g key={y}>
            <line x1={[30, 44, 22][i]} y1={y} x2={[58, 70, 46][i]} y2={y} stroke={stroke} strokeWidth="1.5" />
            <rect x={[42, 55, 32][i]} y={y - 3} width="6" height="6" fill={stroke} />
          </g>
        ))}
      </svg>
    );
  }
  if (kind === "ring") {
    return (
      <svg viewBox="0 0 80 48" className="h-12 w-20" aria-hidden="true">
        <circle cx="40" cy="24" r="18" fill="none" stroke={stroke} strokeOpacity="0.4" />
        <circle cx="40" cy="24" r="18" fill="none" stroke={stroke} strokeWidth="4" strokeDasharray="10 6 22 9 4 12 30 20" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 80 48" className="h-12 w-20" aria-hidden="true" fill="none" stroke={stroke} strokeWidth="1.5">
      <path d="M6 24H20M20 12V36M20 12H40M20 36H34M40 6V18M40 6H72M40 18H62M34 30V42M34 30H66M34 42H54" />
    </svg>
  );
}

function ToolsSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.6fr]">
        <div>
          <h2 className="font-display text-4xl md:text-5xl">Tools I build</h2>
          <p className="mt-4 max-w-sm text-mist">
            Free, browser-based software for the analyses I run in my own work.
          </p>
        </div>
        <ul className="border-t border-white/10">
          {TOOLS.map((tool) => (
            <li key={tool.name} className="border-b border-white/10">
              <Link
                href={tool.href}
                className="group grid grid-cols-[1fr_auto] items-center gap-6 py-7 transition-colors hover:bg-white/[0.03] sm:px-4"
              >
                <div>
                  <p className="font-display text-3xl transition-colors group-hover:text-aspen md:text-4xl">{tool.name}</p>
                  <p className="mt-2 max-w-xl text-mist">{tool.summary}</p>
                </div>
                <span className="text-mist transition-[color,transform] duration-300 group-hover:translate-x-1 group-hover:text-aspen">
                  <ToolGlyph kind={tool.glyph} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Research themes: pick a theme, see the work behind it                     */
/* -------------------------------------------------------------------------- */

const byTitle = (fragment: string) => PUBLICATIONS.find((p) => p.title.includes(fragment));

const THEMES = [
  {
    name: "Antimicrobial resistance",
    text: "How resistant bacteria move through food chains and farms, and how climate change speeds that up.",
    work: [byTitle("climate change"), byTitle("Enterococcus faecium"), byTitle("fresh cut fruits")],
  },
  {
    name: "Microbial genomics",
    text: "Sequencing and comparing bacterial genomes from meat, eggs, manure and produce to trace resistance genes.",
    work: [byTitle("Enterococcus faecium")],
    extra: `${NCBI_GROUPS[0].records.length} bacterial genomes deposited on NCBI`,
  },
  {
    name: "Vaccines and immunity",
    text: "Developing and testing an inactivated Brucella abortus vaccine for cattle in Bangladesh.",
    work: [byTitle("Brucella abortus")],
  },
  {
    name: "One Health and environment",
    text: "What microplastics, antibiotic use and climate do to animals, people and ecosystems together.",
    work: [byTitle("microplastics"), byTitle("Economic and Environmental"), byTitle("climate change")],
  },
  {
    name: "Predictive epidemiology",
    text: "Statistical, machine-learning and quantum machine-learning models for surveillance and outbreak risk.",
    work: [byTitle("Hygienic Practices")],
    extra: "EGStat-N, QI-GeneX-N and PRRSLooM",
  },
];

function ResearchThemes() {
  const [active, setActive] = useState(0);
  const theme = THEMES[active];

  return (
    <section className="bg-birch text-lake">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="font-display text-4xl md:text-5xl">What I work on</h2>
          <div role="tablist" aria-label="Research themes" className="mt-10 flex flex-col">
            {THEMES.map((t, i) => (
              <button
                key={t.name}
                role="tab"
                id={`theme-tab-${i}`}
                aria-selected={i === active}
                aria-controls="theme-panel"
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                className={`border-l-2 py-3 pl-5 text-left font-display text-2xl transition-colors md:text-3xl ${
                  i === active ? "border-aspen text-lake" : "border-lake/10 text-lake/45 hover:text-lake/80"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div
          id="theme-panel"
          role="tabpanel"
          aria-labelledby={`theme-tab-${active}`}
          key={active}
          className="self-center motion-safe:animate-[rise_0.5s_ease_both]"
        >
          <p className="font-display text-3xl leading-snug md:text-4xl">{theme.text}</p>
          <ul className="mt-10 space-y-4">
            {theme.work.filter(Boolean).map((pub) => (
              <li key={pub!.title}>
                <a href={pub!.url} target="_blank" rel="noopener noreferrer" className="group block">
                  <span className="text-lake/80 underline decoration-lake/20 underline-offset-4 group-hover:decoration-aspen">
                    {pub!.title}
                  </span>
                  <span className="mt-1 block text-sm text-lake/55">
                    {pub!.venue}, {pub!.year}
                  </span>
                </a>
              </li>
            ))}
            {theme.extra && <li className="text-sm text-lake/55">{theme.extra}</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Latest work                                                               */
/* -------------------------------------------------------------------------- */

function LatestWork() {
  const latest = [...PUBLICATIONS].sort((a, b) => b.year - a.year || b.citations - a.citations).slice(0, 4);
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-4xl md:text-5xl">Recent papers</h2>
        <Link href="/publications" className="text-aspen underline-offset-4 hover:underline">
          See all {PUBLICATIONS.length} publications and NCBI data
        </Link>
      </div>
      <ol className="mt-10 border-t border-white/10">
        {latest.map((pub) => (
          <li key={pub.title} className="border-b border-white/10">
            <a
              href={pub.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group grid gap-2 py-6 sm:grid-cols-[5rem_1fr_auto] sm:gap-8"
            >
              <span className="font-display text-2xl text-mist">{pub.year}</span>
              <span>
                <span className="block text-lg leading-snug transition-colors group-hover:text-aspen md:text-xl">
                  {pub.title}
                </span>
                <span className="mt-1 block text-sm italic text-mist">{pub.venue}</span>
              </span>
              <span className="text-sm text-mist sm:text-right">
                {pub.citations > 0 ? `${pub.citations} citation${pub.citations === 1 ? "" : "s"}` : pub.kind}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function Home() {
  return (
    <div className="-mt-16">
      <section className="relative overflow-hidden">
        <LakeContours />
        <div className="relative mx-auto grid min-h-[min(100svh,960px)] max-w-7xl items-center gap-14 px-4 pb-16 pt-28 sm:px-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="hero-rise">
            <p className="text-lg text-mist">Veterinarian and microbiologist</p>
            <h1 className="mt-3 font-display text-[clamp(3.25rem,8.6vw,7rem)] font-medium leading-[0.92] tracking-[-0.02em]">
              Nahid&shy;uzzaman
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-birch/85 md:text-xl">
              I study how bacteria and viruses spread and resist treatment across animals, food and people, from
              culture plates to whole genomes to predictive models.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/publications"
                className="rounded-full bg-aspen px-6 py-3 font-semibold text-lake transition-colors hover:bg-birch"
              >
                Read my publications
              </Link>
              <Link
                href="/tools"
                className="rounded-full border border-birch/30 px-6 py-3 font-semibold transition-colors hover:border-aspen hover:text-aspen"
              >
                Open the tools
              </Link>
              <Link href="/about" className="px-3 py-3 font-semibold text-mist transition-colors hover:text-birch">
                About me
              </Link>
            </div>
          </div>
          <PhotoPair />
        </div>
      </section>

      <RecordLine />
      <ToolsSection />
      <ResearchThemes />
      <LatestWork />
    </div>
  );
}
