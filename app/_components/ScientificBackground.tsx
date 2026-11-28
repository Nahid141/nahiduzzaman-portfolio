"use client";

import { useCallback, useEffect, useRef } from "react";

/* Animated scientific background: phylogenetic tree, DNA strands, viruses,
   bacteria and particles that react to the pointer. */

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

export default function ScientificBackground() {
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
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

      if (!reduced) animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="fixed inset-0 z-0 bg-slate-950" />;
}
