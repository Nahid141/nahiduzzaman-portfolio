"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EMAILS, H_INDEX, PUBLICATIONS, TOTAL_CITATIONS } from "../_data/profile";

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

const emails = EMAILS;

const profileLinks = [
  { name: "Google Scholar", short: "GS", url: "https://scholar.google.com/citations?user=37f5LKUAAAAJ&hl=en" },
  { name: "Scopus", short: "SC", url: "https://www.scopus.com/authid/detail.uri?authorId=59914950700" },
  { name: "ResearchGate", short: "RG", url: "https://www.researchgate.net/profile/Fnu-Nahiduzzaman" },
  { name: "LinkedIn", short: "in", url: "https://www.linkedin.com/in/fnu-nahiduzzaman-20195419b" },
  { name: "ORCID", short: "iD", url: "https://orcid.org/0009-0000-1970-9480" },
];

const q1Count = PUBLICATIONS.filter((p) => p.quartile === "Q1").length;
const i10 = PUBLICATIONS.filter((p) => p.citations >= 10).length;

const researchStats = [
  { label: "Citations", value: TOTAL_CITATIONS, suffix: "", note: "Google Scholar citations to date", glow: "from-cyan-300 to-blue-500" },
  { label: "h-index", value: H_INDEX, suffix: "", note: "Research influence index", glow: "from-emerald-300 to-cyan-500" },
  { label: "i10-index", value: i10, suffix: "", note: "Papers with 10 or more citations", glow: "from-purple-300 to-pink-500" },
  { label: "Q1 papers", value: q1Count, suffix: `/${PUBLICATIONS.length}`, note: "Publications in Q1 journals (SJR)", glow: "from-amber-300 to-orange-500" },
];

const paperBars = [...PUBLICATIONS]
  .sort((a, b) => b.citations - a.citations)
  .map((p) => ({ title: p.title, venue: p.venue, year: p.year, citations: p.citations, url: p.url }));

const rankingSplit = (() => {
  const n = PUBLICATIONS.length;
  const groups = [
    { label: "Q1", count: PUBLICATIONS.filter((p) => p.quartile === "Q1").length },
    { label: "Q3", count: PUBLICATIONS.filter((p) => p.quartile === "Q3").length },
    { label: "Not ranked (chapter, preprint)", count: PUBLICATIONS.filter((p) => !p.quartile).length },
  ];
  return groups.filter((g) => g.count).map((g) => ({ ...g, value: Math.round((g.count / n) * 100) }));
})();

const skillDomains = [
  {
    title: "Microbiology Laboratory",
    summary: "Pathogen isolation, identification, molecular confirmation, and antimicrobial resistance analysis.",
    points: [
      "Microbial culture, media preparation, bacterial isolation, and colony characterization",
      "Cell culture, virus isolation, and basic virological investigation",
      "Disc diffusion, MIC interpretation, and antimicrobial resistance profiling",
      "PCR, real-time PCR, gel electrophoresis, ELISA, and molecular result validation",
    ],
  },
  {
    title: "Research Development",
    summary: "Scientific writing, evidence synthesis, study design, and interpretation of biological data.",
    points: [
      "Manuscript, review article, report, and research proposal writing",
      "Literature review, meta-analysis, knowledge-gap identification, and study planning",
      "Experimental, statistical, and computational data interpretation",
      "Hypothesis building, project development, collaboration, and research problem-solving",
    ],
  },
  {
    title: "Bioinformatics and Genomics",
    summary: "Microbial and viral genome analysis using reproducible computational workflows.",
    points: [
      "Whole-genome sequence analysis, microbial genomics, and viral genomics",
      "Phylogenetic interpretation, molecular epidemiology, and evolutionary analysis",
      "Genome annotation, comparative genomics, resistance-gene interpretation, and visualization",
      "Linux-based bioinformatics workflows for pathogen genomic investigation",
    ],
  },
  {
    title: "ML, QML and Software Development",
    summary: "Predictive and computational tools for genomics, molecular epidemiology, and disease dynamics.",
    points: [
      "Machine learning for surveillance, outbreak prediction, and risk assessment",
      "Quantum machine learning concepts for genomics and molecular epidemiology",
      "Python, R, Julia, MATLAB, SPSS, and ArcGIS Pro for research analysis",
      "Scientific web tools, Python GUI utilities, automation scripts, and visualization workflows",
    ],
  },
  {
    title: "Veterinary Academic Base",
    summary: "DVM training across veterinary, biomedical, clinical, and public-health disciplines.",
    points: [
      "Anatomy, histology, physiology, biochemistry, genetics, and toxicology",
      "Microbiology, immunology, parasitology, pathology, public health, and epidemiology",
      "Veterinary medicine, surgery, clinical reasoning, animal health, and disease investigation",
      "Interdisciplinary foundation for One Health and translational veterinary public health",
    ],
  },
];

