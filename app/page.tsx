"use client";

import Image from "next/image";
import { useEffect, useRef, useCallback } from "react";

/* -------------------------------------------------------------------------- */
/*   Interactive Phylogenetic Network Background                              */
/*   – responsive canvas with mouse-reactive tree, DNA network lines,         */
/*     viruses, bacteria, particles, and clickable phylogenetic pop‑up       */
/* -------------------------------------------------------------------------- */
function PhylogeneticBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const mouseRef = useRef({ x: -1000, y: -1000, active: false });
  const dimensions = useRef({ width: 0, height: 0 });
  const scaleRef = useRef(1); // mobile scale factor

  // --- background tree ---
  const treeNodesRef = useRef<any[]>([]);
  const treeEdgesRef = useRef<[number, number][]>([]);
  // --- three DNA network nodes (now drawn as light connection lines) ---
  const dnaNodesRef = useRef<any[]>([]);
  const networkEdgesRef = useRef<[number, number][]>([]);
  // --- viruses & bacteria ---
  const virusesRef = useRef<any[]>([]);
  const bacteriaRef = useRef<any[]>([]);
  // --- ambient particles ---
  const particlesRef = useRef<any[]>([]);
  // --- click phylogenetic tree ---
  const clickTreeNodesRef = useRef<any[]>([]);
  const clickTreeEdgesRef = useRef<[number, number][]>([]);
  const showClickTreeRef = useRef(false);
  const clickTreeTimerRef = useRef(0);

  const globalTimeRef = useRef(0);
  const dashOffsetRef = useRef(0); // for flowing dash effect on DNA lines

  // ==================== BUILD FUNCTIONS ====================
  const buildBackgroundTree = useCallback((width: number, height: number) => {
    const nodes: any[] = [];
    const edges: [number, number][] = [];
    const root = { id: 0, x: width * 0.5, y: height * 0.15, vx: 0, vy: 0, radius: 5 * scaleRef.current };
    nodes.push(root);
    const maxDepth = 5;
    const branchAngle = Math.PI / 4;
    const lengthBase = Math.min(width, height) * 0.09 * scaleRef.current;

    const addChildren = (parentId: number, depth: number, angle: number, centerX: number, centerY: number) => {
      if (depth >= maxDepth) return;
      const childCount = depth < 3 ? 3 : 2;
      const length = lengthBase * (1 - depth * 0.12);
      for (let i = 0; i < childCount; i++) {
        const offset = (i - (childCount - 1) / 2) * (branchAngle / (depth + 1));
        const childAngle = angle + offset;
        const childX = centerX + Math.cos(childAngle) * length;
        const childY = centerY + Math.sin(childAngle) * length;
        const id = nodes.length;
        nodes.push({ id, x: childX, y: childY, vx: 0, vy: 0, radius: 4 - depth * 0.4 });
        edges.push([parentId, id]);
        addChildren(id, depth + 1, childAngle, childX, childY);
      }
    };
    addChildren(0, 0, -Math.PI / 2, root.x, root.y);
    return { nodes, edges };
  }, [scaleRef]);

  const buildNetworkDNA = useCallback((width: number, height: number) => {
    // Three fixed DNA points arranged in a triangle
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusOuter = Math.min(width, height) * 0.25;
    const angles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
    const startAngle = -Math.PI / 2;
    const positions = angles.map(a => ({
      x: centerX + radiusOuter * Math.cos(a + startAngle),
      y: centerY + radiusOuter * Math.sin(a + startAngle)
    }));

    const strands = positions.map((pos, idx) => {
      const angleToCenter = Math.atan2(centerY - pos.y, centerX - pos.x);
      return {
        id: idx,
        centerX: pos.x,
        centerY: pos.y,
        axisAngle: angleToCenter,
        length: 260 * scaleRef.current,
        amplitude: 18 * scaleRef.current,
        numTwists: 5.5,
        phase: Math.random() * Math.PI * 2,
        twistSpeed: 0.3,
        opacity: 0.3,           // base opacity (will increase on hover)
        hoverOpacity: 0.8,
      };
    });

    const edges: [number, number][] = [[0, 1], [1, 2], [2, 0]];
    return { nodes: strands, edges };
  }, [scaleRef]);

  const buildViruses = useCallback((width: number, height: number) => {
    const viruses = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      const baseRadius = 12 + Math.random() * 10;
      viruses.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        radius: baseRadius * scaleRef.current,
        spikes: 8 + Math.floor(Math.random() * 8),
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.05,
        color: `hsl(${Math.random() * 60 + 340}, 80%, 60%)`,
      });
    }
    return viruses;
  }, [scaleRef]);

  const buildBacteria = useCallback((width: number, height: number) => {
    const bacteria = [];
    const count = 3;
    for (let i = 0; i < count; i++) {
      const baseLength = 30 + Math.random() * 40;
      const baseWidth = 8 + Math.random() * 12;
      bacteria.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        length: baseLength * scaleRef.current,
        width: baseWidth * scaleRef.current,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.03,
        flagellumPhase: Math.random() * Math.PI * 2,
        flagellumSpeed: 0.2 + Math.random() * 0.4,
        color: `hsl(${Math.random() * 30 + 140}, 70%, 50%)`,
      });
    }
    return bacteria;
  }, [scaleRef]);

  const buildParticles = useCallback((width: number, height: number) => {
    const particles = [];
    const count = 50;
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: (1.5 + Math.random() * 2.5) * scaleRef.current,
        glow: (3 + Math.random() * 6) * scaleRef.current,
      });
    }
    return particles;
  }, [scaleRef]);

  const buildClickTree = useCallback((rootX: number, rootY: number) => {
    const nodes: any[] = [];
    const edges: [number, number][] = [];
    const root = { id: 0, x: rootX, y: rootY, vx: 0, vy: 0, radius: 5 * scaleRef.current };
    nodes.push(root);
    const maxDepth = 3;
    const branchAngle = Math.PI / 3;
    const lengthBase = 55 * scaleRef.current;

    const addChildren = (parentId: number, depth: number, angle: number) => {
      if (depth >= maxDepth) return;
      const parent = nodes[parentId];
      const childCount = depth < 2 ? 3 : 2;
      const length = lengthBase * (1 - depth * 0.15);
      for (let i = 0; i < childCount; i++) {
        const offset = (i - (childCount - 1) / 2) * (branchAngle / (depth + 1));
        const childAngle = angle + offset;
        const childX = parent.x + Math.cos(childAngle) * length;
        const childY = parent.y + Math.sin(childAngle) * length;
        const id = nodes.length;
        nodes.push({ id, x: childX, y: childY, vx: 0, vy: 0, radius: 3.5 - depth * 0.4 });
        edges.push([parentId, id]);
        addChildren(id, depth + 1, childAngle);
      }
    };

    const startAngles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
    for (const ang of startAngles) {
      const firstChildX = rootX + Math.cos(ang) * lengthBase;
      const firstChildY = rootY + Math.sin(ang) * lengthBase;
      const id = nodes.length;
      nodes.push({ id, x: firstChildX, y: firstChildY, vx: 0, vy: 0, radius: 3.5 });
      edges.push([0, id]);
      addChildren(id, 1, ang);
    }
    return { nodes, edges };
  }, [scaleRef]);

  // ==================== RESIZE ====================
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    dimensions.current = { width: w, height: h };

    const scale = Math.min(1, w / 800);
    scaleRef.current = scale;

    const { nodes, edges } = buildBackgroundTree(w, h);
    treeNodesRef.current = nodes;
    treeEdgesRef.current = edges;

    const { nodes: dnaNodes, edges: networkEdges } = buildNetworkDNA(w, h);
    dnaNodesRef.current = dnaNodes;
    networkEdgesRef.current = networkEdges;

    virusesRef.current = buildViruses(w, h);
    bacteriaRef.current = buildBacteria(w, h);
    particlesRef.current = buildParticles(w, h);

    showClickTreeRef.current = false;
    clickTreeNodesRef.current = [];
    clickTreeEdgesRef.current = [];
  }, [buildBackgroundTree, buildNetworkDNA, buildViruses, buildBacteria, buildParticles]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ==================== MOUSE ====================
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
    };
    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, []);

  // ==================== CANVAS CLICK (DNA TAP) ====================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dnaList = dnaNodesRef.current;
      let hitID = -1;
      for (const dna of dnaList) {
        const dx = x - dna.centerX;
        const dy = y - dna.centerY;
        const along = dx * Math.cos(dna.axisAngle) + dy * Math.sin(dna.axisAngle);
        const perp = Math.abs(-dx * Math.sin(dna.axisAngle) + dy * Math.cos(dna.axisAngle));
        const halfLen = dna.length / 2;
        if (Math.abs(along) < halfLen && perp < 40) { // slightly wider hit area
          hitID = dna.id;
          break;
        }
      }
      if (hitID >= 0) {
        const dna = dnaList[hitID];
        const { nodes, edges } = buildClickTree(dna.centerX, dna.centerY);
        clickTreeNodesRef.current = nodes;
        clickTreeEdgesRef.current = edges;
        showClickTreeRef.current = true;
        clickTreeTimerRef.current = 6;
      }
    };
    canvas.addEventListener("click", handleClick);
    return () => canvas.removeEventListener("click", handleClick);
  }, [buildClickTree]);

  // ==================== ANIMATION LOOP ====================
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastTime = performance.now();

    const animate = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      globalTimeRef.current += dt;
      dashOffsetRef.current += dt * 30; // flowing dash effect

      const { width, height } = dimensions.current;
      const responsiveScale = Math.min(1, width / 800);
      if (!width || !height) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const treeNodes = treeNodesRef.current;
      const treeEdges = treeEdgesRef.current;
      const dnaNodes = dnaNodesRef.current;
      const networkEdges = networkEdgesRef.current;
      const viruses = virusesRef.current;
      const bacteria = bacteriaRef.current;
      const particles = particlesRef.current;
      const mouse = mouseRef.current;
      const mouseX = mouse.x;
      const mouseY = mouse.y;
      const mouseActive = mouse.active;

      // ---- update background tree ----
      const homeX = new Float32Array(treeNodes.length);
      const homeY = new Float32Array(treeNodes.length);
      for (let i = 0; i < treeNodes.length; i++) {
        homeX[i] = treeNodes[i].x;
        homeY[i] = treeNodes[i].y;
      }
      const repulsionStrength = 120;
      const springStrength = 0.005;
      const damping = 0.92;
      for (let i = 0; i < treeNodes.length; i++) {
        let fx = 0, fy = 0;
        fx += (homeX[i] - treeNodes[i].x) * springStrength;
        fy += (homeY[i] - treeNodes[i].y) * springStrength;
        if (mouseActive) {
          const dx = treeNodes[i].x - mouseX;
          const dy = treeNodes[i].y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
          if (dist < 180 * responsiveScale) {
            const force = repulsionStrength / (dist * 0.8);
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }
        }
        for (let j = i + 1; j < treeNodes.length; j++) {
          const dx = treeNodes[i].x - treeNodes[j].x;
          const dy = treeNodes[i].y - treeNodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
          if (dist < 60 * responsiveScale) {
            const force = 15 / dist;
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
            treeNodes[j].vx -= (dx / dist) * force;
            treeNodes[j].vy -= (dy / dist) * force;
          }
        }
        treeNodes[i].vx = (treeNodes[i].vx + fx * dt) * damping;
        treeNodes[i].vy = (treeNodes[i].vy + fy * dt) * damping;
        treeNodes[i].x += treeNodes[i].vx * dt;
        treeNodes[i].y += treeNodes[i].vy * dt;
        treeNodes[i].x = Math.max(10, Math.min(width - 10, treeNodes[i].x));
        treeNodes[i].y = Math.max(10, Math.min(height - 10, treeNodes[i].y));
      }

      // ---- update viruses & bacteria ----
      for (const v of viruses) {
        if (mouseActive) {
          const dx = v.x - mouseX, dy = v.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
          if (dist < 150 * responsiveScale) {
            const force = 50 / (dist * 0.5);
            v.vx += (dx / dist) * force * dt;
            v.vy += (dy / dist) * force * dt;
          }
        }
        v.rotation += v.rotSpeed * dt;
        v.x += v.vx * dt;
        v.y += v.vy * dt;
        if (v.x < -30) v.x = width + 30;
        if (v.x > width + 30) v.x = -30;
        if (v.y < -30) v.y = height + 30;
        if (v.y > height + 30) v.y = -30;
      }
      for (const b of bacteria) {
        if (mouseActive) {
          const dx = b.x - mouseX, dy = b.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
          if (dist < 150) {
            const force = 40 / (dist * 0.5);
            b.vx += (dx / dist) * force * dt;
            b.vy += (dy / dist) * force * dt;
          }
        }
        b.rotation += b.rotSpeed * dt;
        b.flagellumPhase += b.flagellumSpeed * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < -50 * responsiveScale) b.x = width + 50 * responsiveScale;
        if (b.x > width + 50 * responsiveScale) b.x = -50 * responsiveScale;
        if (b.y < -50 * responsiveScale) b.y = height + 50 * responsiveScale;
        if (b.y > height + 50 * responsiveScale) b.y = -50 * responsiveScale;
      }

      // ---- determine DNA hover state (interactive glow) ----
      const hoveredDNA = new Set<number>();
      if (mouseActive) {
        for (const dna of dnaNodes) {
          const dx = mouseX - dna.centerX;
          const dy = mouseY - dna.centerY;
          const along = dx * Math.cos(dna.axisAngle) + dy * Math.sin(dna.axisAngle);
          const perp = Math.abs(-dx * Math.sin(dna.axisAngle) + dy * Math.cos(dna.axisAngle));
          if (Math.abs(along) < dna.length / 2 && perp < 50 * responsiveScale) {
            hoveredDNA.add(dna.id);
          }
        }
      }

      // ---- update click tree ----
      if (showClickTreeRef.current) {
        clickTreeTimerRef.current -= dt;
        if (clickTreeTimerRef.current <= 0) {
          showClickTreeRef.current = false;
          clickTreeNodesRef.current = [];
          clickTreeEdgesRef.current = [];
        }
      }

      // ---- DRAW ----
      ctx.clearRect(0, 0, width, height);

      // 1. Background tree
      ctx.beginPath();
      ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
      ctx.lineWidth = 1;
      for (const [a, b] of treeEdges) {
        const na = treeNodes[a], nb = treeNodes[b];
        if (na && nb) { ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); }
      }
      ctx.stroke();
      if (mouseActive) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
        ctx.lineWidth = 1.4;
        for (const [a, b] of treeEdges) {
          const na = treeNodes[a], nb = treeNodes[b];
          if (!na || !nb) continue;
          const midX = (na.x + nb.x) / 2, midY = (na.y + nb.y) / 2;
          if ((midX - mouseX) ** 2 + (midY - mouseY) ** 2 < 120 * 120) {
            ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y);
          }
        }
        ctx.stroke();
      }
      for (const node of treeNodes) {
        ctx.beginPath();
        const g = ctx.createRadialGradient(node.x - 2, node.y - 2, 0, node.x, node.y, node.radius * 2.5);
        g.addColorStop(0, "rgba(125, 211, 252, 0.9)");
        g.addColorStop(1, "rgba(14, 165, 233, 0.1)");
        ctx.fillStyle = g;
        ctx.arc(node.x, node.y, node.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "#7dd3fc";
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Network edges between DNA (base: subtle, glow on hover)
      for (const [a, b] of networkEdges) {
        const na = dnaNodes[a], nb = dnaNodes[b];
        if (!na || !nb) continue;
        const isHovered = hoveredDNA.has(a) || hoveredDNA.has(b);
        ctx.beginPath();
        ctx.setLineDash([8, 10]);
        ctx.lineDashOffset = -dashOffsetRef.current;
        ctx.strokeStyle = isHovered ? "rgba(56, 189, 248, 0.9)" : "rgba(56, 189, 248, 0.25)";
        ctx.lineWidth = isHovered ? 2.5 : 1.8;
        ctx.shadowColor = isHovered ? "#38bdf8" : "transparent";
        ctx.shadowBlur = isHovered ? 12 : 0;
        ctx.moveTo(na.centerX, na.centerY);
        ctx.lineTo(nb.centerX, nb.centerY);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // 3. Draw DNA molecules as flowing network lines (double helix reduced to two wavy lines)
      for (const dna of dnaNodes) {
        const isHovered = hoveredDNA.has(dna.id);
        const opacity = isHovered ? dna.hoverOpacity : dna.opacity;
        ctx.save();
        ctx.translate(dna.centerX, dna.centerY);
        ctx.rotate(dna.axisAngle);
        // NO spinAngle rotation – DNA no longer rotates

        const steps = 100;
        const pts1: [number, number][] = [];
        const pts2: [number, number][] = [];
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const px = t * dna.length - dna.length / 2;
          const py1 = dna.amplitude * Math.sin(2 * Math.PI * dna.numTwists * t + dna.phase + globalTimeRef.current * dna.twistSpeed);
          const py2 = dna.amplitude * Math.sin(2 * Math.PI * dna.numTwists * t + dna.phase + Math.PI + globalTimeRef.current * dna.twistSpeed);
          pts1.push([px, py1]);
          pts2.push([px, py2]);
        }

        // draw backbones as dashed network lines
        ctx.setLineDash([10, 6]);
        ctx.lineDashOffset = -dashOffsetRef.current * 1.2; // flowing movement
        ctx.lineWidth = isHovered ? 2.2 : 1.4;
        ctx.strokeStyle = `rgba(56, 189, 248, ${opacity})`;
        ctx.beginPath(); ctx.moveTo(pts1[0][0], pts1[0][1]);
        for (let i = 1; i < pts1.length; i++) ctx.lineTo(pts1[i][0], pts1[i][1]);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pts2[0][0], pts2[0][1]);
        for (let i = 1; i < pts2.length; i++) ctx.lineTo(pts2[i][0], pts2[i][1]);
        ctx.stroke();

        // faint rungs only when hovered
        if (isHovered) {
          ctx.strokeStyle = `rgba(125, 211, 252, ${opacity * 0.5})`;
          ctx.lineWidth = 0.5;
          const rungCount = 14;
          for (let i = 0; i <= rungCount; i++) {
            const t = i / rungCount;
            const idx = Math.floor(t * steps);
            if (idx < pts1.length) {
              const [x1, y1] = pts1[idx], [x2, y2] = pts2[idx];
              ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            }
          }
        }
        ctx.setLineDash([]);
        ctx.restore();
      }

      // 4. Viruses
      for (const v of viruses) {
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(v.rotation);
        ctx.beginPath();
        ctx.arc(0, 0, v.radius, 0, Math.PI * 2);
        ctx.fillStyle = v.color;
        ctx.fill();
        ctx.strokeStyle = "#fff8";
        ctx.lineWidth = 2;
        for (let i = 0; i < v.spikes; i++) {
          const angle = (i / v.spikes) * Math.PI * 2;
          const inner = v.radius * 0.7, outer = v.radius * 1.4;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
          ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
          ctx.stroke();
        }
        ctx.restore();
      }

      // 5. Bacteria
      for (const b of bacteria) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.rotation);
        const halfLen = b.length / 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, halfLen, b.width / 2, 0, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.strokeStyle = "#fff5";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        const waveAmp = 5, waveLen = 30, stepsFlag = 20;
        for (let i = 0; i <= stepsFlag; i++) {
          const t = i / stepsFlag;
          const px = halfLen + t * waveLen;
          const py = waveAmp * Math.sin(t * Math.PI * 6 + b.flagellumPhase);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // 6. Click phylogenetic tree
      if (showClickTreeRef.current) {
        const cNodes = clickTreeNodesRef.current, cEdges = clickTreeEdgesRef.current;
        const alpha = Math.min(1, clickTreeTimerRef.current / 2);
        ctx.beginPath();
        ctx.strokeStyle = `rgba(192, 38, 211, ${0.8 * alpha})`;
        ctx.lineWidth = 2;
        for (const [a, b] of cEdges) {
          const na = cNodes[a], nb = cNodes[b];
          if (na && nb) { ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); }
        }
        ctx.stroke();
        for (const node of cNodes) {
          ctx.beginPath();
          const g = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius * 2.5);
          g.addColorStop(0, `rgba(192, 38, 211, ${0.9 * alpha})`);
          g.addColorStop(1, "rgba(192, 38, 211, 0)");
          ctx.fillStyle = g;
          ctx.arc(node.x, node.y, node.radius * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = `rgba(192, 132, 252, ${alpha})`;
          ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 7. Particles
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = width + 20; if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20; if (p.y > height + 20) p.y = -20;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.glow);
        g.addColorStop(0, "rgba(56, 189, 248, 0.7)");
        g.addColorStop(1, "rgba(56, 189, 248, 0)");
        ctx.beginPath();
        ctx.fillStyle = g;
        ctx.arc(p.x, p.y, p.glow, 0, Math.PI * 2);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0" />;
}

