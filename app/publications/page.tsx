"use client";

import { useEffect, useRef, useCallback } from "react";

/* ---- Subtle interactive network background for Publications page ---- */
function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -500, y: -500 });
  const dims = useRef({ width: 0, height: 0 });

  const nodesRef = useRef<any[]>([]);
  const edgesRef = useRef<[number, number][]>([]);

  const buildNetwork = useCallback((w: number, h: number) => {
    const nodeCount = 20;
    const nodes = [];
    const edges: [number, number][] = [];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
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
        if (dist < 120) {
          const force = 15 / dist;
          n.vx += (dx / dist) * force * dt;
          n.vy += (dy / dist) * force * dt;
        }
        n.vx *= 0.98;
        n.vy *= 0.98;
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < 0) { n.x = 0; n.vx *= -0.5; }
        if (n.x > width) { n.x = width; n.vx *= -0.5; }
        if (n.y < 0) { n.y = 0; n.vy *= -0.5; }
        if (n.y > height) { n.y = height; n.vy *= -0.5; }
      }

      ctx.clearRect(0, 0, width, height);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(99, 102, 241, 0.15)";
      ctx.lineWidth = 1;
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
      ctx.strokeStyle = "rgba(99, 102, 241, 0.4)";
      ctx.lineWidth = 1.5;
      for (const [a, b] of edges) {
        const na = nodes[a];
        const nb = nodes[b];
        if (!na || !nb) continue;
        const mx = (na.x + nb.x) / 2;
        const my = (na.y + nb.y) / 2;
        const dx = mx - mouse.x;
        const dy = my - mouse.y;
        if (dx * dx + dy * dy < 150 * 150) {
          ctx.moveTo(na.x, na.y);
          ctx.lineTo(nb.x, nb.y);
        }
      }
      ctx.stroke();

      for (const n of nodes) {
        const gradient = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 3);
        gradient.addColorStop(0, "rgba(129, 140, 248, 0.8)");
        gradient.addColorStop(1, "rgba(79, 70, 229, 0.0)");
        ctx.beginPath();
        ctx.fillStyle = gradient;
        ctx.arc(n.x, n.y, n.radius * 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "#818cf8";
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

/* ---- Main Publications Page ---- */
export default function Publications() {
  const journalArticles = [
    {
      authors:
        "FNU Nahiduzzaman, Mst. Arjina Jannat Akhi, Tasnim Zarin, Chandra Shaker Chouhan, Md. Ashiqur Rahman, A. K. M. Anisur Rahman, Mst. Minara Khatun, Md. Ariful Islam, Danishuddin, and Md Azizul Haque",
      year: 2026,
      title:
        "Unraveling the potential impact of climate change on the evolution and acceleration of antimicrobial resistance: mechanisms, consequences, and control strategies",
      journal: "Environmental Reviews",
      volume: "34",
      pages: "1-25",
      doi: "https://doi.org/10.1139/er-2025-0165",
    },
    {
      authors:
        "Nahiduzzaman, F., Rahman, M. Z., Akhi, M. A. J., Manik, M., Khatun, M. M., Islam, M. A., Matin, M. N., & Haque, M. A.",
      year: 2025,
      title:
        "Potential Biological Impacts of Microplastics and Nanoplastics on Farm Animals: Global Perspectives with Insights from Bangladesh",
      journal: "Animals",
      volume: "15(10)",
      pages: "1394",
      doi: "https://doi.org/10.3390/ani15101394",
    },
    {
      authors:
        "A.A. Howlader, F. Nahiduzzaman, R. I. Annan, A. Saha, M. A. Islam, M. M. Khatun",
      year: 2025,
      title:
        "Draft whole-genome sequence of multidrug-resistant Enterococcus faecium strain MKL_BAU_Fe01 isolated from chicken meat",
      journal: "Microbiology Resource Announcements",
      doi: "https://doi.org/10.1128/mra.00043-25",
      note: "doi:10.1128/mra.00043-25",
    },
    {
      authors:
        "Nahiduzzaman FNU, Zarin T, Chouhan CS, Rahman MZ, Khatun MM, et al.",
      year: 2025,
      title:
        "Health effects of street vended fresh cut fruits: A randomized controlled trial in Bangladesh",
      journal: "PLOS ONE",
      volume: "20(10)",
      pages: "e0335979",
      doi: "https://doi.org/10.1371/journal.pone.0335979",
    },
  ];

  // NCBI data grouped
  const wholeGenome = [
    {
      description: "Enterococcus faecalis from Chicken Cloacal Swabs",
      sra: "SRR34941152",
      biosample: "SAMN50554242",
    },
    {
      description: "Enterococcus faecalis from Table Egg",
      sra: "SRR34476346",
      biosample: "SAMN49897812",
    },
    {
      description: "Enterococcus faecium Whole Genome Sequencing",
      sra: "SRR31822501",
      biosample: "SAMN45938320",
    },
    {
      description: "Staphylococcus haemolyticus from Broiler Meat",
      sra: "SRR36443335",
      biosample: "SAMN54053803",
    },
  ];

  const metagenomics = [
    {
      description:
        "Metagenome of Placental Fluid of Brucella-suspected Aborted Cow",
      sra: "SRR36329066",
      biosample: "SAMN53696272",
    },
  ];

  const partialSeq = [
    {
      description:
        "Eukaryotic Nuclear rRNA/ITS / Molecular Epidemiology of Cryptosporidium spp.",
      genbank: "PV123885",
    },
    {
      description: "Lumpy Skin Disease Virus (LSDV) Partial Genome Sequences",
      isolates: [
        { name: "LSDV_isolate_BD_B1_2023", genbank: "PX753735" },
        { name: "LSDV_isolate_BD_B2_2023", genbank: "PX753736" },
        { name: "LSDV_isolate_BD_G1_2023", genbank: "PX753737" },
        { name: "LSDV_isolate_BD_G2_2023", genbank: "PX753738" },
      ],
    },
  ];

  const accessionLink = (id: string, type: "sra" | "biosample" | "genbank") => {
    let url = "";
    switch (type) {
      case "sra":
        url = `https://www.ncbi.nlm.nih.gov/sra/${id}`;
        break;
      case "biosample":
        url = `https://www.ncbi.nlm.nih.gov/biosample/${id}`;
        break;
      case "genbank":
        url = `https://www.ncbi.nlm.nih.gov/nuccore/${id}`;
        break;
    }
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-300 font-mono underline decoration-cyan-300/40 hover:text-cyan-200 transition-colors"
      >
        {id}
      </a>
    );
  };

  const renderEntryCard = (entry: any) => (
    <div
      key={entry.description}
      className="bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-5 transition-all duration-300 hover:border-emerald-400/40 hover:bg-emerald-500/[0.08] hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/10"
    >
      <p className="font-semibold text-white mb-4">{entry.description}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {entry.sra && (
          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-900/20 border border-blue-400/20">
            <span className="text-slate-400">SRA:</span>
            {accessionLink(entry.sra, "sra")}
          </span>
        )}
        {entry.biosample && (
          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-purple-900/20 border border-purple-400/20">
            <span className="text-slate-400">BioSample:</span>
            {accessionLink(entry.biosample, "biosample")}
          </span>
        )}
        {entry.genbank && (
          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-900/20 border border-green-400/20">
            <span className="text-slate-400">GenBank:</span>
            {accessionLink(entry.genbank, "genbank")}
          </span>
        )}
        {entry.isolates &&
          entry.isolates.map((iso: any) => (
            <span
              key={iso.genbank}
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-green-900/20 border border-green-400/20"
            >
              <span className="text-slate-400">{iso.name}:</span>
              {accessionLink(iso.genbank, "genbank")}
            </span>
          ))}
      </div>
    </div>
  );

  return (
    <main className="relative min-h-screen bg-slate-950 text-white overflow-x-hidden">
      <NetworkBackground />

      <div className="relative z-10 px-6 py-20 max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-20">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-indigo-400 mb-4">
            Scientific Output
          </p>
          <h1 className="text-6xl md:text-8xl font-black bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Publications
          </h1>
          <div className="mt-6 h-1.5 w-32 mx-auto rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
        </div>

        {/* Journal Articles */}
        <section className="mb-24">
          <div className="flex items-center gap-4 mb-10">
            <div className="h-12 w-12 rounded-xl bg-indigo-500/10 border border-indigo-400/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
              <svg
                className="w-7 h-7 text-indigo-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h2 className="text-4xl font-black tracking-tight">
              Journal Articles
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {journalArticles.map((article, idx) => (
              <div
                key={idx}
                className="group relative bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-3xl p-6 md:p-8 transition-all duration-300 hover:border-indigo-400/50 hover:bg-indigo-500/[0.08] hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-500/10"
              >
                <span className="absolute top-5 right-5 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-3 py-1 rounded-full text-xs font-bold">
                  {article.year}
                </span>
                <h3 className="text-xl font-bold leading-snug mb-4 pr-16">
                  {article.title}
                </h3>
                <p className="text-sm text-slate-400 mb-3">{article.authors}</p>
                <p className="text-sm italic text-slate-500 mb-5">
                  {article.journal}
                  {article.volume ? `, ${article.volume}` : ""}
                  {article.pages ? `: ${article.pages}` : ""}
                  {article.note ? ` (${article.note})` : ""}
                </p>
                <a
                  href={article.doi}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-400/30 px-4 py-2 rounded-xl hover:bg-indigo-400/10"
                >
                  <span>View Article</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* NCBI Database Contributions */}
        <section>
          <div className="flex items-center gap-4 mb-16">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <svg
                className="w-7 h-7 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7h16M4 7l2-3h12l2 3M9 17h6"
                />
              </svg>
            </div>
            <h2 className="text-4xl font-black tracking-tight">
              NCBI Database Contribution
            </h2>
          </div>

          {/* Whole Genome */}
          <div className="mb-14">
            <div className="flex items-center gap-3 mb-5">
              <span className="h-8 w-1 rounded-full bg-blue-400" />
              <h3 className="text-2xl font-bold text-blue-300">
                Whole Genome & Raw Read Sequences
              </h3>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {wholeGenome.map(renderEntryCard)}
            </div>
          </div>

          {/* Metagenomics */}
          <div className="mb-14">
            <div className="flex items-center gap-3 mb-5">
              <span className="h-8 w-1 rounded-full bg-purple-400" />
              <h3 className="text-2xl font-bold text-purple-300">
                Metagenomics
              </h3>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {metagenomics.map(renderEntryCard)}
            </div>
          </div>

          {/* Partial Sequences */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <span className="h-8 w-1 rounded-full bg-amber-400" />
              <h3 className="text-2xl font-bold text-amber-300">
                Partial Sequences
              </h3>
            </div>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {partialSeq.map(renderEntryCard)}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}