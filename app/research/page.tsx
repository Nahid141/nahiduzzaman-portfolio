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

function NetworkBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -500, y: -500 });
  const dimsRef = useRef({ width: 0, height: 0 });
  const nodesRef = useRef<NetworkNode[]>([]);
  const edgesRef = useRef<NetworkEdge[]>([]);

  const buildNetwork = useCallback((w: number, h: number) => {
    const nodeCount = 20;
    const nodes: NetworkNode[] = [];
    const edges: NetworkEdge[] = [];

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

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        node.x += node.vx;
        node.y += node.vy;

        if (node.x < -20) node.x = width + 20;
        if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        if (node.y > height + 20) node.y = -20;
      }

      ctx.lineWidth = 0.8;

      for (let i = 0; i < edges.length; i++) {
        const [sourceIndex, targetIndex] = edges[i];
        const source = nodes[sourceIndex];
        const target = nodes[targetIndex];

        if (!source || !target) continue;

        ctx.strokeStyle = "rgba(99, 179, 237, 0.22)";
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

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

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
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

const projects: Project[] = [
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
    lab: "Prof. Dr. Mst. Minara Khatun's Lab",
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
          <div className="flex space-x-2">
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
                className="cursor-pointer rounded-xl border border-gray-700 bg-gray-800/50 transition hover:bg-gray-800"
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

                    <div className="flex items-center gap-2 text-sm text-gray-400">
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
                  <div className="border-t border-gray-700 px-5 pb-5 pt-4 text-sm text-gray-300">
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