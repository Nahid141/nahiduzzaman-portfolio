"use client";

import Image from "next/image";
import { useEffect, useRef, useCallback, useState } from "react";

// ---------- Data ----------
const researchStats = {
  citations: 12,
  hIndex: 2,
  i10Index: 0,
  q1: 60,
  q3: 20,
  na: 20,
};

const yearlyCitations = [
  { year: "2025", citations: 4 },
  { year: "2026", citations: 8 },
];

const socialLinks = [
  {
    name: "Google Scholar",
    url: "https://scholar.google.com/citations?user=37f5LKUAAAAJ&hl=en",
    icon: (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.749-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z" />
      </svg>
    ),
  },
  {
    name: "Scopus",
    url: "https://www.scopus.com/authid/detail.uri?authorId=59914950700",
    icon: (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-5-5 1.41-1.41L11 14.17l7.59-7.59L20 8l-9 9z" />
      </svg>
    ),
  },
  {
    name: "ResearchGate",
    url: "https://www.researchgate.net/profile/Fnu-Nahiduzzaman",
    icon: (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M21 15v-2h2v4h-2v-2h-2v-2h2zM17 13h-4v-2h4V9h2v2h2v2h-2v2h-2v-2zm-8 0H5v-2h4V9h2v2h2v2h-2v2h-2v-2zM3 15v-2h2v4H3v-2H1v-2h2z" />
      </svg>
    ),
  },
  {
    name: "LinkedIn",
    url: "https://www.linkedin.com/in/fnu-nahiduzzaman-20195419b",
    icon: (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zM7.119 20.452H3.556V9h3.563v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    name: "X",
    url: "https://x.com/Nahid_bau?t=b2wwlT2lHv_lYZffeY2iVg&s=08",
    icon: (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    name: "Facebook",
    url: "https://www.facebook.com/profile.php?id=100083735952268",
    icon: (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
];

const emails = [
  "nahiduzzaman.2001055@bau.edu.bd",
  "nahid007@umn.edu",
];

// ---------- Components ----------
function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -500, y: -500 });
  const dims = useRef({ width: 0, height: 0 });

  const nodesRef = useRef<any[]>([]);
  const edgesRef = useRef<[number, number][]>([]);

  const buildNetwork = useCallback((w: number, h: number) => {
    const nodeCount = 25;
    const nodes = [];
    const edges: [number, number][] = [];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 2.5 + Math.random() * 3.5,
      });
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < w * 0.28) {
          edges.push([i, j]);
        }
      }
    }

    return { nodes, edges };
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = w;
    canvas.height = h;
    dims.current = { width: w, height: h };

    const { nodes, edges } = buildNetwork(w, h);
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [buildNetwork]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTime = performance.now();

    const animate = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      const { width, height } = dims.current;
      if (!width || !height) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const mouse = mouseRef.current;

      for (const n of nodes) {
        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;

        if (dist < 140) {
          const force = 20 / dist;
          n.vx += (dx / dist) * force * dt;
          n.vy += (dy / dist) * force * dt;
        }

        n.vx *= 0.97;
        n.vy *= 0.97;
        n.x += n.vx * dt;
        n.y += n.vy * dt;

        if (n.x < 0) {
          n.x = 0;
          n.vx *= -0.5;
        }

        if (n.x > width) {
          n.x = width;
          n.vx *= -0.5;
        }

        if (n.y < 0) {
          n.y = 0;
          n.vy *= -0.5;
        }

        if (n.y > height) {
          n.y = height;
          n.vy *= -0.5;
        }
      }

      ctx.clearRect(0, 0, width, height);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.12)";
      ctx.lineWidth = 0.8;

      for (const [a, b] of edges) {
        const na = nodes[a];
        const nb = nodes[b];

        if (na && nb) {
          ctx.moveTo(na.x, na.y);
          ctx.lineTo(nb.x, nb.y);
        }
      }

      ctx.stroke();

      ctx.beginPath();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
      ctx.lineWidth = 1.8;

      for (const [a, b] of edges) {
        const na = nodes[a];
        const nb = nodes[b];

        if (!na || !nb) continue;

        const mx = (na.x + nb.x) / 2;
        const my = (na.y + nb.y) / 2;
        const dx = mx - mouse.x;
        const dy = my - mouse.y;

        if (dx * dx + dy * dy < 160 * 160) {
          ctx.moveTo(na.x, na.y);
          ctx.lineTo(nb.x, nb.y);
        }
      }

      ctx.stroke();

      for (const n of nodes) {
        const gradient = ctx.createRadialGradient(
          n.x,
          n.y,
          0,
          n.x,
          n.y,
          n.radius * 3
        );

        gradient.addColorStop(0, "rgba(96, 165, 250, 0.9)");
        gradient.addColorStop(1, "rgba(59, 130, 246, 0.0)");

        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(n.x, n.y, n.radius * 2.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = "#93c5fd";
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0" />;
}

function StatBox({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const target = typeof value === "number" ? value : parseFloat(value as string) || 0;

  useEffect(() => {
    let start = 0;
    const duration = 1000;
    const step = target / (duration / 16);
    let animationFrame: number;

    const animate = () => {
      start += step;
      if (start >= target) {
        setDisplayValue(target);
        return;
      }
      setDisplayValue(Math.floor(start));
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [target]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-center shadow-xl backdrop-blur-md transition duration-300 hover:scale-105 hover:border-cyan-400/40 group">
      <div className="text-3xl font-black text-cyan-300 group-hover:drop-shadow-[0_0_8px_rgba(56,189,248,0.6)]">
        {displayValue}{suffix}
      </div>
      <div className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </div>
    </div>
  );
}

function SmallCitationGraph() {
  const [active, setActive] = useState<string | null>(null);
  const maxCitation = Math.max(...yearlyCitations.map((d) => d.citations));

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 backdrop-blur-xl shadow-2xl transition-all duration-300 hover:border-cyan-400/30 hover:shadow-cyan-500/10">
      <h3 className="mb-1 text-2xl font-black text-white">Citation Growth</h3>
      <p className="mb-5 text-sm text-slate-400">
        Based on current Google Scholar profile statistics
      </p>

      <div className="flex h-44 items-end justify-center gap-10 border-b border-l border-slate-600 px-4 pb-3">
        {yearlyCitations.map((item) => (
          <div
            key={item.year}
            className="group flex h-full cursor-pointer flex-col items-center justify-end"
            onMouseEnter={() => setActive(item.year)}
            onMouseLeave={() => setActive(null)}
          >
            <div className="mb-2 text-xs font-bold text-cyan-300 opacity-0 transition group-hover:opacity-100">
              {item.citations}
            </div>

            <div
              className="w-14 rounded-t-xl bg-gradient-to-t from-blue-600 to-cyan-300 shadow-lg shadow-cyan-500/20 transition-all duration-500 group-hover:scale-110 group-hover:from-emerald-500 group-hover:to-cyan-200"
              style={{
                height: `${(item.citations / maxCitation) * 120}px`,
              }}
            />

            <div className="mt-3 text-sm font-bold text-slate-300">
              {item.year}
            </div>
          </div>
        ))}
      </div>

      {active && (
        <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3 text-sm text-cyan-200 animate-in fade-in slide-in-from-bottom-2">
          {active}:{" "}
          <span className="font-black">
            {yearlyCitations.find((d) => d.year === active)?.citations}
          </span>{" "}
          citations
        </div>
      )}
    </div>
  );
}

function SmallJournalRankGraph() {
  const data = [
    { label: "Q1", value: researchStats.q1 },
    { label: "Q3", value: researchStats.q3 },
    { label: "NA", value: researchStats.na },
  ];

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 backdrop-blur-xl shadow-2xl transition-all duration-300 hover:border-cyan-400/30 hover:shadow-cyan-500/10">
      <h3 className="mb-5 text-2xl font-black text-white">Journal Ranking</h3>

      <div className="space-y-4">
        {data.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex justify-between text-xs font-bold text-slate-300">
              <span>{item.label}</span>
              <span>{item.value}%</span>
            </div>

            <div className="h-4 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-700 hover:from-emerald-400 hover:to-cyan-300"
                style={{ width: `${item.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs text-slate-400">
        Based on 5 most cited papers in the last 10 years.
      </p>
    </div>
  );
}

// ---------- Main Page ----------
export default function About() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-950 text-white">
      <NetworkBackground />

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        {/* Section 1: Image + Introduction */}
        <section className="mb-24 grid items-center gap-16 md:grid-cols-2">
          <div className="flex justify-center">
            <div className="group relative">
              <div className="absolute inset-0 rounded-full bg-blue-500 opacity-30 blur-3xl transition duration-500 group-hover:opacity-50" />

              <div className="relative z-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-600 p-1 shadow-2xl shadow-blue-900/40">
                <div className="overflow-hidden rounded-full">
                  <Image
                    src="/Me1.jpg"
                    alt="Portrait"
                    width={420}
                    height={420}
                    className="h-[380px] w-[380px] rounded-full object-cover transition-transform duration-500 group-hover:scale-105 md:h-[420px] md:w-[420px]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-xl leading-relaxed text-slate-300 backdrop-blur-sm transition-all duration-300 hover:border-cyan-400/20 hover:shadow-cyan-500/5">
            <p>
              Nahiduzzaman is a Doctor of Veterinary Medicine (DVM) graduate specializing in microbiology, epidemiology, and bioinformatics, with experience in pathogen genomics, antimicrobial resistance, and infectious disease research. He is skilled in data analysis, bioinformatics, and scientific writing, with a focus on advancing animal and public health.
            </p>

            <p>
              I serve as a research assistant in{" "}
              <span className="font-semibold text-blue-400">
                Dr. Md. Ariful Islam’s Lab
              </span>{" "}
              at the Department of Microbiology and Hygiene, Bangladesh
              Agricultural University (BAU). My work bridges laboratory
              experiments and computational analysis.
            </p>

            <p>
              My research interests span infectious diseases, zoonosis, vaccine
              development, microbial genomics, antimicrobial resistance,
              epidemiology, environmental microbiology, and AI-driven
              bioinformatics.
            </p>
          </div>
        </section>

        {/* Section 2: Image + Skills/Projects (reversed order on mobile) */}
        <section className="mb-24 grid items-center gap-16 md:grid-cols-2">
          <div className="order-2 space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-xl leading-relaxed text-slate-300 backdrop-blur-sm transition-all duration-300 hover:border-cyan-400/20 hover:shadow-cyan-500/5 md:order-1">
            <p>
              Beyond the bench, I'm proficient in biological data analysis and
              computational tools:{" "}
              <span className="font-semibold text-white">
                R, Python, Julia, Linux, MATLAB
              </span>
              , and numerous bioinformatics platforms.
            </p>

            <p>
              I am deeply fascinated by the microbial world and its impact on
              human, animal, and environmental health. My ultimate goal is to
              become a full-time researcher, contributing to global science
              through innovative, sustainable solutions.
            </p>

            <p>
              I also hold a strong interest in programming, cybersecurity, and
              ethical hacking – certified in that domain.
            </p>

            <p>
              Currently, I'm developing several Python-based tools for
              epidemiology, genomics, and machine learning. One flagship project
              is{" "}
              <span className="text-2xl font-bold text-blue-400">
                EGStat-N
              </span>
              , a multifunctional GUI bioinformatics platform.
            </p>
          </div>

          <div className="order-1 flex justify-center md:order-2">
            <div className="group relative">
              <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-emerald-400 to-cyan-500 opacity-20 blur-2xl transition duration-500 group-hover:opacity-40" />

              <div className="relative z-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-1.5 shadow-2xl shadow-emerald-900/30">
                <div className="overflow-hidden rounded-xl">
                  <Image
                    src="/Me2.jpg"
                    alt="Research"
                    width={420}
                    height={420}
                    className="h-[380px] w-[380px] rounded-xl object-cover transition-transform duration-500 group-hover:scale-105 md:h-[420px] md:w-[420px]"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Research Statistics Section */}
        <section className="mb-24">
          <div className="mb-10 text-center">
            <h2 className="inline-block bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-5xl font-black text-transparent">
              Research Statistics
            </h2>
            <div className="mx-auto mt-4 h-1 w-24 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" />
            <p className="mx-auto mt-5 max-w-3xl text-lg text-slate-400">
              Current research profile summary, citation growth, and journal
              ranking distribution.
            </p>
          </div>

          <div className="mb-8 grid grid-cols-2 gap-5 md:grid-cols-4">
            <StatBox label="Citations" value={researchStats.citations} />
            <StatBox label="h-index" value={researchStats.hIndex} />
            <StatBox label="i10-index" value={researchStats.i10Index} />
            <StatBox label="Q1 Papers" value={researchStats.q1} suffix="%" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <SmallCitationGraph />
            </div>
            <div className="lg:col-span-1">
              <SmallJournalRankGraph />
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl lg:col-span-1 transition-all duration-300 hover:border-cyan-400/30">
              <div className="flex items-center gap-4">
                <Image
                  src="/profile.png"
                  alt="Profile"
                  width={90}
                  height={90}
                  className="h-[90px] w-[90px] rounded-full border-2 border-cyan-400/40 object-cover"
                />
                <div>
                  <h3 className="text-2xl font-black text-white">
                    FNU Nahiduzzaman
                  </h3>
                  <p className="text-sm text-slate-400">
                    Bangladesh Agricultural University
                  </p>
                  <p className="mt-2 text-sm font-semibold text-cyan-300">
                    Infectious Disease • Epidemiology • AMR • Bioinformatics
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <h4 className="mb-3 font-bold text-white">Research Keywords</h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Epidemiology",
                    "Genomics",
                    "Bioinformatics",
                  ].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/20 hover:scale-105"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Work Environment */}
        <section className="mb-16 text-center">
          <div className="mb-10">
            <h2 className="inline-block bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-5xl font-black text-transparent">
              My Work Environment
            </h2>
            <div className="mx-auto mt-4 h-1 w-24 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" />
          </div>

          <div className="group relative inline-block">
            <div className="absolute -inset-6 rounded-3xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 opacity-0 blur-3xl transition duration-700 group-hover:opacity-100" />
            <div className="relative z-10 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-800 to-slate-900 p-2 shadow-2xl shadow-black/20">
              <Image
                src="/Workstation.jpg"
                alt="Workstation"
                width={800}
                height={480}
                className="h-auto w-full max-w-5xl rounded-2xl object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            </div>
          </div>
        </section>

        {/* Connect / Social Links & Emails */}
        <section className="mt-24">
          <div className="mb-10 text-center">
            <h2 className="inline-block bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-5xl font-black text-transparent">
              Connect With Me
            </h2>
            <div className="mx-auto mt-4 h-1 w-24 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" />
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {/* Social Networks */}
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 backdrop-blur-xl shadow-2xl">
              <h3 className="mb-6 text-2xl font-black text-white">
                Academic & Social Profiles
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:shadow-lg hover:shadow-cyan-500/20"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 transition group-hover:bg-cyan-400/20 group-hover:text-cyan-200">
                      {link.icon}
                    </span>
                    <span className="text-sm font-bold text-slate-200 transition group-hover:text-white">
                      {link.name}
                    </span>
                  </a>
                ))}
              </div>
            </div>

            {/* Email & Contact */}
            <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-8 backdrop-blur-xl shadow-2xl">
              <h3 className="mb-6 text-2xl font-black text-white">Email Me</h3>
              <div className="space-y-4">
                {emails.map((email) => (
                  <a
                    key={email}
                    href={`mailto:${email}`}
                    className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-all hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:shadow-lg hover:shadow-cyan-500/20"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 transition group-hover:bg-cyan-400/20 group-hover:text-cyan-200">
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                    </span>
                    <span className="text-sm font-bold text-slate-200 transition group-hover:text-white break-all">
                      {email}
                    </span>
                  </a>
                ))}
              </div>
              <p className="mt-6 text-sm text-slate-400">
                Feel free to reach out for collaborations, research inquiries,
                or just to say hello.
              </p>
            </div>
          </div>
        </section>

        {/* Subtle footer space */}
        <div className="h-16" />
      </div>
    </main>
  );
}