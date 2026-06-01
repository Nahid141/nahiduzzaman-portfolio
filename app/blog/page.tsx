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
    facilities: ["qPCR System", "PCR Workstation", "Gel Documentation", "DNA/RNA Extraction Unit"],
  },
  {
    id: "microbiology",
    floor: 1,
    name: "Microbiology and AMR Research Unit",
    short: "Microbiology",
    color: "#facc15",
    services: [
      "Bacterial culture and identification",
      "Antimicrobial susceptibility testing",
      "Food safety and zoonotic pathogen surveillance",
    ],
    facilities: ["Biosafety Cabinet", "Incubator", "Autoclave", "AST Zone Reader"],
  },
  {
    id: "cell",
    floor: 1,
    name: "Cell Culture and Vaccine Development Suite",
    short: "Cell/Vaccine",
    color: "#22c55e",
    services: [
      "Cell culture-based biological research",
      "Vaccine candidate screening",
      "Virus propagation and biological assay support",
    ],
    facilities: ["CO₂ Incubator", "Inverted Microscope", "Biosafety Cabinet", "Cryostorage System"],
  },
  {
    id: "electron",
    floor: 2,
    name: "Electron Microscopy and Imaging Core",
    short: "EM Core",
    color: "#a855f7",
    services: [
      "SEM and TEM imaging",
      "Ultrastructural biological analysis",
      "Nanoparticle and viral morphology visualization",
    ],
    facilities: ["Scanning Electron Microscope", "Transmission Electron Microscope", "Sample Coater", "Image Workstation"],
  },
  {
    id: "omics",
    floor: 2,
    name: "Proteomics and Metabolomics Platform",
    short: "Omics",
    color: "#fb7185",
    services: [
      "Protein expression profiling",
      "Metabolite detection",
      "Biomarker and pathway discovery",
    ],
    facilities: ["LC-MS/MS", "HPLC System", "Protein Analyzer", "Cold Sample Storage"],
  },
  {
    id: "bioprocess",
    floor: 2,
    name: "Bioprocessing and Fermentation Unit",
    short: "Bioprocess",
    color: "#fb923c",
    services: [
      "Pilot-scale microbial fermentation",
      "Bioproduct optimization",
      "Downstream processing support",
    ],
    facilities: ["Bioreactor", "Fermenter", "Centrifuge", "Purification Unit"],
  },
  {
    id: "hpc",
    floor: 3,
    name: "Supercomputing and AI Bioinformatics Center",
    short: "HPC-AI",
    color: "#60a5fa",
    services: [
      "Whole-genome sequencing analysis",
      "AI and ML-based biological prediction",
      "Phylogenomics and molecular epidemiology",
    ],
    facilities: ["GPU Supercomputer Rack", "Bioinformatics Server", "Secure Data Cloud", "AI Workstation"],
  },
  {
    id: "epi",
    floor: 3,
    name: "Epidemiology and Disease Dynamics Unit",
    short: "Epidemiology",
    color: "#34d399",
    services: [
      "Disease outbreak analysis and epidemiological modeling",
      "Transmission dynamics and risk factor analysis",
      "Surveillance data interpretation for animal and public health",
    ],
    facilities: ["Epidemiology Dashboard", "GIS Mapping Station", "Modeling Workstation", "Surveillance Data Hub"],
  },
  {
    id: "venture",
    floor: 3,
    name: "Biotechnology Venture Incubation Hub",
    short: "Venture Hub",
    color: "#c084fc",
    services: [
      "Biotech startup incubation",
      "Grant and IP development support",
      "Prototype and product planning",
    ],
    facilities: ["Pitch Studio", "Prototype Bench", "Digital Collaboration Wall", "Startup Advisory Room"],
  },
  {
    id: "strategy",
    floor: 4,
    name: "Executive Strategy and Global Partnership Wing",
    short: "Strategy",
    color: "#f472b6",
    services: [
      "Global partnership development",
      "Regulatory and commercialization planning",
      "International biotech program coordination",
    ],
    facilities: ["Executive Boardroom", "Project Dashboard", "Virtual Meeting Studio", "Partnership Office"],
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
      "Workshops and researcher mentorship",
    ],
    facilities: ["Smart Classroom", "Publication Desk", "Digital Learning Studio", "Conference Room"],
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

