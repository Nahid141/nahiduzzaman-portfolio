"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Subtle interactive network background (canvas)                    */
/* ------------------------------------------------------------------ */
function NetworkBackground() {
  const canvasRef = useRef(null);
  const animRef = useRef(0);
  const mouseRef = useRef({ x: -500, y: -500 });
  const dimsRef = useRef({ width: 0, height: 0 });
  const nodesRef = useRef([]);
  const edgesRef = useRef([]);

  // Build initial node set and edges based on current dimensions
  const buildNetwork = useCallback((w, h) => {
    const nodeCount = 20;
    const nodes = [];
    const edges = [];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        radius: 2 + Math.random() * 3,
      });
    }

    // Create edges if distance is below threshold
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

  // Resize handler – re‑build the whole network
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    dimsRef.current = { width: w, height: h };
    const { nodes, edges } = buildNetwork(w, h);
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [buildNetwork]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // Mouse tracker
  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const animate = () => {
      const { width, height } = dimsRef.current;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const mouse = mouseRef.current;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Update node positions (slow drift + wrap)
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;

        // Wrap around edges
        if (n.x < -20) n.x = width + 20;
        if (n.x > width + 20) n.x = -20;
        if (n.y < -20) n.y = height + 20;
        if (n.y > height + 20) n.y = -20;
      }

      // Draw edges
      ctx.strokeStyle = "rgba(99, 179, 237, 0.22)";  // soft blue
      ctx.lineWidth = 0.8;
      for (let k = 0; k < edges.length; k++) {
        const [i, j] = edges[k];
        const a = nodes[i];
        const b = nodes[j];
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // Draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(99, 179, 237, 0.55)";
        ctx.fill();

        // Slight glow
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(99, 179, 237, 0.12)";
        ctx.fill();
      }

      // Optional: draw thin lines from nodes near the mouse
      ctx.strokeStyle = "rgba(99, 179, 237, 0.14)";
      ctx.lineWidth = 0.6;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200) {
          const alpha = 0.2 * (1 - dist / 200);
          ctx.strokeStyle = `rgba(99,179,237,${alpha})`;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.stroke();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Project data (unchanged)                                          */
/* ------------------------------------------------------------------ */
const projects = [
  {
    id: 1,
    title: "Development of Inactivated Brucella abortus Biovar-3 Vaccine with Local Brucella abortus Isolate",
    status: "completed",
    lead: false,
    lab: "Prof. Dr. Ariful Islam's Lab",
    description:
      "A PhD project focusing on producing and evaluating an inactivated vaccine candidate from a local Brucella abortus biovar-3 isolate.",
  },
  {
    id: 2,
    title: "Isolation and Identification of Brucella abortus from Dairy Cattle of Mymensingh Region",
    status: "running",
    lead: false,
    lab: "Prof. Dr. Ariful Islam's Lab",
    description:
      "Active surveillance study to isolate and characterize Brucella abortus strains circulating in dairy herds of Mymensingh.",
  },
  {
    id: 3,
    title: "Metagenomic Insights into the Microbial Community of Placental Fluid",
    status: "completed",
    lead: false,
    lab: "Prof. Dr. Ariful Islam's Lab",
    description:
      "Exploratory metagenomic analysis of placental fluid microbiota to understand its composition and potential pathogenic signatures.",
  },
  {
    id: 4,
    title: "Health Impacts of Consuming Street-vended Fresh-cut-fruits: A Randomized Controlled Trial",
    status: "completed",
    lead: true,
    lab: "Prof. Dr. Mst. Minara Khatun's Lab",
    description:
      "Led a randomized controlled trial evaluating the microbiological safety and health effects of fresh-cut fruits sold by street vendors.",
  },
  {
    id: 5,
    title: "Impacts of Micro- and Nanoplastics on Terrestrial and Aquatic Ecosystems",
    status: "running",
    lead: false,
    lab: "Prof. Dr. Ariful Islam's Lab",
    description:
      "Investigating the ecotoxicological effects of micro- and nanoplastics on soil and water organisms through controlled experiments.",
  },
  {
    id: 6,
    title: "Machine Learning-Based Modeling for Predicting Dengue Virus Prevalence in Aedes aegypti Populations of Mymensingh",
    status: "running",
    lead: false,
    lab: "Prof. Dr. Md. Shahiduzzaman's Lab - Dpt of Parasitology, FVS, BAU",
    description:
      "Building predictive models using climatic, entomological, and epidemiological data to forecast dengue outbreaks in the region.",
  },
  {
    id: 7,
    title: "Comparative Genomics and Risk Factors of S. haemolyticus from Chicken Meat",
    status: "completed",
    lead: true,
    lab: "Prof. Dr. Mst. Minara Khatun's Lab",
    description:
      "Led a study combining whole-genome sequencing and epidemiological analysis to characterize Staphylococcus haemolyticus from retail chicken.",
  },
  {
    id: 8,
    title: "Meta-Analysis on the Efficacy of Current PRRSV Vaccines in the United States",
    status: "running",
    lead: false,
    lab: "Dr. Kimberly VanderWaal's Lab, CVM, UMN",
    description:
      "Ongoing systematic review and meta-analysis to quantify the effectiveness of commercially available PRRSV vaccines in U.S. swine herds.",
  },
  {
    id: 9,
    title: "Prevalence and Antimicrobial Resistance Patterns of Salmonella spp. in the Poultry Supply Chains of Mymensingh District",
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
    title: "Use of Machine Learning to Determine the Risk Factors of Illthrift in Cattle in Mymensingh",
    status: "completed",
    lead: false,
    lab: "Prof. Dr. A.K.M Anisur Rahman's Lab - Dpt of Medicine, FVS, BAU",
    description:
      "Applied ML algorithms to farm-level data to identify predictors of poor growth performance (illthrift) in local cattle.",
  },
];

/* ------------------------------------------------------------------ */
/*  Main Research page component                                      */
/* ------------------------------------------------------------------ */
export default function Research() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const filteredProjects = projects.filter((project) => {
    const matchesStatus =
      statusFilter === "all" || project.status === statusFilter;
    const matchesSearch = project.title
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleToggle = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <>
      {/* Animated background */}
      <NetworkBackground />

      {/* Page content – higher z-index so it sits above the canvas */}
      <main className="relative z-10 px-6 py-20 max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-blue-400 mb-4">Research</h1>

        <p className="text-gray-300 leading-relaxed mb-10">
          My research focuses on infectious diseases, zoonoses, vaccine development,
          microbial genomics, antimicrobial resistance, and epidemiology. I have
          been actively involved in the following interdisciplinary projects across
          multiple laboratories.
        </p>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex space-x-2">
            {["all", "completed", "running"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition ${
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
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full sm:w-72 bg-gray-800 text-gray-200 rounded-lg pl-10 pr-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
            />
            <svg
              className="absolute left-3 top-2.5 w-4 h-4 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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

        {/* Project cards */}
        {filteredProjects.length === 0 ? (
          <div className="text-gray-400 text-center py-10">
            No projects match your current filters. Try adjusting them.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="border border-gray-700 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition cursor-pointer"
                onClick={() => handleToggle(project.id)}
              >
                <div className="flex items-start justify-between p-5">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-lg font-semibold text-white">
                        {project.title}
                      </h3>
                      {project.lead && (
                        <span className="inline-block bg-yellow-600 text-yellow-100 text-xs px-2 py-0.5 rounded-full font-medium">
                          Lead Researcher
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
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
                    className={`w-5 h-5 text-gray-400 mt-1 transition-transform ${
                      expandedId === project.id ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
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
                  <div className="px-5 pb-5 pt-0 text-gray-300 text-sm border-t border-gray-700 mt-2 pt-4">
                    <p>{project.description}</p>
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