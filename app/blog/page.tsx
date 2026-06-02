"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Room = {
  id: string;
  floor: number;
  name: string;
  short: string;
  color: string;
  services: string[];
  facilities: string[];
};

declare global {
  interface Window {
    THREE: any;
  }
}

const companyName = "GeneEx BioTech Ltd (proposed)";

const rooms: Room[] = [
  {
    id: "sample",
    floor: 1,
    name: "Sample Reception and Accessioning Unit",
    short: "Sample Entry",
    color: "#38bdf8",
    services: [
      "Clinical, animal, environmental and food sample receiving",
      "Digital accessioning, barcode tracking and chain-of-custody management",
      "Primary risk categorization and sample routing to specialized laboratories",
    ],
    facilities: [
      "Barcode Accessioning Desk",
      "Sample Triage Station",
      "Cold Receiving Cabinet",
      "Digital LIMS Terminal",
      "Triple Packaging Inspection Bench",
      "Secure Sample Transfer Hatch",
    ],
  },
  {
    id: "molecular",
    floor: 1,
    name: "Molecular Diagnostics Laboratory",
    short: "Molecular Dx",
    color: "#22d3ee",
    services: [
      "PCR, RT-PCR and qPCR-based diagnostics",
      "Pathogen confirmation and molecular typing",
      "Diagnostic assay development and validation",
    ],
    facilities: [
      "qPCR System",
      "Digital PCR System",
      "PCR Workstation",
      "Automated DNA/RNA Extractor",
      "Gel Documentation System",
      "Nucleic Acid Quantifier",
      "Cold Reagent Storage",
      "Clean Amplification Area",
    ],
  },
  {
    id: "bsl3",
    floor: 1,
    name: "High-Containment BSL-3 Microbiology Laboratory",
    short: "BSL-3 Microbiology",
    color: "#facc15",
    services: [
      "High-containment microbiology research and pathogen characterization",
      "Advanced bacterial isolation, identification and AMR surveillance",
      "Controlled workflow for infectious disease and zoonotic pathogen studies",
    ],
    facilities: [
      "Controlled Access Entry",
      "Anteroom and Airlock",
      "Negative Pressure Monitoring Panel",
      "Class II Biosafety Cabinet",
      "Class III Glovebox Cabinet",
      "Pass-through Autoclave",
      "HEPA-filtered Exhaust System",
      "Sealed Interior Surfaces",
      "Emergency Shower and Eyewash",
      "PPE Donning Area",
      "PPE Doffing Area",
      "Biohazard Waste Holding Unit",
      "Dedicated Incubator",
      "Effluent Decontamination Interface",
      "Laboratory Communication Panel",
      "Access Control and CCTV",
    ],
  },
  {
    id: "biobank",
    floor: 1,
    name: "Biobank and Cryogenic Repository",
    short: "Biobank",
    color: "#2dd4bf",
    services: [
      "Long-term biological sample storage",
      "Cryogenic archiving of isolates, nucleic acids and serum samples",
      "Inventory-linked repository for research and diagnostics",
    ],
    facilities: [
      "Liquid Nitrogen Storage",
      "-80°C Ultra-low Freezer",
      "Cryobox Inventory System",
      "Backup Power Interface",
      "Temperature Alarm System",
      "Sample Retrieval Workbench",
    ],
  },
  {
    id: "sequencing",
    floor: 2,
    name: "DNA Sequencing and Microbial Genomics Platform",
    short: "DNA Sequencing",
    color: "#60a5fa",
    services: [
      "Whole-genome sequencing and microbial genomics",
      "Library preparation, sequencing support and genomic interpretation",
      "Pathogen evolution, molecular epidemiology and AMR gene detection",
    ],
    facilities: [
      "Illumina Sequencer",
      "Oxford Nanopore Sequencer",
      "Automated Library Prep Station",
      "Fragment Analyzer",
      "Qubit Fluorometer",
      "TapeStation System",
      "Clean DNA Library Cabinet",
      "Genomics QC Workstation",
    ],
  },
  {
    id: "electron",
    floor: 2,
    name: "Electron Microscopy and Advanced Imaging Core",
    short: "EM Imaging",
    color: "#a855f7",
    services: [
      "SEM and TEM imaging",
      "Ultrastructural biological analysis",
      "Nanoparticle, bacterial and viral morphology visualization",
    ],
    facilities: [
      "Scanning Electron Microscope",
      "Transmission Electron Microscope",
      "Ultramicrotome",
      "Critical Point Dryer",
      "Sputter Coater",
      "Image Analysis Workstation",
      "Sample Preparation Bench",
      "Vibration-controlled Imaging Room",
    ],
  },
  {
    id: "omics",
    floor: 2,
    name: "Proteomics and Metabolomics Platform",
    short: "Omics Core",
    color: "#fb7185",
    services: [
      "Protein expression profiling",
      "Metabolite detection",
      "Biomarker and pathway discovery",
    ],
    facilities: [
      "LC-MS/MS System",
      "HPLC System",
      "Protein Analyzer",
      "Metabolomics Workstation",
      "Sample Concentrator",
      "Cold Sample Storage",
      "Analytical Balance",
      "Data Interpretation Terminal",
    ],
  },
  {
    id: "cell",
    floor: 2,
    name: "Cell Culture and Vaccine Innovation Suite",
    short: "Cell/Vaccine",
    color: "#22c55e",
    services: [
      "Cell culture-based biological research",
      "Vaccine candidate screening",
      "Virus propagation and biological assay support",
    ],
    facilities: [
      "CO₂ Incubator",
      "Inverted Microscope",
      "Class II Biosafety Cabinet",
      "Cryostorage System",
      "Automated Cell Counter",
      "Vaccine Assay Bench",
      "Sterile Media Room",
      "Controlled Culture Area",
    ],
  },
  {
    id: "hpc",
    floor: 3,
    name: "Supercomputing and AI Bioinformatics Center",
    short: "HPC-AI",
    color: "#818cf8",
    services: [
      "Whole-genome sequencing analysis",
      "AI and ML-based biological prediction",
      "Phylogenomics, molecular epidemiology and disease forecasting",
    ],
    facilities: [
      "GPU Supercomputer Rack",
      "High-memory Bioinformatics Server",
      "Secure Data Cloud",
      "AI Model Training Workstation",
      "Genome Analysis Pipeline Server",
      "Large-scale Storage Array",
      "Visualization Wall",
      "Cybersecurity Console",
    ],
  },
  {
    id: "molepi",
    floor: 3,
    name: "Molecular Epidemiology and Phylogenomics Unit",
    short: "Mol. Epidemiology",
    color: "#34d399",
    services: [
      "Genomic outbreak investigation",
      "Phylogenetic and phylodynamic analysis",
      "Transmission pathway and lineage tracking",
    ],
    facilities: [
      "Phylogenomics Workstation",
      "Outbreak Analysis Dashboard",
      "Genomic Surveillance Server",
      "Lineage Tracking Console",
      "Sequence Metadata Hub",
      "Interactive Tree Visualization Wall",
    ],
  },
  {
    id: "epi",
    floor: 3,
    name: "Epidemiology, GIS and Disease Dynamics Unit",
    short: "Epidemiology",
    color: "#14b8a6",
    services: [
      "Disease outbreak analysis and epidemiological modeling",
      "Transmission dynamics and risk factor analysis",
      "GIS-based surveillance and predictive disease mapping",
    ],
    facilities: [
      "Epidemiology Dashboard",
      "GIS Mapping Station",
      "Modeling Workstation",
      "Surveillance Data Hub",
      "Risk Analysis Console",
      "Interactive Map Display",
    ],
  },
  {
    id: "bioprocess",
    floor: 3,
    name: "Bioprocessing and Fermentation Unit",
    short: "Bioprocess",
    color: "#fb923c",
    services: [
      "Pilot-scale microbial fermentation",
      "Bioproduct optimization",
      "Downstream processing support",
    ],
    facilities: [
      "Pilot Bioreactor",
      "Fermenter",
      "Centrifuge",
      "Purification Unit",
      "Filtration System",
      "Bioprocess Control Panel",
      "Cold Product Storage",
      "Quality Sampling Port",
    ],
  },
  {
    id: "quality",
    floor: 4,
    name: "Quality, Regulatory and Biosafety Governance Wing",
    short: "Quality/Reg.",
    color: "#f97316",
    services: [
      "Quality management and regulatory planning",
      "Biosafety documentation and operational governance",
      "Product development compliance and audit support",
    ],
    facilities: [
      "Quality Management Office",
      "Regulatory Documentation Desk",
      "Biosafety Monitoring Dashboard",
      "Audit Review Room",
      "Digital SOP Repository",
      "Risk Assessment Console",
    ],
  },
  {
    id: "strategy",
    floor: 4,
    name: "Executive Strategy and Global Partnership Wing",
    short: "Strategy",
    color: "#f472b6",
    services: [
      "Global partnership development",
      "Commercialization and translational planning",
      "International biotech program coordination",
    ],
    facilities: [
      "Executive Boardroom",
      "Project Dashboard",
      "Virtual Meeting Studio",
      "Partnership Office",
      "Investor Presentation Room",
      "Strategic Planning Wall",
    ],
  },
  {
    id: "training",
    floor: 4,
    name: "Training, Publication and Scientific Communication Center",
    short: "Training",
    color: "#38bdf8",
    services: [
      "Scientific writing and publication support",
      "Bioinformatics and biotechnology training",
      "Workshops, mentorship and researcher development",
    ],
    facilities: [
      "Smart Classroom",
      "Publication Desk",
      "Digital Learning Studio",
      "Conference Room",
      "Scientific Writing Hub",
      "Training Simulation Screen",
    ],
  },
  {
    id: "venture",
    floor: 4,
    name: "Biotechnology Venture Incubation Hub",
    short: "Venture Hub",
    color: "#c084fc",
    services: [
      "Biotech startup incubation",
      "Grant, IP and prototype development support",
      "Product planning and translational innovation",
    ],
    facilities: [
      "Pitch Studio",
      "Prototype Bench",
      "Digital Collaboration Wall",
      "Startup Advisory Room",
      "Innovation Lounge",
      "Product Concept Lab",
    ],
  },
];

