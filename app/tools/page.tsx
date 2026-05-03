"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
  RBPT_Positive: number;
  iELISA_Positive: number;
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

type MainTab = "transmission" | "risk" | "network" | "statistics";
type TStep = "farm" | "observe" | "table" | "analysis" | "map";

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

async function readSpreadsheetLikeFile(file: File): Promise<any[]> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv")) {
    const text = await file.text();
    return parseCSV(text);
  }

  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet);
}

function parseCSV(text: string): any[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row: any = {};

    headers.forEach((h, i) => {
      const raw = values[i] ?? "";
      const n = Number(raw);
      row[h] = raw !== "" && Number.isFinite(n) ? n : raw;
    });

    return row;
  });
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

function normalizeExcelNetworkRows(rows: any[]): NetworkEdge[] {
  return rows
    .map((r, i) => ({
      edgeId: String(r.Edge_ID ?? r["Edge ID"] ?? r.edgeId ?? `E${i + 1}`),
      source: String(r.From_Node ?? r["From Node"] ?? r.source ?? r.Source ?? ""),
      target: String(r.To_Node ?? r["To Node"] ?? r.target ?? r.Target ?? ""),
      edgeType: String(r.Edge_Type ?? r["Edge Type"] ?? r.type ?? "movement"),
      distanceKm: num(r.Road_Distance_km ?? r["Road Distance (km)"] ?? r.distanceKm),
      movements: num(r.Avg_Movements ?? r["Avg Movements"] ?? r.movements, 1),
    }))
    .filter((e) => e.source && e.target);
}

