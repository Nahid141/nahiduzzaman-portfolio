"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type ObsRow = {
  Farm_ID: string;
  Location: string;
  Latitude: number;
  Longitude: number;
  Date: string;
  Observation: number;
  Total_Animals: number;
  S: number;
  E: number;
  I: number;
  R: number;
  Confirmatory_Diagnosis: number;
  Abortion_Count: number;
  Pending_Culled: number;
  Culled: number;
  Pending_Quarantined: number;
  Quarantined: number;
  New_Animals_Moved_In: number;
  New_Animals_Moved_Out: number;
  Susceptible_In_From_MovedIn: number;
  Susceptible_Out_From_MovedOut: number;
};

type NetworkEdge = {
  edgeId: string;
  source: string;
  target: string;
  edgeType: string;
  distanceKm: number;
  movements: number;
};

type MainTab =
  | "transmission"
  | "risk"
  | "statistics"
  | "network"
  | "evolutionary";

type TransmissionStep = "farm" | "observe" | "table" | "analysis" | "map";

type MapStyleMode = "normal" | "satellite";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function num(value: string | number | null | undefined, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "NA";
  return `${(value * 100).toFixed(2)}%`;
}

function valueText(value: any, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return "NA";
  if (typeof value === "number") return value.toFixed(digits);
  return String(value);
}

function nextFarmId(existing: string[]) {
  let i = existing.length + 1;
  while (existing.includes(`Farm_${i}`)) i += 1;
  return `Farm_${i}`;
}

function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }

  out.push(cur.trim());
  return out;
}

async function parseCSVFile(file: File): Promise<Record<string, any>[]> {
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/).filter(Boolean);

  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row: Record<string, any> = {};

    headers.forEach((h, i) => {
      const raw = values[i] ?? "";
      const n = Number(raw);
      row[h] = raw !== "" && Number.isFinite(n) ? n : raw;
    });

    return row;
  });
}

async function readSpreadsheetLikeFile(file: File): Promise<Record<string, any>[]> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv")) {
    return parseCSVFile(file);
  }

  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];
}

function normalizeExcelNetworkRows(rows: Record<string, any>[]): NetworkEdge[] {
  return rows
    .map((r, i) => ({
      edgeId: String(r.Edge_ID ?? r["Edge ID"] ?? r.edgeId ?? `E${i + 1}`),
      source: String(r.From_Node ?? r["From Node"] ?? r.source ?? r.Source ?? ""),
      target: String(r.To_Node ?? r["To Node"] ?? r.target ?? r.Target ?? ""),
      edgeType: String(r.Edge_Type ?? r["Edge Type"] ?? r.type ?? "movement"),
      distanceKm: num(r.Road_Distance_km ?? r["Road Distance (km)"] ?? r.distanceKm),
      movements: num(r.Avg_Movements ?? r["Avg Movements"] ?? r.movements, 1),
    }))
    .filter((edge) => edge.source && edge.target);
}

function csvFromRows(rows: ObsRow[]) {
  const headers = [
    "Farm_ID",
    "Location",
    "Latitude",
    "Longitude",
    "Date",
    "Observation",
    "Total_Animals",
    "S",
    "E",
    "I",
    "Confirmatory_Diagnosis",
    "R",
    "Abortion_Count",
    "Pending_Culled",
    "Culled",
    "Pending_Quarantined",
    "Quarantined",
    "New_Animals_Moved_In",
    "New_Animals_Moved_Out",
    "Susceptible_In_From_MovedIn",
    "Susceptible_Out_From_MovedOut",
  ];

  const body = rows.map((r) =>
    headers
      .map((h) => {
        const raw = String((r as any)[h] ?? "");
        return raw.includes(",") ? `"${raw.replace(/"/g, '""')}"` : raw;
      })
      .join(",")
  );

  return [headers.join(","), ...body].join("\n");
}