function createLabelTexture(THREE: any, text: string, color = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(2, 6, 23, 0.82)";
  ctx.roundRect(28, 46, 968, 164, 34);
  ctx.fill();

  ctx.strokeStyle = "rgba(103, 232, 249, 0.78)";
  ctx.lineWidth = 5;
  ctx.roundRect(28, 46, 968, 164, 34);
  ctx.stroke();

  ctx.font = "900 52px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;

  const shortText = text.length > 25 ? text.slice(0, 24) + "…" : text;
  ctx.fillText(shortText, 512, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  texture.needsUpdate = true;
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

    const roomMeshes: any[] = [];
    const outlineMeshes: any[] = [];

    loadThree().then((THREE) => {
      if (disposed || !mountRef.current) return;

      const container = mountRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;

      scene = new THREE.Scene();
      scene.background = new THREE.Color("#020617");
      scene.fog = new THREE.Fog("#020617", 28, 60);

      camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);

      const target = new THREE.Vector3(0, 4.35, 0);
      let radius = 20;
      let theta = -0.72;
      let phi = 1.08;

      function updateCamera() {
        const x = target.x + radius * Math.sin(phi) * Math.sin(theta);
        const y = target.y + radius * Math.cos(phi);
        const z = target.z + radius * Math.sin(phi) * Math.cos(theta);
        camera.position.set(x, y, z);
        camera.lookAt(target);
      }

      function resetCamera() {
        radius = 20;
        theta = -0.72;
        phi = 1.08;
        updateCamera();
      }

      updateCamera();

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });

      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;

      container.innerHTML = "";
      container.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight("#ffffff", 0.72));

      const sun = new THREE.DirectionalLight("#ffffff", 2.4);
      sun.position.set(9, 15, 12);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      scene.add(sun);

      const cyanLight = new THREE.PointLight("#67e8f9", 2.4, 36);
      cyanLight.position.set(-7, 7, 8);
      scene.add(cyanLight);

      const warmLight = new THREE.PointLight("#fde68a", 1.6, 26);
      warmLight.position.set(3.5, 2.6, 8);
      scene.add(warmLight);

      const buildingGroup = new THREE.Group();
      scene.add(buildingGroup);

      const makeMat = (color: string, roughness = 0.35, metalness = 0.08) =>
        new THREE.MeshStandardMaterial({ color, roughness, metalness });

      const glassMat = new THREE.MeshPhysicalMaterial({
        color: "#dbeafe",
        transparent: true,
        opacity: 0.29,
        roughness: 0.08,
        metalness: 0.04,
        transmission: 0.25,
        thickness: 0.5,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
      });

      const panelMat = new THREE.MeshPhysicalMaterial({
        color: "#bfdbfe",
        transparent: true,
        opacity: 0.42,
        roughness: 0.12,
        metalness: 0.02,
        transmission: 0.28,
        thickness: 0.35,
      });

      function box(
        size: [number, number, number],
        position: [number, number, number],
        material: any,
        cast = true,
        receive = true,
        parent = buildingGroup
      ) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
        mesh.position.set(...position);
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        parent.add(mesh);
        return mesh;
      }

      const ground = new THREE.Mesh(
        new THREE.BoxGeometry(24, 0.18, 16),
        makeMat("#0f172a", 0.8, 0.02)
      );
      ground.position.set(0, -0.18, 0);
      ground.receiveShadow = true;
      scene.add(ground);

      const lawn = new THREE.Mesh(
        new THREE.BoxGeometry(21, 0.08, 9.5),
        makeMat("#14532d", 0.92, 0.01)
      );
      lawn.position.set(0, -0.06, 2.3);
      lawn.receiveShadow = true;
      scene.add(lawn);

      const path = new THREE.Mesh(
        new THREE.BoxGeometry(3.25, 0.09, 5.8),
        makeMat("#475569", 0.7, 0.03)
      );
      path.position.set(0, 0.01, 7.1);
      scene.add(path);

      box([11.8, 0.55, 4.8], [0, 0.35, 0], makeMat("#64748b", 0.62, 0.05));
      box([11.4, 8.4, 0.18], [0, 4.55, -2.45], makeMat("#0f172a", 0.55, 0.05));

      [-5.8, 5.8].forEach((x) => {
        box([0.18, 8.4, 4.8], [x, 4.55, 0], glassMat);
      });

      [0.7, 2.65, 4.6, 6.55, 8.5].forEach((y) => {
        box([11.9, 0.14, 4.9], [0, y, 0], makeMat("#94a3b8", 0.38, 0.08));
      });

      box([11.9, 8.15, 0.12], [0, 4.62, 2.48], glassMat, false, false);

      for (let i = 0; i < 36; i++) {
        const x = -5.75 + i * 0.33;
        const fin = box(
          [0.052, 8.05, 0.18],
          [x, 4.64, 2.66],
          i % 3 === 0 ? panelMat : glassMat,
          false,
          false
        );
        fin.rotation.y = i % 2 === 0 ? 0.035 : -0.025;
      }

      [1.62, 2.65, 3.58, 4.6, 5.52, 6.55, 7.48, 8.5].forEach((y) => {
        box([11.85, 0.035, 0.16], [0, y, 2.76], makeMat("#e2e8f0", 0.22, 0.18), false, false);
      });

      for (let i = 0; i < 14; i++) {
        const x = -5.65 + i * 0.87;
        box([0.04, 8.0, 0.18], [x, 4.65, 2.79], makeMat("#cbd5e1", 0.25, 0.2), false, false);
      }

      box(
        [4.9, 1.45, 0.18],
        [0, 1.15, 2.84],
        new THREE.MeshBasicMaterial({
          color: "#fef3c7",
          transparent: true,
          opacity: 0.35,
        }),
        false,
        false
      );

      [-4.8, -2.4, 2.4, 4.8].forEach((x) => {
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.07, 1.7, 24),
          makeMat("#e2e8f0", 0.25, 0.25)
        );
        col.position.set(x, 1.12, 2.65);
        col.castShadow = true;
        buildingGroup.add(col);
      });

      const floorY: Record<number, number> = {
        1: 1.55,
        2: 3.5,
        3: 5.45,
        4: 7.4,
      };

      rooms.forEach((room) => {
        const roomsOnFloor = rooms.filter((r) => r.floor === room.floor);
        const floorIndex = roomsOnFloor.findIndex((r) => r.id === room.id);

        let x = 0;
        let roomWidth = 2.7;

        if (roomsOnFloor.length === 3) {
          x = [-3.65, 0, 3.65][floorIndex];
          roomWidth = 2.6;
        } else {
          x = [-2.05, 2.05][floorIndex];
          roomWidth = 3.3;
        }

        const material = new THREE.MeshStandardMaterial({
          color: room.color,
          transparent: true,
          opacity: room.id === selectedRef.current ? 0.9 : 0.46,
          roughness: 0.24,
          metalness: 0.18,
          emissive: new THREE.Color(room.color),
          emissiveIntensity: room.id === selectedRef.current ? 0.28 : 0.05,
        });

        const mesh = new THREE.Mesh(new THREE.BoxGeometry(roomWidth, 1.15, 2.35), material);
        mesh.position.set(x, floorY[room.floor], 0.1);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.roomId = room.id;
        buildingGroup.add(mesh);
        roomMeshes.push(mesh);

        const outline = new THREE.Mesh(
          new THREE.BoxGeometry(roomWidth + 0.08, 1.23, 2.43),
          new THREE.MeshBasicMaterial({
            color: "#ffffff",
            transparent: true,
            opacity: room.id === selectedRef.current ? 0.4 : 0.02,
            wireframe: true,
          })
        );
        outline.position.copy(mesh.position);
        outline.userData.roomId = room.id;
        buildingGroup.add(outline);
        outlineMeshes.push(outline);

        const label = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: createLabelTexture(THREE, room.short),
            transparent: true,
            depthTest: false,
          })
        );
        label.position.set(x, floorY[room.floor] + 0.92, 2.95);
        label.scale.set(2.25, 0.56, 1);
        buildingGroup.add(label);
      });

      const previewGroup = new THREE.Group();
      previewGroup.position.set(0, 0.05, 5.58);
      scene.add(previewGroup);

      function clearGroup(group: any) {
        while (group.children.length) {
          const child = group.children.pop();
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose?.();
        }
      }

      function rebuildPreview(room: Room) {
        clearGroup(previewGroup);

        const base = new THREE.Mesh(
          new THREE.BoxGeometry(7.2, 0.12, 3.1),
          makeMat("#0f172a", 0.45, 0.08)
        );
        base.position.set(0, 0.05, 0);
        previewGroup.add(base);

        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(7.2, 2.3, 0.12),
          makeMat("#1e293b", 0.42, 0.05)
        );
        wall.position.set(0, 1.25, -1.48);
        previewGroup.add(wall);

        const title = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: createLabelTexture(THREE, `Inside: ${room.short}`, "#ffffff"),
            transparent: true,
          })
        );
        title.position.set(0, 2.82, -1.4);
        title.scale.set(4.0, 0.92, 1);
        previewGroup.add(title);

        room.facilities.forEach((facility, i) => {
          const x = -2.55 + i * 1.7;

          const machine = new THREE.Mesh(
            new THREE.BoxGeometry(0.95, 1.0, 0.75),
            new THREE.MeshStandardMaterial({
              color: room.color,
              roughness: 0.22,
              metalness: 0.28,
              emissive: new THREE.Color(room.color),
              emissiveIntensity: 0.08,
            })
          );
          machine.position.set(x, 0.65, 0);
          machine.castShadow = true;
          previewGroup.add(machine);

          const screen = new THREE.Mesh(
            new THREE.BoxGeometry(0.52, 0.24, 0.05),
            new THREE.MeshBasicMaterial({ color: "#e0f2fe" })
          );
          screen.position.set(x, 0.95, 0.39);
          previewGroup.add(screen);

          const label = new THREE.Sprite(
            new THREE.SpriteMaterial({
              map: createLabelTexture(THREE, facility, "#ffffff"),
              transparent: true,
              depthTest: false,
            })
          );
          label.position.set(x, -0.35, 0.65);
          label.scale.set(1.45, 0.36, 1);
          previewGroup.add(label);
        });
      }

      function selectRoom(id: string, syncReact = true) {
        selectedRef.current = id;

        roomMeshes.forEach((mesh) => {
          const isActive = mesh.userData.roomId === id;
          mesh.material.opacity = isActive ? 0.9 : 0.45;
          mesh.material.emissiveIntensity = isActive ? 0.28 : 0.05;
          mesh.scale.setScalar(isActive ? 1.09 : 1);
        });

        outlineMeshes.forEach((mesh) => {
          mesh.material.opacity = mesh.userData.roomId === id ? 0.4 : 0.02;
        });

        rebuildPreview(selectedRoomData(id));
        if (syncReact) setSelectedRoomId(id);
      }

      selectRoom(selectedRef.current, false);

      [
        [-8, 0, 3.8],
        [8, 0, 4.1],
        [-7, 0, 7],
        [7, 0, 7.2],
      ].forEach(([x, y, z]) => {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.09, 0.9, 16),
          makeMat("#713f12", 0.55, 0.02)
        );
        trunk.position.set(x, y + 0.45, z);
        scene.add(trunk);

        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 24, 24),
          makeMat("#166534", 0.85, 0.02)
        );
        crown.position.set(x, y + 1.05, z);
        scene.add(crown);
      });

      const sign = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createLabelTexture(THREE, companyName, "#ffffff"),
          transparent: true,
          depthTest: false,
        })
      );
      sign.position.set(0, 9.28, 3.05);
      sign.scale.set(5.9, 1.25, 1);
      buildingGroup.add(sign);

      let isDragging = false;
      let moved = false;
      let lastX = 0;
      let lastY = 0;

      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

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

        theta -= dx * 0.006;
        phi -= dy * 0.004;
        phi = Math.max(0.35, Math.min(1.46, phi));

        lastX = e.clientX;
        lastY = e.clientY;

        updateCamera();
      }

      function onPointerUp(e: PointerEvent) {
        isDragging = false;

        if (!moved) {
          const rect = renderer.domElement.getBoundingClientRect();
          mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

          raycaster.setFromCamera(mouse, camera);
          const hits = raycaster.intersectObjects(roomMeshes, false);

          if (hits.length > 0) {
            const id = hits[0].object.userData.roomId;
            selectRoom(id, true);
          }
        }

        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {}
      }

      function onWheel(e: WheelEvent) {
        e.preventDefault();
        radius += e.deltaY * 0.015;
        radius = Math.max(9, Math.min(34, radius));
        updateCamera();
      }

      function onExternalSelect(e: Event) {
        const custom = e as CustomEvent<string>;
        if (custom.detail) selectRoom(custom.detail, false);
      }

      function onResetView() {
        resetCamera();
      }

      function onResize() {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }

      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

      window.addEventListener("resize", onResize);
      window.addEventListener("geneex-select-room", onExternalSelect);
      window.addEventListener("geneex-reset-view", onResetView);

      function animate() {
        frameId = requestAnimationFrame(animate);
        renderer.render(scene, camera);
      }

      animate();

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

  return <div ref={mountRef} className="h-[780px] w-full rounded-b-3xl" />;
}

