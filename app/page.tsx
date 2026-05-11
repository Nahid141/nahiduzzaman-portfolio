"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";

/* -------------------------------------------------------------------------- */
/*  Animated scientific background                                            */
/* -------------------------------------------------------------------------- */

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  glow: number;
};

type Microbe = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius?: number;
  length?: number;
  width?: number;
  spikes?: number;
  rotation: number;
  rotSpeed: number;
  phase: number;
  color: string;
};

type TreeNode = {
  id: number;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  radius: number;
};

type DnaStrand = {
  id: number;
  centerX: number;
  centerY: number;
  axisAngle: number;
  length: number;
  amplitude: number;
  numTwists: number;
  phase: number;
  twistSpeed: number;
};

function ScientificBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>(0);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });
  const timeRef = useRef(0);
  const dashOffsetRef = useRef(0);

  const treeNodesRef = useRef<TreeNode[]>([]);
  const treeEdgesRef = useRef<[number, number][]>([]);
  const dnaRef = useRef<DnaStrand[]>([]);
  const dnaEdgesRef = useRef<[number, number][]>([]);
  const virusesRef = useRef<Microbe[]>([]);
  const bacteriaRef = useRef<Microbe[]>([]);
  const particlesRef = useRef<Particle[]>([]);

  const randomRange = (min: number, max: number) => min + Math.random() * (max - min);

  const buildBackgroundTree = useCallback((width: number, height: number) => {
    const nodes: TreeNode[] = [];
    const edges: [number, number][] = [];
    const scale = Math.min(1, width / 900);

    nodes.push({
      id: 0,
      x: width * 0.5,
      y: height * 0.16,
      homeX: width * 0.5,
      homeY: height * 0.16,
      vx: 0,
      vy: 0,
      radius: 4.8 * scale,
    });

    const maxDepth = 5;
    const baseLength = Math.min(width, height) * 0.115 * scale;

    const addChildren = (parentId: number, depth: number, angle: number, spread: number) => {
      if (depth >= maxDepth) return;

      const parent = nodes[parentId];
      const childCount = depth < 2 ? 3 : 2;
      const length = baseLength * (1 - depth * 0.11);

      for (let i = 0; i < childCount; i += 1) {
        const offset = (i - (childCount - 1) / 2) * spread;
        const childAngle = angle + offset + randomRange(-0.08, 0.08);
        const x = parent.homeX + Math.cos(childAngle) * length;
        const y = parent.homeY + Math.sin(childAngle) * length;
        const id = nodes.length;

        nodes.push({
          id,
          x,
          y,
          homeX: x,
          homeY: y,
          vx: 0,
          vy: 0,
          radius: Math.max(1.8, 4 - depth * 0.45) * scale,
        });

        edges.push([parentId, id]);
        addChildren(id, depth + 1, childAngle, spread * 0.72);
      }
    };

    addChildren(0, 0, -Math.PI / 2, Math.PI / 3.5);
    return { nodes, edges };
  }, []);

  const buildDnaNetwork = useCallback((width: number, height: number) => {
    const scale = Math.min(1, width / 900);
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.28;
    const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];

    const strands = angles.map((angle, index) => {
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      return {
        id: index,
        centerX: x,
        centerY: y,
        axisAngle: Math.atan2(centerY - y, centerX - x),
        length: 250 * scale,
        amplitude: 17 * scale,
        numTwists: 5.5,
        phase: randomRange(0, Math.PI * 2),
        twistSpeed: randomRange(0.25, 0.45),
      };
    });

    return {
      strands,
      edges: [
        [0, 1],
        [1, 2],
        [2, 0],
      ] as [number, number][],
    };
  }, []);

  const buildMicrobes = useCallback((width: number, height: number) => {
    const scale = Math.min(1, width / 900);

    const viruses: Microbe[] = Array.from({ length: 7 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomRange(-0.35, 0.35),
      vy: randomRange(-0.35, 0.35),
      radius: randomRange(8, 16) * scale,
      spikes: Math.floor(randomRange(8, 14)),
      rotation: randomRange(0, Math.PI * 2),
      rotSpeed: randomRange(-0.04, 0.04),
      phase: randomRange(0, Math.PI * 2),
      color: `hsl(${randomRange(185, 215)}, 85%, 62%)`,
    }));

    const bacteria: Microbe[] = Array.from({ length: 3 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomRange(-0.26, 0.26),
      vy: randomRange(-0.26, 0.26),
      length: randomRange(34, 60) * scale,
      width: randomRange(10, 15) * scale,
      rotation: randomRange(0, Math.PI * 2),
      rotSpeed: randomRange(-0.025, 0.025),
      phase: randomRange(0, Math.PI * 2),
      color: `hsl(${randomRange(155, 180)}, 70%, 50%)`,
    }));

    return { viruses, bacteria };
  }, []);

  const buildParticles = useCallback((width: number, height: number) => {
    const scale = Math.min(1, width / 900);

    return Array.from({ length: width < 768 ? 45 : 75 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: randomRange(-0.25, 0.25),
      vy: randomRange(-0.25, 0.25),
      radius: randomRange(1, 2.6) * scale,
      glow: randomRange(4, 9) * scale,
    }));
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    dimensionsRef.current = { width, height };

    const tree = buildBackgroundTree(width, height);
    treeNodesRef.current = tree.nodes;
    treeEdgesRef.current = tree.edges;

    const dna = buildDnaNetwork(width, height);
    dnaRef.current = dna.strands;
    dnaEdgesRef.current = dna.edges;

    const microbes = buildMicrobes(width, height);
    virusesRef.current = microbes.viruses;
    bacteriaRef.current = microbes.bacteria;

    particlesRef.current = buildParticles(width, height);
  }, [buildBackgroundTree, buildDnaNetwork, buildMicrobes, buildParticles]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);

    const onMouseMove = (event: MouseEvent) => {
      mouseRef.current = { x: event.clientX, y: event.clientY, active: true };
    };

    const onMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseleave", onMouseLeave);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", onMouseLeave);
    };
  }, [resize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let last = performance.now();

    const animate = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.08);
      last = now;

      const { width, height } = dimensionsRef.current;
      if (!width || !height) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      timeRef.current += dt;
      dashOffsetRef.current += dt * 34;
      ctx.clearRect(0, 0, width, height);

      const mouse = mouseRef.current;
      const scale = Math.min(1, width / 900);

      const gradient = ctx.createRadialGradient(
        width * 0.5,
        height * 0.2,
        0,
        width * 0.5,
        height * 0.2,
        Math.max(width, height)
      );
      gradient.addColorStop(0, "rgba(14, 165, 233, 0.12)");
      gradient.addColorStop(0.45, "rgba(15, 23, 42, 0.25)");
      gradient.addColorStop(1, "rgba(2, 6, 23, 0.9)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const nodes = treeNodesRef.current;

      for (const node of nodes) {
        const spring = 0.018;
        const damping = 0.9;
        let fx = (node.homeX - node.x) * spring;
        let fy = (node.homeY - node.y) * spring;

        if (mouse.active) {
          const dx = node.x - mouse.x;
          const dy = node.y - mouse.y;
          const distance = Math.sqrt(dx * dx + dy * dy) + 0.1;

          if (distance < 170 * scale) {
            const force = 30 / distance;
            fx += (dx / distance) * force;
            fy += (dy / distance) * force;
          }
        }

        node.vx = (node.vx + fx) * damping;
        node.vy = (node.vy + fy) * damping;
        node.x += node.vx * dt * 24;
        node.y += node.vy * dt * 24;
      }

      for (const [a, b] of treeEdgesRef.current) {
        const start = nodes[a];
        const end = nodes[b];
        if (!start || !end) continue;

        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const hover =
          mouse.active &&
          (midX - mouse.x) ** 2 + (midY - mouse.y) ** 2 < (130 * scale) ** 2;

        ctx.beginPath();
        ctx.strokeStyle = hover ? "rgba(125, 211, 252, 0.55)" : "rgba(125, 211, 252, 0.10)";
        ctx.lineWidth = hover ? 1.4 : 1;
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }

      for (const node of nodes) {
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 4.5);
        glow.addColorStop(0, "rgba(103, 232, 249, 0.55)");
        glow.addColorStop(1, "rgba(103, 232, 249, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(186, 230, 253, 0.88)";
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      const dnaHover = new Set<number>();

      for (const dna of dnaRef.current) {
        if (!mouse.active) continue;

        const dx = mouse.x - dna.centerX;
        const dy = mouse.y - dna.centerY;
        const along = dx * Math.cos(dna.axisAngle) + dy * Math.sin(dna.axisAngle);
        const perp = Math.abs(-dx * Math.sin(dna.axisAngle) + dy * Math.cos(dna.axisAngle));

        if (Math.abs(along) < dna.length / 2 && perp < 52) dnaHover.add(dna.id);
      }

      for (const [a, b] of dnaEdgesRef.current) {
        const start = dnaRef.current[a];
        const end = dnaRef.current[b];
        if (!start || !end) continue;

        const active = dnaHover.has(a) || dnaHover.has(b);

        ctx.save();
        ctx.setLineDash([8, 10]);
        ctx.lineDashOffset = -dashOffsetRef.current;
        ctx.strokeStyle = active ? "rgba(34, 211, 238, 0.88)" : "rgba(34, 211, 238, 0.20)";
        ctx.lineWidth = active ? 2.4 : 1.4;
        ctx.shadowBlur = active ? 15 : 0;
        ctx.shadowColor = "rgba(34, 211, 238, 0.9)";
        ctx.beginPath();
        ctx.moveTo(start.centerX, start.centerY);
        ctx.lineTo(end.centerX, end.centerY);
        ctx.stroke();
        ctx.restore();
      }

      for (const dna of dnaRef.current) {
        const active = dnaHover.has(dna.id);
        const opacity = active ? 0.9 : 0.32;

        ctx.save();
        ctx.translate(dna.centerX, dna.centerY);
        ctx.rotate(dna.axisAngle);
        ctx.setLineDash([10, 6]);
        ctx.lineDashOffset = -dashOffsetRef.current;

        const steps = 90;
        const top: [number, number][] = [];
        const bottom: [number, number][] = [];

        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const x = t * dna.length - dna.length / 2;
          const wave = 2 * Math.PI * dna.numTwists * t + dna.phase + timeRef.current * dna.twistSpeed;
          top.push([x, Math.sin(wave) * dna.amplitude]);
          bottom.push([x, Math.sin(wave + Math.PI) * dna.amplitude]);
        }

        ctx.strokeStyle = `rgba(34, 211, 238, ${opacity})`;
        ctx.lineWidth = active ? 2.4 : 1.45;

        ctx.beginPath();
        ctx.moveTo(top[0][0], top[0][1]);
        top.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(bottom[0][0], bottom[0][1]);
        bottom.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.stroke();

        ctx.restore();
      }

      const moveWrapped = (item: Microbe) => {
        item.rotation += item.rotSpeed;
        item.phase += 0.035;
        item.x += item.vx;
        item.y += item.vy;

        if (item.x < -80) item.x = width + 80;
        if (item.x > width + 80) item.x = -80;
        if (item.y < -80) item.y = height + 80;
        if (item.y > height + 80) item.y = -80;
      };

      for (const virus of virusesRef.current) {
        moveWrapped(virus);

        ctx.save();
        ctx.translate(virus.x, virus.y);
        ctx.rotate(virus.rotation);
        ctx.fillStyle = virus.color;
        ctx.shadowBlur = 16;
        ctx.shadowColor = "rgba(56, 189, 248, 0.35)";

        ctx.beginPath();
        ctx.arc(0, 0, virus.radius || 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1.5;

        for (let i = 0; i < (virus.spikes || 10); i += 1) {
          const angle = (i / (virus.spikes || 10)) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(
            Math.cos(angle) * (virus.radius || 12) * 0.72,
            Math.sin(angle) * (virus.radius || 12) * 0.72
          );
          ctx.lineTo(
            Math.cos(angle) * (virus.radius || 12) * 1.38,
            Math.sin(angle) * (virus.radius || 12) * 1.38
          );
          ctx.stroke();
        }

        ctx.restore();
      }

      for (const cell of bacteriaRef.current) {
        moveWrapped(cell);

        ctx.save();
        ctx.translate(cell.x, cell.y);
        ctx.rotate(cell.rotation);
        ctx.fillStyle = cell.color;
        ctx.shadowBlur = 14;
        ctx.shadowColor = "rgba(74, 222, 128, 0.28)";

        ctx.beginPath();
        ctx.ellipse(0, 0, (cell.length || 42) / 2, (cell.width || 12) / 2, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = "rgba(187, 247, 208, 0.7)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();

        for (let i = 0; i <= 22; i += 1) {
          const t = i / 22;
          const x = (cell.length || 42) / 2 + t * 34;
          const y = Math.sin(t * Math.PI * 6 + cell.phase) * 5;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.stroke();
        ctx.restore();
      }

      for (const particle of particlesRef.current) {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < -20) particle.x = width + 20;
        if (particle.x > width + 20) particle.x = -20;
        if (particle.y < -20) particle.y = height + 20;
        if (particle.y > height + 20) particle.y = -20;

        const glow = ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          particle.glow
        );

        glow.addColorStop(0, "rgba(125, 211, 252, 0.62)");
        glow.addColorStop(1, "rgba(125, 211, 252, 0)");

        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.glow, 0, Math.PI * 2);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 z-0 bg-slate-950" />;
}

/* -------------------------------------------------------------------------- */
/*  Reusable UI                                                               */
/* -------------------------------------------------------------------------- */

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-serif text-xs font-bold uppercase tracking-[0.34em] text-cyan-300">
      {children}
    </p>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-cyan-300/15 bg-white/[0.055] p-4 backdrop-blur-xl transition duration-300 hover:border-cyan-300/70 hover:bg-cyan-300/10">
      <p className="font-serif text-2xl font-bold text-cyan-200">{value}</p>
      <p className="mt-1 font-serif text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
    </div>
  );
}