/* -------------------------------------------------------------------------- */
/*   Homepage Content                                                         */
/* -------------------------------------------------------------------------- */
export default function Home() {
  const stats = [
    { value: "4+", label: "Journal Articles" },
    { value: "10+", label: "NCBI Contributions" },
    { value: "12+", label: "Research Projects" },
    { value: "14+", label: "Conferences" },
  ];

  const focus = [
    "Infectious Disease", "Zoonosis", "Vaccine Development", "Microbial Genomics",
    "AMR", "Public Health", "Epidemiology", "Machine Learning","Quantum Machine Learning",
  ];

  const highlights = [
    {
      title: "Genomics & Bioinformatics",
      text: "Genome analysis, pathogen characterization, evolutionary dynamics, phylogenetics, and data-driven biological interpretation.",
    },
    {
      title: "Public Health & Epidemiology",
      text: "Research focused on zoonoses, food animal associated pathogens (Cattle, Swine, Poultry), foodborne pathogens, antimicrobial resistance, and disease dynamics.",
    },
    {
      title: "Tool Development",
      text: "Building computational tools for epidemiology, genomics, machine learning, and biological data analysis.",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <PhylogeneticBackground />

      <div className="relative z-10">
        {/* hero */}
        <section className="min-h-screen px-6 py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2">
            <div>
              <div className="mb-6 inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-5 py-2 text-xs md:text-sm font-bold text-cyan-200 shadow-lg shadow-cyan-900/20 backdrop-blur-sm">
                Microbiology • Epidemiology • Bioinformatics
              </div>

              <h1 className="mb-6 text-5xl md:text-8xl font-black leading-tight tracking-tight">
                Nahiduzzaman
              </h1>

              <h3 className="text-xl md:text-2xl font-bold text-cyan-200 mb-4">Research Interest</h3>
              <p className="mb-8 max-w-2xl text-base md:text-xl leading-7 md:leading-9 text-slate-300">
                I integrate microbiology, epidemiology, and bioinformatics, with over three years research experience in infectious and zoonotic diseases. My work spans vaccine development, microbial genomics, foodborne pathogen surveillance, and data-driven disease dynamics modeling. Proficient in Python, R, Julia, MATLAB, and Linux, I develop bioinformatics and epidemiological tools. I am particularly interested in host-pathogen interactions, genomic evolution, and epidemiological modeling, and I seek to apply machine learning and quantum machine learning (QML) approaches to understand pathogen adaptation in livestock systems.
              </p>

              <div className="mb-10 flex flex-wrap gap-4">
                <a href="/research" className="rounded-2xl bg-blue-500 px-7 py-4 font-bold text-white shadow-xl shadow-blue-900/30 transition hover:-translate-y-1 hover:bg-cyan-400 hover:text-slate-950">
                  Explore Research
                </a>
                <a href="/publications" className="rounded-2xl border border-white/20 bg-white/5 px-7 py-4 font-bold text-white backdrop-blur transition hover:-translate-y-1 hover:border-cyan-300 hover:text-cyan-300">
                  Publications
                </a>
                <a href="/tools" className="rounded-2xl border border-white/20 px-7 py-4 font-bold text-white transition hover:-translate-y-1 hover:border-blue-400 hover:bg-blue-500/10">
                  Tools
                </a>
              </div>

              <div className="grid max-w-lg grid-cols-2 gap-4">
                {stats.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-center backdrop-blur-md transition hover:-translate-y-1 hover:border-cyan-300 hover:bg-cyan-300/10"
                  >
                    <p className="text-2xl font-black text-cyan-300">{item.value}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative flex justify-center">
              <div className="absolute h-[430px] w-[430px] rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="absolute h-[360px] w-[360px] animate-pulse rounded-full border border-cyan-300/30" />
              <div className="relative rounded-full bg-gradient-to-br from-cyan-300 via-blue-500 to-indigo-700 p-2 shadow-2xl shadow-blue-950">
                <div className="rounded-full bg-slate-950 p-3">
                  <Image
                    src="/profile.png"
                    alt="Nahiduzzaman"
                    width={360}
                    height={360}
                    priority
                    className="h-[280px] w-[280px] md:h-[360px] md:w-[360px] rounded-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* research ecosystem */}
        <section className="px-6 pb-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-10 text-center">
              <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-300">
                Research Ecosystem
              </p>
              <h2 className="mt-3 text-3xl md:text-5xl font-black">
                Integrated Laboratory + Computational Research
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {highlights.map((card) => (
                <div
                  key={card.title}
                  className="group rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 md:p-8 backdrop-blur-xl transition duration-300 hover:-translate-y-3 hover:border-cyan-300 hover:bg-cyan-300/10 hover:shadow-2xl hover:shadow-cyan-950/40"
                >
                  <div className="mb-6 h-12 w-12 md:h-14 md:w-14 rounded-2xl bg-blue-500/20 ring-1 ring-blue-300/30 transition group-hover:bg-cyan-300 group-hover:text-slate-950" />
                  <h3 className="mb-3 text-xl md:text-2xl font-black">{card.title}</h3>
                  <p className="leading-7 md:leading-8 text-slate-300">{card.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* expertise */}
        <section className="px-6 pb-24">
          <div className="mx-auto max-w-7xl rounded-[2.5rem] border border-white/10 bg-slate-900/70 p-6 md:p-12 backdrop-blur-xl">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-cyan-300">
                  Expertise
                </p>
                <h2 className="mt-3 text-3xl md:text-4xl font-black">
                  Multidisciplinary Research Areas
                </h2>
                <p className="mt-5 leading-7 md:leading-8 text-slate-300">
                  My work connects microbiology, molecular biology, public
                  health, epidemiology, genomics, and computational tool
                  development.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                {focus.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 md:px-5 md:py-3 text-xs md:text-sm font-bold text-slate-200 transition hover:-translate-y-1 hover:border-cyan-300 hover:bg-cyan-300 hover:text-slate-950"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* about / blog */}
        <section className="px-6 pb-24">
          <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2">
            <a
              href="/about"
              className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-blue-600/30 to-cyan-500/10 p-6 md:p-8 transition hover:-translate-y-2 hover:border-cyan-300"
            >
              <p className="mb-3 text-sm font-black text-cyan-300">ABOUT</p>
              <h3 className="text-2xl md:text-3xl font-black">My academic journey</h3>
              <p className="mt-4 leading-7 md:leading-8 text-slate-300">
                Learn about my background, training, research path, and goals.
              </p>
            </a>

            <a
              href="/blog"
              className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-indigo-600/30 to-blue-500/10 p-6 md:p-8 transition hover:-translate-y-2 hover:border-cyan-300"
            >
              <p className="mb-3 text-sm font-black text-cyan-300">BLOG</p>
              <h3 className="text-2xl md:text-3xl font-black">Articles & tutorials</h3>
              <p className="mt-4 leading-7 md:leading-8 text-slate-300">
                Bioinformatics workflows, research notes, and scientific
                writing.
              </p>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}