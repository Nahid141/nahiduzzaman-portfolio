"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type NetworkNode = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

type NetworkEdge = [number, number];

type ProjectStatus = "completed" | "running";

type Project = {
  id: number;
  title: string;
  status: ProjectStatus;
  lead: boolean;
  lab: string;
  description: string;
};

type FruitImageData = {
  src: string;
  label: string;
  borderColor: string;
  dotColor: string;
  positionClass: string;
  lineColorClass: string;
};

const articleLink =
  "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0335979";

const fruitImages: FruitImageData[] = [
  {
    src: "/cropped_circle_image.jpeg",
    label: "Street Fruit",
    borderColor: "border-green-400",
    dotColor: "bg-green-400",
    positionClass: "left-5 top-10 sm:left-10 sm:top-10",
    lineColorClass: "stroke-green-400",
  },
  {
    src: "/cropped_circle_image%20(2).jpeg",
    label: "Street Fruit",
    borderColor: "border-yellow-400",
    dotColor: "bg-yellow-400",
    positionClass: "right-5 top-10 sm:right-10 sm:top-10",
    lineColorClass: "stroke-yellow-400",
  },
  {
    src: "/cropped_circle_image%20(1).jpeg",
    label: "Street Fruit",
    borderColor: "border-red-400",
    dotColor: "bg-red-400",
    positionClass: "left-5 top-[470px] sm:left-10 sm:top-[455px]",
    lineColorClass: "stroke-red-400",
  },
  {
    src: "/cropped_circle_imag.jpeg",
    label: "Street Fruit",
    borderColor: "border-purple-400",
    dotColor: "bg-purple-400",
    positionClass: "right-5 top-[470px] sm:right-10 sm:top-[455px]",
    lineColorClass: "stroke-purple-400",
  },
];