export default function Tools() {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("transmission");

  const [transmissionMode, setTransmissionMode] = useState<"logic" | "import">("logic");
  const [tStep, setTStep] = useState<TransmissionStep>("farm");
  const [farms, setFarms] = useState<ObsRow[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState("");

  const [transmissionFile, setTransmissionFile] = useState<File | null>(null);
  const [transmissionFileName, setTransmissionFileName] = useState("");
  const [infectiousPeriodDays, setInfectiousPeriodDays] = useState("14");
  const [transmissionResult, setTransmissionResult] = useState<any>(null);

  const [riskFile, setRiskFile] = useState<File | null>(null);
  const [riskFileName, setRiskFileName] = useState("");
  const [riskOutcome, setRiskOutcome] = useState("");
  const [riskPredictors, setRiskPredictors] = useState("");
  const [riskThreshold, setRiskThreshold] = useState("0.2");
  const [riskResult, setRiskResult] = useState<any>(null);

  const [statsFile, setStatsFile] = useState<File | null>(null);
  const [statsFileName, setStatsFileName] = useState("");
  const [statsResult, setStatsResult] = useState<any>(null);

  const [networkSource, setNetworkSource] = useState<"manual" | "import">("manual");
  const [networkEdges, setNetworkEdges] = useState<NetworkEdge[]>([]);
  const [networkFileName, setNetworkFileName] = useState("");
  const [networkInput, setNetworkInput] = useState<NetworkEdge>({
    edgeId: "E1",
    source: "",
    target: "",
    edgeType: "movement",
    distanceKm: 0,
    movements: 1,
  });
  const [networkResult, setNetworkResult] = useState<any>(null);

  const [evoAnimalFile, setEvoAnimalFile] = useState<File | null>(null);
  const [evoAnimalFileName, setEvoAnimalFileName] = useState("");
  const [evoGeoFile, setEvoGeoFile] = useState<File | null>(null);
  const [evoGeoFileName, setEvoGeoFileName] = useState("");
  const [evoCircFile, setEvoCircFile] = useState<File | null>(null);
  const [evoCircFileName, setEvoCircFileName] = useState("");
  const [evoFastaFile, setEvoFastaFile] = useState<File | null>(null);
  const [evoFastaFileName, setEvoFastaFileName] = useState("");
  const [evoFastaText, setEvoFastaText] = useState("");
  const [evoAnimalRowsText, setEvoAnimalRowsText] = useState("");
  const [evoGeoRowsText, setEvoGeoRowsText] = useState("");
  const [evoCircRowsText, setEvoCircRowsText] = useState("");
  const [evoResult, setEvoResult] = useState<any>(null);

  const [log, setLog] = useState<string[]>([
    "> EGStat-N initialized.",
    "> RBPT removed from the UI.",
    "> Confirmatory Diagnosis automatically becomes I.",
    "> Interactive Mapbox heatmap supports normal and satellite views.",
  ]);

  const [setup, setSetup] = useState({
    Farm_ID: "Farm_1",
    Location: "",
    Latitude: "",
    Longitude: "",
    Date: today(),
    Total_Animals: "100",
    E: "0",
    Confirmatory_Diagnosis: "0",
    R: "0",
    Abortion_Count: "0",
    Pending_Culled: "0",
  });

  const [obs, setObs] = useState({
    Date: today(),
    E: "0",
    Confirmatory_Diagnosis: "0",
    Abortion_Count: "0",
    New_Animals_Moved_In: "0",
    New_Animals_Moved_Out: "0",
    Susceptible_In_From_MovedIn: "0",
    Susceptible_Out_From_MovedOut: "0",
    Pending_Culled: "0",
  });

  const farmIds = Array.from(new Set(farms.map((r) => r.Farm_ID)));

  const selectedRows = farms
    .filter((r) => r.Farm_ID === selectedFarmId)
    .sort((a, b) => a.Observation - b.Observation);

  const last = selectedRows.length > 0 ? selectedRows[selectedRows.length - 1] : null;

  const nextPreview = useMemo(() => {
    if (!last) return null;

    const movedIn = num(obs.New_Animals_Moved_In);
    const movedOut = num(obs.New_Animals_Moved_Out);
    const appliedCulled = last.Pending_Culled;
    const appliedQuarantined = last.Pending_Quarantined;
    const Nnew = last.Total_Animals - appliedCulled + movedIn - movedOut;
    const Enew = num(obs.E, last.E);
    const confirmatory = num(obs.Confirmatory_Diagnosis);
    const Inew = confirmatory;
    const Rnew = last.R;
    const pendingCulled = num(obs.Pending_Culled);
    const pendingQuarantined = Math.max(0, Inew - pendingCulled);
    const Snew = Nnew - (Enew + Inew + Rnew);

    return {
      Observation: last.Observation + 1,
      Nnew,
      Snew,
      Enew,
      Inew,
      Rnew,
      confirmatory,
      appliedCulled,
      appliedQuarantined,
      pendingCulled,
      pendingQuarantined,
      movedIn,
      movedOut,
    };
  }, [last, obs]);

  const farmSummary =
    transmissionResult?.analysis?.farmSummaries?.find((x: any) => x.farmId === selectedFarmId) ??
    transmissionResult?.analysis?.farmSummaries?.[0];

  function pushLog(lines: string[]) {
    setLog((old) => [...old, ...lines]);
  }

  function prepareNewFarm() {
    const newId = nextFarmId(farmIds);

    setSetup({
      Farm_ID: newId,
      Location: "",
      Latitude: "",
      Longitude: "",
      Date: today(),
      Total_Animals: "100",
      E: "0",
      Confirmatory_Diagnosis: "0",
      R: "0",
      Abortion_Count: "0",
      Pending_Culled: "0",
    });

    setSelectedFarmId("");
    setTStep("farm");
    setTransmissionMode("logic");
    pushLog([`> New farm entry form opened: ${newId}. Existing farms preserved.`]);
  }

  function createNewFarm() {
    const farmId = setup.Farm_ID.trim();

    if (!farmId) {
      pushLog(["> ERROR: Farm ID is required."]);
      return;
    }

    if (farmIds.includes(farmId)) {
      pushLog([`> ERROR: ${farmId} already exists. Use another Farm_ID.`]);
      return;
    }

    const N = num(setup.Total_Animals);
    const E = num(setup.E);
    const I = num(setup.Confirmatory_Diagnosis);
    const R = num(setup.R);
    const initialAbortions = num(setup.Abortion_Count);
    const pendingCulled = num(setup.Pending_Culled);
    const pendingQuarantined = Math.max(0, I - pendingCulled);
    const S = N - (E + I + R);

    if (N < 0 || S < 0) {
      pushLog([`> ERROR: Invalid initial SEIR. Calculated S=${S}.`]);
      return;
    }

    const initial: ObsRow = {
      Farm_ID: farmId,
      Location: setup.Location,
      Latitude: num(setup.Latitude, NaN),
      Longitude: num(setup.Longitude, NaN),
      Date: setup.Date || today(),
      Observation: 1,
      Total_Animals: N,
      S,
      E,
      I,
      R,
      Confirmatory_Diagnosis: I,
      Abortion_Count: initialAbortions,
      Pending_Culled: pendingCulled,
      Culled: 0,
      Pending_Quarantined: pendingQuarantined,
      Quarantined: 0,
      New_Animals_Moved_In: 0,
      New_Animals_Moved_Out: 0,
      Susceptible_In_From_MovedIn: 0,
      Susceptible_Out_From_MovedOut: 0,
    };

    setFarms((old) => [...old, initial]);
    setSelectedFarmId(farmId);
    setTransmissionResult(null);
    setTStep("observe");

    setObs({
      Date: today(),
      E: String(E),
      Confirmatory_Diagnosis: "0",
      Abortion_Count: "0",
      New_Animals_Moved_In: "0",
      New_Animals_Moved_Out: "0",
      Susceptible_In_From_MovedIn: "0",
      Susceptible_Out_From_MovedOut: "0",
      Pending_Culled: "0",
    });

    pushLog([
      `> Farm created: ${farmId}.`,
      `> Initial observation: N=${N}, S=${S}, E=${E}, I=${I}, R=${R}, abortions=${initialAbortions}.`,
      `> Confirmatory Diagnosis=${I}; therefore I=${I}.`,
      `> Coordinates saved: lat=${initial.Latitude}, lon=${initial.Longitude}.`,
    ]);
  }

  function addObservation() {
    if (!last || !nextPreview) {
      pushLog(["> ERROR: Select or create a farm first."]);
      return;
    }

    const susIn = num(obs.Susceptible_In_From_MovedIn);
    const susOut = num(obs.Susceptible_Out_From_MovedOut);

    if (susIn > nextPreview.movedIn) {
      pushLog(["> ERROR: Susceptible moved-in cannot exceed total moved-in."]);
      return;
    }

    if (susOut > nextPreview.movedOut) {
      pushLog(["> ERROR: Susceptible moved-out cannot exceed total moved-out."]);
      return;
    }

    if (nextPreview.Nnew < 0 || nextPreview.Snew < 0) {
      pushLog([
        `> ERROR: Invalid observation. New N=${nextPreview.Nnew}, New S=${nextPreview.Snew}.`,
      ]);
      return;
    }

    const newRow: ObsRow = {
      Farm_ID: last.Farm_ID,
      Location: last.Location,
      Latitude: last.Latitude,
      Longitude: last.Longitude,
      Date: obs.Date || today(),
      Observation: nextPreview.Observation,
      Total_Animals: nextPreview.Nnew,
      S: nextPreview.Snew,
      E: nextPreview.Enew,
      I: nextPreview.Inew,
      R: nextPreview.Rnew,
      Confirmatory_Diagnosis: nextPreview.confirmatory,
      Abortion_Count: num(obs.Abortion_Count),
      Pending_Culled: nextPreview.pendingCulled,
      Culled: nextPreview.appliedCulled,
      Pending_Quarantined: nextPreview.pendingQuarantined,
      Quarantined: nextPreview.appliedQuarantined,
      New_Animals_Moved_In: nextPreview.movedIn,
      New_Animals_Moved_Out: nextPreview.movedOut,
      Susceptible_In_From_MovedIn: susIn,
      Susceptible_Out_From_MovedOut: susOut,
    };

    setFarms((old) => [...old, newRow]);
    setTransmissionResult(null);

    setObs({
      Date: today(),
      E: String(newRow.E),
      Confirmatory_Diagnosis: "0",
      Abortion_Count: "0",
      New_Animals_Moved_In: "0",
      New_Animals_Moved_Out: "0",
      Susceptible_In_From_MovedIn: "0",
      Susceptible_Out_From_MovedOut: "0",
      Pending_Culled: "0",
    });

    pushLog([
      `> Observation ${newRow.Observation} added for ${newRow.Farm_ID}.`,
      `> N_new = ${last.Total_Animals} - previous Pending_Culled ${last.Pending_Culled} + moved_in ${nextPreview.movedIn} - moved_out ${nextPreview.movedOut} = ${newRow.Total_Animals}.`,
      `> Confirmatory Diagnosis=${newRow.Confirmatory_Diagnosis}; therefore I=${newRow.I}.`,
    ]);
  }

  function deleteFarm(farmId: string) {
    setFarms((old) => old.filter((r) => r.Farm_ID !== farmId));
    if (selectedFarmId === farmId) setSelectedFarmId("");
    setTransmissionResult(null);
    pushLog([`> Farm removed from current session: ${farmId}.`]);
  }

  function clearAllFarms() {
    setFarms([]);
    setSelectedFarmId("");
    setTransmissionResult(null);
    pushLog(["> All farm observations cleared."]);
  }

  async function runTransmissionAnalysis(goToMap = false) {
    const formData = new FormData();

    formData.append("module", "transmission");
    formData.append("mode", transmissionMode);
    formData.append("infectiousPeriodDays", infectiousPeriodDays);

    if (transmissionMode === "import") {
      if (!transmissionFile) {
        pushLog(["> ERROR: Upload transmission CSV first."]);
        return;
      }

      formData.append("file", transmissionFile);
    } else {
      if (farms.length === 0) {
        pushLog(["> ERROR: Create at least one farm first."]);
        return;
      }

      formData.append("rows", JSON.stringify(farms));
    }

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      pushLog([`> ERROR: ${data.error}`]);
      return;
    }

    setTransmissionResult(data);
    setTStep(goToMap ? "map" : "analysis");

    pushLog([
      "> Transmission dynamics calculated.",
      `> Total farms=${data.analysis.totalFarms}; overall N=${data.analysis.overallSEIR.N}; overall I=${data.analysis.overallSEIR.I}.`,
      `> Heatmap features=${data.analysis.heatmapGeoJSON?.features?.length ?? 0}.`,
    ]);
  }

  async function runRiskAnalysis() {
    if (!riskFile || !riskOutcome || !riskPredictors) {
      pushLog(["> ERROR: Risk file, outcome, and predictors are required."]);
      return;
    }

    const formData = new FormData();

    formData.append("module", "risk");
    formData.append("file", riskFile);
    formData.append("outcome", riskOutcome);
    formData.append("predictors", riskPredictors);
    formData.append("threshold", riskThreshold);

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      pushLog([`> ERROR: ${data.error}`]);
      return;
    }

    setRiskResult(data);
    pushLog(["> Risk-factor analysis completed."]);
  }

  async function runStatistics() {
    if (!statsFile) {
      pushLog(["> ERROR: Upload a statistics CSV file first."]);
      return;
    }

    const formData = new FormData();

    formData.append("module", "statistics");
    formData.append("file", statsFile);

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      pushLog([`> ERROR: ${data.error}`]);
      return;
    }

    setStatsResult(data);
    pushLog(["> Statistical summary completed."]);
  }

  async function importNetworkFile(file: File) {
    const rows = await readSpreadsheetLikeFile(file);
    const edges = normalizeExcelNetworkRows(rows);

    setNetworkEdges(edges);
    setNetworkFileName(file.name);
    setNetworkResult(null);

    pushLog([`> Network file imported: ${file.name}. Edges=${edges.length}.`]);
  }

  function addManualNetworkEdge() {
    if (!networkInput.source || !networkInput.target) {
      pushLog(["> ERROR: Source and target nodes are required."]);
      return;
    }

    setNetworkEdges((old) => [...old, networkInput]);
    setNetworkInput({
      edgeId: `E${networkEdges.length + 2}`,
      source: "",
      target: "",
      edgeType: "movement",
      distanceKm: 0,
      movements: 1,
    });
    setNetworkResult(null);
    pushLog([`> Network edge added: ${networkInput.source} → ${networkInput.target}.`]);
  }

  async function runNetworkAnalysis() {
    if (networkEdges.length === 0) {
      pushLog(["> ERROR: Add or import network edges first."]);
      return;
    }

    const formData = new FormData();

    formData.append("module", "network");
    formData.append("source", "manual");
    formData.append("edges", JSON.stringify(networkEdges));

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      pushLog([`> ERROR: ${data.error}`]);
      return;
    }

    setNetworkResult(data);
    pushLog([
      "> Network analysis completed.",
      `> Nodes=${data.network.statistics.nodeCount}; Edges=${data.network.statistics.edgeCount}.`,
    ]);
  }

  async function runEvolutionaryAnalysis() {
    const formData = new FormData();

    formData.append("module", "evolutionary");

    if (evoAnimalFile) formData.append("animalFile", evoAnimalFile);
    if (evoGeoFile) formData.append("geoFile", evoGeoFile);
    if (evoCircFile) formData.append("circumstantialFile", evoCircFile);
    if (evoFastaFile) formData.append("fastaFile", evoFastaFile);

    if (evoFastaText.trim()) formData.append("fastaText", evoFastaText);

    if (evoAnimalRowsText.trim()) {
      try {
        JSON.parse(evoAnimalRowsText);
        formData.append("animalRows", evoAnimalRowsText);
      } catch {
        pushLog(["> ERROR: Animal-level manual JSON is invalid."]);
        return;
      }
    }

    if (evoGeoRowsText.trim()) {
      try {
        JSON.parse(evoGeoRowsText);
        formData.append("geoRows", evoGeoRowsText);
      } catch {
        pushLog(["> ERROR: Geospatial/temporal manual JSON is invalid."]);
        return;
      }
    }

    if (evoCircRowsText.trim()) {
      try {
        JSON.parse(evoCircRowsText);
        formData.append("circumstantialRows", evoCircRowsText);
      } catch {
        pushLog(["> ERROR: Circumstantial manual JSON is invalid."]);
        return;
      }
    }

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      pushLog([`> ERROR: ${data.error}`]);
      return;
    }

    setEvoResult(data);
    pushLog([
      "> Evolutionary analysis completed.",
      `> Sequences analyzed=${data.evolutionary?.genomics?.count ?? 0}.`,
      `> Risk category=${data.evolutionary?.integratedSummary?.riskCategory ?? "NA"}.`,
    ]);
  }

  function downloadJSON(data: any, name: string) {
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = name;
    a.click();

    URL.revokeObjectURL(url);
  }

  function downloadCSV(text: string, name: string) {
    const blob = new Blob([text], {
      type: "text/csv;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = name;
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <section className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.3em] text-cyan-300">
            Research Tools
          </p>

          <h1 className="mb-6 text-5xl font-black">EGStat-N</h1>

          <p className="mx-auto max-w-4xl text-lg leading-8 text-slate-300">
            Epidemiological Graphics and Statistics Tool for Networks —
            transmission dynamics, interactive heatmap mapping, risk-factor
            analysis, network analysis, and evolutionary analysis for animal,
            spatial, genomic, and circumstantial evidence.
          </p>
        </div>

        <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="mb-4 text-3xl font-black text-cyan-300">
                Launch analysis workspace
              </h2>

              <p className="mb-6 leading-8 text-slate-300">
                The transmission module uses Confirmatory Diagnosis as I,
                removes RBPT terms, calculates SEIR dynamics, and exports
                heatmap-ready Mapbox data for normal and satellite views.
              </p>

              <button
                onClick={() => setOpen(true)}
                className="rounded-2xl bg-cyan-400 px-7 py-4 font-black text-slate-950 transition hover:-translate-y-1 hover:bg-white"
              >
                Open Tool Window
              </button>
            </div>

            <div className="rounded-3xl border border-cyan-300/20 bg-slate-900/80 p-6">
              <p className="mb-3 text-sm font-bold text-cyan-300">Modules</p>

              <div className="grid gap-3 text-sm font-semibold text-slate-300">
                <div className="rounded-xl bg-white/5 p-3">
                  Multi-farm SEIR Transmission
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  Interactive Heatmap + Satellite View
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  Risk Factor and Statistics
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  Network Movement Analysis
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  Evolutionary Analysis
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur">
          <div
            className={`border border-white/10 bg-slate-950 shadow-2xl ${
              fullscreen
                ? "h-full w-full rounded-none"
                : "h-[92vh] w-full max-w-7xl rounded-[2rem]"
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-2xl font-black text-cyan-300">
                  EGStat-N Analysis Window
                </h2>
                <p className="text-sm text-slate-400">
                  Transmission • Heatmap • Risk • Statistics • Network • Evolutionary
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setFullscreen(!fullscreen)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-cyan-300 hover:text-cyan-300"
                >
                  {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>

                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="h-[calc(100%-88px)] overflow-auto p-6">
              <div className="mb-6 grid gap-3 md:grid-cols-5">
                <TabButton
                  label="Transmission"
                  active={mainTab === "transmission"}
                  onClick={() => setMainTab("transmission")}
                />

                <TabButton
                  label="Risk Analysis"
                  active={mainTab === "risk"}
                  onClick={() => setMainTab("risk")}
                />

                <TabButton
                  label="Statistics"
                  active={mainTab === "statistics"}
                  onClick={() => setMainTab("statistics")}
                />

                <TabButton
                  label="Network"
                  active={mainTab === "network"}
                  onClick={() => setMainTab("network")}
                />

                <TabButton
                  label="Evolutionary"
                  active={mainTab === "evolutionary"}
                  onClick={() => setMainTab("evolutionary")}
                />
              </div>

              {mainTab === "transmission" && (
                <TransmissionSection
                  tStep={tStep}
                  setTStep={setTStep}
                  transmissionMode={transmissionMode}
                  setTransmissionMode={setTransmissionMode}
                  transmissionFileName={transmissionFileName}
                  setTransmissionFile={setTransmissionFile}
                  setTransmissionFileName={setTransmissionFileName}
                  infectiousPeriodDays={infectiousPeriodDays}
                  setInfectiousPeriodDays={setInfectiousPeriodDays}
                  setup={setup}
                  setSetup={setSetup}
                  obs={obs}
                  setObs={setObs}
                  createNewFarm={createNewFarm}
                  prepareNewFarm={prepareNewFarm}
                  addObservation={addObservation}
                  deleteFarm={deleteFarm}
                  clearAllFarms={clearAllFarms}
                  runTransmissionAnalysis={runTransmissionAnalysis}
                  selectedFarmId={selectedFarmId}
                  setSelectedFarmId={setSelectedFarmId}
                  farmIds={farmIds}
                  farms={farms}
                  selectedRows={selectedRows}
                  last={last}
                  nextPreview={nextPreview}
                  transmissionResult={transmissionResult}
                  farmSummary={farmSummary}
                  downloadJSON={downloadJSON}
                  downloadCSV={downloadCSV}
                  log={log}
                />
              )}

              {mainTab === "risk" && (
                <RiskSection
                  riskFileName={riskFileName}
                  setRiskFile={setRiskFile}
                  setRiskFileName={setRiskFileName}
                  riskOutcome={riskOutcome}
                  setRiskOutcome={setRiskOutcome}
                  riskPredictors={riskPredictors}
                  setRiskPredictors={setRiskPredictors}
                  riskThreshold={riskThreshold}
                  setRiskThreshold={setRiskThreshold}
                  riskResult={riskResult}
                  runRiskAnalysis={runRiskAnalysis}
                  downloadJSON={downloadJSON}
                />
              )}

              {mainTab === "statistics" && (
                <StatisticsSection
                  statsFileName={statsFileName}
                  setStatsFile={setStatsFile}
                  setStatsFileName={setStatsFileName}
                  statsResult={statsResult}
                  runStatistics={runStatistics}
                  downloadJSON={downloadJSON}
                />
              )}

              {mainTab === "network" && (
                <NetworkSection
                  networkSource={networkSource}
                  setNetworkSource={setNetworkSource}
                  networkInput={networkInput}
                  setNetworkInput={setNetworkInput}
                  networkEdges={networkEdges}
                  networkFileName={networkFileName}
                  importNetworkFile={importNetworkFile}
                  addManualNetworkEdge={addManualNetworkEdge}
                  runNetworkAnalysis={runNetworkAnalysis}
                  networkResult={networkResult}
                  downloadJSON={downloadJSON}
                />
              )}

              {mainTab === "evolutionary" && (
                <EvolutionarySection
                  evoAnimalFileName={evoAnimalFileName}
                  setEvoAnimalFile={setEvoAnimalFile}
                  setEvoAnimalFileName={setEvoAnimalFileName}
                  evoGeoFileName={evoGeoFileName}
                  setEvoGeoFile={setEvoGeoFile}
                  setEvoGeoFileName={setEvoGeoFileName}
                  evoCircFileName={evoCircFileName}
                  setEvoCircFile={setEvoCircFile}
                  setEvoCircFileName={setEvoCircFileName}
                  evoFastaFileName={evoFastaFileName}
                  setEvoFastaFile={setEvoFastaFile}
                  setEvoFastaFileName={setEvoFastaFileName}
                  evoFastaText={evoFastaText}
                  setEvoFastaText={setEvoFastaText}
                  evoAnimalRowsText={evoAnimalRowsText}
                  setEvoAnimalRowsText={setEvoAnimalRowsText}
                  evoGeoRowsText={evoGeoRowsText}
                  setEvoGeoRowsText={setEvoGeoRowsText}
                  evoCircRowsText={evoCircRowsText}
                  setEvoCircRowsText={setEvoCircRowsText}
                  evoResult={evoResult}
                  runEvolutionaryAnalysis={runEvolutionaryAnalysis}
                  downloadJSON={downloadJSON}
                />
              )}

              <div className="mt-8">
                <Console log={log} />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function TransmissionSection(props: any) {
  const {
    tStep,
    setTStep,
    transmissionMode,
    setTransmissionMode,
    transmissionFileName,
    setTransmissionFile,
    setTransmissionFileName,
    infectiousPeriodDays,
    setInfectiousPeriodDays,
    setup,
    setSetup,
    obs,
    setObs,
    createNewFarm,
    prepareNewFarm,
    addObservation,
    deleteFarm,
    clearAllFarms,
    runTransmissionAnalysis,
    selectedFarmId,
    setSelectedFarmId,
    farmIds,
    farms,
    last,
    nextPreview,
    transmissionResult,
    farmSummary,
    downloadJSON,
    downloadCSV,
    log,
  } = props;

  return (
    <section>
      <div className="mb-6 grid gap-3 md:grid-cols-5">
        <TabButton label="Create Farm" active={tStep === "farm"} onClick={() => setTStep("farm")} />
        <TabButton label="Observation" active={tStep === "observe"} onClick={() => setTStep("observe")} />
        <TabButton label="Data Table" active={tStep === "table"} onClick={() => setTStep("table")} />
        <TabButton label="Analysis" active={tStep === "analysis"} onClick={() => setTStep("analysis")} />
        <TabButton label="Heatmap Map" active={tStep === "map"} onClick={() => setTStep("map")} />
      </div>

      <div className="mb-6 rounded-3xl border border-white/10 bg-white/[0.05] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setTransmissionMode("logic")}
            className={`rounded-xl px-4 py-2 text-sm font-black ${
              transmissionMode === "logic" ? "bg-cyan-400 text-slate-950" : "bg-white/10"
            }`}
          >
            Logic-wise Entry
          </button>

          <button
            onClick={() => setTransmissionMode("import")}
            className={`rounded-xl px-4 py-2 text-sm font-black ${
              transmissionMode === "import" ? "bg-cyan-400 text-slate-950" : "bg-white/10"
            }`}
          >
            CSV Import
          </button>

          <button
            onClick={prepareNewFarm}
            className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-white"
          >
            + Add New Farm
          </button>

          <label className="ml-auto text-sm text-slate-300">Infectious period</label>

          <input
            value={infectiousPeriodDays}
            onChange={(e) => setInfectiousPeriodDays(e.target.value)}
            className="w-24 rounded-xl border border-white/10 bg-slate-900 px-3 py-2"
          />

          <span className="text-sm text-slate-400">days</span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <ResultCard title="Farms stored" value={String(farmIds.length)} />
          <ResultCard title="Observations stored" value={String(farms.length)} />
          <ResultCard title="Selected farm" value={selectedFarmId || "None"} />
          <ResultCard title="Input mode" value={transmissionMode} />
        </div>

        {transmissionMode === "import" && (
          <div className="mt-4">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const selected = e.target.files?.[0] || null;
                setTransmissionFile(selected);
                setTransmissionFileName(selected?.name || "");
              }}
              className="block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
            />

            {transmissionFileName && (
              <p className="mt-2 text-sm text-cyan-300">Loaded: {transmissionFileName}</p>
            )}

            <button
              onClick={() => runTransmissionAnalysis(false)}
              className="mt-3 rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950"
            >
              Run Imported Analysis
            </button>
          </div>
        )}
      </div>

      {tStep === "farm" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-black text-cyan-300">Create New Farm</h3>
                <p className="text-sm text-slate-400">
                  RBPT is removed. Confirmatory Diagnosis is automatically treated as I.
                </p>
              </div>

              <button
                onClick={prepareNewFarm}
                className="rounded-xl bg-emerald-400 px-4 py-2 font-black text-slate-950 hover:bg-white"
              >
                Prepare Another Farm
              </button>
            </div>

            <div className="mb-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-sm leading-7 text-slate-300">
              Initial rule: Culled=0, Quarantined=0, Pending_Quarantined=max(0, I - Pending_Culled),
              and S=N-(E+I+R). Lat/lon are saved for the heatmap.
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(setup).map(([key, value]: any) => (
                <Input
                  key={key}
                  label={key}
                  value={value}
                  onChange={(v) => setSetup({ ...setup, [key]: v })}
                />
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <ResultCard title="Calculated I" value={String(num(setup.Confirmatory_Diagnosis))} />
              <ResultCard
                title="Calculated S"
                value={String(num(setup.Total_Animals) - (num(setup.E) + num(setup.Confirmatory_Diagnosis) + num(setup.R)))}
              />
              <ResultCard title="Abortions" value={String(num(setup.Abortion_Count))} />
              <ResultCard
                title="Pending Quarantined"
                value={String(Math.max(0, num(setup.Confirmatory_Diagnosis) - num(setup.Pending_Culled)))}
              />
            </div>

            <button
              onClick={createNewFarm}
              className="mt-6 rounded-2xl bg-cyan-400 px-7 py-4 font-black text-slate-950 hover:bg-white"
            >
              Create Farm and Preserve Previous Data
            </button>

            {farmIds.length > 0 && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-4">
                <h4 className="mb-3 font-black text-cyan-300">Existing Farms</h4>
                <div className="flex flex-wrap gap-2">
                  {farmIds.map((id: string) => (
                    <button
                      key={id}
                      onClick={() => {
                        setSelectedFarmId(id);
                        setTStep("observe");
                      }}
                      className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-cyan-300 hover:text-cyan-300"
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Console log={log} />
        </div>
      )}

      {tStep === "observe" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-black text-cyan-300">Add Farm-wise Observation</h3>
                <p className="text-sm text-slate-400">
                  Enter Confirmatory Diagnosis; it will automatically become I.
                </p>
              </div>

              <button
                onClick={prepareNewFarm}
                className="rounded-xl bg-emerald-400 px-4 py-2 font-black text-slate-950 hover:bg-white"
              >
                + Add New Farm
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-3">
              <select
                value={selectedFarmId}
                onChange={(e) => setSelectedFarmId(e.target.value)}
                className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3"
              >
                <option value="">Select farm</option>
                {farmIds.map((id: string) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setTStep("table")}
                className="rounded-xl border border-white/10 px-4 py-3 font-bold hover:border-cyan-300"
              >
                View Farm-wise Table
              </button>
            </div>

            {last && (
              <div className="mb-6 grid gap-4 md:grid-cols-4">
                <ResultCard title="Last N" value={String(last.Total_Animals)} />
                <ResultCard title="Last I" value={String(last.I)} />
                <ResultCard title="Last Confirmatory" value={String(last.Confirmatory_Diagnosis)} />
                <ResultCard title="Previous Pending Culled" value={String(last.Pending_Culled)} />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(obs).map(([key, value]: any) => (
                <Input
                  key={key}
                  label={key}
                  value={value}
                  onChange={(v) => setObs({ ...obs, [key]: v })}
                />
              ))}
            </div>

            {nextPreview && (
              <div className="mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
                <h4 className="mb-4 text-lg font-black text-cyan-300">
                  Auto-calculated Next Observation
                </h4>

                <div className="grid gap-4 md:grid-cols-4">
                  <ResultCard title="New N" value={String(nextPreview.Nnew)} />
                  <ResultCard title="New S" value={String(nextPreview.Snew)} />
                  <ResultCard title="New E" value={String(nextPreview.Enew)} />
                  <ResultCard title="New I" value={String(nextPreview.Inew)} />
                  <ResultCard title="Confirmatory Diagnosis" value={String(nextPreview.confirmatory)} />
                  <ResultCard title="Applied Culled" value={String(nextPreview.appliedCulled)} />
                  <ResultCard title="Applied Quarantined" value={String(nextPreview.appliedQuarantined)} />
                  <ResultCard title="New Pending Quarantined" value={String(nextPreview.pendingQuarantined)} />
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={addObservation}
                className="rounded-2xl bg-cyan-400 px-7 py-4 font-black text-slate-950 hover:bg-white"
              >
                Add Observation to Selected Farm
              </button>

              <button
                onClick={() => runTransmissionAnalysis(false)}
                className="rounded-2xl bg-blue-500 px-7 py-4 font-black text-white hover:bg-blue-600"
              >
                Calculate SEIR Dynamics
              </button>

              <button
                onClick={() => runTransmissionAnalysis(true)}
                className="rounded-2xl bg-emerald-400 px-7 py-4 font-black text-slate-950 hover:bg-white"
              >
                Build Heatmap
              </button>
            </div>
          </Panel>

          <Console log={log} />
        </div>
      )}

      {tStep === "table" && (
        <Panel>
          <div className="mb-5 flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="text-2xl font-black text-cyan-300">
                Farm-wise Observation Table
              </h3>
              <p className="text-sm text-slate-400">
                RBPT removed. Only I and Confirmatory Diagnosis are shown.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={prepareNewFarm}
                className="rounded-xl bg-emerald-400 px-4 py-2 font-black text-slate-950 hover:bg-white"
              >
                + Add New Farm
              </button>

              <button
                onClick={() => runTransmissionAnalysis(false)}
                className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-slate-950 hover:bg-white"
              >
                Calculate Dynamics
              </button>

              <button
                onClick={() => downloadCSV(csvFromRows(farms), "egstat_n_transmission_rows.csv")}
                className="rounded-xl border border-white/10 px-4 py-2 font-black hover:border-cyan-300"
              >
                Export CSV
              </button>

              <button
                onClick={clearAllFarms}
                className="rounded-xl bg-red-500 px-4 py-2 font-black text-white hover:bg-red-600"
              >
                Clear All
              </button>
            </div>
          </div>

          <ObservationTable
            rows={farms}
            deleteFarm={deleteFarm}
            setSelectedFarmId={setSelectedFarmId}
            setTStep={setTStep}
          />
        </Panel>
      )}

      {tStep === "analysis" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <div className="mb-5 flex flex-wrap justify-between gap-3">
              <h3 className="text-2xl font-black text-cyan-300">
                Overall SEIR Dynamics
              </h3>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setTStep("map")}
                  className="rounded-xl bg-emerald-400 px-4 py-2 font-black text-slate-950 hover:bg-white"
                >
                  View Heatmap
                </button>

                <button
                  onClick={() => downloadJSON(transmissionResult, "egstat_n_transmission.json")}
                  className="rounded-xl bg-blue-500 px-4 py-2 font-black text-white"
                >
                  Download JSON
                </button>
              </div>
            </div>

            {transmissionResult ? (
              <>
                <div className="grid gap-4 md:grid-cols-5">
                  <ResultCard title="Overall N" value={String(transmissionResult.analysis.overallSEIR.N)} />
                  <ResultCard title="Overall S" value={String(transmissionResult.analysis.overallSEIR.S)} />
                  <ResultCard title="Overall E" value={String(transmissionResult.analysis.overallSEIR.E)} />
                  <ResultCard title="Overall I" value={String(transmissionResult.analysis.overallSEIR.I)} />
                  <ResultCard title="Overall R" value={String(transmissionResult.analysis.overallSEIR.R)} />
                  <ResultCard title="Overall Prevalence" value={percent(transmissionResult.analysis.overallSEIR.overallPrevalence)} />
                  <ResultCard title="Farms" value={String(transmissionResult.analysis.totalFarms)} />
                  <ResultCard title="Observations" value={String(transmissionResult.analysis.totalObservations)} />
                  <ResultCard title="Abortions" value={String(transmissionResult.analysis.overallTotals.totalAbortions)} />
                  <ResultCard title="Selected Farm R0" value={valueText(farmSummary?.estimatedR0)} />
                </div>

                {transmissionResult.analysis.validation?.warnings?.length > 0 && (
                  <div className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                    <p className="font-black">Warnings</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {transmissionResult.analysis.validation.warnings.map((w: string, i: number) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                  <TrendBars title="Overall I Trend" data={transmissionResult.analysis.visualization.overallTrend ?? []} valueKey="I" labelKey="observation" />
                  <TrendBars title="Overall Confirmatory Diagnosis Trend" data={transmissionResult.analysis.visualization.overallTrend ?? []} valueKey="confirmatoryDiagnosis" labelKey="observation" />
                  <RankingBars title="Prevalence Ranking" data={transmissionResult.analysis.visualization.prevalenceBars ?? []} labelKey="farmId" valueKey="prevalence" percentValue />
                  <RankingBars title="Estimated R0 Ranking" data={transmissionResult.analysis.visualization.r0Bars ?? []} labelKey="farmId" valueKey="r0" />
                </div>

                <pre className="mt-6 max-h-96 overflow-auto rounded-2xl bg-black p-5 text-sm text-slate-300">
                  {JSON.stringify(transmissionResult.analysis, null, 2)}
                </pre>
              </>
            ) : (
              <p className="rounded-2xl bg-slate-900 p-6 text-slate-300">
                Run transmission analysis first.
              </p>
            )}
          </Panel>

          <Console log={log} />
        </div>
      )}

      {tStep === "map" && (
        <Panel>
          <div className="mb-5 flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="text-2xl font-black text-cyan-300">
                Interactive Transmission Heatmap
              </h3>

              <p className="text-sm text-slate-400">
                Normal and satellite views, heat layer, clickable outbreak points, and automatic map bounds.
              </p>
            </div>

            <button
              onClick={() => runTransmissionAnalysis(true)}
              className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-slate-950 hover:bg-white"
            >
              Refresh Map Data
            </button>
          </div>

          <MapboxHeatMap
            heatmapGeoJSON={transmissionResult?.analysis?.heatmapGeoJSON}
            mapConfig={transmissionResult?.analysis?.mapConfig}
          />
        </Panel>
      )}
    </section>
  );
}

function RiskSection(props: any) {
  const {
    riskFileName,
    setRiskFile,
    setRiskFileName,
    riskOutcome,
    setRiskOutcome,
    riskPredictors,
    setRiskPredictors,
    riskThreshold,
    setRiskThreshold,
    riskResult,
    runRiskAnalysis,
    downloadJSON,
  } = props;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel>
        <h3 className="mb-4 text-2xl font-black text-cyan-300">
          Risk Factor Analysis
        </h3>

        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setRiskFile(f);
            setRiskFileName(f?.name || "");
          }}
          className="block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
        />

        {riskFileName && <p className="mt-2 text-sm text-cyan-300">Loaded: {riskFileName}</p>}

        <div className="mt-5 grid gap-4">
          <Input label="Outcome variable" value={riskOutcome} onChange={setRiskOutcome} />
          <Input label="Predictors comma-separated" value={riskPredictors} onChange={setRiskPredictors} />
          <Input label="Selection threshold" value={riskThreshold} onChange={setRiskThreshold} />
        </div>

        <button
          onClick={runRiskAnalysis}
          className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 hover:bg-white"
        >
          Run Risk Analysis
        </button>

        {riskResult && (
          <button
            onClick={() => downloadJSON(riskResult, "egstat_n_risk_analysis.json")}
            className="mt-4 w-full rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-600"
          >
            Download JSON
          </button>
        )}
      </Panel>

      <Panel className="lg:col-span-2">
        <h3 className="mb-4 text-2xl font-black text-cyan-300">Risk Results</h3>

        {riskResult ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <ResultCard title="Predictors" value={String(riskResult.risk.summary.totalPredictors)} />
              <ResultCard title="p < 0.05" value={String(riskResult.risk.summary.significantAt005)} />
              <ResultCard title="Selected" value={String(riskResult.risk.summary.selectedForMultivariable)} />
              <ResultCard title="Strongest" value={riskResult.risk.summary.strongestPredictor?.variable ?? "NA"} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <RankingBars title="p-value Ranking" data={riskResult.risk.visualization?.pValueBars ?? []} labelKey="variable" valueKey="pValue" inverse />
              <RiskForestPlot data={riskResult.risk.visualization?.forestData ?? []} />
            </div>

            <pre className="mt-6 max-h-96 overflow-auto rounded-2xl bg-black p-5 text-sm text-slate-300">
              {JSON.stringify(riskResult.risk, null, 2)}
            </pre>
          </>
        ) : (
          <p className="rounded-2xl bg-slate-900 p-6 text-slate-300">
            Upload CSV and run analysis.
          </p>
        )}
      </Panel>
    </div>
  );
}

function StatisticsSection(props: any) {
  const {
    statsFileName,
    setStatsFile,
    setStatsFileName,
    statsResult,
    runStatistics,
    downloadJSON,
  } = props;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel>
        <h3 className="mb-4 text-2xl font-black text-cyan-300">
          Statistical Summary
        </h3>

        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setStatsFile(f);
            setStatsFileName(f?.name || "");
          }}
          className="block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
        />

        {statsFileName && <p className="mt-2 text-sm text-cyan-300">Loaded: {statsFileName}</p>}

        <button
          onClick={runStatistics}
          className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 hover:bg-white"
        >
          Run Statistical Summary
        </button>

        {statsResult && (
          <button
            onClick={() => downloadJSON(statsResult, "egstat_n_statistics.json")}
            className="mt-4 w-full rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-600"
          >
            Download JSON
          </button>
        )}
      </Panel>

      <Panel className="lg:col-span-2">
        <h3 className="mb-4 text-2xl font-black text-cyan-300">Statistical Results</h3>

        {statsResult ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <ResultCard title="Rows" value={String(statsResult.statistics.dataset.rows)} />
              <ResultCard title="Columns" value={String(statsResult.statistics.dataset.columns)} />
              <ResultCard title="Numeric Variables" value={String(statsResult.statistics.numericColumns.length)} />
            </div>

            <StatsTable rows={statsResult.statistics.descriptiveStatistics ?? []} />

            <pre className="mt-6 max-h-96 overflow-auto rounded-2xl bg-black p-5 text-sm text-slate-300">
              {JSON.stringify(statsResult.statistics, null, 2)}
            </pre>
          </>
        ) : (
          <p className="rounded-2xl bg-slate-900 p-6 text-slate-300">
            Upload CSV and run statistical summary.
          </p>
        )}
      </Panel>
    </div>
  );
}

function NetworkSection(props: any) {
  const {
    networkSource,
    setNetworkSource,
    networkInput,
    setNetworkInput,
    networkEdges,
    networkFileName,
    importNetworkFile,
    addManualNetworkEdge,
    runNetworkAnalysis,
    networkResult,
    downloadJSON,
  } = props;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel>
        <h3 className="mb-4 text-2xl font-black text-cyan-300">
          Network Data Input
        </h3>

        <div className="mb-4 flex gap-3">
          <button
            onClick={() => setNetworkSource("manual")}
            className={`rounded-xl px-4 py-2 font-black ${
              networkSource === "manual" ? "bg-cyan-400 text-slate-950" : "bg-white/10"
            }`}
          >
            Manual
          </button>

          <button
            onClick={() => setNetworkSource("import")}
            className={`rounded-xl px-4 py-2 font-black ${
              networkSource === "import" ? "bg-cyan-400 text-slate-950" : "bg-white/10"
            }`}
          >
            Excel/CSV Import
          </button>
        </div>

        {networkSource === "manual" ? (
          <div className="grid gap-3">
            <Input label="Edge ID" value={networkInput.edgeId} onChange={(v) => setNetworkInput({ ...networkInput, edgeId: v })} />
            <Input label="From Node" value={networkInput.source} onChange={(v) => setNetworkInput({ ...networkInput, source: v })} />
            <Input label="To Node" value={networkInput.target} onChange={(v) => setNetworkInput({ ...networkInput, target: v })} />
            <Input label="Edge Type" value={networkInput.edgeType} onChange={(v) => setNetworkInput({ ...networkInput, edgeType: v })} />
            <Input label="Road Distance km" value={String(networkInput.distanceKm)} onChange={(v) => setNetworkInput({ ...networkInput, distanceKm: num(v) })} />
            <Input label="Avg Movements" value={String(networkInput.movements)} onChange={(v) => setNetworkInput({ ...networkInput, movements: num(v, 1) })} />

            <button
              onClick={addManualNetworkEdge}
              className="rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 hover:bg-white"
            >
              Add Edge
            </button>
          </div>
        ) : (
          <div>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importNetworkFile(f);
              }}
              className="block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
            />

            {networkFileName && <p className="mt-2 text-sm text-cyan-300">Loaded: {networkFileName}</p>}
          </div>
        )}

        <button
          onClick={runNetworkAnalysis}
          className="mt-6 w-full rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-600"
        >
          Run Network Analysis
        </button>
      </Panel>

      <Panel className="lg:col-span-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-2xl font-black text-cyan-300">Network Results</h3>

          {networkResult && (
            <button
              onClick={() => downloadJSON(networkResult, "egstat_n_network.json")}
              className="rounded-xl bg-blue-500 px-4 py-2 font-black"
            >
              Download JSON
            </button>
          )}
        </div>

        {networkResult ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <ResultCard title="Nodes" value={String(networkResult.network.statistics.nodeCount)} />
              <ResultCard title="Edges" value={String(networkResult.network.statistics.edgeCount)} />
              <ResultCard title="Density" value={valueText(networkResult.network.statistics.density)} />
              <ResultCard title="Top Node" value={networkResult.network.statistics.highestDegreeNode?.node ?? "NA"} />
            </div>

            <NetworkPlot data={networkResult.network} />
            <RankingBars title="Node Degree Ranking" data={networkResult.network.visualization?.degreeBars ?? []} labelKey="node" valueKey="degree" />
          </>
        ) : (
          <>
            <p className="mb-4 rounded-2xl bg-slate-900 p-4 text-slate-300">
              Edges loaded: {networkEdges.length}
            </p>

            <NetworkEdgeTable edges={networkEdges} />
          </>
        )}
      </Panel>
    </div>
  );
}

function EvolutionarySection(props: any) {
  const {
    evoAnimalFileName,
    setEvoAnimalFile,
    setEvoAnimalFileName,
    evoGeoFileName,
    setEvoGeoFile,
    setEvoGeoFileName,
    evoCircFileName,
    setEvoCircFile,
    setEvoCircFileName,
    evoFastaFileName,
    setEvoFastaFile,
    setEvoFastaFileName,
    evoFastaText,
    setEvoFastaText,
    evoAnimalRowsText,
    setEvoAnimalRowsText,
    evoGeoRowsText,
    setEvoGeoRowsText,
    evoCircRowsText,
    setEvoCircRowsText,
    evoResult,
    runEvolutionaryAnalysis,
    downloadJSON,
  } = props;

  return (
    <section>
      <Panel>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black text-cyan-300">
              Evolutionary Analysis
            </h3>

            <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-400">
              Integrates animal-level epidemiology, geospatial-temporal evidence,
              isolated pathogen FASTA sequence data, and circumstantial outbreak
              evidence to generate an evolutionary-risk summary.
            </p>
          </div>

          {evoResult && (
            <button
              onClick={() => downloadJSON(evoResult, "egstat_n_evolutionary_analysis.json")}
              className="rounded-xl bg-blue-500 px-4 py-2 font-black text-white"
            >
              Download JSON
            </button>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <EvidenceCard
            title="1) Animal-level data"
            description="CSV columns may include species, age, sex, disease_state, immunity_score, serum_pathogen_load, vaccine_strain, vaccine_strain_sequence, vaccination_date, antibody_titer, co_infections, body_temperature, clinical_score, weight, farm_id, and location."
            filename={evoAnimalFileName}
            accept=".csv"
            onFile={(f) => {
              setEvoAnimalFile(f);
              setEvoAnimalFileName(f?.name || "");
            }}
          >
            <Textarea
              label="Optional manual JSON array"
              value={evoAnimalRowsText}
              onChange={setEvoAnimalRowsText}
              placeholder='[{"species":"cattle","age":24,"sex":"female","disease_state":"infected","immunity_score":35,"serum_pathogen_load":8.2}]'
            />
          </EvidenceCard>

          <EvidenceCard
            title="2) Geospatial + temporal data"
            description="CSV columns may include farm_id, location, latitude, longitude, date, cases, deaths, cluster_id, site_type, and movement_exposure."
            filename={evoGeoFileName}
            accept=".csv"
            onFile={(f) => {
              setEvoGeoFile(f);
              setEvoGeoFileName(f?.name || "");
            }}
          >
            <Textarea
              label="Optional manual JSON array"
              value={evoGeoRowsText}
              onChange={setEvoGeoRowsText}
              placeholder='[{"farm_id":"Farm_1","location":"Mymensingh","latitude":24.7471,"longitude":90.4203,"date":"2026-01-01","cases":5}]'
            />
          </EvidenceCard>

          <EvidenceCard
            title="3) Genomics data"
            description="Upload or paste FASTA sequence data from the isolated pathogen. The backend calculates sequence summaries, GC content, pairwise distances, consensus preview, and mutation hotspots."
            filename={evoFastaFileName}
            accept=".fasta,.fa,.txt"
            onFile={(f) => {
              setEvoFastaFile(f);
              setEvoFastaFileName(f?.name || "");
            }}
          >
            <Textarea
              label="Paste FASTA sequence"
              value={evoFastaText}
              onChange={setEvoFastaText}
              placeholder=">isolate_1&#10;ATGCGTACGTAGCTAGCTA&#10;>isolate_2&#10;ATGCGTACGTAGCTAGTTA"
            />
          </EvidenceCard>

          <EvidenceCard
            title="4) Circumstantial evidence"
            description="CSV columns may include number_of_animals_reared, how_many_ill, similar_symptoms_seen_in, duration_days, drug_administered, management_system, biosecurity_score, feed_source, water_source, vector_exposure, and recent_animal_introduction."
            filename={evoCircFileName}
            accept=".csv"
            onFile={(f) => {
              setEvoCircFile(f);
              setEvoCircFileName(f?.name || "");
            }}
          >
            <Textarea
              label="Optional manual JSON array"
              value={evoCircRowsText}
              onChange={setEvoCircRowsText}
              placeholder='[{"farm_id":"Farm_1","number_of_animals_reared":100,"how_many_ill":15,"duration_days":7,"drug_administered":"oxytetracycline"}]'
            />
          </EvidenceCard>
        </div>

        <button
          onClick={runEvolutionaryAnalysis}
          className="mt-6 rounded-2xl bg-cyan-400 px-7 py-4 font-black text-slate-950 hover:bg-white"
        >
          Run Evolutionary Analysis
        </button>

        {evoResult && (
          <>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <ResultCard title="Animal rows" value={String(evoResult.evolutionary.animalLevel?.count ?? 0)} />
              <ResultCard title="Geo rows" value={String(evoResult.evolutionary.geoTemporal?.count ?? 0)} />
              <ResultCard title="Sequences" value={String(evoResult.evolutionary.genomics?.count ?? 0)} />
              <ResultCard title="Risk Category" value={String(evoResult.evolutionary.integratedSummary?.riskCategory ?? "NA")} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <RankingBars
                title="Disease State Distribution"
                data={evoResult.evolutionary.visualization?.diseaseStateDistribution ?? []}
                labelKey="level"
                valueKey="count"
              />

              <RankingBars
                title="Mutation Hotspots"
                data={evoResult.evolutionary.visualization?.genomicHotspots ?? []}
                labelKey="position"
                valueKey="variabilityScore"
              />

              <RankingBars
                title="Species Distribution"
                data={evoResult.evolutionary.visualization?.speciesDistribution ?? []}
                labelKey="level"
                valueKey="count"
              />

              <RankingBars
                title="Vaccine Strain Distribution"
                data={evoResult.evolutionary.visualization?.vaccineStrainDistribution ?? []}
                labelKey="level"
                valueKey="count"
              />
            </div>

            <pre className="mt-6 max-h-[520px] overflow-auto rounded-2xl bg-black p-5 text-sm text-slate-300">
              {JSON.stringify(evoResult.evolutionary, null, 2)}
            </pre>
          </>
        )}
      </Panel>
    </section>
  );
}

function MapboxHeatMap({
  heatmapGeoJSON,
  mapConfig,
}: {
  heatmapGeoJSON: any;
  mapConfig: any;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<MapStyleMode>("normal");
  const [showHeat, setShowHeat] = useState(true);
  const [showPoints, setShowPoints] = useState(true);

  useEffect(() => {
    let destroyed = false;

    async function init() {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

      if (!token) {
        setMessage("Mapbox token missing. Add NEXT_PUBLIC_MAPBOX_TOKEN in .env.local and Vercel.");
        return;
      }

      if (!containerRef.current) return;

      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        mapboxgl.accessToken = token;

        const features = heatmapGeoJSON?.features ?? [];
        const configuredCenter = mapConfig?.center;

        const center: [number, number] =
          configuredCenter?.longitude !== null &&
          configuredCenter?.longitude !== undefined &&
          configuredCenter?.latitude !== null &&
          configuredCenter?.latitude !== undefined
            ? [Number(configuredCenter.longitude), Number(configuredCenter.latitude)]
            : features.length > 0
            ? [
                Number(features[0].geometry.coordinates[0]),
                Number(features[0].geometry.coordinates[1]),
              ]
            : [90.4125, 23.8103];

        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }

        const style =
          view === "satellite"
            ? "mapbox://styles/mapbox/satellite-streets-v12"
            : "mapbox://styles/mapbox/dark-v11";

        const map = new mapboxgl.Map({
          container: containerRef.current,
          style,
          center,
          zoom: features.length > 0 ? 7 : 5,
        });

        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        map.on("load", () => {
          if (destroyed) return;

          if (!map.getSource("egstat-heatmap")) {
            map.addSource("egstat-heatmap", {
              type: "geojson",
              data: heatmapGeoJSON ?? { type: "FeatureCollection", features: [] },
            });
          }

          if (!map.getLayer("egstat-heat-layer")) {
            map.addLayer({
              id: "egstat-heat-layer",
              type: "heatmap",
              source: "egstat-heatmap",
              maxzoom: 15,
              paint: {
                "heatmap-weight": [
                  "interpolate",
                  ["linear"],
                  ["get", "heatWeight"],
                  0,
                  0,
                  10,
                  0.5,
                  25,
                  1,
                ],
                "heatmap-intensity": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  0,
                  0.8,
                  9,
                  1.6,
                ],
                "heatmap-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  0,
                  12,
                  6,
                  24,
                  10,
                  42,
                  15,
                  60,
                ],
                "heatmap-opacity": showHeat ? 0.88 : 0,
              },
            });
          }

          if (!map.getLayer("egstat-point-layer")) {
            map.addLayer({
              id: "egstat-point-layer",
              type: "circle",
              source: "egstat-heatmap",
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["get", "infected"],
                  0,
                  6,
                  10,
                  12,
                  50,
                  22,
                  100,
                  32,
                ],
                "circle-color": [
                  "interpolate",
                  ["linear"],
                  ["get", "prevalence"],
                  0,
                  "#06b6d4",
                  0.05,
                  "#22c55e",
                  0.15,
                  "#f59e0b",
                  0.3,
                  "#ef4444",
                ],
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 1.5,
                "circle-opacity": showPoints ? 0.92 : 0,
              },
            });
          }

          map.on("click", "egstat-point-layer", (e: any) => {
            const feature = e.features?.[0];
            if (!feature) return;

            const coordinates = feature.geometry.coordinates.slice();
            const html =
              feature.properties?.popupHTML ??
              `<strong>${feature.properties?.farmId ?? "Farm"}</strong>`;

            new mapboxgl.Popup()
              .setLngLat(coordinates as [number, number])
              .setHTML(html)
              .addTo(map);
          });

          map.on("mouseenter", "egstat-point-layer", () => {
            map.getCanvas().style.cursor = "pointer";
          });

          map.on("mouseleave", "egstat-point-layer", () => {
            map.getCanvas().style.cursor = "";
          });

          if (features.length > 0) {
            const bounds = new mapboxgl.LngLatBounds();

            features.forEach((feature: any) => {
              bounds.extend([
                Number(feature.geometry.coordinates[0]),
                Number(feature.geometry.coordinates[1]),
              ]);
            });

            map.fitBounds(bounds, {
              padding: 70,
              maxZoom: 9,
              duration: 900,
            });
          }
        });
      } catch (error: any) {
        setMessage(`Mapbox failed: ${error.message}`);
      }
    }

    init();

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [heatmapGeoJSON, mapConfig, view]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.getLayer("egstat-heat-layer")) {
      map.setPaintProperty("egstat-heat-layer", "heatmap-opacity", showHeat ? 0.88 : 0);
    }

    if (map.getLayer("egstat-point-layer")) {
      map.setPaintProperty("egstat-point-layer", "circle-opacity", showPoints ? 0.92 : 0);
    }
  }, [showHeat, showPoints]);

  const featureCount = heatmapGeoJSON?.features?.length ?? 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setView("normal")}
          className={`rounded-xl px-4 py-2 font-black ${
            view === "normal" ? "bg-cyan-400 text-slate-950" : "border border-white/10 bg-white/5"
          }`}
        >
          Normal View
        </button>

        <button
          onClick={() => setView("satellite")}
          className={`rounded-xl px-4 py-2 font-black ${
            view === "satellite" ? "bg-cyan-400 text-slate-950" : "border border-white/10 bg-white/5"
          }`}
        >
          Satellite View
        </button>

        <button
          onClick={() => setShowHeat(!showHeat)}
          className="rounded-xl border border-white/10 px-4 py-2 font-bold hover:border-cyan-300"
        >
          {showHeat ? "Hide Heat" : "Show Heat"}
        </button>

        <button
          onClick={() => setShowPoints(!showPoints)}
          className="rounded-xl border border-white/10 px-4 py-2 font-bold hover:border-cyan-300"
        >
          {showPoints ? "Hide Points" : "Show Points"}
        </button>

        <span className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-slate-300">
          Features: {featureCount}
        </span>
      </div>

      {message && (
        <p className="mb-3 rounded-xl bg-red-500/20 p-3 text-sm text-red-100">
          {message}
        </p>
      )}

      {featureCount === 0 && (
        <p className="mb-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
          No heatmap points yet. Enter valid latitude and longitude, then click Refresh Map Data.
        </p>
      )}

      <div
        ref={containerRef}
        className="h-[650px] overflow-hidden rounded-3xl border border-white/10 bg-slate-900"
      />
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/[0.05] p-6 ${className}`}>
      {children}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
        active
          ? "bg-cyan-400 text-slate-950"
          : "border border-white/10 bg-white/5 text-slate-300 hover:border-cyan-300 hover:text-cyan-300"
      }`}
    >
      {label}
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </label>

      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-cyan-300"
      />
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="mt-4">
      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </label>

      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-36 w-full rounded-xl border border-white/10 bg-black p-3 text-sm text-slate-200 outline-none focus:border-cyan-300"
      />
    </div>
  );
}

function ResultCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {title}
      </p>

      <p className="mt-2 break-words text-2xl font-black text-cyan-300">
        {value}
      </p>
    </div>
  );
}

function Console({ log }: { log: string[] }) {
  return (
    <Panel>
      <h3 className="mb-4 text-xl font-black text-cyan-300">Analysis Console</h3>

      <div className="h-72 overflow-auto rounded-2xl bg-black p-5 font-mono text-sm text-green-300">
        {log.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </Panel>
  );
}

function ObservationTable({
  rows,
  deleteFarm,
  setSelectedFarmId,
  setTStep,
}: {
  rows: ObsRow[];
  deleteFarm: (id: string) => void;
  setSelectedFarmId: (id: string) => void;
  setTStep: (step: TransmissionStep) => void;
}) {
  const grouped = Array.from(new Set(rows.map((r) => r.Farm_ID)));

  return (
    <div className="space-y-8">
      {grouped.map((farmId) => {
        const farmRows = rows
          .filter((r) => r.Farm_ID === farmId)
          .sort((a, b) => a.Observation - b.Observation);

        return (
          <div key={farmId}>
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-xl font-black text-cyan-300">{farmId}</h4>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedFarmId(farmId);
                    setTStep("observe");
                  }}
                  className="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold hover:border-cyan-300"
                >
                  Add Observation
                </button>

                <button
                  onClick={() => deleteFarm(farmId)}
                  className="rounded-xl bg-red-500 px-3 py-2 text-sm font-bold text-white"
                >
                  Delete Farm
                </button>
              </div>
            </div>

            <div className="overflow-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[1500px] border-collapse text-sm">
                <thead className="bg-slate-900 text-cyan-300">
                  <tr>
                    {[
                      "Farm_ID",
                      "Location",
                      "Date",
                      "Obs",
                      "Lat",
                      "Lon",
                      "N",
                      "S",
                      "E",
                      "I",
                      "Confirmatory Diagnosis",
                      "R",
                      "Abortions",
                      "Pending_Culled",
                      "Culled",
                      "Pending_Quarantined",
                      "Quarantined",
                      "MovedIn",
                      "MovedOut",
                    ].map((h) => (
                      <th key={h} className="border border-white/10 px-3 py-2 text-left">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {farmRows.map((r, i) => (
                    <tr key={i} className="odd:bg-white/[0.03] even:bg-white/[0.06]">
                      <td className="border border-white/10 px-3 py-2">{r.Farm_ID}</td>
                      <td className="border border-white/10 px-3 py-2">{r.Location}</td>
                      <td className="border border-white/10 px-3 py-2">{r.Date}</td>
                      <td className="border border-white/10 px-3 py-2">{r.Observation}</td>
                      <td className="border border-white/10 px-3 py-2">{valueText(r.Latitude)}</td>
                      <td className="border border-white/10 px-3 py-2">{valueText(r.Longitude)}</td>
                      <td className="border border-white/10 px-3 py-2">{r.Total_Animals}</td>
                      <td className="border border-white/10 px-3 py-2">{r.S}</td>
                      <td className="border border-white/10 px-3 py-2">{r.E}</td>
                      <td className="border border-white/10 px-3 py-2">{r.I}</td>
                      <td className="border border-white/10 px-3 py-2">{r.Confirmatory_Diagnosis}</td>
                      <td className="border border-white/10 px-3 py-2">{r.R}</td>
                      <td className="border border-white/10 px-3 py-2">{r.Abortion_Count}</td>
                      <td className="border border-white/10 px-3 py-2">{r.Pending_Culled}</td>
                      <td className="border border-white/10 px-3 py-2">{r.Culled}</td>
                      <td className="border border-white/10 px-3 py-2">{r.Pending_Quarantined}</td>
                      <td className="border border-white/10 px-3 py-2">{r.Quarantined}</td>
                      <td className="border border-white/10 px-3 py-2">{r.New_Animals_Moved_In}</td>
                      <td className="border border-white/10 px-3 py-2">{r.New_Animals_Moved_Out}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {rows.length === 0 && (
        <p className="rounded-2xl bg-slate-900 p-6 text-slate-300">
          No farm data yet. Create a farm first.
        </p>
      )}
    </div>
  );
}

function TrendBars({
  title,
  data,
  valueKey,
  labelKey,
}: {
  title: string;
  data: any[];
  valueKey: string;
  labelKey: string;
}) {
  const maxValue = Math.max(1, ...(data ?? []).map((d) => Number(d[valueKey] ?? 0)));

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">{title}</h4>

      <div className="space-y-3">
        {(data ?? []).slice(-20).map((d, i) => {
          const v = Number(d[valueKey] ?? 0);

          return (
            <div key={i}>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span>Obs {String(d[labelKey])}</span>
                <span>{valueText(v)}</span>
              </div>

              <div className="h-3 rounded-full bg-white/10">
                <div
                  className="h-3 rounded-full bg-cyan-300"
                  style={{ width: `${Math.max(2, (v / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankingBars({
  title,
  data,
  labelKey,
  valueKey,
  percentValue = false,
  inverse = false,
}: {
  title: string;
  data: any[];
  labelKey: string;
  valueKey: string;
  percentValue?: boolean;
  inverse?: boolean;
}) {
  const usable = [...(data ?? [])].filter((d) => Number.isFinite(Number(d[valueKey])));
  const sorted = usable.sort((a, b) =>
    inverse ? Number(a[valueKey]) - Number(b[valueKey]) : Number(b[valueKey]) - Number(a[valueKey])
  );
  const maxValue = Math.max(0.00001, ...sorted.map((d) => Math.abs(Number(d[valueKey] ?? 0))));

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">{title}</h4>

      <div className="space-y-3">
        {sorted.slice(0, 15).map((d, i) => {
          const v = Number(d[valueKey] ?? 0);

          return (
            <div key={i}>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span>{String(d[labelKey] ?? "NA")}</span>
                <span>{percentValue ? percent(v) : valueText(v)}</span>
              </div>

              <div className="h-3 rounded-full bg-white/10">
                <div
                  className="h-3 rounded-full bg-cyan-300"
                  style={{ width: `${Math.max(2, (Math.abs(v) / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <p className="text-sm text-slate-400">No numeric data available.</p>
        )}
      </div>
    </div>
  );
}

function RiskForestPlot({ data }: { data: any[] }) {
  const rows = [...(data ?? [])]
    .filter((d) => Number.isFinite(Number(d.oddsRatio)))
    .slice(0, 15);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">Odds Ratio Plot</h4>

      <div className="space-y-4">
        {rows.map((d, i) => {
          const or = Number(d.oddsRatio);
          const pos = Math.max(5, Math.min(95, 50 + Math.log(or) * 22));

          return (
            <div key={i}>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span>{d.variable}</span>
                <span>OR={valueText(or)}</span>
              </div>

              <div className="relative h-5 rounded-full bg-white/10">
                <div className="absolute left-1/2 top-0 h-5 w-[2px] bg-white/40" />
                <div
                  className="absolute top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-cyan-300"
                  style={{ left: `${pos}%` }}
                />
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <p className="text-sm text-slate-400">No odds-ratio data available.</p>
        )}
      </div>
    </div>
  );
}

function StatsTable({ rows }: { rows: any[] }) {
  return (
    <div className="mt-6 overflow-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="bg-black text-cyan-300">
          <tr>
            {["Variable", "N", "Mean", "Median", "SD", "Min", "Q1", "Q3", "Max"].map((h) => (
              <th key={h} className="border border-white/10 px-3 py-2 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {(rows ?? []).map((r, i) => (
            <tr key={i} className="odd:bg-white/[0.03] even:bg-white/[0.06]">
              <td className="border border-white/10 px-3 py-2">{r.variable}</td>
              <td className="border border-white/10 px-3 py-2">{r.n}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.mean)}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.median)}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.sd)}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.min)}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.q1)}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.q3)}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.max)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NetworkEdgeTable({ edges }: { edges: NetworkEdge[] }) {
  return (
    <div className="overflow-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[800px] border-collapse text-sm">
        <thead className="bg-black text-cyan-300">
          <tr>
            {["Edge", "From", "To", "Type", "Distance", "Movements"].map((h) => (
              <th key={h} className="border border-white/10 px-3 py-2 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {edges.map((e, i) => (
            <tr key={i} className="odd:bg-white/[0.03] even:bg-white/[0.06]">
              <td className="border border-white/10 px-3 py-2">{e.edgeId}</td>
              <td className="border border-white/10 px-3 py-2">{e.source}</td>
              <td className="border border-white/10 px-3 py-2">{e.target}</td>
              <td className="border border-white/10 px-3 py-2">{e.edgeType}</td>
              <td className="border border-white/10 px-3 py-2">{e.distanceKm}</td>
              <td className="border border-white/10 px-3 py-2">{e.movements}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NetworkPlot({ data }: { data: any }) {
  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];
  const size = 560;
  const center = size / 2;
  const scale = 210;

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-black p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">
        Network Visualization
      </h4>

      <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="rounded-xl bg-slate-950">
        {edges.map((e: any, i: number) => {
          const s = nodes.find((n: any) => n.id === e.source);
          const t = nodes.find((n: any) => n.id === e.target);

          if (!s || !t) return null;

          return (
            <line
              key={i}
              x1={center + s.x * scale}
              y1={center + s.y * scale}
              x2={center + t.x * scale}
              y2={center + t.y * scale}
              stroke="rgba(34,211,238,.45)"
              strokeWidth={Math.max(1, Math.min(8, Number(e.movements ?? 1)))}
            />
          );
        })}

        {nodes.map((n: any) => (
          <g key={n.id}>
            <circle
              cx={center + n.x * scale}
              cy={center + n.y * scale}
              r={10 + Number(n.degree ?? 0) * 3}
              fill="rgb(34,211,238)"
            />

            <text
              x={center + n.x * scale + 12}
              y={center + n.y * scale + 4}
              fill="white"
              fontSize="13"
            >
              {n.id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function EvidenceCard({
  title,
  description,
  filename,
  accept,
  onFile,
  children,
}: {
  title: string;
  description: string;
  filename: string;
  accept: string;
  onFile: (file: File | null) => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-3 font-black text-cyan-300">{title}</h4>

      <p className="mb-4 text-sm leading-7 text-slate-400">
        {description}
      </p>

      <input
        type="file"
        accept={accept}
        onChange={(e) => onFile(e.target.files?.[0] || null)}
        className="block w-full rounded-xl border border-white/10 bg-black p-3"
      />

      {filename && <p className="mt-2 text-sm text-cyan-300">Loaded: {filename}</p>}

      {children}
    </div>
  );
}