function GoalSection() {
  const [open, setOpen] = useState(true);
  const [selectedRoomId, setSelectedRoomId] = useState("hpc");

  const selectedRoom = useMemo(() => selectedRoomData(selectedRoomId), [selectedRoomId]);

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
            biotechnology company that will integrate molecular diagnostics, microbial genomics,
            molecular epidemiology, epidemiology, disease dynamics, AI bioinformatics,
            supercomputing, electron microscopy, vaccine innovation, AMR surveillance,
            omics-based discovery and translational biotech services to support animal health,
            public health and next-generation life-science innovation.
          </p>
        </div>

        <div className="ml-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/10 text-3xl font-black text-cyan-200 transition group-hover:bg-cyan-300 group-hover:text-slate-950">
          {open ? "−" : "+"}
        </div>
      </button>

      {open && (
        <div className="animate-[fadeIn_0.35s_ease]">
          <div className="grid gap-8 xl:grid-cols-[1.35fr_0.75fr]">
            <div className="overflow-hidden rounded-[2rem] border border-cyan-400/20 bg-slate-900 shadow-2xl shadow-cyan-950/50">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/90 px-5 py-4">
                <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100">
                  Drag · Rotate · Zoom · Click Rooms
                </div>

                <button
                  onClick={resetView}
                  className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-cyan-300 hover:text-slate-950"
                >
                  Reset View
                </button>
              </div>

              <ThreeBuilding
                selectedRoomId={selectedRoomId}
                setSelectedRoomId={setSelectedRoomId}
              />
            </div>

            <aside className="rounded-[2rem] border border-cyan-400/20 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl shadow-cyan-950/40">
              <div
                className="mb-5 h-2 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${selectedRoom.color}, #020617)`,
                }}
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

              <h4 className="mb-3 text-lg font-black text-cyan-200">
                Services and Functions
              </h4>

              <div className="mb-6 space-y-2">
                {selectedRoom.services.map((service) => (
                  <div
                    key={service}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm leading-6 text-slate-300"
                  >
                    {service}
                  </div>
                ))}
              </div>

              <h4 className="mb-3 text-lg font-black text-cyan-200">
                Inner Structures and Machineries
              </h4>

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
                    <p className="text-sm font-black leading-snug text-slate-200">
                      {facility}
                    </p>
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
          <p className="mb-2 text-xs font-black uppercase tracking-[0.3em] text-cyan-300">
            Click to Open
          </p>
          <h2 className="text-3xl font-black text-white">{title}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">{subtitle}</p>
        </div>

        <div className="ml-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-950 text-2xl font-black text-cyan-200 transition group-hover:bg-cyan-300 group-hover:text-slate-950">
          {open ? "−" : "+"}
        </div>
      </button>

      {open && (
        <div className="mt-5 rounded-[2rem] border border-cyan-400/20 bg-slate-950 p-6 shadow-xl">
          {children}
        </div>
      )}
    </section>
  );
}

