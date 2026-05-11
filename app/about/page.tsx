"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

const emails = ["nahiduzzaman.2001055@bau.edu.bd", "nahid007@umn.edu"];

const profileLinks = [
  { name: "Google Scholar", short: "GS", url: "https://scholar.google.com/citations?user=37f5LKUAAAAJ&hl=en" },
  { name: "Scopus", short: "SC", url: "https://www.scopus.com/authid/detail.uri?authorId=59914950700" },
  { name: "ResearchGate", short: "RG", url: "https://www.researchgate.net/profile/Fnu-Nahiduzzaman" },
  { name: "LinkedIn", short: "in", url: "https://www.linkedin.com/in/fnu-nahiduzzaman-20195419b" },
  { name: "ORCID", short: "iD", url: "https://orcid.org/0009-0000-1970-9480" },
];

const yearlyCitations = [
  { year: "2025", citations: 4 },
  { year: "2026", citations: 10 },
];

const researchStats = [
  { label: "Citations", value: "14" },
  { label: "h-index", value: "2" },
  { label: "i10-index", value: "0" },
  { label: "Q1 papers", value: "60%" },
];

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

const workflowSteps = [
  "Sampling and microbiological investigation",
  "Molecular diagnostics and confirmation",
  "Genome analysis and phylogenetic interpretation",
  "Epidemiology and molecular epidemiology",
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

/* -------------------------------------------------------------------------- */
/*  Enhanced Dynamic Background                                                */
/* -------------------------------------------------------------------------- */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  glow: number;
};

type Microbe = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  speed: number;
  type: "virus" | "dna" | "cell";
};

function EnhancedResearchBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const microbesRef = useRef<Microbe[]>([]);
  const sizeRef = useRef({ width: 0, height: 0 });
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const build = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      sizeRef.current = { width, height };

      const particleCount = width < 768 ? 42 : 88;
      particlesRef.current = Array.from({ length: particleCount }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.34,
        vy: (Math.random() - 0.5) * 0.34,
        r: 1.2 + Math.random() * 2.8,
        glow: 0.45 + Math.random() * 0.55,
      }));

      const microbeCount = width < 768 ? 9 : 18;
      microbesRef.current = Array.from({ length: microbeCount }, (_, i) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        size: 9 + Math.random() * 18,
        rotation: Math.random() * Math.PI * 2,
        speed: (Math.random() - 0.5) * 0.018,
        type: i % 3 === 0 ? "dna" : i % 3 === 1 ? "virus" : "cell",
      }));
    };

    build();

    const handleMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY, active: true };
    };

    const handleLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener("resize", build);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);

    return () => {
      window.removeEventListener("resize", build);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let last = performance.now();

    const drawGrid = (width: number, height: number) => {
      ctx.save();
      ctx.strokeStyle = "rgba(56,189,248,0.048)";
      ctx.lineWidth = 1;

      const spacing = 80;
      for (let x = 0; x <= width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      for (let y = 0; y <= height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawPhylogeneticField = (time: number, width: number, height: number) => {
      const rootX = width * 0.045;
      const rootY = height * 0.54;
      const endX = width * 0.98;
      const tips = width < 768 ? 18 : 42;
      const top = height * 0.09;
      const span = height * 0.78;

      ctx.save();

      for (let i = 0; i < tips; i += 1) {
        const y = top + (i * span) / Math.max(tips - 1, 1);
        const bend = i < tips / 2 ? -1 : 1;
        const alpha = i % 4 === 0 ? 0.12 : 0.06;

        ctx.beginPath();
        ctx.lineWidth = i % 5 === 0 ? 1.35 : 0.9;
        ctx.strokeStyle = `rgba(56,189,248,${alpha})`;
        ctx.moveTo(rootX, rootY);
        ctx.bezierCurveTo(width * 0.17, rootY + bend * height * 0.15, width * 0.32, y, width * 0.5, y);
        ctx.bezierCurveTo(width * 0.66, y, width * 0.78, y + Math.sin(i * 1.8) * 18, endX, y);
        ctx.stroke();

        if (i % 3 === Math.floor(time / 900) % 3) {
          const p = (time * 0.00018 + i * 0.026) % 1;
          const x = rootX + (endX - rootX) * p;
          const py = rootY + (y - rootY) * p + Math.sin(p * Math.PI) * bend * height * 0.08;

          const pulse = ctx.createRadialGradient(x, py, 0, x, py, 18);
          pulse.addColorStop(0, "rgba(125,211,252,0.42)");
          pulse.addColorStop(1, "rgba(125,211,252,0)");
          ctx.fillStyle = pulse;
          ctx.beginPath();
          ctx.arc(x, py, 18, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "rgba(125,211,252,0.86)";
          ctx.beginPath();
          ctx.arc(x, py, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    };

    const drawGenomeArc = (time: number, width: number, height: number) => {
      ctx.save();
      ctx.strokeStyle = "rgba(34,211,238,0.095)";
      ctx.lineWidth = 1.2;

      for (let i = 0; i < 6; i += 1) {
        const baseY = height * (0.18 + i * 0.11);
        ctx.beginPath();
        for (let x = -50; x <= width + 50; x += 18) {
          const y = baseY + Math.sin((x + time * 0.035) * 0.012 + i) * 18;
          if (x === -50) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      ctx.restore();
    };

    const drawMicrobes = (time: number, width: number, height: number) => {
      const microbes = microbesRef.current;

      for (const m of microbes) {
        m.x += m.vx;
        m.y += m.vy;
        m.rotation += m.speed;

        if (m.x < -80) m.x = width + 80;
        if (m.x > width + 80) m.x = -80;
        if (m.y < -80) m.y = height + 80;
        if (m.y > height + 80) m.y = -80;

        ctx.save();
        ctx.translate(m.x, m.y);
        ctx.rotate(m.rotation);
        ctx.strokeStyle = "rgba(34,211,238,0.20)";
        ctx.fillStyle = "rgba(34,211,238,0.045)";
        ctx.lineWidth = 1.1;

        if (m.type === "virus") {
          ctx.beginPath();
          ctx.arc(0, 0, m.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          for (let s = 0; s < 12; s += 1) {
            const a = (s / 12) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * m.size * 0.72, Math.sin(a) * m.size * 0.72);
            ctx.lineTo(Math.cos(a) * m.size * 1.35, Math.sin(a) * m.size * 1.35);
            ctx.stroke();
          }
        }

        if (m.type === "dna") {
          ctx.beginPath();
          for (let i = 0; i <= 34; i += 1) {
            const t = i / 34;
            const x = (t - 0.5) * m.size * 4.2;
            const y = Math.sin(t * Math.PI * 5 + time * 0.002) * m.size * 0.45;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();

          ctx.beginPath();
          for (let i = 0; i <= 34; i += 1) {
            const t = i / 34;
            const x = (t - 0.5) * m.size * 4.2;
            const y = Math.sin(t * Math.PI * 5 + Math.PI + time * 0.002) * m.size * 0.45;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        if (m.type === "cell") {
          ctx.beginPath();
          ctx.ellipse(0, 0, m.size * 1.4, m.size * 0.9, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(m.size * 0.2, 0, m.size * 0.28, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.restore();
      }
    };

    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      const { width, height } = sizeRef.current;
      const particles = particlesRef.current;
      const mouse = mouseRef.current;

      ctx.clearRect(0, 0, width, height);

      const bg = ctx.createRadialGradient(width * 0.3, height * 0.08, 0, width * 0.56, height * 0.55, Math.max(width, height));
      bg.addColorStop(0, "rgba(14,165,233,0.18)");
      bg.addColorStop(0.38, "rgba(15,23,42,0.32)");
      bg.addColorStop(1, "rgba(2,6,23,0.97)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      drawGrid(width, height);
      drawGenomeArc(now, width, height);
      drawPhylogeneticField(now, width, height);
      drawMicrobes(now, width, height);

      for (const p of particles) {
        if (mouse.active) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;

          if (dist < 170) {
            const force = 24 / dist;
            p.vx += (dx / dist) * force * dt;
            p.vy += (dy / dist) * force * dt;
          }
        }

        p.vx *= 0.977;
        p.vy *= 0.977;
        p.x += p.vx * dt * 30;
        p.y += p.vy * dt * 30;

        if (p.x < 0 || p.x > width) p.vx *= -0.6;
        if (p.y < 0 || p.y > height) p.vy *= -0.6;

        p.x = Math.max(0, Math.min(width, p.x));
        p.y = Math.max(0, Math.min(height, p.y));
      }

      ctx.beginPath();
      ctx.strokeStyle = "rgba(56,189,248,0.085)";
      ctx.lineWidth = 0.8;

      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 145) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        }
      }

      ctx.stroke();

      for (const p of particles) {
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4.2);
        glow.addColorStop(0, `rgba(125,211,252,${0.55 * p.glow})`);
        glow.addColorStop(1, "rgba(14,165,233,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(186,230,253,0.94)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 bg-slate-950" />;
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
      <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">{eyebrow}</p>
      <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl md:text-4xl">{title}</h2>
      {subtitle && <p className="mx-auto mt-4 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">{subtitle}</p>}
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
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md">
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close education modal" />

      <div className="relative max-h-[86vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-cyan-300/20 bg-slate-950/95 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl md:p-8">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/20 hover:text-white"
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

function HeroSection({ onEducationClick }: { onEducationClick: () => void }) {
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
          <div className="relative rounded-full border border-cyan-300/20 bg-slate-900/80 p-2 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
            <Image
              src="/Me1.jpg"
              alt="Nahiduzzaman portrait"
              width={520}
              height={520}
              priority
              className="h-[270px] w-[270px] rounded-full object-cover transition duration-700 group-hover:scale-[1.035] sm:h-[340px] sm:w-[340px] lg:h-[400px] lg:w-[400px]"
            />
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/72 p-6 text-center shadow-2xl shadow-cyan-950/20 backdrop-blur-xl md:p-8 lg:p-10">
        <p className="text-sm font-black uppercase tracking-[0.28em] text-cyan-300">About Nahiduzzaman</p>

        <h1 className="mx-auto mt-4 max-w-3xl text-2xl font-black leading-tight text-white sm:text-3xl md:text-4xl">
          Microbiology researcher connecting laboratory evidence with computational biology.
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
          His work brings together veterinary microbiology, infectious disease investigation, molecular epidemiology, microbial genomics, public health, and data-driven research.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          {heroActions.map((action) =>
            "onClick" in action ? (
              <button
                key={action.label}
                onClick={action.onClick}
                className="rounded-xl border border-cyan-300/25 bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20 transition hover:-translate-y-1 hover:bg-white"
              >
                View {action.label}
              </button>
            ) : (
              <a
                key={action.label}
                href={action.href}
                target={action.label === "ORCID" ? "_blank" : undefined}
                rel={action.label === "ORCID" ? "noopener noreferrer" : undefined}
                className="rounded-xl border border-cyan-300/20 bg-cyan-300/8 px-5 py-3 text-center text-sm font-black text-cyan-100 transition hover:-translate-y-1 hover:border-cyan-300/60 hover:bg-cyan-300/15"
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

function MotivationSection() {
  const bullets = [
    "Nature’s calm beauty inspires curiosity and careful observation.",
    "That curiosity led me toward the invisible microbial world.",
    "Microbiology allows me to understand hidden mechanisms of life at the microscopic level.",
    "Sharing useful discoveries is the reason I chose this research path.",
  ];

  return (
    <section className="mt-16 overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-slate-900/72 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
      <div className="grid lg:grid-cols-[0.66fr_1.34fr]">
        <div className="relative min-h-[320px] overflow-hidden bg-gradient-to-br from-cyan-300/12 via-slate-950 to-emerald-400/10 p-8 text-center md:p-10">
          <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-emerald-300/12 blur-3xl" />

          <div className="relative flex h-full flex-col justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">About Me</p>
              <h2 className="mt-4 text-3xl font-black leading-tight text-white md:text-5xl">
                A researcher shaped by nature and microbiology.
              </h2>
            </div>

            <p className="mt-8 text-sm font-bold uppercase tracking-[0.18em] text-cyan-100">
              Curiosity • Microscopy • Discovery
            </p>
          </div>
        </div>

        <div className="p-7 md:p-10">
          <blockquote className="border-l-2 border-cyan-300/50 pl-5 text-lg font-semibold leading-9 text-slate-200 md:text-xl md:leading-10">
            “Nature has always captivated me with her gentle voice, soothing presence, and limitless beauty. Her whispers inspire my curiosity to explore the unseen microbial world, understand life’s hidden mechanisms at the microscopic level, and share meaningful discoveries.”
          </blockquote>

          <div className="mt-7 grid gap-3 md:grid-cols-2">
            {bullets.map((bullet) => (
              <div key={bullet} className="rounded-2xl border border-cyan-300/12 bg-white/[0.035] p-4 text-sm leading-7 text-slate-300">
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


function DynamicVisualDivider() {
  return (
    <section className="mt-16 overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-slate-900/62 p-6 shadow-2xl shadow-cyan-950/10 backdrop-blur-xl md:p-8">
      <div className="grid gap-6 md:grid-cols-3">
        {[
          {
            title: "Microbial Network",
            text: "Connected nodes represent laboratory evidence moving into structured biological interpretation.",
          },
          {
            title: "Genomic Signal",
            text: "Wave-like genomic layers indicate sequence analysis, comparison, and phylogenetic reasoning.",
          },
          {
            title: "Predictive Layer",
            text: "Computational modeling links molecular patterns with surveillance and disease dynamics.",
          },
        ].map((item, index) => (
          <div
            key={item.title}
            className="group relative overflow-hidden rounded-2xl border border-cyan-300/12 bg-white/[0.035] p-5 text-center transition hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/5"
          >
            <div className="absolute left-1/2 top-0 h-24 w-24 -translate-x-1/2 rounded-full bg-cyan-300/10 blur-2xl transition group-hover:bg-cyan-300/20" />
            <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-300/10 text-sm font-black text-cyan-200">
              0{index + 1}
            </div>
            <h3 className="relative mt-4 text-lg font-black text-white">{item.title}</h3>
            <p className="relative mt-3 text-sm leading-7 text-slate-300">{item.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResearchAreaBand() {
  return (
    <section className="mt-16 rounded-[2rem] border border-cyan-300/15 bg-slate-900/62 p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur-xl md:p-7">
      <div className="flex flex-wrap justify-center gap-3">
        {researchAreas.map((area) => (
          <span
            key={area}
            className="rounded-full border border-cyan-300/18 bg-cyan-300/6 px-4 py-2 text-sm font-bold text-slate-200 transition hover:-translate-y-1 hover:border-cyan-300/50 hover:bg-cyan-300/12"
          >
            {area}
          </span>
        ))}
      </div>
    </section>
  );
}

function StandardResearchModel() {
  const modelSteps = [
    {
      title: "Field and sample source",
      detail: "Animal, food, environmental, and public-health contexts generate the first layer of evidence.",
    },
    {
      title: "Laboratory confirmation",
      detail: "Culture, molecular diagnostics, and phenotypic analysis confirm the biological signal.",
    },
    {
      title: "Genomic interpretation",
      detail: "Genome analysis, phylogenetics, resistance profiling, and molecular epidemiology explain relationships.",
    },
    {
      title: "Predictive insight",
      detail: "Biostatistics, machine learning, and QML concepts support surveillance, forecasting, and risk assessment.",
    },
  ];

  return (
    <section className="mt-16 rounded-[2rem] border border-cyan-300/15 bg-slate-900/68 p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur-xl md:p-8">
      <SectionHeading
        eyebrow="Research Model"
        title="Evidence-to-insight workflow"
        subtitle="A professional model of the research process, from sample evidence to genomic and epidemiological interpretation."
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="absolute left-0 right-0 top-1/2 hidden h-px bg-cyan-300/20 md:block" />

        <div className="grid gap-5 md:grid-cols-4">
          {modelSteps.map((step, index) => (
            <article
              key={step.title}
              className="relative rounded-[1.5rem] border border-cyan-300/14 bg-slate-950/72 p-5 text-center shadow-xl shadow-cyan-950/10 transition hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/5"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-300/10 text-sm font-black text-cyan-200">
                0{index + 1}
              </div>
              <h3 className="mt-4 text-lg font-black text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">{step.detail}</p>
            </article>
          ))}
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
                className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition duration-300 ${
                  active === index
                    ? "border-cyan-300/70 bg-cyan-300/12 shadow-2xl shadow-cyan-950/20"
                    : "border-cyan-300/12 bg-white/[0.035] hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/5"
                }`}
              >
                <div className="absolute -right-12 -top-12 h-28 w-28 rounded-full bg-cyan-300/10 blur-2xl transition group-hover:bg-cyan-300/20" />
                <p className="relative text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                  Layer 0{index + 1}
                </p>
                <h3 className="relative mt-3 text-lg font-black text-white">{domain.title}</h3>
                <p className="relative mt-3 text-sm leading-7 text-slate-400">{domain.summary}</p>
              </button>
            ))}
          </div>

          <div className="rounded-[1.75rem] border border-cyan-300/14 bg-slate-950/72 p-6 md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
                  Selected Skill Layer
                </p>
                <h3 className="mt-3 text-2xl font-black text-white md:text-3xl">
                  {activeDomain.title}
                </h3>
              </div>

              <a
                href="https://bau.edu.bd/public/file_manager/dvm.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl border border-cyan-300/25 bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950 transition hover:-translate-y-1 hover:bg-white"
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
                Skill integration: laboratory methods, genomic interpretation, statistical thinking, and software-driven visualization are combined to support infectious disease research.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkflowSection() {
  return (
    <section className="mt-24 grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="group relative">
        <div className="absolute -inset-5 rounded-[2rem] bg-emerald-400/10 blur-3xl transition group-hover:bg-cyan-300/18" />
        <div className="relative rounded-[2rem] border border-cyan-300/18 bg-slate-900/70 p-2 shadow-2xl shadow-cyan-950/25 backdrop-blur-xl">
          <Image
            src="/Me2.jpg"
            alt="Research activity"
            width={720}
            height={720}
            className="h-[330px] w-full rounded-[1.5rem] object-cover transition duration-700 group-hover:scale-[1.015] sm:h-[420px]"
          />
        </div>
      </div>

      <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/72 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl md:p-8">
        <SectionHeading
          eyebrow="Research Workflow"
          title="From sample to interpretation"
          subtitle="A compact workflow connecting laboratory evidence with molecular confirmation, genomic interpretation, and epidemiological analysis."
        />

        <div className="grid gap-4 md:grid-cols-2">
          {workflowSteps.map((step, index) => (
            <div key={step} className="rounded-2xl border border-cyan-300/12 bg-white/[0.035] p-4 transition hover:border-cyan-300/45 hover:bg-cyan-300/5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Step 0{index + 1}</p>
              <p className="mt-2 text-sm leading-7 text-slate-300">{step}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MetricsSection() {
  const [hovered, setHovered] = useState<string | null>(null);
  const max = Math.max(...yearlyCitations.map((item) => item.citations));

  return (
    <section className="mt-24">
      <SectionHeading
        eyebrow="Research Metrics"
        title="Research profile at a glance"
        subtitle="A compact summary of the current citation trend and publication profile."
      />

      <div className="grid gap-4 md:grid-cols-4">
        {researchStats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-cyan-300/15 bg-slate-900/75 p-5 text-center shadow-xl backdrop-blur-xl transition hover:-translate-y-1 hover:border-cyan-300/50 hover:bg-cyan-300/10">
            <p className="text-3xl font-black text-cyan-300">{stat.value}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/75 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
          <h3 className="text-2xl font-black text-white">Citation Growth</h3>
          <p className="mt-1 text-sm text-slate-400">Yearly citation trend</p>

          <div className="mt-6 flex h-44 items-end justify-center gap-10 border-b border-l border-slate-700/70 px-4 pb-3">
            {yearlyCitations.map((item) => (
              <button
                key={item.year}
                type="button"
                onMouseEnter={() => setHovered(item.year)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(item.year)}
                onBlur={() => setHovered(null)}
                className="group flex h-full flex-col items-center justify-end"
              >
                <div className="mb-2 text-xs font-bold text-cyan-300 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
                  {item.citations}
                </div>
                <div
                  className="w-16 rounded-t-xl bg-gradient-to-t from-blue-700 to-cyan-300 shadow-lg shadow-cyan-500/20 transition-all duration-500 group-hover:scale-105 group-focus:scale-105"
                  style={{ height: `${(item.citations / max) * 122}px` }}
                />
                <div className="mt-3 text-sm font-bold text-slate-300">{item.year}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 min-h-11 rounded-xl border border-cyan-300/10 bg-cyan-300/5 p-3 text-sm text-cyan-100">
            {hovered ? `${hovered}: ${yearlyCitations.find((item) => item.year === hovered)?.citations} citations` : "Hover over a bar to inspect yearly citations."}
          </div>
        </div>

        <div className="rounded-[2rem] border border-cyan-300/15 bg-slate-900/75 p-6 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
          <h3 className="text-2xl font-black text-white">Journal Ranking</h3>
          <p className="mt-1 text-sm text-slate-400">Current ranking distribution</p>

          <div className="mt-7 space-y-5">
            {[
              { label: "Q1", value: 60 },
              { label: "Q3", value: 20 },
              { label: "NA", value: 20 },
            ].map((item) => (
              <div key={item.label}>
                <div className="mb-2 flex justify-between text-xs font-bold text-slate-300">
                  <span>{item.label}</span>
                  <span>{item.value}%</span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-700" style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs leading-6 text-slate-400">Based on the current publication profile summary.</p>
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
                className="group flex items-center gap-3 rounded-xl border border-cyan-300/12 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/8"
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
                className="group flex items-center gap-3 rounded-xl border border-cyan-300/12 bg-white/[0.035] p-4 transition hover:-translate-y-1 hover:border-cyan-300/45 hover:bg-cyan-300/8"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-300">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
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
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <EnhancedResearchBackground />
      <EducationModal isOpen={showEducation} onClose={() => setShowEducation(false)} />

      <div className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(circle_at_70%_5%,rgba(34,211,238,0.16),transparent_34%),linear-gradient(to_bottom,rgba(2,6,23,0.06),rgba(2,6,23,0.94))]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-20">
        <HeroSection onEducationClick={() => setShowEducation(true)} />
        <MotivationSection />
        <ResearchAreaBand />
        <DynamicVisualDivider />
        <StandardResearchModel />
        <SkillsSection />
        <WorkflowSection />
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

        <footer className="mt-16 border-t border-cyan-300/15 py-7 text-center">
          <p className="text-sm text-slate-400">© 2026 Nahiduzzaman. All rights reserved.</p>
          <p className="mt-1 text-sm font-bold text-cyan-300">Developed by Nahiduzzaman</p>
        </footer>
      </div>
    </main>
  );
}
