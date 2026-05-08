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
  | "network";

type TransmissionStep = "farm" | "observe" | "table" | "analysis" | "map";

type MapStyleMode = "normal" | "satellite";

type QigenexSequenceMode = "unaligned" | "aligned";

type QigenexAnalysisMode =
  | "complete"
  | "alignment"
  | "qc"
  | "classification"
  | "gene_orf"
  | "gp5"
  | "mutation"
  | "fitness"
  | "evolution"
  | "phylogeny"
  | "genomic_intelligence"
  | "ml_qml"
  | "antigenic_drift"
  | "antigenic_shift"
  | "vaccine_escape"
  | "geo_spatiotemporal"
  | "animal_host"
  | "visualization"
  | "report_package";

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

const QIGENEX_PUBLIC_BACKEND =
  process.env.NEXT_PUBLIC_QIGENEX_BACKEND_PUBLIC_URL?.replace(/\/+$/, "") ||
  "http://34.67.1.205:8000";

function qigenexResultUrl(path?: string) {
  if (!path) return "";

  if (path.startsWith("http")) {
    return path;
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${QIGENEX_PUBLIC_BACKEND}${cleanPath}`;
}

function qigenexDownloadName(path: string) {
  return path.split("/").pop() || "qigenex_result";
}

function qigenexStatusColor(status?: string) {
  if (status === "completed") return "text-emerald-300";
  if (status === "failed" || status === "error") return "text-red-300";
  if (status === "queued" || status === "running") return "text-amber-300";
  return "text-slate-300";
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
  const [statsGroupColumn, setStatsGroupColumn] = useState("");
  const [statsValueColumns, setStatsValueColumns] = useState("");
  const [statsTests, setStatsTests] = useState("descriptive,t_test,paired_t_test,anova,welch_anova,chi_square,correlation,normality,kruskal_wallis,mann_whitney,linear_regression");
  const [statsAlpha, setStatsAlpha] = useState("0.05");

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

  const [qigenexOpen, setQigenexOpen] = useState(false);
  const [qigenexFullscreen, setQigenexFullscreen] = useState(false);
  const [qigenexSequenceMode, setQigenexSequenceMode] = useState<QigenexSequenceMode>("unaligned");
  const [qigenexAnalysisMode, setQigenexAnalysisMode] = useState<QigenexAnalysisMode>("complete");
  const [qigenexFastaFile, setQigenexFastaFile] = useState<File | null>(null);
  const [qigenexFastaFileName, setQigenexFastaFileName] = useState("");
  const [qigenexFastaText, setQigenexFastaText] = useState("");
  const [qigenexAlignedFile, setQigenexAlignedFile] = useState<File | null>(null);
  const [qigenexAlignedFileName, setQigenexAlignedFileName] = useState("");
  const [qigenexAlignedText, setQigenexAlignedText] = useState("");
  const [qigenexReferenceText, setQigenexReferenceText] = useState("");
  const [qigenexVaccineStrainText, setQigenexVaccineStrainText] = useState("");
  const [qigenexGeoFile, setQigenexGeoFile] = useState<File | null>(null);
  const [qigenexGeoFileName, setQigenexGeoFileName] = useState("");
  const [qigenexAnimalFile, setQigenexAnimalFile] = useState<File | null>(null);
  const [qigenexAnimalFileName, setQigenexAnimalFileName] = useState("");
  const [qigenexGeoRowsText, setQigenexGeoRowsText] = useState(
    "sample_id,farm_id,location,latitude,longitude,collection_date,cases,total_animals\nISO_001,Farm_1,Mymensingh,24.7471,90.4203,2026-01-01,5,100\nISO_002,Farm_2,Gazipur,24.0023,90.4264,2026-01-05,8,120"
  );
  const [qigenexAnimalRowsText, setQigenexAnimalRowsText] = useState(
    "animal_id,sample_id,species,age,sex,disease_state,immunity_score,serum_pathogen_load,vaccine_strain,vaccination_date,antibody_titer,co_infections\nA001,ISO_001,cattle,24,female,infected,42,8.2,Strain_A,2025-12-01,128,none\nA002,ISO_002,goat,18,male,infected,35,7.1,Strain_B,2025-11-20,64,pasteurella"
  );
  const [qigenexNotes, setQigenexNotes] = useState("");
  const [qigenexResult, setQigenexResult] = useState<any>(null);
  const [qigenexLoading, setQigenexLoading] = useState(false);

  const [log, setLog] = useState<string[]>([
    "> Tools page ready.",
    "> EGStat-N initialized.",
    "> QI-GeneX-N ready.",
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
    formData.append("groupColumn", statsGroupColumn);
    formData.append("valueColumns", statsValueColumns);
    formData.append("tests", statsTests);
    formData.append("alpha", statsAlpha);

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

  async function pollQigenexJob(jobId: string) {
    for (let i = 0; i < 240; i++) {
      const response = await fetch(`/api/qigenex?job_id=${encodeURIComponent(jobId)}`, {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();
      setQigenexResult(data);

      if (data.status === "completed") {
        pushLog([
          "> QI-GeneX-N completed.",
          `> Status: ${data.message ?? "completed"}.`,
          `> Outputs available: ${Object.keys(data.outputs ?? {}).length}.`,
        ]);
        return data;
      }

      if (data.status === "failed" || data.status === "error") {
        pushLog([`> QI-GeneX-N failed: ${data.message || data.error || "Unknown error"}`]);
        return data;
      }

      if (i % 4 === 0) {
        pushLog([`> QI-GeneX-N still running: ${data.message ?? data.status ?? "processing"}`]);
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
    }

    pushLog(["> QI-GeneX-N polling timeout. Check backend job status manually."]);
    return null;
  }

  async function runQigenexAnalysis() {
    const hasSequence =
      qigenexFastaText.trim() ||
      qigenexFastaFile ||
      qigenexAlignedText.trim() ||
      qigenexAlignedFile;

    if (!hasSequence) {
      pushLog([
        "> ERROR: QI-GeneX-N requires FASTA text, FASTA file, aligned text, or aligned FASTA file.",
      ]);
      return;
    }

    const formData = new FormData();

    formData.append("analysisMode", qigenexAnalysisMode);
    formData.append("sequenceMode", qigenexSequenceMode);
    formData.append("tool", "QI-GeneX-N");

    const selectedBackendMode =
      qigenexAnalysisMode === "phylogeny" ||
      qigenexAnalysisMode === "genomic_intelligence" ||
      qigenexAnalysisMode === "evolution" ||
      qigenexAnalysisMode === "antigenic_drift" ||
      qigenexAnalysisMode === "antigenic_shift"
        ? "standard"
        : "fast";

    formData.append("mode", selectedBackendMode);

    formData.append("run_visualization", "true");
    formData.append("run_composite_figures", "true");
    formData.append("run_packaging", "true");
    formData.append("run_ml", "true");
    formData.append("run_qml", "true");
    formData.append("run_fitness", "true");
    formData.append("run_geospatial", "true");
    formData.append("run_report", "true");

    if (
      qigenexAnalysisMode === "evolution" ||
      qigenexAnalysisMode === "phylogeny" ||
      qigenexAnalysisMode === "genomic_intelligence" ||
      qigenexAnalysisMode === "antigenic_drift" ||
      qigenexAnalysisMode === "antigenic_shift"
    ) {
      formData.append("run_phylogeny", "true");
    }

    formData.append("figure_set", "full");
    formData.append("figure_styles", "journal_clean,journal_colorblind,journal_mono");
    formData.append("figure_formats", "png,svg,pdf");
    formData.append("figure_dpi", "600");

    if (qigenexFastaText.trim()) formData.append("fastaText", qigenexFastaText);
    if (qigenexFastaFile) formData.append("fastaFile", qigenexFastaFile);

    if (qigenexAlignedText.trim()) formData.append("alignedText", qigenexAlignedText);
    if (qigenexAlignedFile) formData.append("alignedFile", qigenexAlignedFile);

    if (qigenexReferenceText.trim()) formData.append("referenceText", qigenexReferenceText);
    if (qigenexVaccineStrainText.trim()) {
      formData.append("vaccineStrainText", qigenexVaccineStrainText);
    }

    if (qigenexGeoFile) formData.append("geoFile", qigenexGeoFile);
    if (qigenexGeoRowsText.trim()) formData.append("geoRowsText", qigenexGeoRowsText);

    if (qigenexAnimalFile) formData.append("animalFile", qigenexAnimalFile);
    if (qigenexAnimalRowsText.trim()) formData.append("animalRowsText", qigenexAnimalRowsText);

    if (qigenexNotes.trim()) formData.append("notes", qigenexNotes);

    setQigenexLoading(true);
    setQigenexResult(null);

    try {
      const response = await fetch("/api/qigenex", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || data.status === "error") {
        setQigenexResult(data);
        pushLog([`> QI-GeneX-N ERROR: ${data.error || data.message || "Google Cloud analysis failed."}`]);
        return;
      }

      setQigenexResult(data);

      const jobId = data.job_id;

      pushLog([
        "> QI-GeneX-N job submitted to Google Cloud.",
        `> Job ID: ${jobId}`,
        `> Backend mode: ${data.mode ?? selectedBackendMode}`,
        "> Polling job status...",
      ]);

      if (jobId) {
        await pollQigenexJob(jobId);
      }
    } catch (error) {
      pushLog([`> QI-GeneX-N connection ERROR: ${String(error)}`]);
    } finally {
      setQigenexLoading(false);
    }
  }


  function clearQigenexInputs() {
    setQigenexFastaFile(null);
    setQigenexFastaFileName("");
    setQigenexFastaText("");
    setQigenexAlignedFile(null);
    setQigenexAlignedFileName("");
    setQigenexAlignedText("");
    setQigenexReferenceText("");
    setQigenexVaccineStrainText("");
    setQigenexGeoFile(null);
    setQigenexGeoFileName("");
    setQigenexAnimalFile(null);
    setQigenexAnimalFileName("");
    setQigenexNotes("");
    setQigenexResult(null);
    pushLog(["> QI-GeneX-N inputs cleared."]);
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
    <main className="min-h-screen overflow-hidden bg-slate-950 px-6 py-16 text-white">
      <section className="relative mx-auto max-w-7xl">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 top-32 h-80 w-80 rounded-full bg-purple-500/20 blur-3xl" />

        <div className="relative mb-10 rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 shadow-2xl backdrop-blur-xl md:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 text-sm font-black uppercase tracking-[0.35em] text-cyan-300">
                Research workspace
              </p>
              <h1 className="text-5xl font-black tracking-tight md:text-7xl">
                Tools
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300 md:text-lg">
                Select a tool, upload or enter data, run analysis, visualize results, and download outputs from one clean dashboard.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setOpen(true)}
                className="rounded-2xl bg-cyan-400 px-6 py-4 font-black text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:-translate-y-1 hover:bg-white"
              >
                Open EGStat-N
              </button>
              <button
                onClick={() => setQigenexOpen(true)}
                className="rounded-2xl bg-purple-400 px-6 py-4 font-black text-slate-950 shadow-lg shadow-purple-400/20 transition hover:-translate-y-1 hover:bg-white"
              >
                Open QI-GeneX-N
              </button>
            </div>
          </div>
        </div>

        <div className="relative grid gap-6 lg:grid-cols-2">
          <button
            onClick={() => setOpen(true)}
            className="group rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-400/15 via-white/[0.06] to-slate-950 p-7 text-left shadow-2xl backdrop-blur-xl transition hover:-translate-y-2 hover:border-cyan-300/60"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="rounded-2xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950">
                Epidemiology
              </div>
              <span className="rounded-full border border-cyan-300/30 px-4 py-2 text-sm font-black text-cyan-200 group-hover:bg-cyan-400 group-hover:text-slate-950">
                Launch →
              </span>
            </div>
            <h2 className="text-4xl font-black text-cyan-200">EGStat-N</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "SEIR transmission",
                "Interactive heatmap",
                "Risk analysis",
                "Network analytics",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </button>

          <button
            onClick={() => setQigenexOpen(true)}
            className="group rounded-[2rem] border border-purple-300/20 bg-gradient-to-br from-purple-500/20 via-white/[0.06] to-slate-950 p-7 text-left shadow-2xl backdrop-blur-xl transition hover:-translate-y-2 hover:border-purple-300/60"
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="rounded-2xl bg-purple-400 px-4 py-2 text-sm font-black text-slate-950">
                Genomics
              </div>
              <span className="rounded-full border border-purple-300/30 px-4 py-2 text-sm font-black text-purple-200 group-hover:bg-purple-400 group-hover:text-slate-950">
                Launch →
              </span>
            </div>
            <h2 className="text-4xl font-black text-purple-200">QI-GeneX-N</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "FASTA input",
                "Mutation profile",
                "Vaccine mismatch",
                "Reports + figures",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold text-slate-200">
                  {item}
                </div>
              ))}
            </div>
          </button>
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
                  EGStat-N
                </h2>
                <p className="text-sm text-slate-400">
                  Transmission • Heatmap • Risk • Statistics • Network
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
                  statsGroupColumn={statsGroupColumn}
                  setStatsGroupColumn={setStatsGroupColumn}
                  statsValueColumns={statsValueColumns}
                  setStatsValueColumns={setStatsValueColumns}
                  statsTests={statsTests}
                  setStatsTests={setStatsTests}
                  statsAlpha={statsAlpha}
                  setStatsAlpha={setStatsAlpha}
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


              <div className="mt-8">
                <Console log={log} />
              </div>
            </div>
          </div>
        </div>
      )}

      {qigenexOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4 backdrop-blur">
          <div
            className={`border border-purple-300/20 bg-slate-950 shadow-2xl ${
              qigenexFullscreen
                ? "h-full w-full rounded-none"
                : "h-[92vh] w-full max-w-7xl rounded-[2rem]"
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-2xl font-black text-purple-300">
                  QI-GeneX-N
                </h2>
                <p className="text-sm text-slate-400">
                  Sequence analysis • mutation profile • reports
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setQigenexFullscreen(!qigenexFullscreen)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-purple-300 hover:text-purple-300"
                >
                  {qigenexFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>

                <button
                  onClick={() => setQigenexOpen(false)}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="h-[calc(100%-88px)] overflow-auto p-6">
              <QigenexSection
                sequenceMode={qigenexSequenceMode}
                setSequenceMode={setQigenexSequenceMode}
                analysisMode={qigenexAnalysisMode}
                setAnalysisMode={setQigenexAnalysisMode}
                fastaFileName={qigenexFastaFileName}
                setFastaFile={setQigenexFastaFile}
                setFastaFileName={setQigenexFastaFileName}
                fastaText={qigenexFastaText}
                setFastaText={setQigenexFastaText}
                alignedFileName={qigenexAlignedFileName}
                setAlignedFile={setQigenexAlignedFile}
                setAlignedFileName={setQigenexAlignedFileName}
                alignedText={qigenexAlignedText}
                setAlignedText={setQigenexAlignedText}
                referenceText={qigenexReferenceText}
                setReferenceText={setQigenexReferenceText}
                vaccineStrainText={qigenexVaccineStrainText}
                setVaccineStrainText={setQigenexVaccineStrainText}
                geoFileName={qigenexGeoFileName}
                setGeoFile={setQigenexGeoFile}
                setGeoFileName={setQigenexGeoFileName}
                geoRowsText={qigenexGeoRowsText}
                setGeoRowsText={setQigenexGeoRowsText}
                animalFileName={qigenexAnimalFileName}
                setAnimalFile={setQigenexAnimalFile}
                setAnimalFileName={setQigenexAnimalFileName}
                animalRowsText={qigenexAnimalRowsText}
                setAnimalRowsText={setQigenexAnimalRowsText}
                notes={qigenexNotes}
                setNotes={setQigenexNotes}
                result={qigenexResult}
                loading={qigenexLoading}
                runQigenexAnalysis={runQigenexAnalysis}
                clearQigenexInputs={clearQigenexInputs}
                downloadJSON={downloadJSON}
                downloadCSV={downloadCSV}
                log={log}
              />
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
        <div className="grid gap-6">
          <Panel>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-2xl font-black text-cyan-300">Create New Farm</h3>
                <p className="text-sm text-slate-400">
                  Confirmatory Diagnosis is automatically treated as I.
                </p>
              </div>

              <button
                onClick={prepareNewFarm}
                className="rounded-xl bg-emerald-400 px-4 py-2 font-black text-slate-950 hover:bg-white"
              >
                Prepare Another Farm
              </button>
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
        </div>
      )}

      {tStep === "observe" && (
        <div className="grid gap-6">
          <Panel>
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
                Only I and Confirmatory Diagnosis are shown.
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
        <div className="grid gap-6">
          <Panel>
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
    statsGroupColumn,
    setStatsGroupColumn,
    statsValueColumns,
    setStatsValueColumns,
    statsTests,
    setStatsTests,
    statsAlpha,
    setStatsAlpha,
    runStatistics,
    downloadJSON,
  } = props;

  const availableTests = [
    { key: "descriptive", label: "Descriptive summary" },
    { key: "t_test", label: "Independent t-test" },
    { key: "paired_t_test", label: "Paired t-test" },
    { key: "one_sample_t_test", label: "One-sample t-test" },
    { key: "anova", label: "One-way ANOVA" },
    { key: "two_way_anova", label: "Two-way ANOVA" },
    { key: "welch_anova", label: "Welch ANOVA" },
    { key: "repeated_measures_anova", label: "Repeated-measures ANOVA" },
    { key: "chi_square", label: "Chi-square / Fisher exact" },
    { key: "correlation", label: "Pearson/Spearman correlation" },
    { key: "normality", label: "Normality tests" },
    { key: "levene", label: "Levene variance test" },
    { key: "kruskal_wallis", label: "Kruskal-Wallis" },
    { key: "mann_whitney", label: "Mann-Whitney U" },
    { key: "linear_regression", label: "Linear regression" },
    { key: "logistic_regression", label: "Logistic regression" },
  ];

  const selectedTests = new Set(String(statsTests || "").split(",").map((x) => x.trim()).filter(Boolean));

  function toggleTest(key: string) {
    const next = new Set(selectedTests);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setStatsTests(Array.from(next).join(","));
  }

  const inferential = statsResult?.statistics?.inferentialTests ?? statsResult?.statistics?.tests ?? statsResult?.statistics?.inferential ?? [];
  const correlations = statsResult?.statistics?.correlationMatrix ?? statsResult?.statistics?.correlations ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <Panel className="xl:col-span-4">
        <h3 className="mb-2 text-2xl font-black text-cyan-300">
          Advanced Statistics
        </h3>
        <p className="mb-5 text-sm leading-7 text-slate-400">
          Upload a CSV, choose variables, then request descriptive, t-test, ANOVA, non-parametric, correlation, and regression outputs from the backend.
        </p>

        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setStatsFile(f);
            setStatsFileName(f?.name || "");
          }}
          className="block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
        />

        {statsFileName && <p className="mt-2 text-sm text-cyan-300">Loaded: {statsFileName}</p>}

        <div className="mt-5 grid gap-4">
          <Input label="Group / factor column" value={statsGroupColumn} onChange={setStatsGroupColumn} />
          <Input label="Numeric value columns, comma-separated" value={statsValueColumns} onChange={setStatsValueColumns} />
          <Input label="Alpha / significance level" value={statsAlpha} onChange={setStatsAlpha} />
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="font-black text-cyan-300">Select analyses</h4>
            <button
              onClick={() => setStatsTests(availableTests.map((t) => t.key).join(","))}
              className="rounded-lg border border-white/10 px-3 py-1 text-xs font-black hover:border-cyan-300"
            >
              Select all
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {availableTests.map((test) => (
              <label
                key={test.key}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  selectedTests.has(test.key)
                    ? "border-cyan-300 bg-cyan-300/15 text-cyan-100"
                    : "border-white/10 bg-slate-900 text-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTests.has(test.key)}
                  onChange={() => toggleTest(test.key)}
                />
                {test.label}
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={runStatistics}
          className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 hover:bg-white"
        >
          Run Advanced Statistical Analysis
        </button>

        {statsResult && (
          <button
            onClick={() => downloadJSON(statsResult, "egstat_n_advanced_statistics.json")}
            className="mt-4 w-full rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-600"
          >
            Download JSON
          </button>
        )}
      </Panel>

      <Panel className="xl:col-span-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black text-cyan-300">Statistical Results</h3>
            <p className="text-sm text-slate-400">Descriptive summaries plus inferential-test cards when returned by the API.</p>
          </div>
          <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-xs font-black text-cyan-200">
            α = {statsAlpha || "0.05"}
          </div>
        </div>

        {statsResult ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <ResultCard title="Rows" value={String(statsResult.statistics.dataset.rows)} />
              <ResultCard title="Columns" value={String(statsResult.statistics.dataset.columns)} />
              <ResultCard title="Numeric Variables" value={String(statsResult.statistics.numericColumns.length)} />
              <ResultCard title="Tests Requested" value={String(selectedTests.size)} />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.isArray(inferential) && inferential.length > 0 ? (
                inferential.slice(0, 12).map((test: any, i: number) => (
                  <div key={i} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <h4 className="font-black text-cyan-200">{test.test ?? test.name ?? test.method ?? `Test ${i + 1}`}</h4>
                      <span className={`rounded-full px-2 py-1 text-xs font-black ${Number(test.pValue ?? test.p_value ?? 1) <= Number(statsAlpha || 0.05) ? "bg-emerald-400/20 text-emerald-200" : "bg-slate-700 text-slate-200"}`}>
                        p={valueText(test.pValue ?? test.p_value, 4)}
                      </span>
                    </div>
                    <div className="grid gap-2 text-sm text-slate-300">
                      <p>Statistic: <b>{valueText(test.statistic ?? test.fStatistic ?? test.tStatistic ?? test.chiSquare, 4)}</b></p>
                      <p>DF: <b>{valueText(test.df ?? test.degreesOfFreedom, 2)}</b></p>
                      <p>Effect: <b>{valueText(test.effectSize ?? test.etaSquared ?? test.cohensD ?? test.r, 4)}</b></p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm text-slate-300 md:col-span-2 xl:col-span-3">
                  No inferential-test array was returned yet. The frontend already sends requested tests as <code className="text-cyan-200">tests</code>, <code className="text-cyan-200">groupColumn</code>, <code className="text-cyan-200">valueColumns</code>, and <code className="text-cyan-200">alpha</code> for backend support.
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div>
                <h4 className="mb-3 text-lg font-black text-cyan-300">Descriptive Statistics</h4>
                <StatsTable rows={statsResult.statistics.descriptiveStatistics ?? []} />
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                <h4 className="mb-3 text-lg font-black text-cyan-300">Correlation / Extra Outputs</h4>
                {Array.isArray(correlations) && correlations.length > 0 ? (
                  <pre className="max-h-80 overflow-auto rounded-xl bg-black p-4 text-xs text-slate-300">{JSON.stringify(correlations, null, 2)}</pre>
                ) : (
                  <p className="rounded-xl bg-slate-900 p-4 text-sm text-slate-300">Correlation, model, or assumption-test outputs will appear here when returned by the backend.</p>
                )}
              </div>
            </div>

            <pre className="mt-6 max-h-96 overflow-auto rounded-2xl bg-black p-5 text-sm text-slate-300">
              {JSON.stringify(statsResult.statistics, null, 2)}
            </pre>
          </>
        ) : (
          <p className="rounded-2xl bg-slate-900 p-6 text-slate-300">
            Upload CSV and run advanced statistical analysis.
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
            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <RankingBars title="Node Degree Ranking" data={networkResult.network.visualization?.degreeBars ?? []} labelKey="node" valueKey="degree" />
              <NetworkComplexityPanel data={networkResult.network} />
            </div>
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

function QigenexSection(props: any) {
  const {
    sequenceMode,
    setSequenceMode,
    analysisMode,
    setAnalysisMode,
    fastaFileName,
    setFastaFile,
    setFastaFileName,
    fastaText,
    setFastaText,
    alignedFileName,
    setAlignedFile,
    setAlignedFileName,
    alignedText,
    setAlignedText,
    referenceText,
    setReferenceText,
    vaccineStrainText,
    setVaccineStrainText,
    geoFileName,
    setGeoFile,
    setGeoFileName,
    geoRowsText,
    setGeoRowsText,
    animalFileName,
    setAnimalFile,
    setAnimalFileName,
    animalRowsText,
    setAnimalRowsText,
    notes,
    setNotes,
    result,
    loading,
    runQigenexAnalysis,
    clearQigenexInputs,
    downloadJSON,
    downloadCSV,
    log,
  } = props;

  const hasSequence = Boolean(fastaText.trim() || fastaFileName || alignedText.trim() || alignedFileName);
  const hasMetadata = Boolean(geoRowsText.trim() || geoFileName || animalRowsText.trim() || animalFileName);

  const analysisOptions = [
    {
      id: "complete",
      title: "Full analysis",
      subtitle: "Complete workflow.",
      accent: "border-purple-300/40 bg-purple-400/10 text-purple-100",
      chips: ["QC", "genes", "mutations", "figures", "ZIP"],
    },
    {
      id: "mutation",
      title: "Mutation profile",
      subtitle: "Variants and hotspots.",
      accent: "border-rose-300/40 bg-rose-400/10 text-rose-100",
      chips: ["variants", "indels", "hotspots"],
    },
    {
      id: "vaccine_escape",
      title: "Vaccine mismatch",
      subtitle: "Mismatch screening.",
      accent: "border-amber-300/40 bg-amber-400/10 text-amber-100",
      chips: ["GP5", "mismatch", "screening"],
    },
    {
      id: "fitness",
      title: "Fitness landscape",
      subtitle: "Expansion score.",
      accent: "border-emerald-300/40 bg-emerald-400/10 text-emerald-100",
      chips: ["fitness", "expansion", "3D plot"],
    },
    {
      id: "phylogeny",
      title: "Relationship analysis",
      subtitle: "Tree and distance views.",
      accent: "border-blue-300/40 bg-blue-400/10 text-blue-100",
      chips: ["tree", "PCA", "network"],
    },
    {
      id: "geo_spatiotemporal",
      title: "Map and timeline",
      subtitle: "Map and timeline outputs.",
      accent: "border-lime-300/40 bg-lime-400/10 text-lime-100",
      chips: ["map", "timeline", "region"],
    },
    {
      id: "visualization",
      title: "Figures only",
      subtitle: "Figure export.",
      accent: "border-fuchsia-300/40 bg-fuchsia-400/10 text-fuchsia-100",
      chips: ["PNG", "SVG", "PDF"],
    },
    {
      id: "report_package",
      title: "Report package",
      subtitle: "Report downloads.",
      accent: "border-slate-300/40 bg-white/10 text-slate-100",
      chips: ["report", "tables", "downloads"],
    },
  ];

  const selectedOption =
    analysisOptions.find((option) => option.id === analysisMode) ?? analysisOptions[0];

  const runSteps = [
    { label: "Choose", active: true },
    { label: "Add data", active: hasSequence },
    { label: "Run", active: loading || Boolean(result) },
    { label: "Download", active: result?.status === "completed" },
  ];

  return (
    <section className="space-y-6">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-black uppercase tracking-[0.3em] text-purple-300">
              QI-GeneX-N
            </p>
            <h3 className="text-3xl font-black text-purple-100">
              Select, upload, run, download
            </h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {runSteps.map((step, index) => (
              <div
                key={step.label}
                className={`rounded-full px-4 py-2 text-xs font-black ${
                  step.active ? "bg-purple-400 text-slate-950" : "bg-white/10 text-slate-400"
                }`}
              >
                {index + 1}. {step.label}
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-2xl font-black text-purple-300">Analysis option</h4>
            </div>
            <select
              value={analysisMode}
              onChange={(e) => setAnalysisMode(e.target.value)}
              className="rounded-2xl border border-purple-300/20 bg-slate-900 px-4 py-3 text-sm font-black text-white outline-none focus:border-purple-300"
            >
              {analysisOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {analysisOptions.map((option) => {
              const active = option.id === selectedOption.id;
              return (
                <button
                  key={option.id}
                  onClick={() => setAnalysisMode(option.id)}
                  className={`rounded-3xl border p-4 text-left transition hover:-translate-y-1 hover:border-purple-300 ${
                    active ? option.accent : "border-white/10 bg-slate-900/70 text-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h5 className="text-lg font-black">{option.title}</h5>
                      <p className="mt-2 text-sm leading-6 opacity-80">{option.subtitle}</p>
                    </div>
                    {active && <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-950">selected</span>}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {option.chips.map((chip) => (
                      <span key={chip} className="rounded-full bg-black/25 px-3 py-1 text-xs font-bold">
                        {chip}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <h4 className="text-2xl font-black text-purple-300">Run setup</h4>
          <div className="mt-5 grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Selected</p>
              <p className="mt-2 text-lg font-black text-white">{selectedOption.title}</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">{selectedOption.subtitle}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <ResultCard title="Sequence" value={hasSequence ? "Ready" : "Required"} />
              <ResultCard title="Metadata" value={hasMetadata ? "Added" : "Optional"} />
              <ResultCard title="Figures" value="On" />
              <ResultCard title="Downloads" value="On" />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="mb-3 text-sm font-black text-purple-200">Sequence input</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setSequenceMode("unaligned")}
                  className={`rounded-xl px-4 py-2 text-sm font-black ${
                    sequenceMode === "unaligned" ? "bg-purple-400 text-slate-950" : "bg-white/10 text-slate-300"
                  }`}
                >
                  FASTA
                </button>
                <button
                  onClick={() => setSequenceMode("aligned")}
                  className={`rounded-xl px-4 py-2 text-sm font-black ${
                    sequenceMode === "aligned" ? "bg-purple-400 text-slate-950" : "bg-white/10 text-slate-300"
                  }`}
                >
                  Aligned FASTA
                </button>
              </div>

              {sequenceMode === "unaligned" ? (
                <div className="grid gap-3">
                  <input
                    type="file"
                    accept=".fasta,.fa,.fna,.txt"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setFastaFile(f);
                      setFastaFileName(f?.name || "");
                    }}
                    className="block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
                  />
                  {fastaFileName && <p className="text-sm font-bold text-purple-200">Loaded: {fastaFileName}</p>}
                  <textarea
                    value={fastaText}
                    onChange={(e) => setFastaText(e.target.value)}
                    placeholder=">sample_1\nATGC..."
                    className="min-h-[130px] rounded-2xl border border-white/10 bg-black p-4 text-sm text-slate-200 outline-none focus:border-purple-300"
                  />
                </div>
              ) : (
                <div className="grid gap-3">
                  <input
                    type="file"
                    accept=".fasta,.fa,.aln,.txt"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setAlignedFile(f);
                      setAlignedFileName(f?.name || "");
                    }}
                    className="block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
                  />
                  {alignedFileName && <p className="text-sm font-bold text-purple-200">Loaded: {alignedFileName}</p>}
                  <textarea
                    value={alignedText}
                    onChange={(e) => setAlignedText(e.target.value)}
                    placeholder=">sample_1\nATGC---..."
                    className="min-h-[130px] rounded-2xl border border-white/10 bg-black p-4 text-sm text-slate-200 outline-none focus:border-purple-300"
                  />
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <Panel>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-2xl font-black text-purple-300">Optional data</h4>
            <p className="mt-1 text-sm text-slate-400">Add these only when available.</p>
          </div>
          <button
            onClick={clearQigenexInputs}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-slate-300 hover:border-red-300 hover:text-red-300"
          >
            Clear
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <p className="mb-3 font-black text-purple-200">Reference / vaccine sequence</p>
            <textarea
              value={referenceText}
              onChange={(e) => setReferenceText(e.target.value)}
              placeholder="Reference FASTA sequence"
              className="mb-3 min-h-[110px] w-full rounded-2xl border border-white/10 bg-black p-4 text-sm text-slate-200 outline-none focus:border-purple-300"
            />
            <textarea
              value={vaccineStrainText}
              onChange={(e) => setVaccineStrainText(e.target.value)}
              placeholder="Vaccine strain FASTA sequence"
              className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-black p-4 text-sm text-slate-200 outline-none focus:border-purple-300"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <p className="mb-3 font-black text-purple-200">Metadata</p>
            <input
              type="file"
              accept=".csv,.tsv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setGeoFile(f);
                setGeoFileName(f?.name || "");
              }}
              className="mb-3 block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
            />
            {geoFileName && <p className="mb-3 text-sm font-bold text-purple-200">Loaded: {geoFileName}</p>}
            <textarea
              value={geoRowsText}
              onChange={(e) => setGeoRowsText(e.target.value)}
              placeholder="sample_id,collection_date,country,region,latitude,longitude"
              className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-black p-4 text-sm text-slate-200 outline-none focus:border-purple-300"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <p className="mb-3 font-black text-purple-200">Animal-level table</p>
            <input
              type="file"
              accept=".csv,.tsv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setAnimalFile(f);
                setAnimalFileName(f?.name || "");
              }}
              className="mb-3 block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
            />
            {animalFileName && <p className="mb-3 text-sm font-bold text-purple-200">Loaded: {animalFileName}</p>}
            <textarea
              value={animalRowsText}
              onChange={(e) => setAnimalRowsText(e.target.value)}
              placeholder="animal_id,sample_id,species,age,disease_state"
              className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-black p-4 text-sm text-slate-200 outline-none focus:border-purple-300"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <p className="mb-3 font-black text-purple-200">Notes</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Study notes or interpretation context"
              className="min-h-[190px] w-full rounded-2xl border border-white/10 bg-black p-4 text-sm text-slate-200 outline-none focus:border-purple-300"
            />
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="text-2xl font-black text-purple-300">Run</h4>
            <p className="mt-1 text-sm text-slate-400">
              {hasSequence ? "Ready." : "FASTA required."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={runQigenexAnalysis}
              disabled={loading || !hasSequence}
              className="rounded-2xl bg-purple-400 px-7 py-4 font-black text-slate-950 transition hover:-translate-y-1 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? "Running..." : "Run selected analysis"}
            </button>
            {result && (
              <button
                onClick={() => downloadJSON(result, "qigenex_n_results.json")}
                className="rounded-2xl bg-blue-500 px-7 py-4 font-black text-white hover:bg-blue-600"
              >
                Download JSON
              </button>
            )}
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="mb-5">
          <h4 className="text-2xl font-black text-purple-300">Results</h4>
        </div>
        <QigenexResultsDashboard result={result} />
      </Panel>

      <Console log={log} />
    </section>
  );
}

function QigenexResultsDashboard({ result }: { result: any }) {
  if (!result) {
    return (
      <div className="rounded-2xl bg-slate-900 p-6 text-slate-300">
        Run QI-GeneX-N to show live status, reports, figures, and downloads.
      </div>
    );
  }

  const outputs = result.outputs ?? {};
  const summary = result.summary ?? {};
  const jobId = result.job_id ?? result.bridge?.jobId ?? "";

  const zipOutputs = [
    ["Complete Results ZIP", outputs.qigenex_complete_results_zip],
    ["Figures ZIP", outputs.qigenex_figures_only_zip],
    ["Tables ZIP", outputs.qigenex_tables_only_zip],
    ["Report Package ZIP", outputs.qigenex_report_package_zip],
  ].filter(([, path]) => Boolean(path));

  const reportOutputs = [
    ["Research Report", outputs.qigenex_research_report_txt],
    ["Research Report JSON", outputs.qigenex_research_report_json],
    ["Key Findings", outputs.qigenex_key_findings],
    ["Download Manifest", outputs.qigenex_download_manifest],
    ["Package Manifest", outputs.qigenex_package_manifest],
    ["Figure Manifest", outputs.figure_manifest],
    ["Figure Captions", outputs.figure_captions],
    ["Composite Figure Manifest", outputs.composite_figure_manifest],
  ].filter(([, path]) => Boolean(path));

  const analysisOutputs = [
    ["QC Table", outputs.qc_table],
    ["Reference Similarity", outputs.reference_similarity],
    ["ORF Annotation", outputs.orf_annotation],
    ["PRRSV Gene Annotation", outputs.prrsv_gene_annotation],
    ["Curated Gene Annotation", outputs.prrsv_curated_gene_annotation],
    ["GP5 Glycosylation", outputs.gp5_glycosylation],
    ["GP5 Features", outputs.gp5_features],
    ["Nucleotide Mutations", outputs.nucleotide_mutations],
    ["Indels", outputs.indels],
    ["Mutation Features", outputs.mutation_features],
    ["Predictive Mutation Ranking", outputs.predictive_mutation_ranking],
    ["Vaccine Mismatch", outputs.vaccine_mismatch_scores],
    ["Risk Assessment", outputs.risk_assessment],
    ["Surveillance Priority", outputs.sample_surveillance_priority],
    ["Molecular Clusters", outputs.spatiotemporal_clusters ?? outputs.molecular_epidemiology_clusters],
    ["Fitness Landscape", outputs.fitness_landscape],
    ["Strain Expansion", outputs.strain_expansion_scores],
    ["ML Features", outputs.ml_risk_features],
    ["ML Predictions", outputs.ml_predictions],
    ["QML Predictions", outputs.qml_predictions],
    ["Map-ready Samples", outputs.map_ready_samples],
    ["Timeline-ready Samples", outputs.timeline_ready_samples],
  ].filter(([, path]) => Boolean(path));

  const figureOutputs = [
    ["Figures ZIP", outputs.qigenex_figures_only_zip],
    ["Figure Summary", outputs.figure_generation_summary_txt],
    ["Figure Manifest", outputs.figure_manifest],
    ["Figure Captions", outputs.figure_captions],
    ["Composite Figure Summary", outputs.composite_figure_summary_txt],
    ["Composite Figure Manifest", outputs.composite_figure_manifest],
  ].filter(([, path]) => Boolean(path));

  const cards = [
    ["Status", result.status ?? "NA"],
    ["Job ID", jobId || "NA"],
    ["Message", result.message ?? "NA"],
    ["Total Sequences", summary.total_sequences ?? "NA"],
    ["Passed QC", summary.passed_qc ?? "NA"],
    ["Failed QC", summary.failed_qc ?? "NA"],
    ["Mean GC %", summary.mean_gc_percent ?? "NA"],
    [
      "Classification",
      summary.classification_summary?.classified_sequences !== undefined
        ? `${summary.classification_summary.classified_sequences} classified`
        : "NA",
    ],
    [
      "ORF5/GP5",
      summary.prrsv_specialized_summary?.orf5_gp5_status ??
        summary.prrsv_specialized_summary?.orf5_gp5_alias_found ??
        "NA",
    ],
    [
      "Mutations",
      summary.mutation_summary?.total_substitutions !== undefined
        ? `${summary.mutation_summary.total_substitutions} substitutions`
        : "NA",
    ],
    ["Mismatch", summary.vaccine_mismatch_summary?.mean_mismatch_score ?? "NA"],
    ["Fitness", summary.fitness_landscape_summary?.max_fitness_landscape_score ?? "NA"],
    [
      "ML",
      summary.ml_model_summary?.ml_available === true
        ? "available"
        : summary.ml_model_summary?.reason ?? "not available",
    ],
    [
      "QML",
      summary.qml_summary?.qml_available === true
        ? "available"
        : summary.qml_summary?.reason ?? "not available",
    ],
    [
      "Figures",
      summary.figure_generation_summary?.generated_records !== undefined
        ? `${summary.figure_generation_summary.generated_records} generated`
        : "pending",
    ],
  ];

  function LinkButton({ label, path }: { label: string; path: any }) {
    const href = qigenexResultUrl(String(path));

    async function copyLink() {
      try {
        await navigator.clipboard.writeText(href);
        alert("Download link copied. Paste it directly in your browser if automatic download is blocked.");
      } catch {
        alert(href);
      }
    }

    return (
      <div className="flex flex-wrap gap-2">
        <a
          href={href}
          download={qigenexDownloadName(String(path))}
          className="rounded-xl border border-purple-300/20 bg-purple-400/10 px-4 py-3 text-sm font-black text-purple-100 transition hover:border-purple-300 hover:bg-purple-400 hover:text-slate-950"
        >
          {label}
        </a>

        <button
          type="button"
          onClick={copyLink}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-slate-200 hover:border-cyan-300 hover:text-cyan-300"
        >
          Copy link
        </button>
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-2xl font-black text-purple-300">
              QI-GeneX-N Results
            </h4>
            <p className={`mt-1 text-sm font-black uppercase tracking-[0.25em] ${qigenexStatusColor(result.status)}`}>
              {result.status ?? "unknown"}
            </p>
          </div>

          {jobId && (
            <a
              href={qigenexResultUrl(outputs.qigenex_complete_results_zip || `/results/${jobId}/qigenex_complete_results.zip`)}
              download={qigenexDownloadName(outputs.qigenex_complete_results_zip || "qigenex_complete_results.zip")}
              className="rounded-xl bg-purple-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-white"
            >
              Download Complete Results
            </a>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {cards.map(([title, value]) => (
            <div key={title} className="rounded-2xl bg-slate-900 p-4">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                {title}
              </p>
              <p className="mt-2 break-words text-sm font-bold text-white">
                {String(value)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {zipOutputs.length > 0 && (
        <div className="rounded-3xl border border-emerald-300/20 bg-emerald-400/5 p-5">
          <h4 className="mb-4 text-xl font-black text-emerald-300">
            One-click ZIP Downloads
          </h4>
          <div className="flex flex-wrap gap-3">
            {zipOutputs.map(([label, path]) => (
              <LinkButton key={label} label={label} path={path} />
            ))}
          </div>
        </div>
      )}

      {reportOutputs.length > 0 && (
        <div className="rounded-3xl border border-blue-300/20 bg-blue-400/5 p-5">
          <h4 className="mb-4 text-xl font-black text-blue-300">
            Reports, Captions, and Manifests
          </h4>
          <div className="flex flex-wrap gap-3">
            {reportOutputs.map(([label, path]) => (
              <LinkButton key={label} label={label} path={path} />
            ))}
          </div>
        </div>
      )}

      {analysisOutputs.length > 0 && (
        <div className="rounded-3xl border border-amber-300/20 bg-amber-400/5 p-5">
          <h4 className="mb-4 text-xl font-black text-amber-300">
            Analysis Tables
          </h4>
          <div className="flex flex-wrap gap-3">
            {analysisOutputs.map(([label, path]) => (
              <LinkButton key={label} label={label} path={path} />
            ))}
          </div>
        </div>
      )}

      {figureOutputs.length > 0 && (
        <div className="rounded-3xl border border-fuchsia-300/20 bg-fuchsia-400/5 p-5">
          <h4 className="mb-4 text-xl font-black text-fuchsia-300">
            Publication Figures
          </h4>
          <div className="flex flex-wrap gap-3">
            {figureOutputs.map(([label, path]) => (
              <LinkButton key={label} label={label} path={path} />
            ))}
          </div>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            Figure outputs include PNG, SVG, and PDF formats, journal-style variants,
            composite panels, captions, and manifests when figure generation is complete.
          </p>
        </div>
      )}

      <details className="rounded-3xl border border-white/10 bg-black p-5">
        <summary className="cursor-pointer text-lg font-black text-purple-300">
          Raw QI-GeneX-N JSON
        </summary>
        <pre className="mt-4 max-h-[520px] overflow-auto text-xs leading-6 text-slate-300">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Readiness({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-slate-900 p-3">
      <span className="font-bold text-slate-300">{label}</span>
      <span
        className={`rounded-full px-3 py-1 text-xs font-black ${
          ready ? "bg-emerald-400 text-slate-950" : "bg-slate-700 text-slate-300"
        }`}
      >
        {ready ? "Ready" : "Optional"}
      </span>
    </div>
  );
}

function OldQigenexResults({ result }: { result: any }) {
  const sequenceResults = result?.qmlPrediction?.sequenceResults ?? [];
  const hotspots = result?.predictiveMutation?.topHotspots ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        <ResultCard title="Sequences" value={String(result?.summary?.sequenceCount ?? "NA")} />
        <ResultCard title="Mean QML" value={valueText(result?.qmlPrediction?.meanQMLScore)} />
        <ResultCard title="Mean Fitness" value={valueText(result?.fitnessLandscape?.meanFitness)} />
        <ResultCard title="Hotspots" value={String(result?.predictiveMutation?.hotspotCount ?? "NA")} />
        <ResultCard title="Risk" value={String(result?.predictiveEvolution?.riskCategory ?? "NA")} />
      </div>

      {result?.scientificNote && (
        <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-7 text-amber-100">
          <p className="mb-2 font-black text-amber-200">Scientific note</p>
          {result.scientificNote}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <QigenexBars
          title="Integrated predictive score by sequence"
          data={sequenceResults.map((x: any) => ({
            label: x.id,
            value: x.integratedPredictiveScore ?? 0,
          }))}
        />
        <QigenexBars
          title="Quantum mutation score by sequence"
          data={sequenceResults.map((x: any) => ({
            label: x.id,
            value: x.quantumCircuit?.quantumMutationScore ?? 0,
          }))}
        />
        <QigenexBars
          title="PyTorch fitness potential"
          data={sequenceResults.map((x: any) => ({
            label: x.id,
            value: x.torchPrediction?.fitnessPotential ?? 0,
          }))}
        />
        <QigenexBars
          title="Mutation hotspot load"
          data={hotspots.slice(0, 30).map((x: any) => ({
            label: `Pos ${x.position}`,
            value: x.mutationLoad ?? x.diversity ?? 0,
          }))}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <h4 className="mb-4 text-lg font-black text-purple-300">
            Predictive mutation hotspot table
          </h4>
          <div className="max-h-96 overflow-auto rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="p-3">Position</th>
                  <th className="p-3">Variants</th>
                  <th className="p-3">Mutation Load</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.slice(0, 100).map((h: any, i: number) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="p-3">{h.position}</td>
                    <td className="p-3">{h.variants?.join(", ") ?? "NA"}</td>
                    <td className="p-3">{valueText(h.mutationLoad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel>
          <h4 className="mb-4 text-lg font-black text-purple-300">
            Further analysis suggestions
          </h4>
          <ul className="list-disc space-y-3 pl-5 text-sm leading-7 text-slate-300">
            <li>Use aligned FASTA for stronger mutation-position interpretation.</li>
            <li>Add vaccine strain sequence for vaccine escape screening.</li>
            <li>Add reference sequence for mutation naming and isolate comparison.</li>
            <li>Add geospatial CSV for spatial clustering and heatmap analysis.</li>
            <li>Add animal-level CSV for host adaptation and immune pressure analysis.</li>
            <li>Train the PyTorch/Qiskit model using labeled fitness, antigenic, or vaccine-escape datasets.</li>
          </ul>
        </Panel>
      </div>

      <pre className="max-h-[520px] overflow-auto rounded-2xl bg-black p-5 text-xs text-slate-300">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}

function QigenexBars({
  title,
  data,
}: {
  title: string;
  data: { label: string; value: number }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 0.0001);

  return (
    <Panel>
      <h4 className="mb-4 text-lg font-black text-purple-300">{title}</h4>
      {data.length === 0 ? (
        <p className="text-sm text-slate-400">No visualization data available yet.</p>
      ) : (
        <div className="space-y-3">
          {data.slice(0, 25).map((item, i) => (
            <div key={`${item.label}-${i}`}>
              <div className="mb-1 flex justify-between gap-3 text-xs text-slate-400">
                <span className="truncate">{item.label}</span>
                <span>{Number(item.value).toFixed(4)}</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-purple-400"
                  style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
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

function NetworkComplexityPanel({ data }: { data: any }) {
  const stats = data?.statistics ?? {};
  const edges = data?.edges ?? [];
  const totalMovements = edges.reduce((sum: number, e: any) => sum + Number(e.movements ?? 0), 0);
  const totalDistance = edges.reduce((sum: number, e: any) => sum + Number(e.distanceKm ?? 0), 0);
  const meanDistance = edges.length ? totalDistance / edges.length : 0;
  const density = Number(stats.density ?? 0);
  const complexityScore = Math.min(100, Math.round((density * 45 + Math.log1p(totalMovements) * 8 + Math.log1p(edges.length) * 12)));

  const cards = [
    ["Total Movements", valueText(totalMovements, 0)],
    ["Mean Distance", `${valueText(meanDistance, 2)} km`],
    ["Density", valueText(density, 4)],
    ["Complexity Score", `${complexityScore}/100`],
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">Network Complexity Dashboard</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(([title, value]) => <ResultCard key={title} title={title} value={value} />)}
      </div>
      <div className="mt-4 h-4 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-cyan-300" style={{ width: `${complexityScore}%` }} />
      </div>
      <p className="mt-3 text-sm leading-7 text-slate-400">
        Higher score means denser contact structure, stronger movement volume, and more outbreak connectivity.
      </p>
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
  const [selectedNode, setSelectedNode] = useState<string>(nodes[0]?.id ?? "");
  const [hoveredEdge, setHoveredEdge] = useState<any>(null);
  const [minMovements, setMinMovements] = useState(0);
  const [labelMode, setLabelMode] = useState<"all" | "selected" | "none">("all");
  const size = 680;
  const center = size / 2;
  const scale = 260;

  useEffect(() => {
    if (!selectedNode && nodes[0]?.id) setSelectedNode(nodes[0].id);
  }, [nodes, selectedNode]);

  const filteredEdges = edges.filter((e: any) => Number(e.movements ?? 0) >= minMovements);
  const selectedNodeData = nodes.find((n: any) => n.id === selectedNode);
  const neighborIds = new Set(
    filteredEdges
      .filter((e: any) => e.source === selectedNode || e.target === selectedNode)
      .flatMap((e: any) => [e.source, e.target])
  );
  const maxDegree = Math.max(1, ...nodes.map((n: any) => Number(n.degree ?? 0)));
  const maxMovements = Math.max(1, ...edges.map((e: any) => Number(e.movements ?? 0)));
  const shownNodeIds = new Set(filteredEdges.flatMap((e: any) => [e.source, e.target]));
  nodes.forEach((n: any) => shownNodeIds.add(n.id));

  function nodeXY(id: string) {
    const n = nodes.find((x: any) => x.id === id);
    if (!n) return null;
    return {
      node: n,
      x: center + Number(n.x ?? 0) * scale,
      y: center + Number(n.y ?? 0) * scale,
    };
  }

  return (
    <div className="mt-6 rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-black via-slate-950 to-cyan-950/30 p-5 shadow-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-xl font-black text-cyan-300">Interactive Network Intelligence</h4>
          <p className="text-sm text-slate-400">Click nodes, filter movement intensity, inspect edges, and identify network hubs.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-black uppercase tracking-widest text-slate-400">Min movements</label>
          <input
            type="range"
            min="0"
            max={String(Math.ceil(maxMovements))}
            value={minMovements}
            onChange={(e) => setMinMovements(Number(e.target.value))}
            className="w-36"
          />
          <span className="rounded-lg bg-cyan-300/10 px-3 py-1 text-sm font-black text-cyan-200">{minMovements}</span>
          <select
            value={labelMode}
            onChange={(e) => setLabelMode(e.target.value as any)}
            className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="all">All labels</option>
            <option value="selected">Selected labels</option>
            <option value="none">No labels</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <svg width="100%" viewBox={`0 0 ${size} ${size}`} className="rounded-[1.5rem] border border-white/10 bg-slate-950 shadow-inner">
            <defs>
              <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgb(255,255,255)" stopOpacity="0.95" />
                <stop offset="45%" stopColor="rgb(34,211,238)" stopOpacity="0.9" />
                <stop offset="100%" stopColor="rgb(14,165,233)" stopOpacity="0.35" />
              </radialGradient>
              <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,6 L9,3 z" fill="rgba(34,211,238,.75)" />
              </marker>
            </defs>

            {filteredEdges.map((e: any, i: number) => {
              const s = nodeXY(e.source);
              const t = nodeXY(e.target);
              if (!s || !t) return null;
              const isFocused = selectedNode && (e.source === selectedNode || e.target === selectedNode);
              const width = 1 + (Number(e.movements ?? 1) / maxMovements) * 8;

              return (
                <g key={`${e.source}-${e.target}-${i}`} onMouseEnter={() => setHoveredEdge(e)} onMouseLeave={() => setHoveredEdge(null)}>
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={isFocused ? "rgba(251,191,36,.95)" : "rgba(34,211,238,.35)"}
                    strokeWidth={width + 8}
                    strokeLinecap="round"
                    opacity="0.14"
                  />
                  <line
                    x1={s.x}
                    y1={s.y}
                    x2={t.x}
                    y2={t.y}
                    stroke={isFocused ? "rgba(251,191,36,.95)" : "rgba(34,211,238,.75)"}
                    strokeWidth={width}
                    strokeLinecap="round"
                    markerEnd="url(#arrowHead)"
                  />
                </g>
              );
            })}

            {nodes.map((n: any) => {
              const x = center + Number(n.x ?? 0) * scale;
              const y = center + Number(n.y ?? 0) * scale;
              const degree = Number(n.degree ?? 0);
              const isSelected = n.id === selectedNode;
              const isNeighbor = neighborIds.has(n.id);
              const radius = 11 + (degree / maxDegree) * 22;
              const showLabel = labelMode === "all" || (labelMode === "selected" && (isSelected || isNeighbor));

              return (
                <g key={n.id} onClick={() => setSelectedNode(n.id)} className="cursor-pointer">
                  <circle cx={x} cy={y} r={radius + 10} fill={isSelected ? "rgba(251,191,36,.18)" : isNeighbor ? "rgba(34,211,238,.13)" : "rgba(15,23,42,.1)"} />
                  <circle cx={x} cy={y} r={radius} fill="url(#nodeGlow)" stroke={isSelected ? "rgb(251,191,36)" : "rgba(255,255,255,.65)"} strokeWidth={isSelected ? 4 : 1.5} />
                  <text x={x} y={y + 4} textAnchor="middle" fill="rgb(15,23,42)" fontSize="11" fontWeight="900">
                    {degree}
                  </text>
                  {showLabel && (
                    <text x={x + radius + 8} y={y + 5} fill="white" fontSize="13" fontWeight="800">
                      {n.id}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="grid content-start gap-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
            <h5 className="mb-3 font-black text-cyan-300">Selected Node</h5>
            <select
              value={selectedNode}
              onChange={(e) => setSelectedNode(e.target.value)}
              className="mb-3 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm"
            >
              {nodes.map((n: any) => <option key={n.id} value={n.id}>{n.id}</option>)}
            </select>
            <div className="grid gap-2 text-sm text-slate-300">
              <p>Degree: <b className="text-white">{valueText(selectedNodeData?.degree, 0)}</b></p>
              <p>Neighbors: <b className="text-white">{Math.max(0, neighborIds.size - 1)}</b></p>
              <p>Visible edges: <b className="text-white">{filteredEdges.length}</b></p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
            <h5 className="mb-3 font-black text-cyan-300">Edge Inspector</h5>
            {hoveredEdge ? (
              <div className="grid gap-2 text-sm text-slate-300">
                <p><b className="text-white">{hoveredEdge.source}</b> → <b className="text-white">{hoveredEdge.target}</b></p>
                <p>Type: <b>{hoveredEdge.edgeType ?? hoveredEdge.type ?? "movement"}</b></p>
                <p>Distance: <b>{valueText(hoveredEdge.distanceKm, 2)} km</b></p>
                <p>Movements: <b>{valueText(hoveredEdge.movements, 0)}</b></p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Hover any edge to inspect movement, distance, and direction.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
            <h5 className="mb-3 font-black text-cyan-300">Complexity Signals</h5>
            <div className="grid gap-3">
              <ResultCard title="Visible Nodes" value={String(shownNodeIds.size)} />
              <ResultCard title="Visible Edges" value={String(filteredEdges.length)} />
              <ResultCard title="Max Degree" value={String(maxDegree)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