function selectedRoomData(id: string) {
  return rooms.find((room) => room.id === id) || rooms[0];
}

function loadThree(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return;

    if (window.THREE) {
      resolve(window.THREE);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>("script[data-three-cdn='true']");
    if (existing) {
      existing.addEventListener("load", () => resolve(window.THREE));
      existing.addEventListener("error", reject);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/three@0.160.0/build/three.min.js";
    script.async = true;
    script.dataset.threeCdn = "true";
    script.onload = () => resolve(window.THREE);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function createSpriteTexture(THREE: any, text: string, color = "#ffffff", bgAlpha = 0.8, fontSize = 46) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = `rgba(2, 6, 23, ${bgAlpha})`;
  ctx.beginPath();
  ctx.roundRect(40, 28, 944, 200, 48);
  ctx.fill();

  ctx.strokeStyle = "rgba(103, 232, 249, 0.7)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(40, 28, 944, 200, 48);
  ctx.stroke();

  ctx.font = `900 ${fontSize}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;

  const shortText = text.length > 28 ? text.slice(0, 27) + "…" : text;
  ctx.fillText(shortText, 512, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  return texture;
}

function ThreeBuilding({
  selectedRoomId,
  setSelectedRoomId,
}: {
  selectedRoomId: string;
  setSelectedRoomId: React.Dispatch<React.SetStateAction<string>>;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef(selectedRoomId);

  useEffect(() => {
    selectedRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    let renderer: any;
    let scene: any;
    let camera: any;
    let frameId = 0;
    let disposed = false;

    const roomMarkerMeshes: any[] = []; // meshes for click detection
    const roomGlowMeshes: any[] = [];
    const allSprites: any[] = [];

    loadThree().then((THREE) => {
      if (disposed || !mountRef.current) return;

      const container = mountRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      // Scene setup
      scene = new THREE.Scene();
      scene.background = new THREE.Color("#0a1120");
      scene.fog = new THREE.FogExp2("#0a1120", 0.00025);

      camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 220);
      const target = new THREE.Vector3(0, 4.5, 2);
      let radius = 24;
      let theta = -0.65;
      let phi = 1.02;

      function updateCamera() {
        const sp = Math.sin(phi);
        camera.position.set(
          target.x + radius * sp * Math.sin(theta),
          target.y + radius * Math.cos(phi),
          target.z + radius * sp * Math.cos(theta)
        );
        camera.lookAt(target);
      }
      function resetCamera() {
        radius = 24;
        theta = -0.65;
        phi = 1.02;
        updateCamera();
      }
      updateCamera();

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      container.innerHTML = "";
      container.appendChild(renderer.domElement);

      // Lighting
      scene.add(new THREE.AmbientLight("#cbd5e1", 0.65));

      const sun = new THREE.DirectionalLight("#ffe4c4", 4.2);
      sun.position.set(15, 19, 12);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 60;
      sun.shadow.camera.left = -15;
      sun.shadow.camera.right = 15;
      sun.shadow.camera.top = 15;
      sun.shadow.camera.bottom = -15;
      sun.shadow.bias = -0.0005;
      scene.add(sun);

      const fillLight = new THREE.PointLight("#67e8f9", 2.2, 38);
      fillLight.position.set(-8, 5, 10);
      scene.add(fillLight);

      const accentLight = new THREE.PointLight("#fde68a", 1.5, 28);
      accentLight.position.set(6, 2, 11);
      scene.add(accentLight);

      const rimLight = new THREE.PointLight("#a78bfa", 1.3, 30);
      rimLight.position.set(8, 8, -5);
      scene.add(rimLight);

      // Materials
      const concreteMat = new THREE.MeshStandardMaterial({
        color: "#cbd5e1",
        roughness: 0.55,
        metalness: 0.15,
      });
      const darkConcrete = new THREE.MeshStandardMaterial({
        color: "#94a3b8",
        roughness: 0.5,
        metalness: 0.12,
      });
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: "#e0f2fe",
        roughness: 0.08,
        metalness: 0.02,
        clearcoat: 0.6,
        clearcoatRoughness: 0.05,
        transparent: true,
        opacity: 0.32,
        envMapIntensity: 0.4,
      });
      const accentGlass = new THREE.MeshPhysicalMaterial({
        color: "#f0fdfa",
        roughness: 0.05,
        metalness: 0.01,
        clearcoat: 0.9,
        clearcoatRoughness: 0.02,
        transparent: true,
        opacity: 0.45,
      });
      const panelMat = new THREE.MeshStandardMaterial({
        color: "#64748b",
        roughness: 0.3,
        metalness: 0.35,
      });
      const roofMat = new THREE.MeshStandardMaterial({
        color: "#1e293b",
        roughness: 0.7,
        metalness: 0.1,
      });

      // Ground and landscape
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(22, 64),
        new THREE.MeshStandardMaterial({ color: "#2d3a4a", roughness: 0.85, metalness: 0.02 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.05;
      ground.receiveShadow = true;
      scene.add(ground);

      const plaza = new THREE.Mesh(
        new THREE.BoxGeometry(16, 0.08, 9.5),
        new THREE.MeshStandardMaterial({ color: "#475569", roughness: 0.65 })
      );
      plaza.position.set(0, 0.02, 6.2);
      plaza.receiveShadow = true;
      scene.add(plaza);

      const path = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 0.09, 6.8),
        new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.5 })
      );
      path.position.set(0, 0.06, 10.2);
      path.receiveShadow = true;
      scene.add(path);

      // Trees & bushes
      function addTree(x: number, z: number, scale = 1) {
        const group = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12 * scale, 0.15 * scale, 0.9 * scale, 12),
          new THREE.MeshStandardMaterial({ color: "#78350f", roughness: 0.7 })
        );
        trunk.position.y = 0.45 * scale;
        trunk.castShadow = true;
        group.add(trunk);
        const foliage = new THREE.Mesh(
          new THREE.ConeGeometry(0.5 * scale, 0.8 * scale, 16),
          new THREE.MeshStandardMaterial({ color: "#166534", roughness: 0.8 })
        );
        foliage.position.y = 1.05 * scale;
        foliage.castShadow = true;
        group.add(foliage);
        group.position.set(x, 0, z);
        scene.add(group);
      }
      addTree(-13.5, 2.5, 1.1);
      addTree(-12.8, 7.5, 0.9);
      addTree(13.2, 1.8, 1.0);
      addTree(12.5, 7.8, 1.05);
      addTree(-11, -8.5, 1.0);
      addTree(10.5, -8.2, 0.95);

      // Building structure
      const building = new THREE.Group();
      scene.add(building);

      // Main core
      const coreWidth = 14;
      const coreDepth = 7;
      const coreHeight = 9.6;

      const core = new THREE.Mesh(
        new THREE.BoxGeometry(coreWidth, coreHeight, coreDepth),
        darkConcrete
      );
      core.position.set(0, coreHeight / 2, 0);
      core.castShadow = true;
      core.receiveShadow = true;
      building.add(core);

      // Glass curtain wall front
      const frontGlass = new THREE.Mesh(
        new THREE.BoxGeometry(coreWidth - 0.4, coreHeight - 1.2, 0.08),
        glassMat
      );
      frontGlass.position.set(0, coreHeight / 2, coreDepth / 2 + 0.05);
      frontGlass.receiveShadow = true;
      building.add(frontGlass);

      // Horizontal bands
      for (let y = 1.5; y < coreHeight; y += 2.1) {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(coreWidth + 0.1, 0.1, coreDepth + 0.1),
          panelMat
        );
        band.position.y = y;
        band.castShadow = true;
        building.add(band);
      }

      // Vertical mullions
      for (let x = -coreWidth / 2 + 0.5; x <= coreWidth / 2 - 0.5; x += 2.2) {
        const mullion = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, coreHeight - 1.2, 0.15),
          new THREE.MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.25, metalness: 0.5 })
        );
        mullion.position.set(x, coreHeight / 2, coreDepth / 2 + 0.1);
        mullion.castShadow = true;
        building.add(mullion);
      }

      // Side wings
      const wingWidth = 6.5;
      const wingDepth = 5.2;
      const wingHeight = coreHeight;
      for (let side = -1; side <= 1; side += 2) {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(wingWidth, wingHeight, wingDepth),
          concreteMat
        );
        wing.position.set(side * (coreWidth / 2 + wingWidth / 2 - 0.3), wingHeight / 2, -0.8);
        wing.castShadow = true;
        wing.receiveShadow = true;
        building.add(wing);

        // Wing glass
        const wingGlass = new THREE.Mesh(
          new THREE.BoxGeometry(wingWidth - 0.4, wingHeight - 1.2, 0.08),
          accentGlass
        );
        wingGlass.position.set(
          side * (coreWidth / 2 + wingWidth / 2 - 0.3),
          wingHeight / 2,
          wingDepth / 2 - 0.85
        );
        building.add(wingGlass);
      }

      // Rooftop features
      const roofBase = new THREE.Mesh(
        new THREE.BoxGeometry(coreWidth + 1.2, 0.25, coreDepth + 0.8),
        roofMat
      );
      roofBase.position.y = coreHeight + 0.12;
      roofBase.castShadow = true;
      building.add(roofBase);

      // Roof equipment
      for (let i = -2; i <= 2; i += 2) {
        const unit = new THREE.Mesh(
          new THREE.BoxGeometry(2.1, 1.6, 1.4),
          new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.4, metalness: 0.6 })
        );
        unit.position.set(i * 2.5, coreHeight + 1.05, 1.2);
        unit.castShadow = true;
        building.add(unit);
      }

      // DNA helix sculpture at entrance
      const dnaGroup = new THREE.Group();
      const dnaMaterial = new THREE.MeshStandardMaterial({
        color: "#38bdf8",
        roughness: 0.2,
        metalness: 0.7,
        emissive: "#0284c7",
        emissiveIntensity: 0.3,
      });
      const segments = 18;
      const radiusDNA = 0.8;
      const heightDNA = 3.2;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const y = -heightDNA / 2 + t * heightDNA;
        const angle = t * Math.PI * 4;
        const x1 = Math.cos(angle) * radiusDNA;
        const z1 = Math.sin(angle) * radiusDNA;
        const x2 = Math.cos(angle + Math.PI) * radiusDNA;
        const z2 = Math.sin(angle + Math.PI) * radiusDNA;

        const sphere1 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), dnaMaterial);
        sphere1.position.set(x1, y, z1);
        sphere1.castShadow = true;
        dnaGroup.add(sphere1);

        const sphere2 = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), dnaMaterial);
        sphere2.position.set(x2, y, z2);
        sphere2.castShadow = true;
        dnaGroup.add(sphere2);

        if (i < segments) {
          const nextT = (i + 1) / segments;
          const nextAngle = nextT * Math.PI * 4;
          const nX1 = Math.cos(nextAngle) * radiusDNA;
          const nZ1 = Math.sin(nextAngle) * radiusDNA;
          const nX2 = Math.cos(nextAngle + Math.PI) * radiusDNA;
          const nZ2 = Math.sin(nextAngle + Math.PI) * radiusDNA;

          const curve1 = new THREE.CatmullRomCurve3([
            new THREE.Vector3(x1, y, z1),
            new THREE.Vector3(nX1, y + heightDNA / segments, nZ1),
          ]);
          const tube1 = new THREE.TubeGeometry(curve1, 6, 0.07, 8, false);
          const mesh1 = new THREE.Mesh(tube1, dnaMaterial);
          mesh1.castShadow = true;
          dnaGroup.add(mesh1);

          const curve2 = new THREE.CatmullRomCurve3([
            new THREE.Vector3(x2, y, z2),
            new THREE.Vector3(nX2, y + heightDNA / segments, nZ2),
          ]);
          const tube2 = new THREE.TubeGeometry(curve2, 6, 0.07, 8, false);
          const mesh2 = new THREE.Mesh(tube2, dnaMaterial);
          mesh2.castShadow = true;
          dnaGroup.add(mesh2);

          // crossbars
          const cross = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8),
            dnaMaterial
          );
          const midX = (x1 + nX1) / 2;
          const midZ = (z1 + nZ1) / 2;
          cross.position.set(midX, y + heightDNA / segments / 2, midZ);
          cross.lookAt(new THREE.Vector3(midX + x2 - x1, y, midZ + z2 - z1));
          dnaGroup.add(cross);
        }
      }
      dnaGroup.position.set(0, 1.6, coreDepth / 2 + 1.8);
      building.add(dnaGroup);

      // Room interactive markers (glowing panels on facade)
      const floorHeights = [1.9, 3.8, 5.7, 7.6];
      rooms.forEach((room) => {
        const floorIndex = room.floor - 1;
        const roomsOnFloor = rooms.filter((r) => r.floor === room.floor);
        const posInFloor = roomsOnFloor.findIndex((r) => r.id === room.id);
        const xOffset = (posInFloor - (roomsOnFloor.length - 1) / 2) * 2.6;
        const y = floorHeights[floorIndex];
        const z = coreDepth / 2 + 0.25;

        // Glow panel
        const glowGeom = new THREE.BoxGeometry(2.2, 1.2, 0.12);
        const glowMat = new THREE.MeshStandardMaterial({
          color: room.color,
          emissive: room.color,
          emissiveIntensity: 0.4,
          roughness: 0.2,
          metalness: 0.3,
          transparent: true,
          opacity: 0.75,
        });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        glow.position.set(xOffset, y, z);
        glow.userData.roomId = room.id;
        glow.castShadow = true;
        glow.receiveShadow = false;
        building.add(glow);
        roomGlowMeshes.push(glow);

        // Invisible hitbox for better click detection
        const hitGeom = new THREE.BoxGeometry(2.3, 1.3, 0.25);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitbox = new THREE.Mesh(hitGeom, hitMat);
        hitbox.position.copy(glow.position);
        hitbox.userData.roomId = room.id;
        building.add(hitbox);
        roomMarkerMeshes.push(hitbox);

        // Label sprite
        const spriteMat = new THREE.SpriteMaterial({
          map: createSpriteTexture(THREE, room.short, room.color, 0.75, 40),
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(xOffset, y + 0.9, z + 0.8);
        sprite.scale.set(2.3, 0.6, 1);
        building.add(sprite);
        allSprites.push(sprite);
      });

      // Company sign
      const signSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createSpriteTexture(THREE, companyName, "#ffffff", 0.85, 50),
          transparent: true,
          depthTest: false,
        })
      );
      signSprite.position.set(0, coreHeight + 1.8, coreDepth / 2 + 0.3);
      signSprite.scale.set(6.8, 1.45, 1);
      building.add(signSprite);

      // Roof antenna / spire
      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.2, 2.2, 12),
        new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.2, metalness: 0.9 })
      );
      spire.position.set(0, coreHeight + 1.2, 0);
      spire.castShadow = true;
      building.add(spire);
      const spireBall = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 16),
        new THREE.MeshStandardMaterial({ color: "#facc15", roughness: 0.2, metalness: 0.7, emissive: "#854d0e", emissiveIntensity: 0.5 })
      );
      spireBall.position.set(0, coreHeight + 2.35, 0);
      spireBall.castShadow = true;
      building.add(spireBall);

      // Particles
      const particlesGeo = new THREE.BufferGeometry();
      const particlesCount = 300;
      const positions = new Float32Array(particlesCount * 3);
      for (let i = 0; i < particlesCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 28;
        positions[i + 1] = Math.random() * 12;
        positions[i + 2] = (Math.random() - 0.5) * 18;
      }
      particlesGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const particlesMat = new THREE.PointsMaterial({
        color: "#67e8f9",
        size: 0.08,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const particles = new THREE.Points(particlesGeo, particlesMat);
      scene.add(particles);

      // Interaction logic
      let isDragging = false;
      let moved = false;
      let lastX = 0,
        lastY = 0;
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      function selectRoomById(id: string, syncReact = true) {
        selectedRef.current = id;
        roomGlowMeshes.forEach((mesh) => {
          const isActive = mesh.userData.roomId === id;
          mesh.material.emissiveIntensity = isActive ? 0.9 : 0.4;
          mesh.material.opacity = isActive ? 0.95 : 0.75;
          mesh.scale.setScalar(isActive ? 1.12 : 1);
        });
        if (syncReact) setSelectedRoomId(id);
        // Dispatch for preview rebuild (handled by parent)
        window.dispatchEvent(new CustomEvent("geneex-room-changed", { detail: id }));
      }

      function onPointerDown(e: PointerEvent) {
        isDragging = true;
        moved = false;
        lastX = e.clientX;
        lastY = e.clientY;
        renderer.domElement.setPointerCapture(e.pointerId);
      }

      function onPointerMove(e: PointerEvent) {
        if (!isDragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        theta -= dx * 0.005;
        phi -= dy * 0.004;
        phi = Math.max(0.35, Math.min(1.5, phi));
        lastX = e.clientX;
        lastY = e.clientY;
        updateCamera();
        // hover effect could be added here but we keep simple
      }

      function onPointerUp(e: PointerEvent) {
        isDragging = false;
        if (!moved) {
          const rect = renderer.domElement.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(mouse, camera);
          const hits = raycaster.intersectObjects(roomMarkerMeshes);
          if (hits.length > 0) {
            const id = hits[0].object.userData.roomId;
            selectRoomById(id, true);
          }
        }
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
      }

      function onWheel(e: WheelEvent) {
        e.preventDefault();
        radius += e.deltaY * 0.018;
        radius = Math.max(12, Math.min(45, radius));
        updateCamera();
      }

      function onResize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }

      function onExternalSelect(e: Event) {
        const detail = (e as CustomEvent).detail;
        if (detail) selectRoomById(detail, false);
      }

      function onResetView() {
        resetCamera();
      }

      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("resize", onResize);
      window.addEventListener("geneex-select-room", onExternalSelect);
      window.addEventListener("geneex-reset-view", onResetView);

      // Animate
      function animate() {
        frameId = requestAnimationFrame(animate);
        // subtle particle drift
        particles.rotation.y += 0.0002;
        // DNA helix rotation
        dnaGroup.rotation.y += 0.003;
        renderer.render(scene, camera);
      }
      animate();

      // Initial selection
      selectRoomById(selectedRef.current, false);

      // Cleanup
      return () => {
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("wheel", onWheel);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("geneex-select-room", onExternalSelect);
        window.removeEventListener("geneex-reset-view", onResetView);
      };
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement?.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  }, [setSelectedRoomId]);

  return <div ref={mountRef} className="h-[840px] w-full rounded-b-[2rem] cursor-grab active:cursor-grabbing" />;
}

function GoalSection() {
  const [open, setOpen] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState("bsl3");
  const selectedRoom = useMemo(() => selectedRoomData(selectedRoomId), [selectedRoomId]);

  useEffect(() => {
    const handler = (e: Event) => setSelectedRoomId((e as CustomEvent).detail);
    window.addEventListener("geneex-room-changed", handler);
    return () => window.removeEventListener("geneex-room-changed", handler);
  }, []);

  function selectRoom(id: string) {
    setSelectedRoomId(id);
    window.dispatchEvent(new CustomEvent("geneex-select-room", { detail: id }));
  }

  function resetView() {
    window.dispatchEvent(new Event("geneex-reset-view"));
  }

  return (
    <section className="mx-auto max-w-7xl">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="group mb-8 flex w-full items-center justify-between rounded-[2rem] border border-cyan-400/20 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 p-7 text-left shadow-2xl shadow-cyan-950/30 transition hover:-translate-y-1 hover:border-cyan-300/70"
      >
        <div>
          <p className="mb-2 text-sm font-black uppercase tracking-[0.35em] text-cyan-300">
            Click to Explore
          </p>
          <h2 className="text-4xl font-black text-white md:text-5xl">My Goal</h2>
          <p className="mt-4 max-w-5xl text-sm leading-8 text-slate-300 md:text-base">
            My future goal is to establish <strong>{companyName}</strong>, a proposed
            advanced biotechnology company integrating molecular diagnostics, high-containment
            microbiology, microbial genomics, DNA sequencing, molecular epidemiology,
            epidemiology, disease dynamics, AI bioinformatics, supercomputing, electron
            microscopy, vaccine innovation, AMR surveillance, omics-based discovery and
            translational biotech services for animal health, public health and next-generation
            life-science innovation.
          </p>
        </div>
        <div className="ml-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/10 text-3xl font-black text-cyan-200 transition group-hover:bg-cyan-300 group-hover:text-slate-950">
          {open ? "−" : "+"}
        </div>
      </button>

      {open && (
        <div className="animate-[fadeIn_0.35s_ease]">
          <div className="grid gap-8 xl:grid-cols-[1.38fr_0.72fr]">
            <div className="overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-slate-900 shadow-2xl shadow-cyan-950/50">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90 px-5 py-4">
                <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100">
                  Drag · Rotate · Zoom · Click Glowing Panels
                </div>
                <button
                  onClick={resetView}
                  className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-300 hover:text-slate-950"
                >
                  Reset View
                </button>
              </div>
              <ThreeBuilding selectedRoomId={selectedRoomId} setSelectedRoomId={setSelectedRoomId} />
            </div>

            <aside className="rounded-[2rem] border border-cyan-400/20 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl shadow-cyan-950/40">
              <div
                className="mb-5 h-2 rounded-full"
                style={{ background: `linear-gradient(90deg, ${selectedRoom.color}, #020617)` }}
              />
              <p className="mb-2 text-sm font-black uppercase tracking-[0.25em] text-cyan-300">
                Selected Section
              </p>
              <h3 className="mb-2 text-2xl font-black leading-tight text-white">
                {selectedRoom.name}
              </h3>
              <p className="mb-5 text-sm font-semibold text-slate-400">
                Floor {selectedRoom.floor} · Select any room below or inside the 3D building.
              </p>

              <div className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => selectRoom(room.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-xs font-black transition hover:-translate-y-0.5 ${
                      selectedRoomId === room.id
                        ? "border-white bg-white text-slate-950 shadow-lg shadow-white/10"
                        : "border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-300 hover:text-cyan-200"
                    }`}
                  >
                    F{room.floor} · {room.short}
                  </button>
                ))}
              </div>

              <h4 className="mb-3 text-lg font-black text-cyan-200">Services and Functions</h4>
              <div className="mb-6 space-y-2">
                {selectedRoom.services.map((service) => (
                  <div key={service} className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-300">
                    {service}
                  </div>
                ))}
              </div>

              <h4 className="mb-3 text-lg font-black text-cyan-200">Inner Structures and Machineries</h4>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {selectedRoom.facilities.map((facility) => (
                  <div
                    key={facility}
                    className="rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-xl transition hover:-translate-y-1 hover:border-cyan-300/60"
                  >
                    <div
                      className="mb-3 h-16 rounded-xl border border-white/10"
                      style={{
                        background: `linear-gradient(135deg, ${selectedRoom.color}, #020617)`,
                        boxShadow: `0 0 28px ${selectedRoom.color}55`,
                      }}
                    />
                    <p className="text-sm font-black leading-snug text-slate-200">{facility}</p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      )}
    </section>
  );
}

function ExpandableSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mx-auto mt-10 max-w-7xl">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="group flex w-full items-center justify-between rounded-[2rem] border border-slate-700 bg-slate-900 p-6 text-left shadow-xl transition hover:-translate-y-1 hover:border-cyan-300/60"
      >
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-cyan-300">Click to Open</p>
          <h2 className="text-3xl font-black text-white">{title}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">{subtitle}</p>
        </div>
        <div className="ml-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-950 text-2xl font-black text-cyan-200 transition group-hover:bg-cyan-300 group-hover:text-slate-950">
          {open ? "−" : "+"}
        </div>
      </button>
      {open && <div className="mt-5 rounded-[2rem] border border-cyan-400/20 bg-slate-950 p-6 shadow-xl">{children}</div>}
    </section>
  );
}

function PlaceholderGrid({ items }: { items: { title: string; text: string; icon: string }[] }) {
  return (
    <div className="grid gap-5 md:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.title}
          className="rounded-[2rem] border border-slate-700 bg-slate-900 p-6 transition hover:-translate-y-1 hover:border-cyan-300/60"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-2xl">
            {item.icon}
          </div>
          <h3 className="mb-3 text-xl font-black text-cyan-200">{item.title}</h3>
          <p className="text-sm leading-7 text-slate-300">{item.text}</p>
        </div>
      ))}
    </div>
  );
}

