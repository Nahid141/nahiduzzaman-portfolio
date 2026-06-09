"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";

/* =================== Static data (outside component — prevents indexOf bug) =================== */
const JOURNAL_ARTICLES = [
  {
    authors: "FNU Nahiduzzaman, Mst. Arjina Jannat Akhi, Tasnim Zarin, Chandra Shaker Chouhan, Md. Ashiqur Rahman, A. K. M. Anisur Rahman, Mst. Minara Khatun, Md. Ariful Islam, Danishuddin, and Md Azizul Haque",
    year: 2026,
    title: "Unraveling the potential impact of climate change on the evolution and acceleration of antimicrobial resistance: mechanisms, consequences, and control strategies",
    journal: "Environmental Reviews",
    volume: "34",
    pages: "1-25",
    doi: "https://doi.org/10.1139/er-2025-0165",
    tags: ["Climate Change", "AMR", "Review"],
  },
  {
    authors: "Nahiduzzaman, F., Rahman, M. Z., Akhi, M. A. J., Manik, M., Khatun, M. M., Islam, M. A., Matin, M. N., & Haque, M. A.",
    year: 2025,
    title: "Potential Biological Impacts of Microplastics and Nanoplastics on Farm Animals: Global Perspectives with Insights from Bangladesh",
    journal: "Animals",
    volume: "15(10)",
    pages: "1394",
    doi: "https://doi.org/10.3390/ani15101394",
    tags: ["Microplastics", "Livestock", "Bangladesh"],
  },
  {
    authors: "A.A. Howlader, F. Nahiduzzaman, R. I. Annan, A. Saha, M. A. Islam, M. M. Khatun",
    year: 2025,
    title: "Draft whole-genome sequence of multidrug-resistant Enterococcus faecium strain MKL_BAU_Fe01 isolated from chicken meat",
    journal: "Microbiology Resource Announcements",
    doi: "https://doi.org/10.1128/mra.00043-25",
    note: "doi:10.1128/mra.00043-25",
    tags: ["Genomics", "MDR", "Enterococcus"],
  },
  {
    authors: "Nahiduzzaman FNU, Zarin T, Chouhan CS, Rahman MZ, Khatun MM, et al.",
    year: 2025,
    title: "Health effects of street vended fresh cut fruits: A randomized controlled trial in Bangladesh",
    journal: "PLOS ONE",
    volume: "20(10)",
    pages: "e0335979",
    doi: "https://doi.org/10.1371/journal.pone.0335979",
    tags: ["Food Safety", "RCT", "Bangladesh"],
  },
];

const WHOLE_GENOME = [
  { description: "Enterococcus faecalis from Chicken Cloacal Swabs", sra: "SRR34941152", biosample: "SAMN50554242" },
  { description: "Enterococcus faecalis from Table Egg", sra: "SRR34476346", biosample: "SAMN49897812" },
  { description: "Enterococcus faecium Whole Genome Sequencing", sra: "SRR31822501", biosample: "SAMN45938320" },
  { description: "Staphylococcus haemolyticus from Broiler Meat", sra: "SRR36443335", biosample: "SAMN54053803" },
  { description: "Proteus mirabilis from Bovine Fecal Sample", sra: "SRR38613778", biosample: "SAMN60043054" },
  { description: "Salmonella enterica from Chicken Carcass", sra: "SRR38610240", biosample: "SAMN59990286" },
];

const METAGENOMICS = [
  { description: "Metagenome of Placental Fluid of Brucella-suspected Aborted Cow", sra: "SRR36329066", biosample: "SAMN53696272" },
];