function ResearchAreaCard({
  title,
  text,
  index,
}: {
  title: string;
  text: string;
  index: string;
}) {
  return (
    <article className="group border border-cyan-300/15 bg-slate-900/68 p-7 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-cyan-300/70 hover:bg-cyan-300/10 md:p-8">
      <div className="flex items-center justify-between gap-4 border-b border-cyan-300/10 pb-5">
        <p className="font-serif text-sm font-bold text-cyan-300">{index}</p>
        <span className="h-2 w-2 bg-cyan-300 opacity-70 shadow-[0_0_16px_rgba(103,232,249,0.85)]" />
      </div>
      <h3 className="mt-5 font-serif text-2xl font-bold text-white">{title}</h3>
      <p className="mt-4 font-serif text-base leading-8 text-slate-300">{text}</p>
    </article>
  );
}

function HoverRevealProfileSections() {
  return (
    <section id="profile-sections" className="px-6 pb-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">
          <SectionKicker>Profile</SectionKicker>
          <h2 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-tight text-white md:text-5xl">
            Biography and research interest
          </h2>
        </div>

        <div className="relative hidden h-[360px] overflow-hidden border border-cyan-300/20 bg-slate-950 shadow-2xl shadow-cyan-950/30 lg:block">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(8,47,73,0.55),rgba(2,6,23,1)_45%,rgba(8,47,73,0.55))]" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-cyan-300/15" />

          <article className="group absolute left-0 top-0 z-10 h-full w-1/2 overflow-hidden border-r border-cyan-300/15 bg-slate-950 transition-all duration-700 ease-out hover:z-40 hover:w-full hover:border-cyan-300/35 hover:shadow-[0_0_70px_rgba(34,211,238,0.18)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(90deg,rgba(15,23,42,1),rgba(2,6,23,1)_65%)]" />
            <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-cyan-300/16 blur-3xl transition duration-700 group-hover:bg-cyan-300/25" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-1 w-0 bg-cyan-300 transition-all duration-700 group-hover:w-full" />
            <div className="pointer-events-none absolute left-0 top-0 h-full w-20 -translate-x-full bg-gradient-to-r from-transparent via-cyan-200/10 to-transparent transition-transform duration-1000 group-hover:translate-x-[950%]" />

            <div className="relative grid h-full grid-cols-[0.36fr_0.64fr]">
              <div className="flex h-full flex-col justify-between p-8 xl:p-10">
                <div>
                  <SectionKicker>Biography</SectionKicker>
                  <h3 className="mt-4 font-serif text-4xl font-bold leading-tight text-white xl:text-5xl">
                    Academic profile
                  </h3>
                </div>

                <div className="border-t border-cyan-300/20 pt-5">
                  <p className="font-serif text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">
                    Hover to reveal
                  </p>
                </div>
              </div>

              <div className="flex h-full translate-x-10 items-center border-l border-cyan-300/20 bg-slate-950 p-8 opacity-0 transition-all duration-700 ease-out group-hover:translate-x-0 group-hover:opacity-100 xl:p-10">
                <div className="max-w-4xl">
                  <p className="font-serif text-base leading-8 text-slate-300 xl:text-lg xl:leading-9">
                    Nahiduzzaman began his DVM at the Faculty of Veterinary Science, Bangladesh Agricultural University, in 2020 and completed the degree on 31 March 2026. From September 2023 to March 2026, he worked as an Undergraduate Research Assistant in the Department of Microbiology and Hygiene under Prof. Dr. Ariful Islam, where he began his research journey through vaccine development, foodborne pathogen investigation, and public health-related studies. During this period, he contributed to more than 12 research projects, developing expertise in microbiology, epidemiology, public health, bioinformatics, genomics, vaccinology, and related laboratory, molecular, programming, and biological data analysis skills.
                  </p>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <div className="border border-cyan-300/15 bg-cyan-300/5 p-3">
                      <p className="font-serif text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                        Focus
                      </p>
                      <p className="mt-1 font-serif text-sm text-slate-300">Microbiology</p>
                    </div>

                    <div className="border border-cyan-300/15 bg-cyan-300/5 p-3">
                      <p className="font-serif text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                        Method
                      </p>
                      <p className="mt-1 font-serif text-sm text-slate-300">Genomics</p>
                    </div>

                    <div className="border border-cyan-300/15 bg-cyan-300/5 p-3">
                      <p className="font-serif text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                        Output
                      </p>
                      <p className="mt-1 font-serif text-sm text-slate-300">Analysis</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className="group absolute right-0 top-0 z-10 h-full w-1/2 overflow-hidden border-l border-cyan-300/15 bg-slate-950 transition-all duration-700 ease-out hover:z-40 hover:w-full hover:border-cyan-300/35 hover:shadow-[0_0_70px_rgba(34,211,238,0.18)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,0.18),transparent_34%),linear-gradient(270deg,rgba(15,23,42,1),rgba(2,6,23,1)_65%)]" />
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-400/16 blur-3xl transition duration-700 group-hover:bg-cyan-300/25" />
            <div className="pointer-events-none absolute bottom-0 right-0 h-1 w-0 bg-cyan-300 transition-all duration-700 group-hover:w-full" />
            <div className="pointer-events-none absolute right-0 top-0 h-full w-20 translate-x-full bg-gradient-to-l from-transparent via-cyan-200/10 to-transparent transition-transform duration-1000 group-hover:-translate-x-[950%]" />

            <div className="relative grid h-full grid-cols-[0.64fr_0.36fr]">
              <div className="flex h-full -translate-x-10 items-center border-r border-cyan-300/20 bg-slate-950 p-8 opacity-0 transition-all duration-700 ease-out group-hover:translate-x-0 group-hover:opacity-100 xl:p-10">
                <div className="max-w-4xl">
                  <p className="font-serif text-base leading-8 text-slate-300 xl:text-lg xl:leading-9">
                    My research interests focus on microbiology, infectious diseases, public health, epidemiology, molecular epidemiology, bioinformatics, and microbial genomics. I am particularly interested in genomic evolution and transmission dynamics of infectious pathogens. A major focus of my research is the application of machine learning and quantum machine learning models in genomics, molecular epidemiology, and disease dynamics to improve pathogen surveillance, outbreak prediction, evolutionary analysis, and risk assessment. I am also interested in vaccine development, host-pathogen interactions, and the effects of plastic particles on animals, humans, and ecosystems.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {[
                      "Microbial genomics",
                      "Molecular epidemiology",
                      "Transmission dynamics",
                      "ML/QML",
                      "Risk assessment",
                      "Plastic particles",
                    ].map((item) => (
                      <span
                        key={item}
                        className="border border-cyan-300/15 bg-cyan-300/5 px-3 py-2 font-serif text-xs font-bold uppercase tracking-[0.14em] text-cyan-100"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex h-full flex-col justify-between p-8 text-right xl:p-10">
                <div>
                  <SectionKicker>Research Interest</SectionKicker>
                  <h3 className="mt-4 font-serif text-4xl font-bold leading-tight text-white xl:text-5xl">
                    Research interest
                  </h3>
                </div>

                <div className="border-t border-cyan-300/20 pt-5">
                  <p className="font-serif text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">
                    Hover to reveal
                  </p>
                </div>
              </div>
            </div>
          </article>
        </div>

        <div className="grid gap-6 lg:hidden">
          <article className="border border-cyan-300/20 bg-slate-950 p-7 shadow-2xl shadow-cyan-950/20">
            <SectionKicker>Biography</SectionKicker>
            <h3 className="mt-3 font-serif text-3xl font-bold text-white">
              Academic profile
            </h3>
            <p className="mt-5 font-serif text-base leading-8 text-slate-300">
              Nahiduzzaman began his DVM at the Faculty of Veterinary Science, Bangladesh Agricultural University, in 2020 and completed the degree on 31 March 2026. From September 2023 to March 2026, he worked as an Undergraduate Research Assistant in the Department of Microbiology and Hygiene under Prof. Dr. Ariful Islam, where he began his research journey through vaccine development, foodborne pathogen investigation, and public health-related studies. During this period, he contributed to more than 12 research projects and developed expertise in microbiology, epidemiology, public health, bioinformatics, genomics, vaccinology, and related analytical skills.
            </p>
          </article>

          <article className="border border-cyan-300/20 bg-slate-950 p-7 shadow-2xl shadow-cyan-950/20">
            <SectionKicker>Research Interest</SectionKicker>
            <h3 className="mt-3 font-serif text-3xl font-bold text-white">
              Research interest
            </h3>
            <p className="mt-5 font-serif text-base leading-8 text-slate-300">
              My research interests focus on microbiology, infectious diseases, public health, epidemiology, molecular epidemiology, bioinformatics, and microbial genomics. I am particularly interested in genomic evolution and transmission dynamics of infectious pathogens. A major focus of my research is the application of machine learning and quantum machine learning models in genomics, molecular epidemiology, and disease dynamics to improve pathogen surveillance, outbreak prediction, evolutionary analysis, and risk assessment. I am also interested in vaccine development, host-pathogen interactions, and the effects of plastic particles on animals, humans, and ecosystems.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Home page                                                                 */
/* -------------------------------------------------------------------------- */

export default function Home() {
  const stats = [
    { value: "12+", label: "Projects" },
    { value: "4+", label: "Articles" },
    { value: "10+", label: "NCBI" },
    { value: "14+", label: "Conferences" },
  ];

  const researchAreas = [
    {
      title: "Pathogen Detection",
      text: "Isolation, identification, molecular detection, and characterization of pathogens with veterinary and public health relevance.",
    },
    {
      title: "Genomics and Evolution",
      text: "Comparative genomics, phylogenetic interpretation, virulence assessment, AMR gene screening, and evolutionary analysis.",
    },
    {
      title: "Predictive Epidemiology",
      text: "Disease dynamics, outbreak prediction, transmission modeling, ML/QML-supported surveillance, and molecular epidemiological analysis.",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <ScientificBackground />

      <div className="pointer-events-none fixed inset-0 z-[1] bg-[radial-gradient(circle_at_70%_10%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(to_bottom,rgba(2,6,23,0.02),rgba(2,6,23,0.88))]" />

      <div className="relative z-10 font-serif">
        {/* HERO */}
        <section className="px-6 py-20 md:py-24">
          <div className="mx-auto grid min-h-[78vh] max-w-7xl items-center gap-14 lg:grid-cols-[1fr_0.82fr]">
            <div>
              <p className="mb-6 font-serif text-sm font-bold uppercase tracking-[0.34em] text-cyan-300">
                Veterinary Microbiology • Genomics • Epidemiology
              </p>

              <h1 className="max-w-5xl font-serif text-5xl font-bold leading-[0.96] tracking-tight text-white md:text-7xl lg:text-8xl">
                Nahiduzzaman
              </h1>

              <p className="mt-7 max-w-3xl font-serif text-2xl font-semibold leading-tight text-cyan-100 md:text-4xl">
                Veterinary researcher focused on microbiology, public health, genomics, and computational disease modeling.
              </p>

              <p className="mt-7 max-w-3xl font-serif text-base leading-8 text-slate-300 md:text-lg md:leading-9">
                An academic portfolio integrating laboratory microbiology, molecular epidemiology, genomics, vaccinology, environmental toxicology, and data-driven infectious disease research.
              </p>

              <div className="mt-10 flex flex-wrap gap-4">
                <a
                  href="/research"
                  className="border border-cyan-300 bg-cyan-300 px-7 py-4 font-serif font-bold text-slate-950 transition duration-300 hover:bg-white"
                >
                  Research
                </a>

                <a
                  href="/publications"
                  className="border border-white/20 bg-white/5 px-7 py-4 font-serif font-bold text-white backdrop-blur transition duration-300 hover:border-cyan-300 hover:text-cyan-200"
                >
                  Publications
                </a>

                <a
                  href="/tools"
                  className="border border-white/20 px-7 py-4 font-serif font-bold text-white transition duration-300 hover:border-cyan-300 hover:bg-cyan-300/10"
                >
                  Tools
                </a>

                <a
                  href="#profile-sections"
                  className="border border-cyan-300/20 bg-cyan-300/5 px-7 py-4 font-serif font-bold text-cyan-100 transition duration-300 hover:border-cyan-300 hover:bg-cyan-300/15"
                >
                  Profile
                </a>
              </div>

              <div className="mt-10 grid max-w-2xl grid-cols-2 gap-4 md:grid-cols-4">
                {stats.map((item) => (
                  <StatCard key={item.label} value={item.value} label={item.label} />
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute left-1/2 top-1/2 h-[470px] w-[470px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/15 blur-3xl" />

              <div className="relative border border-cyan-300/18 bg-slate-900/55 p-5 shadow-2xl shadow-slate-950/80 backdrop-blur-xl">
                <Image
                  src="/profile.png"
                  alt="Nahiduzzaman profile portrait"
                  width={760}
                  height={860}
                  priority
                  className="h-[470px] w-full object-cover object-center transition duration-700 hover:scale-[1.025]"
                />
              </div>
            </div>
          </div>
        </section>

        <HoverRevealProfileSections />

        {/* LOWER LAB IMAGE */}
        <section id="laboratory-work" className="px-6 pb-24">
          <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="relative">
              <div className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/15 blur-3xl" />
              <div className="relative border border-cyan-300/18 bg-slate-900/55 p-4 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
                <Image
                  src="/Mee.png"
                  alt="Nahiduzzaman working in laboratory"
                  width={900}
                  height={700}
                  className="h-[420px] w-full object-cover object-center transition duration-700 hover:scale-[1.025]"
                />
              </div>
            </div>

            <div className="border border-cyan-300/15 bg-slate-900/68 p-7 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl md:p-10">
              <SectionKicker>Workflow</SectionKicker>
              <h2 className="mt-3 font-serif text-3xl font-bold leading-tight text-white md:text-5xl">
                From bench work to interpretation
              </h2>

              <p className="mt-5 font-serif text-base leading-8 text-slate-300 md:text-lg">
                The workflow connects sample-level investigation with molecular confirmation, genomic analysis, statistical modeling, and scientific visualization. This combined approach supports interpretation of pathogen biology, vaccine-related research, disease dynamics, environmental toxicology, and public health relevance.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="border border-cyan-300/15 bg-white/[0.05] p-5">
                  <p className="font-serif text-lg font-bold text-cyan-200">Laboratory Research</p>
                  <p className="mt-2 font-serif text-sm leading-6 text-slate-300">
                    Isolation, identification, molecular assays, AMR profiling, vaccine-related research, and foodborne pathogen investigation.
                  </p>
                </div>

                <div className="border border-cyan-300/15 bg-white/[0.05] p-5">
                  <p className="font-serif text-lg font-bold text-cyan-200">Computational Analysis</p>
                  <p className="mt-2 font-serif text-sm leading-6 text-slate-300">
                    Genome analysis, viral genomics, phylogeny, epidemiological modeling, ML/QML concepts, biostatistics, and visualization.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* RESEARCH AREAS */}
        <section className="px-6 pb-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10">
              <SectionKicker>Research Areas</SectionKicker>
              <h2 className="mt-3 max-w-4xl font-serif text-3xl font-bold leading-tight text-white md:text-5xl">
                Focused scientific capabilities
              </h2>
              <p className="mt-5 max-w-4xl font-serif text-base leading-8 text-slate-300 md:text-lg">
                The portfolio connects diagnostic microbiology, genomic evidence, epidemiological modeling, and computational tool development.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {researchAreas.map((card, index) => (
                <ResearchAreaCard
                  key={card.title}
                  title={card.title}
                  text={card.text}
                  index={`0${index + 1}`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* NAV CARDS */}
        <section className="px-6 pb-24">
          <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2">
            <a
              href="/about"
              className="group border border-cyan-300/15 bg-gradient-to-br from-blue-600/20 to-cyan-500/10 p-7 transition duration-300 hover:border-cyan-300 md:p-8"
            >
              <SectionKicker>About</SectionKicker>
              <h3 className="mt-3 font-serif text-2xl font-bold md:text-3xl">
                Academic journey and research training
              </h3>
              <p className="mt-4 font-serif leading-8 text-slate-300">
                Academic background, research development, technical skills, and long-term scientific goals.
              </p>
              <p className="mt-6 font-serif font-bold text-cyan-200 transition group-hover:translate-x-1">
                Read more →
              </p>
            </a>

            <a
              href="/blog"
              className="group border border-cyan-300/15 bg-gradient-to-br from-indigo-600/20 to-blue-500/10 p-7 transition duration-300 hover:border-cyan-300 md:p-8"
            >
              <SectionKicker>Blog</SectionKicker>
              <h3 className="mt-3 font-serif text-2xl font-bold md:text-3xl">
                Bioinformatics notes and research writing
              </h3>
              <p className="mt-4 font-serif leading-8 text-slate-300">
                Practical workflows, research reflections, scientific writing notes, and computational biology resources.
              </p>
              <p className="mt-6 font-serif font-bold text-cyan-200 transition group-hover:translate-x-1">
                Visit blog →
              </p>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