export default function Blog() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <section className="mx-auto mb-12 max-w-7xl text-center">
        <p className="mb-4 text-sm font-black uppercase tracking-[0.35em] text-cyan-300">
          Personal Vision & Life Archive
        </p>
        <h1 className="mb-6 bg-gradient-to-r from-cyan-300 via-blue-400 to-purple-400 bg-clip-text text-5xl font-black text-transparent md:text-7xl">
          Blog
        </h1>
        <p className="mx-auto max-w-4xl text-lg leading-8 text-slate-300">
          A personal space for future goals, photography, travel memories, videos, visual stories and reflections.
        </p>
      </section>

      <GoalSection />

      <ExpandableSection
        title="Photography Gallery"
        subtitle="Selected photographs, visual collections, field moments and creative frames from personal and academic life."
      >
        <PlaceholderGrid
          items={[
            { icon: "📷", title: "Field Photography", text: "Photos from research visits, farms, laboratories, nature and field-level observations." },
            { icon: "🌿", title: "Nature Frames", text: "Landscape, animals, rural life, campus environment and natural scenes." },
            { icon: "🧪", title: "Research Moments", text: "Visual memories from laboratory work, training, projects and scientific activities." },
          ]}
        />
      </ExpandableSection>

      <ExpandableSection
        title="Travel Journal"
        subtitle="A personal archive of travel experiences, places visited, memories, routes and meaningful stories."
      >
        <PlaceholderGrid
          items={[
            { icon: "🗺️", title: "Places Visited", text: "Cities, campuses, villages, research sites and memorable destinations." },
            { icon: "✈️", title: "Travel Plans", text: "Future travel goals, academic journeys, conference visits and international experiences." },
            { icon: "📍", title: "Location Stories", text: "Short notes about each place, why it mattered and what I learned from it." },
          ]}
        />
      </ExpandableSection>

      <ExpandableSection
        title="Video Stories"
        subtitle="A personal video section for short clips, documentary-style visuals, academic videos and life moments."
      >
        <PlaceholderGrid
          items={[
            { icon: "🎥", title: "Personal Clips", text: "Short videos from daily life, events, campus, field visits and travel memories." },
            { icon: "🎬", title: "Research Videos", text: "Scientific demonstrations, project highlights, tool demos and academic video records." },
            { icon: "🌐", title: "Visual Stories", text: "Edited storytelling videos combining photography, travel, research and reflections." },
          ]}
        />
      </ExpandableSection>

      <ExpandableSection
        title="Personal Notes"
        subtitle="Thoughts, reflections, lessons, life updates and personal writing beyond academic work."
      >
        <PlaceholderGrid
          items={[
            { icon: "📝", title: "Reflections", text: "Personal thoughts on growth, discipline, research life, challenges and long-term vision." },
            { icon: "⭐", title: "Milestones", text: "Important achievements, turning points, academic memories and meaningful life events." },
            { icon: "💡", title: "Ideas", text: "Future ideas, creative plans, personal projects and concepts to develop over time." },
          ]}
        />
      </ExpandableSection>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}