const PARTIAL_SEQ = [
  { description: "Eukaryotic Nuclear rRNA/ITS / Molecular Epidemiology of Cryptosporidium spp.", genbank: "PV123885" },
  { description: "Pseudomonas sp. strain S_BAU_01 16S rRNA Gene, Partial Sequence", genbank: "PZ420633.1" },
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

/* count computed once from actual data */
const TOTAL_NCBI = WHOLE_GENOME.length + METAGENOMICS.length + PARTIAL_SEQ.length;

/* =================== Network Background =================== */
function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -500, y: -500 });
  const dims = useRef({ width: 0, height: 0 });
  const nodesRef = useRef<any[]>([]);
  const edgesRef = useRef<[number, number][]>([]);

  const buildNetwork = useCallback((w: number, h: number) => {
    const nodes: any[] = [];
    const edges: [number, number][] = [];
    for (let i = 0; i < 20; i++) nodes.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2, radius: 2 + Math.random() * 3 });
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
        if (Math.sqrt(dx * dx + dy * dy) < w * 0.25) edges.push([i, j]);
      }
    return { nodes, edges };
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = w; canvas.height = h;
    dims.current = { width: w, height: h };
    const { nodes, edges } = buildNetwork(w, h);
    nodesRef.current = nodes; edgesRef.current = edges;
  }, [buildNetwork]);

  useEffect(() => { resize(); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, [resize]);
  useEffect(() => {
    const onMove = (e: MouseEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let lastTime = performance.now();
    const animate = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1); lastTime = time;
      const { width, height } = dims.current;
      if (!width || !height) { animRef.current = requestAnimationFrame(animate); return; }
      const nodes = nodesRef.current, edges = edgesRef.current, mouse = mouseRef.current;
      for (const n of nodes) {
        const dx = n.x - mouse.x, dy = n.y - mouse.y, dist = Math.sqrt(dx * dx + dy * dy) + 0.1;
        if (dist < 120) { const f = 15 / dist; n.vx += (dx / dist) * f * dt; n.vy += (dy / dist) * f * dt; }
        n.vx *= 0.98; n.vy *= 0.98; n.x += n.vx * dt; n.y += n.vy * dt;
        if (n.x < 0) { n.x = 0; n.vx *= -0.5; } if (n.x > width) { n.x = width; n.vx *= -0.5; }
        if (n.y < 0) { n.y = 0; n.vy *= -0.5; } if (n.y > height) { n.y = height; n.vy *= -0.5; }
      }
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath(); ctx.strokeStyle = "rgba(99,102,241,0.15)"; ctx.lineWidth = 1;
      for (const [a, b] of edges) { const na = nodes[a], nb = nodes[b]; if (na && nb) { ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); } }
      ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle = "rgba(99,102,241,0.4)"; ctx.lineWidth = 1.5;
      for (const [a, b] of edges) {
        const na = nodes[a], nb = nodes[b]; if (!na || !nb) continue;
        const mx = (na.x + nb.x) / 2, my = (na.y + nb.y) / 2;
        if ((mx - mouse.x) ** 2 + (my - mouse.y) ** 2 < 150 * 150) { ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); }
      }
      ctx.stroke();
      for (const n of nodes) {
        const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 3);
        g.addColorStop(0, "rgba(129,140,248,0.8)"); g.addColorStop(1, "rgba(79,70,229,0)");
        ctx.beginPath(); ctx.fillStyle = g; ctx.arc(n.x, n.y, n.radius * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.fillStyle = "#818cf8"; ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2); ctx.fill();
      }
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 z-0" />;
}

