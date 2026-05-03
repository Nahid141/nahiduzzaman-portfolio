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
  position: string;
};

const fruitImages: FruitImageData[] = [
  {
    src: "/cropped_circle_image.jpeg",
    label: "Fruit Sample 1",
    borderColor: "border-green-400",
    dotColor: "bg-green-400",
    position: "left-3 top-8 sm:left-8",
  },
  {
    src: "/cropped_circle_image%20(2).jpeg",
    label: "Fruit Sample 2",
    borderColor: "border-yellow-400",
    dotColor: "bg-yellow-400",
    position: "right-3 top-8 sm:right-8",
  },
  {
    src: "/cropped_circle_image%20(1).jpeg",
    label: "Fruit Sample 3",
    borderColor: "border-red-400",
    dotColor: "bg-red-400",
    position: "bottom-12 left-3 sm:left-8",
  },
  {
    src: "/cropped_circle_imag.jpeg",
    label: "Fruit Sample 4",
    borderColor: "border-purple-400",
    dotColor: "bg-purple-400",
    position: "bottom-12 right-3 sm:right-8",
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
        if (node.y > height + 20) node.y = -20;
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
    <div className={`absolute ${fruit.position} z-20 flex flex-col items-center`}>
      <div
        className={`relative h-24 w-24 overflow-hidden rounded-full border-4 ${fruit.borderColor} bg-gray-950 shadow-xl shadow-black/40 transition duration-500 hover:scale-110 sm:h-32 sm:w-32`}
      >
        <img
          src={fruit.src}
          alt={fruit.label}
          className="h-full w-full object-cover transition duration-700 hover:scale-125"
        />

        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/20 via-transparent to-white/20" />
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-full bg-gray-950/90 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/10 sm:text-sm">
        <span className={`h-2 w-2 rounded-full ${fruit.dotColor}`} />
        {fruit.label}
      </div>
    </div>
  );
}

function MovingFruitLines() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
      viewBox="0 0 1000 520"
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
        d="M140 110 C260 120, 365 165, 455 240"
        fill="none"
      />
      <path
        id="fruitPath2"
        d="M860 110 C740 120, 635 165, 545 240"
        fill="none"
      />
      <path
        id="fruitPath3"
        d="M140 370 C260 355, 365 315, 455 280"
        fill="none"
      />
      <path
        id="fruitPath4"
        d="M860 370 C740 355, 635 315, 545 280"
        fill="none"
      />

      <use
        href="#fruitPath1"
        className="animated-dash stroke-green-400"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        filter="url(#lineGlow)"
      />
      <use
        href="#fruitPath2"
        className="animated-dash stroke-yellow-400"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        filter="url(#lineGlow)"
      />
      <use
        href="#fruitPath3"
        className="animated-dash stroke-red-400"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        filter="url(#lineGlow)"
      />
      <use
        href="#fruitPath4"
        className="animated-dash stroke-purple-400"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        filter="url(#lineGlow)"
      />

      <circle r="7" className="fill-green-300">
        <animateMotion dur="3.5s" repeatCount="indefinite">
          <mpath href="#fruitPath1" />
        </animateMotion>
      </circle>

      <circle r="7" className="fill-yellow-300">
        <animateMotion dur="3.8s" repeatCount="indefinite">
          <mpath href="#fruitPath2" />
        </animateMotion>
      </circle>

      <circle r="7" className="fill-red-300">
        <animateMotion dur="4s" repeatCount="indefinite">
          <mpath href="#fruitPath3" />
        </animateMotion>
      </circle>

      <circle r="7" className="fill-purple-300">
        <animateMotion dur="4.2s" repeatCount="indefinite">
          <mpath href="#fruitPath4" />
        </animateMotion>
      </circle>
    </svg>
  );
}