export default function Tools() {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("transmission");

  const [transmissionMode, setTransmissionMode] = useState<"logic" | "import">("logic");
  const [tStep, setTStep] = useState<TStep>("farm");
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

  const [statsFile, setStatsFile] = useState<File | null>(null);
  const [statsFileName, setStatsFileName] = useState("");
  const [statsResult, setStatsResult] = useState<any>(null);

  const [log, setLog] = useState<string[]>([
    "> EGStat-N web engine initialized.",
    "> Modules: transmission dynamics, risk-factor analysis, statistics, geospatial map, and network analysis.",
  ]);

  const [setup, setSetup] = useState({
    Farm_ID: "Farm_1",
    Location: "",
    Latitude: "0",
    Longitude: "0",
    Date: today(),
    Total_Animals: "100",
    E: "0",
    I: "0",
    R: "0",
    RBPT_Positive: "0",
    iELISA_Positive: "0",
    Pending_Culled: "0",
  });

  const [obs, setObs] = useState({
    Date: today(),
    E: "0",
    RBPT_Positive: "0",
    iELISA_Positive: "0",
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
    const Inew = num(obs.iELISA_Positive);
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
    const I = num(setup.I);
    const R = num(setup.R);
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
      Latitude: num(setup.Latitude),
      Longitude: num(setup.Longitude),
      Date: setup.Date || today(),
      Observation: 1,
      Total_Animals: N,
      S,
      E,
      I,
      R,
      RBPT_Positive: num(setup.RBPT_Positive),
      iELISA_Positive: num(setup.iELISA_Positive, I),
      Abortion_Count: 0,
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
      RBPT_Positive: "0",
      iELISA_Positive: "0",
      Abortion_Count: "0",
      New_Animals_Moved_In: "0",
      New_Animals_Moved_Out: "0",
      Susceptible_In_From_MovedIn: "0",
      Susceptible_Out_From_MovedOut: "0",
      Pending_Culled: "0",
    });

    pushLog([
      `> New farm created: ${farmId}.`,
      `> Initial observation: N=${N}, S=${S}, E=${E}, I=${I}, R=${R}.`,
      "> First observation rule applied: Culled=0, Quarantined=0.",
      `> Pending_Culled=${pendingCulled}; Pending_Quarantined=${pendingQuarantined}.`,
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
      RBPT_Positive: num(obs.RBPT_Positive),
      iELISA_Positive: nextPreview.Inew,
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
      RBPT_Positive: "0",
      iELISA_Positive: "0",
      Abortion_Count: "0",
      New_Animals_Moved_In: "0",
      New_Animals_Moved_Out: "0",
      Susceptible_In_From_MovedIn: "0",
      Susceptible_Out_From_MovedOut: "0",
      Pending_Culled: "0",
    });

    pushLog([
      `> Observation ${newRow.Observation} added for ${newRow.Farm_ID}.`,
      `> N_new = previous N (${last.Total_Animals}) - previous Pending_Culled (${last.Pending_Culled}) + Moved_In (${nextPreview.movedIn}) - Moved_Out (${nextPreview.movedOut}) = ${newRow.Total_Animals}.`,
      `> New S = N - (E + I + R) = ${newRow.S}.`,
      `> Applied culled=${newRow.Culled}; applied quarantined=${newRow.Quarantined}.`,
    ]);
  }

  async function runTransmissionAnalysis() {
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
    setTStep("analysis");

    pushLog([
      "> Transmission dynamics calculated.",
      `> Total farms=${data.analysis.totalFarms}; overall N=${data.analysis.overallSEIR.N}; overall I=${data.analysis.overallSEIR.I}.`,
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

    pushLog([
      "> Risk-factor analysis completed.",
      `> Significant predictors at p<0.05: ${data.risk.summary.significantAt005}.`,
    ]);
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
      `> Nodes=${data.network.statistics.nodeCount}; Edges=${data.network.statistics.edgeCount}; Density=${valueText(data.network.statistics.density)}.`,
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

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <section className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.3em] text-cyan-300">
            Research Tools
          </p>

          <h1 className="mb-6 text-5xl font-black">EGStat-N</h1>

          <p className="mx-auto max-w-3xl text-lg leading-8 text-slate-300">
            Epidemiological Graphics and Statistics Tool for Networks —
            farm-level SEIR transmission dynamics, risk-factor analysis,
            statistical summaries, Mapbox geospatial visualization, and network
            analysis.
          </p>
        </div>

        <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="mb-4 text-3xl font-black text-cyan-300">
                Launch EGStat-N
              </h2>

              <p className="mb-6 leading-8 text-slate-300">
                Create multiple farms, add sequential observations, calculate
                overall SEIR dynamics, visualize trends, map farms with Mapbox,
                run risk-factor screening, and analyze transmission networks.
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
                  Transmission Dynamics + Overall SEIR
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  Mapbox Geospatial Map
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  Risk Factor Analysis
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  Statistical Summary
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  Manual / Excel Network Input
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
                  Transmission dynamics • Risk factors • Statistics • Mapbox •
                  Networks
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
              <div className="mb-6 grid gap-3 md:grid-cols-4">
                <TabButton
                  label="Transmission Dynamics"
                  active={mainTab === "transmission"}
                  onClick={() => setMainTab("transmission")}
                />
                <TabButton
                  label="Risk Factor Analysis"
                  active={mainTab === "risk"}
                  onClick={() => setMainTab("risk")}
                />
                <TabButton
                  label="Statistical Summary"
                  active={mainTab === "statistics"}
                  onClick={() => setMainTab("statistics")}
                />
                <TabButton
                  label="Network Analysis"
                  active={mainTab === "network"}
                  onClick={() => setMainTab("network")}
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
                  addObservation={addObservation}
                  runTransmissionAnalysis={runTransmissionAnalysis}
                  selectedFarmId={selectedFarmId}
                  setSelectedFarmId={setSelectedFarmId}
                  farmIds={farmIds}
                  farms={farms}
                  last={last}
                  nextPreview={nextPreview}
                  transmissionResult={transmissionResult}
                  farmSummary={farmSummary}
                  downloadJSON={downloadJSON}
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
                  log={log}
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
                  log={log}
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
                  log={log}
                />
              )}
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
    addObservation,
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
    log,
  } = props;

  return (
    <section>
      <div className="mb-6 grid gap-3 md:grid-cols-5">
        <TabButton label="Create Farm" active={tStep === "farm"} onClick={() => setTStep("farm")} />
        <TabButton label="Observation" active={tStep === "observe"} onClick={() => setTStep("observe")} />
        <TabButton label="Data Table" active={tStep === "table"} onClick={() => setTStep("table")} />
        <TabButton label="Analysis" active={tStep === "analysis"} onClick={() => setTStep("analysis")} />
        <TabButton label="Mapbox Map" active={tStep === "map"} onClick={() => setTStep("map")} />
      </div>

      <div className="mb-6 rounded-3xl border border-white/10 bg-white/[0.05] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setTransmissionMode("logic")}
            className={`rounded-xl px-4 py-2 text-sm font-black ${
              transmissionMode === "logic"
                ? "bg-cyan-400 text-slate-950"
                : "bg-white/10"
            }`}
          >
            Logic-wise Entry
          </button>

          <button
            onClick={() => setTransmissionMode("import")}
            className={`rounded-xl px-4 py-2 text-sm font-black ${
              transmissionMode === "import"
                ? "bg-cyan-400 text-slate-950"
                : "bg-white/10"
            }`}
          >
            CSV Import
          </button>

          <label className="ml-auto text-sm text-slate-300">
            Infectious period
          </label>

          <input
            value={infectiousPeriodDays}
            onChange={(e) => setInfectiousPeriodDays(e.target.value)}
            className="w-24 rounded-xl border border-white/10 bg-slate-900 px-3 py-2"
          />

          <span className="text-sm text-slate-400">days</span>
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
              <p className="mt-2 text-sm text-cyan-300">
                Loaded: {transmissionFileName}
              </p>
            )}

            <button
              onClick={runTransmissionAnalysis}
              className="mt-3 rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950"
            >
              Run Imported Analysis
            </button>
          </div>
        )}
      </div>

      {tStep === "farm" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
            <h3 className="mb-4 text-2xl font-black text-cyan-300">
              Create New Farm
            </h3>

            <p className="mb-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-sm leading-7 text-slate-300">
              Initial observation rule: Culled=0, Quarantined=0,
              Pending_Quarantined=max(0, I - Pending_Culled), and
              S=N-(E+I+R).
            </p>

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
              <ResultCard
                title="Calculated S"
                value={String(
                  num(setup.Total_Animals) -
                    (num(setup.E) + num(setup.I) + num(setup.R))
                )}
              />
              <ResultCard
                title="Pending Quarantined"
                value={String(
                  Math.max(0, num(setup.I) - num(setup.Pending_Culled))
                )}
              />
              <ResultCard title="Culled" value="0" />
              <ResultCard title="Quarantined" value="0" />
            </div>

            <button
              onClick={createNewFarm}
              className="mt-6 rounded-2xl bg-cyan-400 px-7 py-4 font-black text-slate-950 hover:bg-white"
            >
              Create New Farm
            </button>
          </div>

          <Console log={log} />
        </div>
      )}

      {tStep === "observe" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
            <h3 className="mb-4 text-2xl font-black text-cyan-300">
              Add Observation
            </h3>

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
                onClick={() => setTStep("farm")}
                className="rounded-xl border border-white/10 px-4 py-3 font-bold hover:border-cyan-300"
              >
                Create another farm
              </button>
            </div>

            {last && (
              <div className="mb-6 grid gap-4 md:grid-cols-4">
                <ResultCard title="Last N" value={String(last.Total_Animals)} />
                <ResultCard
                  title="Previous Pending Culled"
                  value={String(last.Pending_Culled)}
                />
                <ResultCard
                  title="New N formula"
                  value={`${last.Total_Animals} - ${last.Pending_Culled} + in - out`}
                />
                <ResultCard title="Last S" value={String(last.S)} />
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
                  <ResultCard
                    title="Applied Culled"
                    value={String(nextPreview.appliedCulled)}
                  />
                  <ResultCard
                    title="Applied Quarantined"
                    value={String(nextPreview.appliedQuarantined)}
                  />
                  <ResultCard title="New N" value={String(nextPreview.Nnew)} />
                  <ResultCard title="New S" value={String(nextPreview.Snew)} />
                  <ResultCard title="New E" value={String(nextPreview.Enew)} />
                  <ResultCard title="New I" value={String(nextPreview.Inew)} />
                  <ResultCard title="New R" value={String(nextPreview.Rnew)} />
                  <ResultCard
                    title="New Pending Quarantined"
                    value={String(nextPreview.pendingQuarantined)}
                  />
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={addObservation}
                className="rounded-2xl bg-cyan-400 px-7 py-4 font-black text-slate-950 hover:bg-white"
              >
                Add Observation
              </button>

              <button
                onClick={runTransmissionAnalysis}
                className="rounded-2xl bg-blue-500 px-7 py-4 font-black text-white hover:bg-blue-600"
              >
                Calculate Overall SEIR Dynamics
              </button>
            </div>
          </div>

          <Console log={log} />
        </div>
      )}

      {tStep === "table" && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
          <div className="mb-5 flex flex-wrap justify-between gap-3">
            <h3 className="text-2xl font-black text-cyan-300">
              Farm Observation Table
            </h3>

            <button
              onClick={runTransmissionAnalysis}
              className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-slate-950 hover:bg-white"
            >
              Calculate Dynamics
            </button>
          </div>

          <ObservationTable rows={farms} />
        </div>
      )}

      {tStep === "analysis" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
            <div className="mb-5 flex flex-wrap justify-between gap-3">
              <h3 className="text-2xl font-black text-cyan-300">
                Overall SEIR Dynamics
              </h3>

              <button
                onClick={() =>
                  downloadJSON(transmissionResult, "egstat_n_transmission.json")
                }
                className="rounded-xl bg-blue-500 px-4 py-2 font-black"
              >
                Download JSON
              </button>
            </div>

            {transmissionResult ? (
              <>
                <div className="grid gap-4 md:grid-cols-5">
                  <ResultCard
                    title="Overall N"
                    value={String(transmissionResult.analysis.overallSEIR.N)}
                  />
                  <ResultCard
                    title="Overall S"
                    value={String(transmissionResult.analysis.overallSEIR.S)}
                  />
                  <ResultCard
                    title="Overall E"
                    value={String(transmissionResult.analysis.overallSEIR.E)}
                  />
                  <ResultCard
                    title="Overall I"
                    value={String(transmissionResult.analysis.overallSEIR.I)}
                  />
                  <ResultCard
                    title="Overall R"
                    value={String(transmissionResult.analysis.overallSEIR.R)}
                  />
                  <ResultCard
                    title="Overall Prevalence"
                    value={percent(
                      transmissionResult.analysis.overallSEIR.overallPrevalence
                    )}
                  />
                  <ResultCard
                    title="Farms"
                    value={String(transmissionResult.analysis.totalFarms)}
                  />
                  <ResultCard
                    title="Observations"
                    value={String(transmissionResult.analysis.totalObservations)}
                  />
                  <ResultCard
                    title="Selected Farm R0"
                    value={valueText(farmSummary?.estimatedR0)}
                  />
                  <ResultCard
                    title="Selected Farm Attack Rate"
                    value={percent(farmSummary?.attackRate)}
                  />
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                  <SEIRTrend farms={transmissionResult.analysis.farmSummaries} />
                  <PendingCulledChart farms={transmissionResult.analysis.farmSummaries} />
                  <PrevalenceBars
                    data={transmissionResult.analysis.visualization.prevalenceBars}
                  />
                  <R0Bars data={transmissionResult.analysis.visualization.r0Bars} />
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
          </div>

          <Console log={log} />
        </div>
      )}

      {tStep === "map" && (
        <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
          <div className="mb-5 flex flex-wrap justify-between gap-3">
            <div>
              <h3 className="text-2xl font-black text-cyan-300">
                Mapbox Geospatial Visualization
              </h3>
              <p className="text-sm text-slate-400">
                Requires NEXT_PUBLIC_MAPBOX_TOKEN and latitude/longitude for
                farms.
              </p>
            </div>

            <button
              onClick={runTransmissionAnalysis}
              className="rounded-xl bg-cyan-400 px-4 py-2 font-black text-slate-950 hover:bg-white"
            >
              Refresh Map Data
            </button>
          </div>

          <MapboxFarmMap points={transmissionResult?.analysis?.mapPoints ?? []} />
        </div>
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
    log,
  } = props;

  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
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

        {riskFileName && (
          <p className="mt-2 text-sm text-cyan-300">Loaded: {riskFileName}</p>
        )}

        <div className="mt-5 grid gap-4">
          <Input label="Outcome variable" value={riskOutcome} onChange={setRiskOutcome} />
          <Input
            label="Predictors comma-separated"
            value={riskPredictors}
            onChange={setRiskPredictors}
            placeholder="Age,Vaccination,Breed"
          />
          <Input
            label="p-value threshold"
            value={riskThreshold}
            onChange={setRiskThreshold}
          />
        </div>

        <button
          onClick={runRiskAnalysis}
          className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 hover:bg-white"
        >
          Find Risk Factors
        </button>

        {riskResult && (
          <button
            onClick={() => downloadJSON(riskResult, "egstat_n_risk_analysis.json")}
            className="mt-4 w-full rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-600"
          >
            Download JSON
          </button>
        )}
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
        <h3 className="mb-4 text-2xl font-black text-cyan-300">
          Risk Results
        </h3>

        {riskResult ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <ResultCard
                title="Predictors"
                value={String(riskResult.risk.summary.totalPredictors)}
              />
              <ResultCard
                title="p < 0.05"
                value={String(riskResult.risk.summary.significantAt005)}
              />
              <ResultCard
                title="Selected"
                value={String(riskResult.risk.summary.selectedForMultivariable)}
              />
              <ResultCard
                title="Strongest"
                value={riskResult.risk.summary.strongestPredictor?.variable ?? "NA"}
              />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <RiskPValuePlot
                data={riskResult.risk.visualization.pValueBars}
                threshold={num(riskThreshold)}
              />
              <RiskForestPlot data={riskResult.risk.visualization.forestData} />
            </div>

            {riskResult.risk.visualization.multivariableForest?.length > 0 && (
              <div className="mt-6">
                <RiskForestPlot
                  title="Multivariable Odds Ratio Plot"
                  data={riskResult.risk.visualization.multivariableForest}
                />
              </div>
            )}

            <RiskTable rows={riskResult.risk.univariable} />
          </>
        ) : (
          <p className="rounded-2xl bg-slate-900 p-6 text-slate-300">
            Upload CSV and run analysis.
          </p>
        )}
      </div>

      <Console log={log} />
    </section>
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
    log,
  } = props;

  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
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

        {statsFileName && (
          <p className="mt-2 text-sm text-cyan-300">Loaded: {statsFileName}</p>
        )}

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
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
        <h3 className="mb-4 text-2xl font-black text-cyan-300">
          Statistical Results
        </h3>

        {statsResult ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <ResultCard
                title="Rows"
                value={String(statsResult.statistics.dataset.rows)}
              />
              <ResultCard
                title="Columns"
                value={String(statsResult.statistics.dataset.columns)}
              />
              <ResultCard
                title="Numeric Variables"
                value={String(statsResult.statistics.numericColumns.length)}
              />
            </div>

            <StatsTable rows={statsResult.statistics.descriptiveStatistics} />

            <pre className="mt-6 max-h-96 overflow-auto rounded-2xl bg-black p-5 text-sm text-slate-300">
              {JSON.stringify(statsResult.statistics, null, 2)}
            </pre>
          </>
        ) : (
          <p className="rounded-2xl bg-slate-900 p-6 text-slate-300">
            Upload CSV and run statistical summary.
          </p>
        )}
      </div>

      <Console log={log} />
    </section>
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
    log,
  } = props;

  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
        <h3 className="mb-4 text-2xl font-black text-cyan-300">
          Network Data Input
        </h3>

        <div className="mb-4 flex gap-3">
          <button
            onClick={() => setNetworkSource("manual")}
            className={`rounded-xl px-4 py-2 font-black ${
              networkSource === "manual"
                ? "bg-cyan-400 text-slate-950"
                : "bg-white/10"
            }`}
          >
            Manual
          </button>

          <button
            onClick={() => setNetworkSource("import")}
            className={`rounded-xl px-4 py-2 font-black ${
              networkSource === "import"
                ? "bg-cyan-400 text-slate-950"
                : "bg-white/10"
            }`}
          >
            Excel/CSV Import
          </button>
        </div>

        {networkSource === "manual" ? (
          <div className="grid gap-3">
            <Input
              label="Edge ID"
              value={networkInput.edgeId}
              onChange={(v) => setNetworkInput({ ...networkInput, edgeId: v })}
            />
            <Input
              label="From Node"
              value={networkInput.source}
              onChange={(v) => setNetworkInput({ ...networkInput, source: v })}
            />
            <Input
              label="To Node"
              value={networkInput.target}
              onChange={(v) => setNetworkInput({ ...networkInput, target: v })}
            />
            <Input
              label="Edge Type"
              value={networkInput.edgeType}
              onChange={(v) => setNetworkInput({ ...networkInput, edgeType: v })}
            />
            <Input
              label="Road Distance km"
              value={String(networkInput.distanceKm)}
              onChange={(v) =>
                setNetworkInput({ ...networkInput, distanceKm: num(v) })
              }
            />
            <Input
              label="Avg Movements"
              value={String(networkInput.movements)}
              onChange={(v) =>
                setNetworkInput({ ...networkInput, movements: num(v, 1) })
              }
            />

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

            {networkFileName && (
              <p className="mt-2 text-sm text-cyan-300">
                Loaded: {networkFileName}
              </p>
            )}
          </div>
        )}

        <button
          onClick={runNetworkAnalysis}
          className="mt-6 w-full rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-600"
        >
          Run Network Analysis
        </button>
      </div>

      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-2xl font-black text-cyan-300">
            Network Analysis and Visualization
          </h3>

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
              <ResultCard
                title="Nodes"
                value={String(networkResult.network.statistics.nodeCount)}
              />
              <ResultCard
                title="Edges"
                value={String(networkResult.network.statistics.edgeCount)}
              />
              <ResultCard
                title="Density"
                value={valueText(networkResult.network.statistics.density)}
              />
              <ResultCard
                title="Top Node"
                value={networkResult.network.statistics.highestDegreeNode?.node ?? "NA"}
              />
            </div>

            <NetworkPlot data={networkResult.network} />
            <DegreeBars data={networkResult.network.visualization.degreeBars} />

            <pre className="mt-6 max-h-80 overflow-auto rounded-2xl bg-black p-5 text-sm text-slate-300">
              {JSON.stringify(networkResult.network.statistics, null, 2)}
            </pre>
          </>
        ) : (
          <>
            <p className="mb-4 rounded-2xl bg-slate-900 p-4 text-slate-300">
              Edges loaded: {networkEdges.length}
            </p>

            <NetworkEdgeTable edges={networkEdges} />
          </>
        )}
      </div>

      <Console log={log} />
    </section>
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

function ResultCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {title}
      </p>
      <p className="mt-2 text-2xl font-black text-cyan-300">{value}</p>
    </div>
  );
}

function Console({ log }: { log: string[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
      <h3 className="mb-4 text-xl font-black text-cyan-300">
        Analysis Console
      </h3>

      <div className="h-96 overflow-auto rounded-2xl bg-black p-5 font-mono text-sm text-green-300">
        {log.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function ObservationTable({ rows }: { rows: ObsRow[] }) {
  return (
    <div className="overflow-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[1350px] border-collapse text-sm">
        <thead className="bg-slate-900 text-cyan-300">
          <tr>
            {[
              "Farm_ID",
              "Date",
              "Obs",
              "N",
              "S",
              "E",
              "I",
              "R",
              "Pending_Culled",
              "Culled",
              "Pending_Quarantined",
              "Quarantined",
              "MovedIn",
              "MovedOut",
              "Lat",
              "Lon",
            ].map((h) => (
              <th key={h} className="border border-white/10 px-3 py-2 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white/[0.03] even:bg-white/[0.06]">
              <td className="border border-white/10 px-3 py-2">{r.Farm_ID}</td>
              <td className="border border-white/10 px-3 py-2">{r.Date}</td>
              <td className="border border-white/10 px-3 py-2">{r.Observation}</td>
              <td className="border border-white/10 px-3 py-2">{r.Total_Animals}</td>
              <td className="border border-white/10 px-3 py-2">{r.S}</td>
              <td className="border border-white/10 px-3 py-2">{r.E}</td>
              <td className="border border-white/10 px-3 py-2">{r.I}</td>
              <td className="border border-white/10 px-3 py-2">{r.R}</td>
              <td className="border border-white/10 px-3 py-2">{r.Pending_Culled}</td>
              <td className="border border-white/10 px-3 py-2">{r.Culled}</td>
              <td className="border border-white/10 px-3 py-2">{r.Pending_Quarantined}</td>
              <td className="border border-white/10 px-3 py-2">{r.Quarantined}</td>
              <td className="border border-white/10 px-3 py-2">{r.New_Animals_Moved_In}</td>
              <td className="border border-white/10 px-3 py-2">{r.New_Animals_Moved_Out}</td>
              <td className="border border-white/10 px-3 py-2">{r.Latitude}</td>
              <td className="border border-white/10 px-3 py-2">{r.Longitude}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SEIRTrend({ farms }: { farms: any[] }) {
  const all =
    farms?.flatMap((f: any) =>
      f.trend.map((t: any) => ({ ...t, farmId: f.farmId }))
    ) ?? [];
  const maxI = Math.max(1, ...all.map((x: any) => x.I));

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">
        Infection Trend by Observation
      </h4>

      <div className="space-y-3">
        {all.slice(-25).map((d: any, i: number) => (
          <div key={i}>
            <div className="mb-1 flex justify-between text-xs text-slate-300">
              <span>
                {d.farmId} obs {d.observation}
              </span>
              <span>I={d.I}</span>
            </div>

            <div className="h-3 rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-cyan-300"
                style={{ width: `${Math.max(2, (d.I / maxI) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PendingCulledChart({ farms }: { farms: any[] }) {
  const all =
    farms?.flatMap((f: any) =>
      f.trend.map((t: any) => ({ ...t, farmId: f.farmId }))
    ) ?? [];
  const maxV = Math.max(1, ...all.map((x: any) => x.pendingCulled));

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">
        Pending Culled Trend
      </h4>

      <div className="space-y-3">
        {all.slice(-25).map((d: any, i: number) => (
          <div key={i}>
            <div className="mb-1 flex justify-between text-xs text-slate-300">
              <span>
                {d.farmId} obs {d.observation}
              </span>
              <span>pending={d.pendingCulled}</span>
            </div>

            <div className="h-3 rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-blue-400"
                style={{ width: `${Math.max(2, (d.pendingCulled / maxV) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrevalenceBars({ data }: { data: any[] }) {
  const maxV = Math.max(0.01, ...(data ?? []).map((x) => x.prevalence ?? 0));

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">
        Farm Prevalence Ranking
      </h4>

      <div className="space-y-3">
        {(data ?? []).map((d, i) => (
          <div key={i}>
            <div className="mb-1 flex justify-between text-xs text-slate-300">
              <span>{d.farmId}</span>
              <span>{percent(d.prevalence)}</span>
            </div>

            <div className="h-3 rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-cyan-300"
                style={{
                  width: `${Math.max(2, ((d.prevalence ?? 0) / maxV) * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function R0Bars({ data }: { data: any[] }) {
  const maxV = Math.max(1, ...(data ?? []).map((x) => x.r0 ?? 0));

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">
        Estimated R0 Ranking
      </h4>

      <div className="space-y-3">
        {(data ?? []).map((d, i) => (
          <div key={i}>
            <div className="mb-1 flex justify-between text-xs text-slate-300">
              <span>{d.farmId}</span>
              <span>R0={valueText(d.r0)}</span>
            </div>

            <div className="h-3 rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-blue-400"
                style={{ width: `${Math.max(2, ((d.r0 ?? 0) / maxV) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MapboxFarmMap({ points }: { points: any[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let map: any;
    let markers: any[] = [];

    async function init() {
      const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

      if (!token) {
        setMessage(
          "Mapbox token missing. Add NEXT_PUBLIC_MAPBOX_TOKEN in .env.local and Vercel environment variables."
        );
        return;
      }

      if (!containerRef.current) return;

      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        mapboxgl.accessToken = token;

        const center =
          points.length > 0
            ? [Number(points[0].longitude), Number(points[0].latitude)]
            : [90.4125, 23.8103];

        map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center,
          zoom: points.length > 0 ? 7 : 5,
        });

        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        points.forEach((p) => {
          const marker = new mapboxgl.Marker()
            .setLngLat([Number(p.longitude), Number(p.latitude)])
            .setPopup(
              new mapboxgl.Popup().setHTML(
                `<b>${p.farmId}</b><br/>${p.location || ""}<br/>N=${p.totalAnimals}<br/>I=${p.infected}<br/>Prev=${
                  p.prevalence === null ? "NA" : (p.prevalence * 100).toFixed(2) + "%"
                }<br/>R0=${p.estimatedR0 === null ? "NA" : Number(p.estimatedR0).toFixed(3)}`
              )
            )
            .addTo(map);

          markers.push(marker);
        });
      } catch (e: any) {
        setMessage(`Mapbox failed: ${e.message}`);
      }
    }

    init();

    return () => {
      markers.forEach((m) => m.remove());
      if (map) map.remove();
    };
  }, [points]);

  return (
    <div>
      {message && (
        <p className="mb-3 rounded-xl bg-red-500/20 p-3 text-sm text-red-100">
          {message}
        </p>
      )}

      <div
        ref={containerRef}
        className="h-[560px] overflow-hidden rounded-3xl border border-white/10 bg-slate-900"
      />
    </div>
  );
}

function RiskPValuePlot({ data, threshold }: { data: any[]; threshold: number }) {
  const sorted = [...(data ?? [])].sort((a, b) => a.pValue - b.pValue).slice(0, 12);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">p-value Plot</h4>

      <div className="space-y-3">
        {sorted.map((d, i) => {
          const width = Math.max(3, Math.min(100, (1 - Math.min(d.pValue, 1)) * 100));

          return (
            <div key={i}>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span>{d.variable}</span>
                <span>p={valueText(d.pValue)}</span>
              </div>

              <div className="h-3 rounded-full bg-white/10">
                <div
                  className={`h-3 rounded-full ${
                    d.pValue < 0.05
                      ? "bg-cyan-300"
                      : d.pValue < threshold
                      ? "bg-blue-400"
                      : "bg-slate-500"
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RiskForestPlot({
  data,
  title = "Odds Ratio Plot",
}: {
  data: any[];
  title?: string;
}) {
  const rows = [...(data ?? [])]
    .filter((d) => Number.isFinite(d.oddsRatio))
    .slice(0, 12);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">{title}</h4>

      <div className="space-y-4">
        {rows.map((d, i) => {
          const pos = Math.max(5, Math.min(95, 50 + Math.log(Number(d.oddsRatio)) * 22));

          return (
            <div key={i}>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span>{d.variable}</span>
                <span>OR={valueText(d.oddsRatio)}</span>
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
      </div>
    </div>
  );
}

function RiskTable({ rows }: { rows: any[] }) {
  return (
    <div className="mt-6 overflow-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="bg-black text-cyan-300">
          <tr>
            {["Variable", "Test", "p-value", "OR", "95% CI", "Interpretation"].map((h) => (
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
              <td className="border border-white/10 px-3 py-2">{r.test}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.pValue)}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.oddsRatio)}</td>
              <td className="border border-white/10 px-3 py-2">
                {valueText(r.ciLower)} - {valueText(r.ciUpper)}
              </td>
              <td className="border border-white/10 px-3 py-2">
                {r.interpretation || r.message}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
              strokeWidth={Math.max(1, Math.min(8, e.movements))}
            />
          );
        })}

        {nodes.map((n: any) => (
          <g key={n.id}>
            <circle
              cx={center + n.x * scale}
              cy={center + n.y * scale}
              r={10 + n.degree * 3}
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

function DegreeBars({ data }: { data: any[] }) {
  const maxV = Math.max(1, ...(data ?? []).map((d) => d.degree ?? 0));

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">
        Node Degree Ranking
      </h4>

      <div className="space-y-3">
        {(data ?? []).slice(0, 12).map((d, i) => (
          <div key={i}>
            <div className="mb-1 flex justify-between text-xs text-slate-300">
              <span>{d.node}</span>
              <span>degree={d.degree}</span>
            </div>

            <div className="h-3 rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-cyan-300"
                style={{ width: `${Math.max(2, ((d.degree ?? 0) / maxV) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