/* A single, unified workflow — replaces the old duplicate "Research Model" +
   "Research Workflow" sections that described the same pipeline twice. */
const pipeline = [
  {
    tag: "Source",
    title: "Field & sample collection",
    detail:
      "Animal, food, environmental, and public-health contexts generate the first layer of evidence through structured sampling.",
    methods: ["Sampling design", "Sample handling", "Metadata capture"],
  },
  {
    tag: "Lab",
    title: "Laboratory confirmation",
    detail:
      "Culture, phenotypic testing, and molecular diagnostics confirm the biological signal and characterize the pathogen.",
    methods: ["Culture & isolation", "PCR / qPCR", "AMR profiling"],
  },
  {
    tag: "Genome",
    title: "Genomic interpretation",
    detail:
      "Whole-genome analysis, phylogenetics, and resistance-gene profiling explain how isolates relate and evolve.",
    methods: ["WGS analysis", "Phylogenetics", "Comparative genomics"],
  },
  {
    tag: "Insight",
    title: "Epidemiology & prediction",
    detail:
      "Molecular epidemiology, biostatistics, and ML/QML concepts turn results into surveillance, forecasting, and risk insight.",
    methods: ["Molecular epi", "Biostatistics", "ML / QML"],
  },
];

const researchAreas = [
  "Microbiology",
  "Infectious diseases",
  "Molecular epidemiology",
  "Microbial genomics",
  "Bioinformatics",
  "Disease dynamics",
  "ML and QML",
  "Public health",
  "Vaccine research",
  "Environmental toxicology",
];

const educationData = [
  {
    degree: "Doctor of Veterinary Medicine (DVM)",
    session: "2020–2026",
    result: "CGPA: 3.155",
    institution: "Bangladesh Agricultural University",
    location: "Mymensingh, Bangladesh",
  },
  {
    degree: "Higher Secondary School Certificate",
    session: "2017–2019",
    result: "GPA: 5.00/5",
    institution: "Shahid Syed Nazrul Islam College",
    location: "Mymensingh, Bangladesh",
  },
  {
    degree: "Secondary School Certificate",
    session: "2015–2017",
    result: "GPA: 5.00/5",
    institution: "Hazrabari High School",
    location: "Melandah, Jamalpur, Bangladesh",
  },
];

/*  Hooks                                                                     */
/* -------------------------------------------------------------------------- */

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
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

/** Reveal an element once it scrolls into view. Returns [ref, inView]. */
function useInView<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

/** Animate a number from 0 to `target` when `start` becomes true. */
function useCountUp(target: number, start: boolean, duration = 1100) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start || reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, duration, reduced]);
  return reduced && start ? target : value;
}

/* -------------------------------------------------------------------------- */
/*  Shared Components                                                         */
/* -------------------------------------------------------------------------- */

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto mb-10 max-w-4xl text-center">
      <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
        <span className="h-px w-6 bg-cyan-300/60" aria-hidden />
        {eyebrow}
        <span className="h-px w-6 bg-cyan-300/60" aria-hidden />
      </p>
      <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl md:text-4xl">{title}</h2>
      {subtitle && (
        <p className="mx-auto mt-4 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">{subtitle}</p>
      )}
    </div>
  );
}

function EducationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Educational timeline"
    >
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close education modal" />
      <div className="relative max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-cyan-300/20 bg-slate-950/95 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl md:p-8">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          aria-label="Close"
        >
          ✕
        </button>
        <SectionHeading
          eyebrow="Education"
          title="Educational timeline"
          subtitle="A concise academic pathway from school education to DVM training."
        />
        <div className="relative ml-4 border-l-2 border-cyan-400/25 pl-8">
          {educationData.map((entry) => (
            <div key={`${entry.degree}-${entry.session}`} className="relative mb-8 last:mb-0">
              <div className="absolute -left-[2.35rem] top-2 h-4 w-4 rounded-full border-2 border-cyan-300 bg-slate-950 shadow-lg shadow-cyan-500/30" />
              <div className="rounded-2xl border border-cyan-300/12 bg-white/[0.035] p-5 transition hover:border-cyan-300/45 hover:bg-cyan-300/5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-white">{entry.degree}</h3>
                  <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                    {entry.session}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-emerald-300">{entry.result}</p>
                <p className="mt-1 text-sm text-slate-300">{entry.institution}</p>
                <p className="text-xs text-slate-500">{entry.location}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page Sections                                                             */
/* -------------------------------------------------------------------------- */

const PORTRAITS = [
  { src: "/Me1.jpg", alt: "Nahiduzzaman portrait", pos: "object-center" },
  { src: "/nahid-overlook.jpg", alt: "Nahiduzzaman at a Lake Superior overlook in autumn", pos: "object-[70%_55%]" },
];

function HeroSection({ onEducationClick }: { onEducationClick: () => void }) {
  const [main, setMain] = useState(1);
  const other = 1 - main;
  const heroActions = [
    { label: "Education", onClick: onEducationClick },
    { label: "ORCID", href: "https://orcid.org/0009-0000-1970-9480" },
    { label: "Email", href: `mailto:${emails[0]}` },
  ];

  return (
    <section className="grid items-center gap-10 lg:grid-cols-[0.78fr_1.22fr]">
      <div className="flex justify-center lg:justify-start">
        <div className="group relative">
          <div className="absolute -inset-6 rounded-full bg-cyan-400/20 blur-3xl transition duration-700 group-hover:bg-cyan-300/30" />
          <div className="absolute -inset-3 rounded-full border border-dashed border-cyan-300/30 motion-safe:animate-[spin_40s_linear_infinite]" />
          <div className="relative rounded-full border border-cyan-300/20 bg-slate-900/80 p-2 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <Image
              key={PORTRAITS[main].src}
              src={PORTRAITS[main].src}
              alt={PORTRAITS[main].alt}
              width={700}
              height={700}
              priority
              className={`h-[270px] w-[270px] rounded-full object-cover ${PORTRAITS[main].pos} transition duration-700 motion-safe:animate-[fadeUp_0.5s_ease] group-hover:scale-[1.035] sm:h-[340px] sm:w-[340px] lg:h-[400px] lg:w-[400px]`}
            />
          </div>
          <button
            type="button"
            onClick={() => setMain(other)}
            aria-label={`Show photo: ${PORTRAITS[other].alt}`}
            className="absolute -bottom-2 right-0 rounded-full border-2 border-cyan-300/60 bg-slate-950 p-1 shadow-xl shadow-cyan-950/40 transition hover:scale-110 hover:border-cyan-300 sm:right-4"
          >
            <Image
              src={PORTRAITS[other].src}
              alt=""
              width={200}
              height={200}
              className={`h-20 w-20 rounded-full object-cover ${PORTRAITS[other].pos} sm:h-24 sm:w-24`}
            />
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] font-black text-slate-950">
              Swap
            </span>
          </button>
        </div>
      </div>

      <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/72 p-6 text-center shadow-2xl shadow-cyan-950/20 backdrop-blur-xl md:p-8 lg:p-10">
        <p className="text-sm font-black uppercase tracking-[0.28em] text-cyan-300">About Nahiduzzaman</p>
        <h1 className="mx-auto mt-4 max-w-3xl text-2xl font-black leading-tight text-white sm:text-3xl md:text-4xl">
          Microbiology researcher connecting laboratory evidence with computational biology.
        </h1>
        <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
          His work brings together veterinary microbiology, infectious disease investigation, molecular
          epidemiology, microbial genomics, public health, and data-driven research.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {heroActions.map((action) =>
            "onClick" in action ? (
              <button
                key={action.label}
                onClick={action.onClick}
                className="rounded-xl border border-cyan-300/25 bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20 transition hover:-translate-y-1 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                View {action.label}
              </button>
            ) : (
              <a
                key={action.label}
                href={action.href}
                target={action.label === "ORCID" ? "_blank" : undefined}
                rel={action.label === "ORCID" ? "noopener noreferrer" : undefined}
                className="rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-5 py-3 text-center text-sm font-black text-cyan-100 transition hover:-translate-y-1 hover:border-cyan-300/60 hover:bg-cyan-300/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
              >
                {action.label}
              </a>
            )
          )}
        </div>
      </div>
    </section>
  );
}

function WaterfallVideo({ className }: { className: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <video
      className={className}
      src="/waterfall.mp4"
      poster="/waterfall-poster.jpg"
      autoPlay={!reduced}
      muted
      loop
      playsInline
      preload="metadata"
      aria-label="Waterfall in an autumn forest"
    />
  );
}

function MotivationSection() {
  const bullets = [
    "Nature’s calm beauty inspires curiosity and careful observation.",
    "That curiosity led me toward the invisible microbial world.",
    "Microbiology reveals the hidden mechanisms of life at the microscopic level.",
    "Sharing useful discoveries is the reason I chose this research path.",
  ];

  return (
    <section className="mt-16 overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-slate-900/72 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
      <div className="grid lg:grid-cols-[0.66fr_1.34fr]">
        <div className="group relative min-h-[360px] overflow-hidden p-8 text-center md:p-10">
          <WaterfallVideo className="absolute inset-0 h-full w-full object-cover transition duration-1000 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/25 to-slate-950/70" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">About Me</p>
              <h2 className="mt-4 text-3xl font-black leading-tight text-white md:text-5xl">
                Decode complexity and deliver progress
              </h2>
            </div>
          </div>
        </div>

        <div className="p-7 md:p-10">
          <blockquote className="border-l-2 border-cyan-300/50 pl-5 text-lg font-semibold leading-9 text-slate-200 md:text-xl md:leading-10">
            “Nature has always captivated me with her gentle voice, soothing presence, and limitless beauty.
            Her whispers inspire my curiosity to explore the unseen microbial world, understand life’s hidden
            mechanisms at the microscopic level, and share meaningful discoveries.”
          </blockquote>
          <div className="mt-7 grid gap-3 md:grid-cols-2">
            {bullets.map((bullet) => (
              <div
                key={bullet}
                className="rounded-2xl border border-cyan-300/12 bg-white/[0.035] p-4 text-sm leading-7 text-slate-300"
              >
                <div className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                  <span>{bullet}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 rounded-2xl border border-cyan-300/12 bg-cyan-300/5 p-5 text-base font-bold leading-8 text-cyan-100">
            This is the key reason I chose to become a researcher in microbiology.
          </p>
        </div>
      </div>
    </section>
  );
}

function ResearchAreaBand() {
  const [ref, inView] = useInView<HTMLDivElement>(0.2);
  const reduced = usePrefersReducedMotion();

  return (
    <section className="mt-16 rounded-[2rem] border border-cyan-300/15 bg-slate-900/62 p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur-xl md:p-7">
      <p className="mb-5 text-center text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
        Research focus
      </p>
      <div ref={ref} className="flex flex-wrap justify-center gap-3">
        {researchAreas.map((area, i) => (
          <span
            key={area}
            style={{
              transitionDelay: reduced ? "0ms" : `${i * 55}ms`,
              opacity: inView || reduced ? 1 : 0,
              transform: inView || reduced ? "translateY(0)" : "translateY(10px)",
            }}
            className="rounded-full border border-cyan-300/18 bg-cyan-300/6 px-4 py-2 text-sm font-bold text-slate-200 transition-all duration-500 hover:-translate-y-1 hover:border-cyan-300/50 hover:bg-cyan-300/12"
          >
            {area}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Unified, interactive research pipeline.
 *  Replaces the old redundant "Research Model" + "Research Workflow" sections.
 *  Click or arrow-key through the four stages; a progress rail fills as you advance. */
function ResearchPipeline() {
  const [active, setActive] = useState(0);
  const stage = pipeline[active];
  const progress = (active / (pipeline.length - 1)) * 100;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, pipeline.length - 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    }
  };

  return (
    <section className="mt-24">
      <SectionHeading
        eyebrow="Research Pipeline"
        title="From sample to insight"
        subtitle="One continuous workflow. Select a stage to see the methods involved at each step."
      />

      <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/68 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl md:p-8">
        {/* Stage selector rail */}
        <div
          role="tablist"
          aria-label="Research pipeline stages"
          tabIndex={0}
          onKeyDown={onKey}
          className="relative rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          {/* base rail */}
          <div className="absolute left-[8%] right-[8%] top-7 hidden h-[3px] -translate-y-1/2 rounded bg-slate-700/60 md:block" />
          {/* progress fill */}
          <div
            className="absolute left-[8%] top-7 hidden h-[3px] -translate-y-1/2 rounded bg-gradient-to-r from-cyan-300 to-blue-500 transition-all duration-500 md:block"
            style={{ width: `calc((100% - 16%) * ${progress / 100})` }}
          />
          <div className="relative grid gap-4 md:grid-cols-4">
            {pipeline.map((step, i) => {
              const isActive = i === active;
              const isDone = i < active;
              return (
                <button
                  key={step.tag}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(i)}
                  className="group flex flex-col items-center gap-3 rounded-2xl p-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                >
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-full border text-sm font-black transition duration-300 ${
                      isActive
                        ? "scale-110 border-cyan-300 bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/30"
                        : isDone
                        ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-200"
                        : "border-slate-600 bg-slate-950 text-slate-400 group-hover:border-cyan-300/50"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={`text-xs font-black uppercase tracking-[0.18em] transition ${
                      isActive ? "text-cyan-200" : "text-slate-500 group-hover:text-cyan-200"
                    }`}
                  >
                    {step.tag}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div
          key={active}
          className="mt-8 grid animate-[fadeUp_0.4s_ease] gap-6 rounded-[1.5rem] border border-cyan-300/14 bg-slate-950/72 p-6 md:grid-cols-[1.3fr_1fr] md:p-8"
        >
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
              Stage {active + 1} of {pipeline.length}
            </p>
            <h3 className="mt-3 text-2xl font-black text-white md:text-3xl">{stage.title}</h3>
            <p className="mt-4 text-base leading-8 text-slate-300">{stage.detail}</p>
          </div>
          <div className="flex flex-col justify-center gap-3">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Methods used</p>
            {stage.methods.map((m) => (
              <div
                key={m}
                className="flex items-center gap-3 rounded-xl border border-cyan-300/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-200"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                {m}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile prev/next */}
        <div className="mt-5 flex items-center justify-between gap-3 md:hidden">
          <button
            onClick={() => setActive((a) => Math.max(a - 1, 0))}
            disabled={active === 0}
            className="rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-4 py-2 text-sm font-bold text-cyan-100 transition disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-xs font-bold text-slate-400">
            {active + 1} / {pipeline.length}
          </span>
          <button
            onClick={() => setActive((a) => Math.min(a + 1, pipeline.length - 1))}
            disabled={active === pipeline.length - 1}
            className="rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-4 py-2 text-sm font-bold text-cyan-100 transition disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      </div>
    </section>
  );
}

function SkillsSection() {
  const [active, setActive] = useState(0);
  const activeDomain = skillDomains[active];

  return (
    <section className="mt-24">
      <SectionHeading
        eyebrow="Skills"
        title="Research Skills"
        subtitle="Core laboratory, genomic, computational, and academic skills used across microbiology and infectious disease research."
      />
      <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/72 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl md:p-7">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            {skillDomains.map((domain, index) => (
              <button
                key={domain.title}
                type="button"
                onClick={() => setActive(index)}
                onMouseEnter={() => setActive(index)}
                aria-pressed={active === index}
                className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
                  active === index
                    ? "border-cyan-300/70 bg-cyan-300/12 shadow-2xl shadow-cyan-950/20"
                    : "border-cyan-300/12 bg-white/[0.035] hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/5"
                }`}
              >
                <div className="absolute -right-12 -top-12 h-28 w-28 rounded-full bg-cyan-300/10 blur-2xl transition group-hover:bg-cyan-300/20" />
                <p className="relative text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                  Domain {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="relative mt-3 text-lg font-black text-white">{domain.title}</h3>
                <p className="relative mt-3 text-sm leading-7 text-slate-400">{domain.summary}</p>
              </button>
            ))}
          </div>

          <div className="rounded-[1.75rem] border border-cyan-300/14 bg-slate-950/72 p-6 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Selected domain</p>
                <h3 className="mt-3 text-2xl font-black text-white md:text-3xl">{activeDomain.title}</h3>
              </div>
              <a
                href="https://bau.edu.bd/public/file_manager/dvm.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-cyan-300/25 bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-1 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                View DVM Curriculum
              </a>
            </div>
            <p className="mt-5 text-base leading-8 text-slate-300">{activeDomain.summary}</p>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {activeDomain.points.map((point) => (
                <div
                  key={point}
                  className="rounded-2xl border border-cyan-300/12 bg-white/[0.04] p-4 text-sm font-semibold leading-7 text-slate-200 transition hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/5"
                >
                  <div className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                    <span>{point}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-2xl border border-cyan-300/12 bg-cyan-300/5 p-4">
              <p className="text-sm font-bold leading-7 text-cyan-100">
                Skill integration: laboratory methods, genomic interpretation, statistical thinking, and
                software-driven visualization combine to support infectious disease research.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  stat,
  active,
  start,
  onSelect,
}: {
  stat: (typeof researchStats)[number];
  active: boolean;
  start: boolean;
  onSelect: () => void;
}) {
  const count = useCountUp(stat.value, start);
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onSelect}
      aria-pressed={active}
      className={`group relative overflow-hidden rounded-2xl border p-5 text-center shadow-xl backdrop-blur-xl transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
        active
          ? "border-cyan-300/70 bg-cyan-300/12"
          : "border-cyan-300/15 bg-slate-900/75 hover:border-cyan-300/50 hover:bg-cyan-300/10"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${stat.glow}`} />
      <div
        className={`absolute -right-10 -top-10 h-24 w-24 rounded-full bg-gradient-to-r ${stat.glow} opacity-20 blur-2xl transition group-hover:opacity-35`}
      />
      <p className="relative text-4xl font-black text-cyan-300 tabular-nums">
        {count}
        {stat.suffix}
      </p>
      <p className="relative mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{stat.label}</p>
      <p className="relative mt-3 text-xs leading-5 text-slate-500">{stat.note}</p>
    </button>
  );
}

function MetricsSection() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeStat, setActiveStat] = useState(researchStats[0]);
  const [ref, inView] = useInView<HTMLDivElement>(0.3);
  const max = useMemo(() => Math.max(...paperBars.map((i) => i.citations)), []);

  return (
    <section className="mt-24" ref={ref}>
      <SectionHeading
        eyebrow="Research Metrics"
        title="Research profile at a glance"
        subtitle="Citations, h-index, i10-index and journal ranking, updated from Google Scholar."
      />

      <div className="grid gap-4 md:grid-cols-4">
        {researchStats.map((stat) => (
          <StatCard
            key={stat.label}
            stat={stat}
            active={activeStat.label === stat.label}
            start={inView}
            onSelect={() => setActiveStat(stat)}
          />
        ))}
      </div>

      <div className="mt-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-4 text-center shadow-xl">
        <p className="text-sm font-bold text-cyan-100">
          Selected metric: <span className="text-white">{activeStat.label}</span> ={" "}
          <span className="text-cyan-300">
            {activeStat.value}
            {activeStat.suffix}
          </span>
          . {activeStat.note}.
        </p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/75 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-2xl font-black text-white">Citations per paper</h3>
              <p className="mt-1 text-sm text-slate-400">Hover or tap a bar to see the paper</p>
            </div>
            <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100">
              Total: {TOTAL_CITATIONS}
            </div>
          </div>
          <div className="mt-6 flex h-52 items-end justify-between gap-2 border-b border-l border-slate-700/70 px-3 pb-3 sm:gap-4">
            {paperBars.map((item) => (
              <button
                key={item.title}
                type="button"
                aria-label={`${item.citations} citations: ${item.title}`}
                onMouseEnter={() => setHovered(item.title)}
                onFocus={() => setHovered(item.title)}
                onClick={() => setHovered(item.title)}
                className="group flex h-full flex-1 flex-col items-center justify-end focus-visible:outline-none"
              >
                <div className={`mb-2 text-xs font-bold text-cyan-300 transition ${hovered === item.title ? "opacity-100" : "opacity-60"}`}>
                  {item.citations}
                </div>
                <div
                  className={`w-full max-w-14 rounded-t-xl bg-gradient-to-t from-blue-700 via-sky-400 to-cyan-200 shadow-lg shadow-cyan-500/20 transition-all duration-700 ${
                    hovered === item.title ? "brightness-125" : ""
                  }`}
                  style={{ height: inView ? `${Math.max((item.citations / max) * 150, 4)}px` : "0px" }}
                />
              </button>
            ))}
          </div>
          <div className="mt-4 min-h-16 rounded-xl border border-cyan-300/10 bg-cyan-300/5 p-3 text-sm text-cyan-100">
            {(() => {
              const p = paperBars.find((i) => i.title === hovered);
              return p ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  <span className="font-black text-cyan-300">{p.citations} citations.</span> {p.title}{" "}
                  <span className="text-slate-400">({p.venue}, {p.year})</span>
                </a>
              ) : (
                "Hover over a bar to see which paper it is."
              );
            })()}
          </div>
        </div>

        <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/75 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
          <h3 className="text-2xl font-black text-white">Journal Ranking</h3>
          <p className="mt-1 text-sm text-slate-400">Current ranking distribution</p>
          <div className="mt-7 space-y-5">
            {rankingSplit.map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex justify-between text-xs font-bold text-slate-300">
                  <span>{item.label}</span>
                  <span>{item.count} paper{item.count === 1 ? "" : "s"} ({item.value}%)</span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-700"
                    style={{ width: inView ? `${item.value}%` : "0%" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-xs leading-6 text-slate-400">SJR quartiles of the journals, as listed on Google Scholar.</p>
        </div>
      </div>
    </section>
  );
}

function ContactSection() {
  return (
    <section className="mt-24">
      <SectionHeading
        eyebrow="Connect"
        title="Academic profiles and contact"
        subtitle="Links for academic profiles, collaboration, and professional communication."
      />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/75 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl md:p-8">
          <h3 className="text-2xl font-black text-white">Profiles</h3>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {profileLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-cyan-300/12 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-sm font-black text-cyan-300">
                  {link.short}
                </span>
                <span className="text-sm font-bold text-slate-200 group-hover:text-white">{link.name}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/75 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl md:p-8">
          <h3 className="text-2xl font-black text-white">Email</h3>
          <div className="mt-6 space-y-3">
            {emails.map((email) => (
              <a
                key={email}
                href={`mailto:${email}`}
                className="group flex items-center gap-3 rounded-xl border border-cyan-300/12 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </span>
                <span className="break-all text-sm font-bold text-slate-200 group-hover:text-white">{email}</span>
              </a>
            ))}
          </div>
          <p className="mt-6 text-sm leading-7 text-slate-400">
            Open to academic collaboration, research discussion, and computational biology projects.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function About() {
  const [showEducation, setShowEducation] = useState(false);

  return (
    <div className="relative overflow-x-hidden text-white">
      {/* local keyframe for the pipeline panel transition */}
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[fadeUp_0\\.4s_ease\\] { animation: none !important; }
        }
      `}</style>

      <EducationModal isOpen={showEducation} onClose={() => setShowEducation(false)} />


      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-20">
        <HeroSection onEducationClick={() => setShowEducation(true)} />
        <MotivationSection />
        <ResearchAreaBand />
        <ResearchPipeline />
        <SkillsSection />
        <MetricsSection />

        <section className="mt-24">
          <SectionHeading
            eyebrow="Workspace"
            title="Research desk and computational environment"
            subtitle="A practical working environment for coding, analysis, writing, visualization, and interpretation of biological data."
          />
          <div className="group relative">
            <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-r from-blue-500/15 to-purple-500/15 opacity-0 blur-3xl transition duration-700 group-hover:opacity-100" />
            <div className="relative rounded-[2rem] border border-cyan-300/15 bg-slate-900/70 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <Image
                src="/Workstation.jpg"
                alt="Workstation"
                width={1100}
                height={620}
                className="h-auto w-full rounded-[1.5rem] object-cover transition duration-700 group-hover:scale-[1.01]"
              />
            </div>
          </div>
        </section>

        <ContactSection />

      </div>
    </div>
  );
}