function ConsumerButton({ active }: { active: boolean }) {
  return (
    <div
      className={`relative flex h-36 w-36 flex-col items-center justify-center rounded-full border bg-gray-950 text-center shadow-2xl transition duration-500 sm:h-44 sm:w-44 ${
        active
          ? "border-cyan-300 shadow-cyan-400/40"
          : "border-cyan-500/40 shadow-cyan-500/20"
      }`}
    >
      <div className="absolute inset-[-10px] rounded-full border border-cyan-400/30" />
      <div className="absolute inset-[-22px] animate-ping rounded-full border border-cyan-400/20" />

      <div className="relative mb-2 h-20 w-20">
        <div className="absolute left-1/2 top-1 h-8 w-8 -translate-x-1/2 rounded-full border-2 border-white bg-gray-900" />
        <div className="absolute left-[28px] top-4 h-1.5 w-1.5 rounded-full bg-white" />
        <div className="absolute right-[28px] top-4 h-1.5 w-1.5 rounded-full bg-white" />
        <div className="absolute left-1/2 top-7 h-1 w-4 -translate-x-1/2 rounded-full bg-white/80" />
        <div className="absolute left-1/2 top-10 h-10 w-16 -translate-x-1/2 rounded-t-full border-2 border-white border-b-0" />
      </div>

      <h4 className="text-lg font-black text-white sm:text-xl">Consumer</h4>

      <span
        className={`mt-2 rounded-full px-4 py-1 text-xs font-black uppercase tracking-wide transition ${
          active
            ? "bg-cyan-300 text-gray-950"
            : "bg-cyan-500/20 text-cyan-200"
        }`}
      >
        {active ? "Clicked" : "Click"}
      </span>
    </div>
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
  const controlWidth = Math.min(Math.max(controlValue * 3, controlValue === 0 ? 2 : 5), 100);

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

        <div className="rounded-full bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 ring-1 ring-red-400/30">
          Increased gastrointestinal symptom risk
        </div>
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
              Markedly higher hazard of symptom development in the Treatment
              group.
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
                5.78–5.86 log CFU/ml linked to weakness, abdominal cramps, and
                diarrhea.
              </p>
            </div>

            <div className="rounded-xl bg-purple-500/10 p-4 ring-1 ring-purple-400/20">
              <div className="mb-2 text-3xl">🦠</div>
              <h5 className="font-bold text-purple-300">E. coli</h5>
              <p className="mt-1 text-sm leading-relaxed text-gray-300">
                6–10% prevalence; strongest correlation with abdominal cramps,
                weakness, and diarrhea.
              </p>
            </div>

            <div className="rounded-xl bg-orange-500/10 p-4 ring-1 ring-orange-400/20">
              <div className="mb-2 text-3xl">🔬</div>
              <h5 className="font-bold text-orange-300">S. aureus</h5>
              <p className="mt-1 text-sm leading-relaxed text-gray-300">
                20–34% prevalence; linked mainly to weakness and abdominal
                cramps.
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
                Abdominal cramps, weakness, and diarrhea showed the highest
                sensitivity to microbial contamination.
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
            This study highlights significant health risks from consuming
            contaminated street-vended fresh-cut fruits and supports consumer
            awareness, hygiene improvement, and stronger food safety measures.
          </div>
        </div>
      </div>
    </div>
  );
}

function FruitRCTVisual() {
  const [active, setActive] = useState(false);

  return (
    <div className="mt-5 overflow-hidden rounded-3xl border border-cyan-400/25 bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-5 shadow-2xl shadow-cyan-500/10">
      <style jsx>{`
        .animated-dash {
          stroke-dasharray: 12 14;
          animation: dashMove 1.4s linear infinite;
        }

        @keyframes dashMove {
          from {
            stroke-dashoffset: 80;
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
            transform: translateY(-12px);
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

        .fruit-stage > .floating-fruit:nth-of-type(1) {
          animation: floatSoft 4.2s ease-in-out infinite;
        }

        .fruit-stage > .floating-fruit:nth-of-type(2) {
          animation: floatSoft 4.7s ease-in-out infinite;
          animation-delay: 0.4s;
        }

        .fruit-stage > .floating-fruit:nth-of-type(3) {
          animation: floatSoft 4.4s ease-in-out infinite;
          animation-delay: 0.8s;
        }

        .fruit-stage > .floating-fruit:nth-of-type(4) {
          animation: floatSoft 4.9s ease-in-out infinite;
          animation-delay: 1.2s;
        }
      `}</style>

      <div className="mb-6 text-center">
        <h3 className="text-2xl font-black text-white sm:text-3xl">
          Health Impacts of Consuming Street-vended Fresh-cut Fruits
        </h3>

        <p className="mt-1 text-sm font-semibold text-green-300">
          A Randomized Controlled Trial
        </p>
      </div>

      <div className="fruit-stage relative mx-auto h-[520px] max-w-5xl rounded-3xl border border-white/10 bg-white/[0.03] shadow-inner">
        <MovingFruitLines />

        {fruitImages.map((fruit) => (
          <div key={fruit.src} className="floating-fruit">
            <FruitCircle fruit={fruit} />
          </div>
        ))}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setActive((current) => !current);
          }}
          className="absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition hover:scale-105 focus:ring-4 focus:ring-cyan-400/40"
          aria-label="Click consumer to show RCT health effects"
        >
          <ConsumerButton active={active} />
        </button>

        <div className="absolute bottom-5 left-1/2 z-20 w-[90%] -translate-x-1/2 rounded-full border border-cyan-400/30 bg-gray-950/80 px-4 py-2 text-center text-xs font-semibold text-cyan-100 shadow-lg backdrop-blur sm:w-auto">
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
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>(
    "all"
  );
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