function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -500, y: -500 });
  const dimsRef = useRef({ width: 0, height: 0 });
  const nodesRef = useRef<NetworkNode[]>([]);
  const edgesRef = useRef<NetworkEdge[]>([]);

  const buildNetwork = useCallback((w: number, h: number) => {
    const nodeCount = 22;
    const nodes: NetworkNode[] = [];
    const edges: NetworkEdge[] = [];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        radius: 2 + Math.random() * 3,
      });
    }

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;

        if (Math.sqrt(dx * dx + dy * dy) < w * 0.25) {
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

    dimsRef.current = { width: w, height: h };

    const network = buildNetwork(w, h);
    nodesRef.current = network.nodes;
    edgesRef.current = network.edges;
  }, [buildNetwork]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
    };
  }, [resize]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      const { width, height } = dimsRef.current;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const mouse = mouseRef.current;

      ctx.clearRect(0, 0, width, height);

      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;

        if (node.x < -20) node.x = width + 20;
        if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        if (node.y > width + 20) node.y = -20;
      }

      ctx.lineWidth = 0.8;

      for (const [sourceIndex, targetIndex] of edges) {
        const source = nodes[sourceIndex];
        const target = nodes[targetIndex];

        if (!source || !target) continue;

        ctx.strokeStyle = "rgba(99, 179, 237, 0.22)";
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }

      for (const node of nodes) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(99, 179, 237, 0.55)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(99, 179, 237, 0.12)";
        ctx.fill();
      }

      ctx.lineWidth = 0.6;

      for (const node of nodes) {
        const dx = node.x - mouse.x;
        const dy = node.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 200) {
          const alpha = 0.2 * (1 - dist / 200);

          ctx.strokeStyle = `rgba(99,179,237,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0"
      aria-hidden="true"
    />
  );
}

function FruitCircle({ fruit }: { fruit: FruitImageData }) {
  return (
    <div className={`absolute z-20 flex flex-col items-center ${fruit.positionClass}`}>
      <div
        className={`relative h-24 w-24 overflow-hidden rounded-full border-4 ${fruit.borderColor} bg-gray-950 shadow-[0_0_25px_rgba(0,0,0,0.45)] transition duration-500 hover:scale-110 sm:h-36 sm:w-36`}
      >
        <img
          src={fruit.src}
          alt={fruit.label}
          className="h-full w-full object-cover transition duration-700 hover:scale-125"
        />
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/20 via-transparent to-white/20" />
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-full border border-white/10 bg-gray-950/95 px-4 py-2 text-sm font-extrabold text-white shadow-xl">
        <span className={`h-2.5 w-2.5 rounded-full ${fruit.dotColor}`} />
        {fruit.label}
      </div>
    </div>
  );
}

function ConsumerIllustration() {
  return (
    <svg
      viewBox="0 0 160 160"
      className="h-24 w-24 sm:h-28 sm:w-28"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="consumerStroke" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#c7f9ff" />
        </linearGradient>

        <radialGradient id="consumerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="80" cy="80" r="72" fill="url(#consumerGlow)" />

      <path
        d="M54 45c3-16 15-24 26-24 12 0 24 8 27 24"
        fill="none"
        stroke="url(#consumerStroke)"
        strokeWidth="6"
        strokeLinecap="round"
      />

      <circle
        cx="80"
        cy="52"
        r="22"
        fill="none"
        stroke="url(#consumerStroke)"
        strokeWidth="4"
      />

      <circle cx="72" cy="48" r="3.8" fill="#ffffff" />
      <circle cx="88" cy="48" r="3.8" fill="#ffffff" />

      <path
        d="M72 61c4 4 12 4 16 0"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.4"
        strokeLinecap="round"
      />

      <path
        d="M49 118c0-20 14-36 31-36s31 16 31 36"
        fill="none"
        stroke="url(#consumerStroke)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M62 82l5 8h26l5-8"
        fill="none"
        stroke="#c7f9ff"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ConsumerButton({ active }: { active: boolean }) {
  return (
    <div
      className={`relative flex h-40 w-40 flex-col items-center justify-center rounded-full border text-center shadow-2xl transition duration-500 sm:h-52 sm:w-52 ${
        active
          ? "border-cyan-300 bg-[radial-gradient(circle_at_top,#03243a,#010816)] shadow-cyan-400/40"
          : "border-cyan-500/50 bg-[radial-gradient(circle_at_top,#02192c,#01060f)] shadow-cyan-500/20"
      }`}
    >
      <div className="absolute inset-[-12px] rounded-full border border-cyan-400/30" />
      <div className="absolute inset-[-22px] rounded-full border border-cyan-400/15" />
      <div className="absolute inset-[-30px] animate-ping rounded-full border border-cyan-300/10" />

      <ConsumerIllustration />

      <h4 className="mt-1 text-2xl font-black tracking-tight text-white">
        Consumer
      </h4>

      <span
        className={`mt-3 rounded-full px-5 py-2 text-sm font-black uppercase tracking-wide transition ${
          active
            ? "bg-cyan-300 text-gray-950 shadow-lg"
            : "bg-cyan-500/20 text-cyan-100"
        }`}
      >
        {active ? "Clicked" : "Click"}
      </span>
    </div>
  );
}

function MovingFruitLines() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      viewBox="0 0 1000 700"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id="lineGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        id="fruitPath1"
        d="M165 140 C290 150, 380 225, 470 320"
        fill="none"
      />
      <path
        id="fruitPath2"
        d="M835 140 C710 150, 620 225, 530 320"
        fill="none"
      />
      <path
        id="fruitPath3"
        d="M165 535 C290 490, 380 420, 470 360"
        fill="none"
      />
      <path
        id="fruitPath4"
        d="M835 535 C710 490, 620 420, 530 360"
        fill="none"
      />

      <use
        href="#fruitPath1"
        className="animated-dash stroke-green-400"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        filter="url(#lineGlow)"
      />
      <use
        href="#fruitPath2"
        className="animated-dash stroke-yellow-400"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        filter="url(#lineGlow)"
      />
      <use
        href="#fruitPath3"
        className="animated-dash stroke-red-400"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        filter="url(#lineGlow)"
      />
      <use
        href="#fruitPath4"
        className="animated-dash stroke-purple-400"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        filter="url(#lineGlow)"
      />

      <circle r="8" className="fill-green-300">
        <animateMotion dur="3.5s" repeatCount="indefinite">
          <mpath href="#fruitPath1" />
        </animateMotion>
      </circle>

      <circle r="8" className="fill-yellow-300">
        <animateMotion dur="3.8s" repeatCount="indefinite">
          <mpath href="#fruitPath2" />
        </animateMotion>
      </circle>

      <circle r="8" className="fill-red-300">
        <animateMotion dur="4s" repeatCount="indefinite">
          <mpath href="#fruitPath3" />
        </animateMotion>
      </circle>

      <circle r="8" className="fill-purple-300">
        <animateMotion dur="4.2s" repeatCount="indefinite">
          <mpath href="#fruitPath4" />
        </animateMotion>
      </circle>
    </svg>
  );
}

function StatBar({
  label,
  treatment,
  control,
  icon,
}: {
  label: string;
  treatment: string;
  control: string;
  icon: string;
}) {
  const treatmentValue = Number(treatment.replace("%", ""));
  const controlValue = Number(control.replace("%", ""));

  const treatmentWidth = Math.min(Math.max(treatmentValue * 3, 5), 100);
  const controlWidth = Math.min(
    Math.max(controlValue * 3, controlValue === 0 ? 2 : 5),
    100
  );

  return (
    <div className="rounded-2xl bg-gray-950/60 p-3 ring-1 ring-white/10">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/15 text-xl">
          {icon}
        </div>
        <h5 className="font-bold text-white">{label}</h5>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[74px_1fr_48px] items-center gap-2">
          <span className="text-xs font-semibold text-green-300">Treatment</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-green-400"
              style={{ width: `${treatmentWidth}%` }}
            />
          </div>
          <span className="text-xs font-black text-green-300">{treatment}</span>
        </div>

        <div className="grid grid-cols-[74px_1fr_48px] items-center gap-2">
          <span className="text-xs font-semibold text-purple-300">Control</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-purple-400"
              style={{ width: `${controlWidth}%` }}
            />
          </div>
          <span className="text-xs font-black text-purple-300">{control}</span>
        </div>
      </div>
    </div>
  );
}

function FindingsPanel() {
  return (
    <div className="mt-8 animate-slide-up rounded-3xl border border-cyan-400/30 bg-gray-950/90 p-5 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-2xl font-black text-white">
            Graphical Health Effects After Consumption
          </h3>
          <p className="text-sm text-gray-400">
            Visual summary of the randomized controlled trial findings.
          </p>
        </div>

        <a
          href={articleLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-4 py-2 text-sm font-black text-gray-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
        >
          View PLOS ONE Article
        </a>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-gray-900/80 p-4 ring-1 ring-white/10">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400 text-sm font-black text-gray-950">
              1
            </span>
            <h4 className="font-bold text-cyan-200">Study Design</h4>
          </div>

          <p className="text-sm leading-relaxed text-gray-300">
            Randomized Controlled Trial, Mymensingh, Bangladesh
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-cyan-500/10 p-3 ring-1 ring-cyan-400/20">
              <div className="text-2xl font-black text-cyan-300">300</div>
              <div className="text-xs text-gray-400">participants</div>
            </div>

            <div className="rounded-xl bg-green-500/10 p-3 ring-1 ring-green-400/20">
              <div className="text-2xl font-black text-green-300">150</div>
              <div className="text-xs text-gray-400">treatment</div>
            </div>

            <div className="rounded-xl bg-purple-500/10 p-3 ring-1 ring-purple-400/20">
              <div className="text-2xl font-black text-purple-300">150</div>
              <div className="text-xs text-gray-400">control</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-gray-950/60 p-3 ring-1 ring-white/10">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
              Exposure pathway
            </div>

            <div className="flex items-center justify-between text-xl">
              <span>🍽️</span>
              <span>→</span>
              <span>👤</span>
              <span>→</span>
              <span>🦠</span>
              <span>→</span>
              <span>🤢</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-gray-900/80 p-4 ring-1 ring-white/10 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-400 text-sm font-black text-gray-950">
              2
            </span>
            <h4 className="font-bold text-green-200">
              Main Outcome Comparison
            </h4>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <StatBar
              label="Any GI symptom"
              treatment="27.3%"
              control="10%"
              icon="🦠"
            />
            <StatBar
              label="Nausea"
              treatment="13.3%"
              control="1.3%"
              icon="🤢"
            />
            <StatBar
              label="Abdominal cramps"
              treatment="8.7%"
              control="0%"
              icon="⚡"
            />
            <StatBar
              label="Diarrhea"
              treatment="4.7%"
              control="0%"
              icon="🚽"
            />
          </div>
        </div>

        <div className="rounded-2xl bg-gray-900/80 p-4 ring-1 ring-white/10">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-sm font-black text-white">
              3
            </span>
            <h4 className="font-bold text-red-200">Risk Modeling</h4>
          </div>

          <div className="rounded-xl bg-red-500/10 p-4 ring-1 ring-red-400/20">
            <div className="text-4xl font-black text-red-300">HR = 162.68</div>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">
              Markedly higher hazard of symptom development in the Treatment group.
            </p>
          </div>

          <div className="mt-3 rounded-xl bg-green-500/10 p-4 ring-1 ring-green-400/20">
            <div className="text-3xl font-black text-green-300">HR = 0.90</div>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">
              Higher hygienic practice score modestly reduced risk.
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-gray-900/80 p-4 ring-1 ring-white/10 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-400 text-sm font-black text-gray-950">
              4
            </span>
            <h4 className="font-bold text-yellow-100">
              Microbial Contamination Findings
            </h4>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-green-500/10 p-4 ring-1 ring-green-400/20">
              <div className="mb-2 text-3xl">🧫</div>
              <h5 className="font-bold text-green-300">Higher TVC</h5>
              <p className="mt-1 text-sm leading-relaxed text-gray-300">
                5.78–5.86 log CFU/ml linked to weakness, abdominal cramps, and diarrhea.
              </p>
            </div>

            <div className="rounded-xl bg-purple-500/10 p-4 ring-1 ring-purple-400/20">
              <div className="mb-2 text-3xl">🦠</div>
              <h5 className="font-bold text-purple-300">E. coli</h5>
              <p className="mt-1 text-sm leading-relaxed text-gray-300">
                6–10% prevalence; strongest correlation with abdominal cramps, weakness, and diarrhea.
              </p>
            </div>

            <div className="rounded-xl bg-orange-500/10 p-4 ring-1 ring-orange-400/20">
              <div className="mb-2 text-3xl">🔬</div>
              <h5 className="font-bold text-orange-300">S. aureus</h5>
              <p className="mt-1 text-sm leading-relaxed text-gray-300">
                20–34% prevalence; linked mainly to weakness and abdominal cramps.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-gray-900/80 p-4 ring-1 ring-white/10 lg:col-span-3">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-cyan-500/10 p-4 ring-1 ring-cyan-400/20">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-3xl">📈</span>
                <h4 className="font-bold text-cyan-200">
                  Diagnostic / Sensitivity Insight
                </h4>
              </div>

              <p className="text-sm leading-relaxed text-gray-300">
                Abdominal cramps, weakness, and diarrhea showed the highest sensitivity to microbial contamination.
              </p>

              <div className="mt-3 inline-flex rounded-full bg-cyan-300 px-4 py-1.5 text-sm font-black text-gray-950">
                AUC = 0.801–0.908
              </div>
            </div>

            <div className="rounded-xl bg-gray-950/70 p-4 ring-1 ring-white/10">
              <h4 className="mb-3 font-bold text-white">
                Public Health Implications
              </h4>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-green-500/10 p-3 text-sm text-green-200 ring-1 ring-green-400/20">
                  <div className="mb-1 text-3xl">👥</div>
                  Consumer awareness
                </div>

                <div className="rounded-xl bg-blue-500/10 p-3 text-sm text-blue-200 ring-1 ring-blue-400/20">
                  <div className="mb-1 text-3xl">🧼</div>
                  Improved hygiene
                </div>

                <div className="rounded-xl bg-orange-500/10 p-3 text-sm text-orange-200 ring-1 ring-orange-400/20">
                  <div className="mb-1 text-3xl">🏛️</div>
                  Food safety policy
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-gradient-to-r from-cyan-500/20 via-green-500/20 to-blue-500/20 p-4 text-sm font-medium leading-relaxed text-gray-200 ring-1 ring-cyan-300/20">
            This study highlights significant health risks from consuming contaminated street-vended fresh-cut fruits and supports consumer awareness, hygiene improvement, and stronger food safety measures.
          </div>
        </div>
      </div>
    </div>
  );
}

function FruitRCTVisual() {
  const [active, setActive] = useState(false);

  return (
    <div className="mt-5 rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-4 shadow-2xl shadow-cyan-500/10 sm:p-5">
      <style jsx>{`
        .animated-dash {
          stroke-dasharray: 13 14;
          animation: dashMove 1.35s linear infinite;
        }

        @keyframes dashMove {
          from {
            stroke-dashoffset: 90;
          }
          to {
            stroke-dashoffset: 0;
          }
        }

        @keyframes floatSoft {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slide-up {
          animation: slideUp 0.55s ease-out both;
        }

        .fruit-float-1 {
          animation: floatSoft 4.2s ease-in-out infinite;
        }

        .fruit-float-2 {
          animation: floatSoft 4.7s ease-in-out infinite;
          animation-delay: 0.4s;
        }

        .fruit-float-3 {
          animation: floatSoft 4.4s ease-in-out infinite;
          animation-delay: 0.8s;
        }

        .fruit-float-4 {
          animation: floatSoft 4.9s ease-in-out infinite;
          animation-delay: 1.2s;
        }
      `}</style>

      <div className="mb-6 text-center">
        <h3 className="mx-auto max-w-4xl text-2xl font-black leading-tight text-white sm:text-3xl">
          Health Impacts of Consuming Street-vended Fresh-cut Fruits
        </h3>

        <p className="mt-2 text-sm font-semibold text-green-300">
          A Randomized Controlled Trial
        </p>

        <a
          href={articleLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center justify-center rounded-full bg-cyan-400 px-5 py-2 text-sm font-black text-gray-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300"
        >
          View Published Article
        </a>
      </div>

      <div className="relative mx-auto h-[700px] max-w-5xl rounded-3xl border border-white/10 bg-white/[0.03] shadow-inner">
        <MovingFruitLines />

        <div className="fruit-float-1">
          <FruitCircle fruit={fruitImages[0]} />
        </div>

        <div className="fruit-float-2">
          <FruitCircle fruit={fruitImages[1]} />
        </div>

        <div className="fruit-float-3">
          <FruitCircle fruit={fruitImages[2]} />
        </div>

        <div className="fruit-float-4">
          <FruitCircle fruit={fruitImages[3]} />
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setActive((current) => !current);
          }}
          className="absolute left-1/2 top-[50%] z-30 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition hover:scale-105 focus:ring-4 focus:ring-cyan-400/40"
          aria-label="Click consumer to show RCT health effects"
        >
          <ConsumerButton active={active} />
        </button>

        <div className="absolute bottom-5 left-1/2 z-20 w-[92%] -translate-x-1/2 rounded-full border border-cyan-400/30 bg-gray-950/80 px-4 py-3 text-center text-xs font-semibold text-cyan-100 shadow-lg backdrop-blur sm:w-auto sm:text-sm">
          Click the central Consumer to reveal the graphical health effects
        </div>
      </div>

      {active && <FindingsPanel />}
    </div>
  );
}

const projects: Project[] = [
  {
    id: 8,
    title:
      "Meta-Analysis on the Efficacy of Current PRRSV Vaccines in the United States",
    status: "running",
    lead: false,
    lab: "Dr. Kimberly VanderWaal's Lab, CVM, UMN",
    description:
      "Ongoing systematic review and meta-analysis to quantify the effectiveness of commercially available PRRSV vaccines in U.S. swine herds.",
  },
  {
    id: 1,
    title:
      "Development of Inactivated Brucella abortus Biovar-3 Vaccine with Local Brucella abortus Isolate",
    status: "completed",
    lead: false,
    lab: "Prof. Dr. Ariful Islam's Lab",
    description:
      "A PhD project focusing on producing and evaluating an inactivated vaccine candidate from a local Brucella abortus biovar-3 isolate.",
  },
  {
    id: 2,
    title:
      "Isolation and Identification of Brucella abortus from Dairy Cattle of Mymensingh Region",
    status: "running",
    lead: false,
    lab: "Prof. Dr. Ariful Islam's Lab",
    description:
      "Active surveillance study to isolate and characterize Brucella abortus strains circulating in dairy herds of Mymensingh.",
  },
  {
    id: 3,
    title:
      "Metagenomic Insights into the Microbial Community of Placental Fluid",
    status: "completed",
    lead: false,
    lab: "Prof. Dr. Ariful Islam's Lab",
    description:
      "Exploratory metagenomic analysis of placental fluid microbiota to understand its composition and potential pathogenic signatures.",
  },
  {
    id: 4,
    title:
      "Health Impacts of Consuming Street-vended Fresh-cut-fruits: A Randomized Controlled Trial",
    status: "completed",
    lead: true,
    lab: "Prof. Dr. Md Ariful Islam's Lab",
    description:
      "Led a randomized controlled trial evaluating the microbiological safety and health effects of fresh-cut fruits sold by street vendors.",
  },
  {
    id: 5,
    title:
      "Impacts of Micro- and Nanoplastics on Terrestrial and Aquatic Ecosystems",
    status: "running",
    lead: false,
    lab: "Prof. Dr. Ariful Islam's Lab",
    description:
      "Investigating the ecotoxicological effects of micro- and nanoplastics on soil and water organisms through controlled experiments.",
  },
  {
    id: 6,
    title:
      "Machine Learning-Based Modeling for Predicting Dengue Virus Prevalence in Aedes aegypti Populations of Mymensingh",
    status: "running",
    lead: false,
    lab: "Prof. Dr. Md. Shahiduzzaman's Lab - Dpt of Parasitology, FVS, BAU",
    description:
      "Building predictive models using climatic, entomological, and epidemiological data to forecast dengue outbreaks in the region.",
  },
  {
    id: 7,
    title:
      "Comparative Genomics and Risk Factors of S. haemolyticus from Chicken Meat",
    status: "completed",
    lead: true,
    lab: "Prof. Dr. Mst. Minara Khatun's Lab",
    description:
      "Led a study combining whole-genome sequencing and epidemiological analysis to characterize Staphylococcus haemolyticus from retail chicken.",
  },
  {
    id: 9,
    title:
      "Prevalence and Antimicrobial Resistance Patterns of Salmonella spp. in the Poultry Supply Chains of Mymensingh District",
    status: "running",
    lead: false,
    lab: "Prof. Dr. Md. Ariful Islam's Lab",
    description:
      "Assessing the occurrence and AMR profiles of Salmonella across different stages of the poultry production and distribution chain.",
  },
  {
    id: 10,
    title: "Transmission Dynamics of Brucella abortus in Bangladesh",
    status: "running",
    lead: false,
    lab: "Prof. Dr. Ariful Islam's Lab",
    description:
      "Investigating the epidemiological patterns and transmission pathways of Brucella abortus among cattle and at-risk human populations.",
  },
  {
    id: 11,
    title: "Identification of the Transmission Cycle of E. coli in Slaughterhouse",
    status: "completed",
    lead: false,
    lab: "Prof. Dr. Mst. Minara Khatun's Lab",
    description:
      "Tracing the flow of Escherichia coli from live animals to final meat products within a slaughterhouse environment.",
  },
  {
    id: 12,
    title:
      "Use of Machine Learning to Determine the Risk Factors of Illthrift in Cattle in Mymensingh",
    status: "completed",
    lead: false,
    lab: "Prof. Dr. A.K.M Anisur Rahman's Lab - Dpt of Medicine, FVS, BAU",
    description:
      "Applied ML algorithms to farm-level data to identify predictors of poor growth performance in local cattle.",
  },
];

export default function Research() {
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filteredProjects = projects.filter((project) => {
    const matchesStatus =
      statusFilter === "all" || project.status === statusFilter;

    const matchesSearch =
      project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.lab.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSearch;
  });

  const handleToggle = (id: number) => {
    setExpandedId((currentId) => (currentId === id ? null : id));
  };

  return (
    <>
      <NetworkBackground />

      <main className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <h1 className="mb-4 text-4xl font-bold text-blue-400">Research</h1>

        <p className="mb-10 leading-relaxed text-gray-300">
          My research focuses on infectious diseases, zoonoses, vaccine
          development, microbial genomics, antimicrobial resistance, and
          epidemiology. I have been actively involved in interdisciplinary
          projects across multiple laboratories.
        </p>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["all", "completed", "running"] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
                  statusFilter === status
                    ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30"
                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search projects..."
              className="w-full rounded-lg bg-gray-800 py-2 pl-10 pr-4 text-gray-200 outline-none placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 sm:w-72"
            />

            <svg
              className="absolute left-3 top-2.5 h-4 w-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
              />
            </svg>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            No projects match your current filters. Try adjusting them.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="cursor-pointer overflow-hidden rounded-xl border border-gray-700 bg-gray-800/50 transition hover:bg-gray-800"
                onClick={() => handleToggle(project.id)}
              >
                <div className="flex items-start justify-between p-5">
                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">
                        {project.title}
                      </h3>

                      {project.lead && (
                        <span className="inline-block rounded-full bg-yellow-600 px-2 py-0.5 text-xs font-medium text-yellow-100">
                          Lead Researcher
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          project.status === "completed"
                            ? "bg-green-900 text-green-300"
                            : "bg-amber-900 text-amber-300"
                        }`}
                      >
                        {project.status}
                      </span>

                      <span>·</span>

                      <span>{project.lab}</span>
                    </div>
                  </div>

                  <svg
                    className={`mt-1 h-5 w-5 text-gray-400 transition-transform ${
                      expandedId === project.id ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </div>

                {expandedId === project.id && (
                  <div
                    className="border-t border-gray-700 px-5 pb-5 pt-4 text-sm text-gray-300"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <p>{project.description}</p>

                    {project.id === 4 && <FruitRCTVisual />}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}