function PlaceholderGrid({
  items,
}: {
  items: { title: string; text: string; icon: string }[];
}) {
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
          A personal space for future goals, photography, travel memories, videos,
          visual stories and reflections.
        </p>
      </section>

      <GoalSection />

      <ExpandableSection
        title="Photography Gallery"
        subtitle="Selected photographs, visual collections, field moments and creative frames from personal and academic life."
      >
        <PlaceholderGrid
          items={[
            {
              icon: "📷",
              title: "Field Photography",
              text: "Photos from research visits, farms, laboratories, nature and field-level observations.",
            },
            {
              icon: "🌿",
              title: "Nature Frames",
              text: "Landscape, animals, rural life, campus environment and natural scenes.",
            },
            {
              icon: "🧪",
              title: "Research Moments",
              text: "Visual memories from laboratory work, training, projects and scientific activities.",
            },
          ]}
        />
      </ExpandableSection>

      <ExpandableSection
        title="Travel Journal"
        subtitle="A personal archive of travel experiences, places visited, memories, routes and meaningful stories."
      >
        <PlaceholderGrid
          items={[
            {
              icon: "🗺️",
              title: "Places Visited",
              text: "Cities, campuses, villages, research sites and memorable destinations.",
            },
            {
              icon: "✈️",
              title: "Travel Plans",
              text: "Future travel goals, academic journeys, conference visits and international experiences.",
            },
            {
              icon: "📍",
              title: "Location Stories",
              text: "Short notes about each place, why it mattered and what I learned from it.",
            },
          ]}
        />
      </ExpandableSection>

      <ExpandableSection
        title="Video Stories"
        subtitle="A personal video section for short clips, documentary-style visuals, academic videos and life moments."
      >
        <PlaceholderGrid
          items={[
            {
              icon: "🎥",
              title: "Personal Clips",
              text: "Short videos from daily life, events, campus, field visits and travel memories.",
            },
            {
              icon: "🎬",
              title: "Research Videos",
              text: "Scientific demonstrations, project highlights, tool demos and academic video records.",
            },
            {
              icon: "🌐",
              title: "Visual Stories",
              text: "Edited storytelling videos combining photography, travel, research and reflections.",
            },
          ]}
        />
      </ExpandableSection>

      <ExpandableSection
        title="Personal Notes"
        subtitle="Thoughts, reflections, lessons, life updates and personal writing beyond academic work."
      >
        <PlaceholderGrid
          items={[
            {
              icon: "📝",
              title: "Reflections",
              text: "Personal thoughts on growth, discipline, research life, challenges and long-term vision.",
            },
            {
              icon: "⭐",
              title: "Milestones",
              text: "Important achievements, turning points, academic memories and meaningful life events.",
            },
            {
              icon: "💡",
              title: "Ideas",
              text: "Future ideas, creative plans, personal projects and concepts to develop over time.",
            },
          ]}
        />
      </ExpandableSection>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}