/* =================== Animated Counter =================== */
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      obs.disconnect();
      let start = 0;
      const tick = (t: number) => {
        if (!start) start = t;
        const p = Math.min((t - start) / 1200, 1);
        setVal(Math.round(p * to));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [to]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* =================== Scroll Reveal =================== */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShow(true); obs.disconnect(); } }, { threshold: 0.08 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={`transition-all duration-700 ease-out ${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* =================== Stat Card =================== */
function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className={`text-center p-6 rounded-2xl border bg-white/[0.03] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 ${color}`}>
      <div className="text-4xl md:text-5xl font-black bg-gradient-to-br from-white to-slate-300 bg-clip-text text-transparent mb-1">
        <Counter to={value} />
      </div>
      <p className="text-sm text-slate-400 font-medium tracking-wide">{label}</p>
    </div>
  );
}

/* =================== Toast =================== */
function Toast({ visible, message }: { visible: boolean; message: string }) {
  return (
    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      <div className="flex items-center gap-2.5 bg-slate-900/90 border border-emerald-400/40 text-emerald-300 px-5 py-3 rounded-2xl backdrop-blur-xl shadow-2xl shadow-emerald-500/20 text-sm font-semibold whitespace-nowrap">
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        {message}
      </div>
    </div>
  );
}

/* =================== Highlight matching text =================== */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-indigo-400/25 text-indigo-200 rounded px-0.5 not-italic">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}

/* =================== Main Page =================== */
export default function Publications() {
  const [search, setSearch] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [toast, setToast] = useState({ visible: false, message: "" });
  const [expandedAuthors, setExpandedAuthors] = useState<Record<number, boolean>>({});
  const [activeNCBI, setActiveNCBI] = useState<"all" | "genome" | "meta" | "partial">("all");
  const [ncbiFade, setNcbiFade] = useState(true);

  /* filtered + sorted articles — now safe because JOURNAL_ARTICLES is module-level */
  const displayedArticles = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? JOURNAL_ARTICLES.filter(a =>
          a.title.toLowerCase().includes(q) ||
          a.journal.toLowerCase().includes(q) ||
          a.authors.toLowerCase().includes(q) ||
          a.tags.some(t => t.toLowerCase().includes(q))
        )
      : [...JOURNAL_ARTICLES];
    return sortDesc
      ? filtered.sort((a, b) => b.year - a.year)
      : filtered.sort((a, b) => a.year - b.year);
  }, [search, sortDesc]);

  const showToast = (message: string) => {
    setToast({ visible: true, message });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500);
  };

  const copyCitation = (article: (typeof JOURNAL_ARTICLES)[0]) => {
    const citation = `${article.authors} (${article.year}). ${article.title}. ${article.journal}${article.volume ? `, ${article.volume}` : ""}${article.pages ? `: ${article.pages}` : ""}${article.note ? ` (${article.note})` : ""}. ${article.doi}`;
    navigator.clipboard.writeText(citation).then(() => showToast("Citation copied to clipboard!"));
  };

  const handleNCBITab = (key: typeof activeNCBI) => {
    if (key === activeNCBI) return;
    setNcbiFade(false);
    setTimeout(() => { setActiveNCBI(key); setNcbiFade(true); }, 180);
  };

  const accessionLink = (id: string, type: "sra" | "biosample" | "genbank") => {
    const urls: Record<string, string> = {
      sra: `https://www.ncbi.nlm.nih.gov/sra/${id}`,
      biosample: `https://www.ncbi.nlm.nih.gov/biosample/${id}`,
      genbank: `https://www.ncbi.nlm.nih.gov/nuccore/${id}`,
    };
    return (
      <a href={urls[type]} target="_blank" rel="noopener noreferrer"
        className="font-mono text-cyan-300 underline decoration-cyan-300/30 hover:text-cyan-100 hover:decoration-cyan-100/60 transition-colors">
        {id}
      </a>
    );
  };

  const renderEntryCard = (entry: any, i: number) => (
    <Reveal key={entry.description} delay={i * 70}>
      <div className="h-full bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-2xl p-5 transition-all duration-300 hover:border-emerald-400/40 hover:bg-emerald-500/[0.06] hover:-translate-y-1 hover:shadow-xl hover:shadow-emerald-500/10">
        <p className="font-semibold text-white mb-4 leading-snug text-sm">{entry.description}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          {entry.sra && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-900/30 border border-blue-400/20">
              <span className="text-blue-400 font-semibold">SRA</span>
              <span className="text-slate-600">/</span>
              {accessionLink(entry.sra, "sra")}
            </span>
          )}
          {entry.biosample && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-900/30 border border-purple-400/20">
              <span className="text-purple-400 font-semibold">BioSample</span>
              <span className="text-slate-600">/</span>
              {accessionLink(entry.biosample, "biosample")}
            </span>
          )}
          {entry.genbank && (
            <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-900/30 border border-green-400/20">
              <span className="text-green-400 font-semibold">GenBank</span>
              <span className="text-slate-600">/</span>
              {accessionLink(entry.genbank, "genbank")}
            </span>
          )}
          {entry.isolates?.map((iso: any) => (
            <span key={iso.genbank} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-900/30 border border-green-400/20">
              <span className="text-green-400 font-semibold truncate max-w-[110px]" title={iso.name}>
                {iso.name.replace("LSDV_isolate_", "")}
              </span>
              <span className="text-slate-600">/</span>
              {accessionLink(iso.genbank, "genbank")}
            </span>
          ))}
        </div>
      </div>
    </Reveal>
  );

  /* tab counts computed from actual arrays — no more hardcoded indices */
  const ncbiTabs = [
    { key: "all" as const, label: "All", count: TOTAL_NCBI },
    { key: "genome" as const, label: "Whole Genome", count: WHOLE_GENOME.length },
    { key: "meta" as const, label: "Metagenomics", count: METAGENOMICS.length },
    { key: "partial" as const, label: "Partial Sequences", count: PARTIAL_SEQ.length },
  ];

  return (
    <main className="relative min-h-screen bg-slate-950 text-white overflow-x-hidden">
      <NetworkBackground />
      <Toast visible={toast.visible} message={toast.message} />

      <div className="relative z-10 px-4 sm:px-6 py-20 max-w-7xl mx-auto">

        {/* ---- Hero Header ---- */}
        <Reveal>
          <div className="text-center mb-16">
            <p className="text-xs font-black uppercase tracking-[0.35em] text-indigo-400 mb-4">Scientific Output</p>
            <h1 className="text-6xl md:text-8xl font-black bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent leading-none pb-2">
              Publications
            </h1>
            <div className="mt-6 h-1.5 w-32 mx-auto rounded-full bg-gradient-to-r from-indigo-500 to-purple-500" />
            <p className="mt-6 text-slate-400 text-base max-w-xl mx-auto">
              Peer-reviewed research spanning antimicrobial resistance, genomics, food safety, and environmental microbiology.
            </p>
          </div>
        </Reveal>

        {/* ---- Stats Row ---- */}
        <Reveal delay={100}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20 max-w-3xl mx-auto">
            <StatCard value={JOURNAL_ARTICLES.length} label="Journal Articles" color="border-indigo-400/20 hover:border-indigo-400/40" />
            <StatCard value={TOTAL_NCBI} label="NCBI Entries" color="border-emerald-400/20 hover:border-emerald-400/40" />
            <StatCard value={WHOLE_GENOME.length} label="Genome Sequences" color="border-blue-400/20 hover:border-blue-400/40" />
            <StatCard value={11.1} label="Total IF" color="border-purple-400/20 hover:border-purple-400/40" />
          </div>
        </Reveal>

        {/* =================== Journal Articles =================== */}
        <section className="mb-28">

          {/* Section header + controls */}
          <Reveal>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-12 w-12 shrink-0 rounded-xl bg-indigo-500/10 border border-indigo-400/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-3xl md:text-4xl font-black tracking-tight truncate">Journal Articles</h2>
                <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  {displayedArticles.length}/{JOURNAL_ARTICLES.length}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Sort toggle */}
                <button
                  onClick={() => setSortDesc(v => !v)}
                  title={sortDesc ? "Newest first" : "Oldest first"}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold border border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20 hover:bg-white/5 transition-all"
                >
                  <svg className={`w-4 h-4 transition-transform duration-300 ${sortDesc ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                  </svg>
                  {sortDesc ? "Newest" : "Oldest"}
                </button>

                {/* Search bar */}
                <div className="relative w-full sm:w-64">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Filter by title, journal, tag…"
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl pl-10 pr-8 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400/50 focus:bg-white/[0.08] transition-all"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Reveal>

          {/* Article Cards */}
          {displayedArticles.length === 0 ? (
            <Reveal>
              <div className="text-center py-16 text-slate-500">
                <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                No articles match &ldquo;{search}&rdquo;
              </div>
            </Reveal>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {displayedArticles.map((article, idx) => {
                /* use indexOf on the stable module-level array — always correct */
                const realIdx = JOURNAL_ARTICLES.indexOf(article);
                const isExpanded = expandedAuthors[realIdx];
                return (
                  <Reveal key={realIdx} delay={idx * 80}>
                    <div className="group relative h-full bg-white/[0.03] backdrop-blur-lg border border-white/10 rounded-3xl p-6 md:p-7 transition-all duration-300 hover:border-indigo-400/50 hover:bg-indigo-500/[0.06] hover:-translate-y-2 hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col">

                      {/* Number + Year */}
                      <div className="flex items-start justify-between mb-4">
                        <span className="text-4xl font-black text-white/5 group-hover:text-indigo-400/20 transition-colors select-none leading-none">
                          {String(realIdx + 1).padStart(2, "0")}
                        </span>
                        <span className="shrink-0 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-3 py-1 rounded-full text-xs font-bold">
                          {article.year}
                        </span>
                      </div>

                      {/* Title with search highlight */}
                      <h3 className="text-lg font-bold leading-snug mb-3">
                        <Highlight text={article.title} query={search} />
                      </h3>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {article.tags.map(tag => (
                          <button
                            key={tag}
                            onClick={() => setSearch(tag)}
                            className={`text-xs px-2.5 py-0.5 rounded-full border transition-all ${search.toLowerCase() === tag.toLowerCase() ? "bg-indigo-500/20 border-indigo-400/50 text-indigo-300" : "bg-white/5 border-white/10 text-slate-400 hover:text-indigo-300 hover:border-indigo-400/40 hover:bg-indigo-500/10"}`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>

                      {/* Authors (expandable) */}
                      <div className="mb-3">
                        <p className={`text-sm text-slate-400 leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                          {article.authors}
                        </p>
                        {article.authors.length > 80 && (
                          <button
                            onClick={() => setExpandedAuthors(prev => ({ ...prev, [realIdx]: !prev[realIdx] }))}
                            className="text-xs text-indigo-400 hover:text-indigo-300 mt-1 transition-colors"
                          >
                            {isExpanded ? "Show less ↑" : "Show all authors ↓"}
                          </button>
                        )}
                      </div>

                      {/* Journal info */}
                      <p className="text-xs italic text-slate-500 mb-5">
                        <Highlight text={`${article.journal}${article.volume ? `, ${article.volume}` : ""}${article.pages ? `: ${article.pages}` : ""}${article.note ? ` (${article.note})` : ""}`} query={search} />
                      </p>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-auto">
                        <a
                          href={article.doi}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm font-bold text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-400/30 px-4 py-2 rounded-xl hover:bg-indigo-400/10 flex-1 justify-center"
                        >
                          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View Article
                        </a>
                        <button
                          onClick={() => copyCitation(article)}
                          title="Copy citation to clipboard"
                          className="inline-flex items-center gap-2 text-sm font-bold text-slate-400 border border-white/10 px-4 py-2 rounded-xl hover:text-slate-200 hover:border-white/20 hover:bg-white/5 transition-all"
                        >
                          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          Cite
                        </button>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          )}
        </section>

        {/* =================== NCBI Section =================== */}
        <section>
          <Reveal>
            <div className="flex items-center gap-4 mb-8">
              <div className="h-12 w-12 shrink-0 rounded-xl bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7h16M4 7l2-3h12l2 3M9 17h6" />
                </svg>
              </div>
              <div>
                <h2 className="text-3xl md:text-4xl font-black tracking-tight">NCBI Database Contributions</h2>
                <p className="text-sm text-slate-500 mt-0.5">{TOTAL_NCBI} entries across 3 categories</p>
              </div>
            </div>
          </Reveal>

          {/* Tab Navigation */}
          <Reveal delay={60}>
            <div className="flex flex-wrap gap-2 mb-8 p-1 bg-white/[0.03] border border-white/10 rounded-2xl w-fit">
              {ncbiTabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => handleNCBITab(tab.key)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
                    activeNCBI === tab.key
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shadow-lg shadow-emerald-500/10"
                      : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeNCBI === tab.key ? "bg-emerald-400/20 text-emerald-300" : "bg-white/5 text-slate-500"}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </Reveal>

          {/* Tab content with fade transition */}
          <div className={`transition-all duration-200 ${ncbiFade ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>

            {/* Whole Genome */}
            {(activeNCBI === "all" || activeNCBI === "genome") && (
              <div className="mb-12">
                <Reveal>
                  <div className="flex items-center gap-3 mb-5">
                    <span className="h-7 w-1 rounded-full bg-blue-400 shrink-0" />
                    <h3 className="text-xl md:text-2xl font-bold text-blue-300">Whole Genome &amp; Raw Read Sequences</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-400/20 text-blue-400 font-semibold">{WHOLE_GENOME.length}</span>
                  </div>
                </Reveal>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {WHOLE_GENOME.map(renderEntryCard)}
                </div>
              </div>
            )}

            {/* Metagenomics */}
            {(activeNCBI === "all" || activeNCBI === "meta") && (
              <div className="mb-12">
                <Reveal>
                  <div className="flex items-center gap-3 mb-5">
                    <span className="h-7 w-1 rounded-full bg-purple-400 shrink-0" />
                    <h3 className="text-xl md:text-2xl font-bold text-purple-300">Metagenomics</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/30 border border-purple-400/20 text-purple-400 font-semibold">{METAGENOMICS.length}</span>
                  </div>
                </Reveal>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {METAGENOMICS.map(renderEntryCard)}
                </div>
              </div>
            )}

            {/* Partial Sequences */}
            {(activeNCBI === "all" || activeNCBI === "partial") && (
              <div>
                <Reveal>
                  <div className="flex items-center gap-3 mb-5">
                    <span className="h-7 w-1 rounded-full bg-amber-400 shrink-0" />
                    <h3 className="text-xl md:text-2xl font-bold text-amber-300">Partial Sequences</h3>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/30 border border-amber-400/20 text-amber-400 font-semibold">{PARTIAL_SEQ.length}</span>
                  </div>
                </Reveal>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {PARTIAL_SEQ.map(renderEntryCard)}
                </div>
              </div>
            )}

          </div>
        </section>

        <div className="h-20" />
      </div>
    </main>
  );
}
