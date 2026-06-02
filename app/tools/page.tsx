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

type QigenexAction = "analysis" | "figures" | "package";

type QigenexFigureOptions = {
  figure_plot_style?: string;
  figure_styles?: string;
  figure_formats?: string;
  figure_dpi?: string;
  figure_layout?: string;
  figure_title_mode?: string;
  figure_title_text?: string;
  title_font_size?: string;
  axis_title_font_size?: string;
  tick_label_font_size?: string;
  font_weight?: string;
  transparent_background?: string;
};

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

function tableColumns(rows: Record<string, any>[]) {
  const cols: string[] = [];

  rows.forEach((row) => {
    Object.keys(row ?? {}).forEach((key) => {
      if (!cols.includes(key)) cols.push(key);
    });
  });

  return cols;
}

function csvFromGenericRows(rows: Record<string, any>[]) {
  const headers = tableColumns(rows);
  const escape = (value: any) => {
    const raw = String(value ?? "");
    return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  };

  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n");
}

function rowsAsUploadFile(rows: Record<string, any>[], fallbackName: string) {
  const csv = csvFromGenericRows(rows);
  return new File([csv], fallbackName, { type: "text/csv;charset=utf-8" });
}

function numericColumnNames(rows: Record<string, any>[]) {
  return tableColumns(rows).filter((column) => {
    const values = rows.map((row) => row[column]).filter((value) => value !== "" && value !== null && value !== undefined);
    return values.length > 0 && values.every((value) => Number.isFinite(Number(value)));
  });
}

function categoricalColumnNames(rows: Record<string, any>[]) {
  const numeric = new Set(numericColumnNames(rows));
  return tableColumns(rows).filter((column) => !numeric.has(column));
}

function uniqueColumnValues(rows: Record<string, any>[], column: string, limit = 50) {
  if (!column) return [];
  return Array.from(
    new Set(
      rows
        .map((row) => row[column])
        .filter((value) => value !== "" && value !== null && value !== undefined)
        .map((value) => String(value))
    )
  ).slice(0, limit);
}

function shortValue(value: any, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return "NA";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(digits);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function flattenForTable(value: any, prefix = ""): Record<string, any> {
  if (value === null || value === undefined) return { [prefix || "value"]: value };
  if (typeof value !== "object") return { [prefix || "value"]: value };
  if (Array.isArray(value)) return { [prefix || "items"]: value.length };

  const out: Record<string, any> = {};
  Object.entries(value).forEach(([key, val]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (val === null || val === undefined || typeof val !== "object") {
      out[nextKey] = val;
    } else if (Array.isArray(val)) {
      out[nextKey] = val.length;
    } else {
      Object.assign(out, flattenForTable(val, nextKey));
    }
  });
  return out;
}

function resultTableSources(result: any) {
  const sources: { label: string; rows: Record<string, any>[] }[] = [];

  function visit(node: any, path: string) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      if (node.length > 0 && node.some((item) => item && typeof item === "object")) {
        sources.push({
          label: `${path} (${node.length})`,
          rows: node.map((item, index) => ({ row: index + 1, ...flattenForTable(item) })),
        });
      }
      return;
    }

    Object.entries(node).forEach(([key, val]) => {
      const nextPath = path ? `${path}.${key}` : key;
      if (Array.isArray(val)) {
        if (val.length > 0 && val.some((item) => item && typeof item === "object")) {
          sources.push({
            label: `${nextPath} (${val.length})`,
            rows: val.map((item, index) => ({ row: index + 1, ...flattenForTable(item) })),
          });
        }
      } else if (val && typeof val === "object") {
        visit(val, nextPath);
      }
    });
  }

  visit(result, "result");

  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.label;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  "http://140.245.47.234";

function qigenexResultUrl(path?: string) {
  if (!path) return "";

  let cleanPath = path;

  if (path.startsWith("http")) {
    try {
      const url = new URL(path);
      cleanPath = url.pathname;
    } catch {
      cleanPath = path;
    }
  }

  cleanPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;

  return `/api/qigenex?path=${encodeURIComponent(cleanPath)}`;
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
  const [riskOutcomeEventLevel, setRiskOutcomeEventLevel] = useState("");
  const [riskPredictors, setRiskPredictors] = useState("");
  const [riskThreshold, setRiskThreshold] = useState("0.2");
  const [riskClarification, setRiskClarification] = useState("");
  const [riskResult, setRiskResult] = useState<any>(null);
  const [riskRows, setRiskRows] = useState<Record<string, any>[]>([]);
  const [riskReferenceCategories, setRiskReferenceCategories] = useState<Record<string, string>>({});

  const [statsFile, setStatsFile] = useState<File | null>(null);
  const [statsFileName, setStatsFileName] = useState("");
  const [statsResult, setStatsResult] = useState<any>(null);
  const [statsGroupColumn, setStatsGroupColumn] = useState("");
  const [statsValueColumns, setStatsValueColumns] = useState("");
  const [statsTests, setStatsTests] = useState("descriptive,t_test,paired_t_test,anova,welch_anova,chi_square,correlation,normality,kruskal_wallis,mann_whitney,linear_regression");
  const [statsAlpha, setStatsAlpha] = useState("0.05");
  const [statsTTestValueColumn, setStatsTTestValueColumn] = useState("");
  const [statsTTestGroupColumn, setStatsTTestGroupColumn] = useState("");
  const [statsTTestGroupA, setStatsTTestGroupA] = useState("");
  const [statsTTestGroupB, setStatsTTestGroupB] = useState("");
  const [statsPairedColumnA, setStatsPairedColumnA] = useState("");
  const [statsPairedColumnB, setStatsPairedColumnB] = useState("");
  const [statsOneSampleMean, setStatsOneSampleMean] = useState("0");
  const [statsOutcomeColumn, setStatsOutcomeColumn] = useState("");
  const [statsPredictorColumns, setStatsPredictorColumns] = useState("");
  const [statsSubjectColumn, setStatsSubjectColumn] = useState("");
  const [statsAnovaValueColumn, setStatsAnovaValueColumn] = useState("");
  const [statsAnovaFactorColumns, setStatsAnovaFactorColumns] = useState("");
  const [statsAnovaPrimaryFactor, setStatsAnovaPrimaryFactor] = useState("");
  const [statsAnovaSecondaryFactor, setStatsAnovaSecondaryFactor] = useState("");
  const [statsDataClarification, setStatsDataClarification] = useState("");
  const [statsTTestClarification, setStatsTTestClarification] = useState("");
  const [statsAnovaClarification, setStatsAnovaClarification] = useState("");
  const [statsRegressionClarification, setStatsRegressionClarification] = useState("");
  const [statsRows, setStatsRows] = useState<Record<string, any>[]>([]);

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

  const farmIds: string[] = Array.from(new Set(farms.map((r) => r.Farm_ID)));

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
    if ((!riskFile && riskRows.length === 0) || !riskOutcome || !riskPredictors) {
      pushLog(["> ERROR: Upload/view data first, then select dependent and independent variables."]);
      return;
    }

    const formData = new FormData();

    const liveRiskRows =
      riskRows.length > 0
        ? riskRows
        : riskFile
        ? await readSpreadsheetLikeFile(riskFile)
        : [];

    if (!liveRiskRows.length) {
      pushLog(["> ERROR: Risk file could not be read. Open/view the dataset once, or upload a valid CSV/XLSX file."]);
      return;
    }

    if (riskRows.length === 0) {
      setRiskRows(liveRiskRows);
    }

    formData.append("module", "risk");
    formData.append("rows", JSON.stringify(liveRiskRows));
    formData.append("file", rowsAsUploadFile(liveRiskRows, riskFileName || "egstat_n_risk_live_data.csv"));
    formData.append("outcome", riskOutcome);
    formData.append("predictors", riskPredictors);
    formData.append("threshold", riskThreshold);
    formData.append("outcomeColumn", riskOutcome);
    formData.append("outcomeEventLevel", riskOutcomeEventLevel);
    formData.append("outcomePositiveLevel", riskOutcomeEventLevel);
    formData.append("positiveOutcomeLevel", riskOutcomeEventLevel);
    formData.append("eventLevel", riskOutcomeEventLevel);
    formData.append("predictorColumns", riskPredictors);
    formData.append("referenceCategories", JSON.stringify(riskReferenceCategories));
    formData.append("referenceCategoryMap", JSON.stringify(riskReferenceCategories));
    formData.append("categoryReferences", JSON.stringify(riskReferenceCategories));
    formData.append("dataClarification", riskClarification);
    formData.append("outcomeClarification", riskClarification);
    formData.append("predictorClarification", riskClarification);

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
      "> Risk-factor analysis completed from the current live-edited table.",
      `> Dependent variable=${riskOutcome}; independent variables=${riskPredictors}.`,
      data?.risk?.excludedPredictors?.length
        ? `> ${data.risk.excludedPredictors.length} unsuitable predictor(s) were excluded automatically. Check the excluded-predictor table.`
        : "> No predictors were automatically excluded.",
      data?.risk?.modelSelectionNotes?.length
        ? `> Model selection note: ${data.risk.modelSelectionNotes.join(" ")}`
        : "> Multivariable model selection completed.",
    ]);
  }

  async function runStatistics() {
    if (!statsFile && statsRows.length === 0) {
      pushLog(["> ERROR: Upload/view a statistics dataset first."]);
      return;
    }

    const formData = new FormData();

    formData.append("module", "statistics");
    formData.append("file", statsRows.length > 0 ? rowsAsUploadFile(statsRows, statsFileName || "egstat_n_statistics_live_data.csv") : statsFile!);
    formData.append("groupColumn", statsGroupColumn);
    formData.append("valueColumns", statsValueColumns);
    formData.append("tests", statsTests);
    formData.append("alpha", statsAlpha);
    formData.append("tTestValueColumn", statsTTestValueColumn || statsValueColumns.split(",")[0] || "");
    formData.append("tTestGroupColumn", statsTTestGroupColumn || statsGroupColumn);
    formData.append("tTestGroupA", statsTTestGroupA);
    formData.append("tTestGroupB", statsTTestGroupB);
    formData.append("pairedColumnA", statsPairedColumnA);
    formData.append("pairedColumnB", statsPairedColumnB);
    formData.append("oneSampleMean", statsOneSampleMean);
    formData.append("outcomeColumn", statsOutcomeColumn || statsValueColumns.split(",")[0] || "");
    formData.append("predictorColumns", statsPredictorColumns);
    formData.append("subjectColumn", statsSubjectColumn);
    formData.append("anovaValueColumn", statsAnovaValueColumn || statsValueColumns.split(",")[0] || "");
    formData.append("anovaFactorColumns", statsAnovaFactorColumns || statsGroupColumn);
    formData.append("anovaPrimaryFactor", statsAnovaPrimaryFactor || statsGroupColumn.split(",")[0] || "");
    formData.append("anovaSecondaryFactor", statsAnovaSecondaryFactor || statsGroupColumn.split(",")[1] || "");
    formData.append("dataClarification", statsDataClarification);
    formData.append("fieldClarifications", statsDataClarification);
    formData.append("testClarifications", [statsTTestClarification, statsAnovaClarification, statsRegressionClarification].filter(Boolean).join(" | "));
    formData.append("groupClarification", statsDataClarification);
    formData.append("anovaClarification", statsAnovaClarification);
    formData.append("tTestClarification", statsTTestClarification);

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
    pushLog([
      "> Statistical analysis completed from the current live-edited table.",
      `> Group/factor=${statsGroupColumn || "auto"}; value columns=${statsValueColumns || "auto numeric"}.`,
    ]);
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

  async function runQigenexAnalysis(
    action: QigenexAction = "analysis",
    figureOptions: QigenexFigureOptions = {}
  ) {
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

    formData.append("action", action);
    formData.append("analysisMode", qigenexAnalysisMode);
    formData.append("selected_analysis", qigenexAnalysisMode);
    formData.append("sequenceMode", qigenexSequenceMode);
    formData.append("tool", "QI-GeneX-N");

    const standardModes = [
      "complete",
      "evolution",
      "phylogeny",
      "genomic_intelligence",
      "ml_qml",
      "antigenic_drift",
      "antigenic_shift",
      "fitness",
      "geo_spatiotemporal",
    ];

    const selectedBackendMode =
      action === "figures" || action === "package"
        ? "standard"
        : standardModes.includes(qigenexAnalysisMode)
        ? "standard"
        : "fast";

    formData.append("mode", selectedBackendMode);

    const flags: Record<string, string> = {
      run_visualization: "false",
      run_composite_figures: "false",
      run_packaging: "false",
      run_ml: "false",
      run_qml: "false",
      run_fitness: "false",
      run_geospatial: "false",
      run_report: "false",
      run_phylogeny: "false",
    };

    if (action === "figures") {
      flags.run_visualization = "true";
    } else if (action === "package") {
      flags.run_visualization = "true";
      flags.run_composite_figures = "true";
      flags.run_packaging = "true";
      flags.run_report = "true";
    } else if (qigenexAnalysisMode === "complete") {
      Object.keys(flags).forEach((key) => {
        flags[key] = "true";
      });
    } else if (
      qigenexAnalysisMode === "evolution" ||
      qigenexAnalysisMode === "phylogeny" ||
      qigenexAnalysisMode === "genomic_intelligence" ||
      qigenexAnalysisMode === "antigenic_drift" ||
      qigenexAnalysisMode === "antigenic_shift"
    ) {
      flags.run_phylogeny = "true";
    } else if (qigenexAnalysisMode === "ml_qml") {
      flags.run_ml = "true";
      flags.run_qml = "true";
    } else if (qigenexAnalysisMode === "fitness") {
      flags.run_fitness = "true";
    } else if (qigenexAnalysisMode === "geo_spatiotemporal") {
      flags.run_geospatial = "true";
    } else if (qigenexAnalysisMode === "visualization") {
      flags.run_visualization = "true";
    } else if (qigenexAnalysisMode === "report_package") {
      flags.run_report = "true";
      flags.run_packaging = "true";
    }

    Object.entries(flags).forEach(([key, value]) => formData.append(key, value));

    formData.append("figure_set", action === "figures" ? "selected" : "none");
    formData.append("figure_plot_style", figureOptions.figure_plot_style || "auto");
    formData.append("figure_styles", figureOptions.figure_styles || "journal_clean");
    formData.append("figure_formats", figureOptions.figure_formats || "png,svg,pdf");
    formData.append("figure_dpi", figureOptions.figure_dpi || "900");
    formData.append("figure_layout", figureOptions.figure_layout || "separate");
    formData.append("panel_mode", figureOptions.figure_layout || "separate");
    formData.append("separate_or_panel", figureOptions.figure_layout || "separate");
    formData.append("figure_title_mode", figureOptions.figure_title_mode || "none");
    formData.append("figure_title_text", figureOptions.figure_title_text || "");
    formData.append("figure_title_font_size", figureOptions.title_font_size || "16");
    formData.append("x_title_font_size", figureOptions.axis_title_font_size || "13");
    formData.append("y_title_font_size", figureOptions.axis_title_font_size || "13");
    formData.append("x_label_font_size", figureOptions.tick_label_font_size || "11");
    formData.append("y_label_font_size", figureOptions.tick_label_font_size || "11");
    formData.append("figure_title_font_weight", figureOptions.font_weight || "bold");
    formData.append("x_title_font_weight", figureOptions.font_weight || "bold");
    formData.append("y_title_font_weight", figureOptions.font_weight || "bold");
    formData.append("transparent_background", figureOptions.transparent_background || "false");

    if (qigenexFastaText.trim()) formData.append("fastaText", qigenexFastaText);
    if (qigenexFastaFile) formData.append("fastaFile", qigenexFastaFile);

    if (qigenexAlignedText.trim()) formData.append("alignedText", qigenexAlignedText);
    if (qigenexAlignedFile) formData.append("alignedFile", qigenexAlignedFile);

    if (qigenexReferenceText.trim()) formData.append("referenceText", qigenexReferenceText);
    if (qigenexVaccineStrainText.trim()) formData.append("vaccineStrainText", qigenexVaccineStrainText);

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
        pushLog([`> QI-GeneX-N ERROR: ${data.error || data.message || "Oracle analysis failed."}`]);
        return;
      }

      setQigenexResult(data);

      const jobId = data.job_id;

      pushLog([
        `> QI-GeneX-N ${action} request submitted to Oracle backend.`,
        `> Selected module: ${qigenexAnalysisMode}.`,
        `> Backend mode: ${data.mode ?? selectedBackendMode}`,
        `> Job ID: ${jobId}`,
        "> Polling job status...",
      ]);

      if (jobId) await pollQigenexJob(jobId);
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
                "Risk factor analysis",
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
                  label="Risk Factor Analysis"
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
                  riskOutcomeEventLevel={riskOutcomeEventLevel}
                  setRiskOutcomeEventLevel={setRiskOutcomeEventLevel}
                  riskPredictors={riskPredictors}
                  setRiskPredictors={setRiskPredictors}
                  riskThreshold={riskThreshold}
                  setRiskThreshold={setRiskThreshold}
                  riskClarification={riskClarification}
                  setRiskClarification={setRiskClarification}
                  riskRows={riskRows}
                  setRiskRows={setRiskRows}
                  riskReferenceCategories={riskReferenceCategories}
                  setRiskReferenceCategories={setRiskReferenceCategories}
                  riskResult={riskResult}
                  runRiskAnalysis={runRiskAnalysis}
                  downloadJSON={downloadJSON}
                  downloadCSV={downloadCSV}
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
                  statsTTestValueColumn={statsTTestValueColumn}
                  setStatsTTestValueColumn={setStatsTTestValueColumn}
                  statsTTestGroupColumn={statsTTestGroupColumn}
                  setStatsTTestGroupColumn={setStatsTTestGroupColumn}
                  statsTTestGroupA={statsTTestGroupA}
                  setStatsTTestGroupA={setStatsTTestGroupA}
                  statsTTestGroupB={statsTTestGroupB}
                  setStatsTTestGroupB={setStatsTTestGroupB}
                  statsPairedColumnA={statsPairedColumnA}
                  setStatsPairedColumnA={setStatsPairedColumnA}
                  statsPairedColumnB={statsPairedColumnB}
                  setStatsPairedColumnB={setStatsPairedColumnB}
                  statsOneSampleMean={statsOneSampleMean}
                  setStatsOneSampleMean={setStatsOneSampleMean}
                  statsOutcomeColumn={statsOutcomeColumn}
                  setStatsOutcomeColumn={setStatsOutcomeColumn}
                  statsPredictorColumns={statsPredictorColumns}
                  setStatsPredictorColumns={setStatsPredictorColumns}
                  statsSubjectColumn={statsSubjectColumn}
                  setStatsSubjectColumn={setStatsSubjectColumn}
                  statsAnovaValueColumn={statsAnovaValueColumn}
                  setStatsAnovaValueColumn={setStatsAnovaValueColumn}
                  statsAnovaFactorColumns={statsAnovaFactorColumns}
                  setStatsAnovaFactorColumns={setStatsAnovaFactorColumns}
                  statsAnovaPrimaryFactor={statsAnovaPrimaryFactor}
                  setStatsAnovaPrimaryFactor={setStatsAnovaPrimaryFactor}
                  statsAnovaSecondaryFactor={statsAnovaSecondaryFactor}
                  setStatsAnovaSecondaryFactor={setStatsAnovaSecondaryFactor}
                  statsDataClarification={statsDataClarification}
                  setStatsDataClarification={setStatsDataClarification}
                  statsTTestClarification={statsTTestClarification}
                  setStatsTTestClarification={setStatsTTestClarification}
                  statsAnovaClarification={statsAnovaClarification}
                  setStatsAnovaClarification={setStatsAnovaClarification}
                  statsRegressionClarification={statsRegressionClarification}
                  setStatsRegressionClarification={setStatsRegressionClarification}
                  statsRows={statsRows}
                  setStatsRows={setStatsRows}
                  runStatistics={runStatistics}
                  downloadJSON={downloadJSON}
                  downloadCSV={downloadCSV}
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
                  downloadCSV={downloadCSV}
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

function VariablePicker({
  label,
  value,
  onChange,
  columns,
  placeholder = "Click to select variable",
  multiple = false,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  columns: string[];
  placeholder?: string;
  multiple?: boolean;
  helper?: string;
}) {
  const selected = String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  function toggleColumn(column: string) {
    if (!multiple) {
      onChange(column);
      return;
    }

    const next = new Set(selected);
    if (next.has(column)) next.delete(column);
    else next.add(column);
    onChange(Array.from(next).join(","));
  }

  return (
    <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4">
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.25em] text-cyan-200">
        {label}
      </label>

      <select
        value={multiple ? "" : value}
        onChange={(e) => {
          if (!e.target.value) return;
          toggleColumn(e.target.value);
        }}
        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-3 font-bold text-white outline-none focus:border-cyan-300"
      >
        <option value="">{placeholder}</option>
        {columns.map((column) => (
          <option key={column} value={column}>
            {column}
          </option>
        ))}
      </select>

      {helper && <p className="mt-2 text-xs leading-5 text-slate-400">{helper}</p>}

      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {selected.map((column) => (
            <button
              key={column}
              type="button"
              onClick={() => toggleColumn(column)}
              className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100 hover:bg-red-500 hover:text-white"
            >
              {column} ×
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EditableDataGrid({
  title,
  rows,
  setRows,
  selectedColumns = [],
  maxRows = 200,
}: {
  title: string;
  rows: Record<string, any>[];
  setRows: (rows: Record<string, any>[]) => void;
  selectedColumns?: string[];
  maxRows?: number;
}) {
  const columns = tableColumns(rows);
  const visibleRows = rows.slice(0, maxRows);
  const selected = new Set(selectedColumns.filter(Boolean));

  function updateCell(rowIndex: number, column: string, value: string) {
    setRows(
      rows.map((row, i) =>
        i === rowIndex
          ? {
              ...row,
              [column]: value,
            }
          : row
      )
    );
  }

  function addEmptyRow() {
    const next: Record<string, any> = {};
    columns.forEach((column) => {
      next[column] = "";
    });
    setRows([...rows, next]);
  }

  function removeRow(index: number) {
    setRows(rows.filter((_, i) => i !== index));
  }

  function addColumn() {
    const name = window.prompt("New column name");
    if (!name?.trim()) return;
    const clean = name.trim();
    if (columns.includes(clean)) return;
    setRows(rows.length > 0 ? rows.map((row) => ({ ...row, [clean]: "" })) : [{ [clean]: "" }]);
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-slate-900/70 p-6 text-slate-300">
        Upload a CSV/XLSX file to preview and edit the {title.toLowerCase()} table live.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-black text-cyan-200">{title}</h4>
          <p className="text-xs text-slate-400">
            Live editable table. Edit any cell before running analysis. Showing {visibleRows.length} of {rows.length} rows.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={addEmptyRow}
            className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-white"
          >
            + Row
          </button>
          <button
            onClick={addColumn}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black hover:border-cyan-300 hover:text-cyan-300"
          >
            + Column
          </button>
        </div>
      </div>

      <div className="max-h-[560px] overflow-auto rounded-2xl border border-white/10">
        <table className="min-w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-900">
            <tr>
              <th className="border-b border-white/10 px-3 py-3 font-black text-slate-400">#</th>
              {columns.map((column) => (
                <th
                  key={column}
                  className={`border-b border-white/10 px-3 py-3 font-black ${
                    selected.has(column) ? "bg-cyan-300/20 text-cyan-100" : "text-slate-300"
                  }`}
                >
                  {column}
                </th>
              ))}
              <th className="border-b border-white/10 px-3 py-3 font-black text-slate-400">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="odd:bg-white/[0.03] hover:bg-cyan-300/5">
                <td className="border-b border-white/5 px-3 py-2 text-slate-500">{rowIndex + 1}</td>
                {columns.map((column) => (
                  <td key={column} className="border-b border-white/5 p-1 align-top">
                    <input
                      value={String(row[column] ?? "")}
                      onChange={(e) => updateCell(rowIndex, column, e.target.value)}
                      className={`min-w-[140px] rounded-lg border px-2 py-2 outline-none ${
                        selected.has(column)
                          ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-50"
                          : "border-white/10 bg-black/30 text-slate-100 focus:border-cyan-300"
                      }`}
                    />
                  </td>
                ))}
                <td className="border-b border-white/5 p-1">
                  <button
                    onClick={() => removeRow(rowIndex)}
                    className="rounded-lg bg-red-500/80 px-3 py-2 font-black text-white hover:bg-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OutputTableExplorer({
  title,
  result,
  downloadCSV,
}: {
  title: string;
  result: any;
  downloadCSV?: (text: string, name: string) => void;
}) {
  const sources = resultTableSources(result);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = sources[selectedIndex] ?? sources[0];
  const rows = selected?.rows ?? [];
  const columns = tableColumns(rows).slice(0, 18);

  if (!result || sources.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900 p-5 text-sm text-slate-400">
        No table-form output is available yet.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-cyan-300/20 bg-slate-900/80 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-black text-cyan-200">{title}</h4>
          <p className="text-xs text-slate-400">
            Select any returned array and inspect it as a table. Showing up to 120 rows and 18 columns.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={selectedIndex}
            onChange={(e) => setSelectedIndex(Number(e.target.value))}
            className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm font-bold text-white outline-none focus:border-cyan-300"
          >
            {sources.map((source, index) => (
              <option key={source.label} value={index}>
                {source.label}
              </option>
            ))}
          </select>

          {downloadCSV && rows.length > 0 && (
            <button
              onClick={() => downloadCSV(csvFromGenericRows(rows), `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.csv`)}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black hover:border-cyan-300 hover:text-cyan-300"
            >
              Export Table CSV
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-950 text-slate-300">
            <tr>
              {columns.map((column) => (
                <th key={column} className="border-b border-white/10 px-3 py-3 font-black">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 120).map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-white/5 odd:bg-white/[0.03] hover:bg-cyan-300/5">
                {columns.map((column) => (
                  <td key={column} className="max-w-[260px] truncate px-3 py-2 text-slate-300" title={shortValue(row[column])}>
                    {shortValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnalysisClarificationBox({
  title,
  value,
  onChange,
  placeholder,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <label className="mb-2 block text-xs font-black uppercase tracking-[0.25em] text-slate-300">
        {title}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[96px] w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300"
      />
    </div>
  );
}


function ReferenceCategoryPanel({
  rows,
  predictors,
  references,
  setReferences,
}: {
  rows: Record<string, any>[];
  predictors: string[];
  references: Record<string, string>;
  setReferences: (value: Record<string, string>) => void;
}) {
  if (!predictors.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/60 p-4 text-sm text-slate-400">
        Select categorical independent variables to set reference categories. Numeric predictors do not need a reference.
      </div>
    );
  }

  function setReference(variable: string, category: string) {
    setReferences({ ...(references ?? {}), [variable]: category });
  }

  return (
    <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/5 p-4">
      <div className="mb-4">
        <h4 className="text-lg font-black text-emerald-200">Reference category setup</h4>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Choose the baseline category for each categorical predictor. The output tables will keep the reference row but OR/AOR and p-value will be shown as Reference; all other categories will be compared against it.
        </p>
      </div>

      <div className="grid gap-4">
        {predictors.map((variable) => {
          const categories = uniqueColumnValues(rows, variable, 100);
          const selected = references?.[variable] || categories[0] || "";

          return (
            <div key={variable} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-white">{variable}</p>
                  <p className="text-xs text-slate-400">Detected categories: {categories.length || 0}</p>
                </div>
                <select
                  value={selected}
                  onChange={(e) => setReference(variable, e.target.value)}
                  className="rounded-xl border border-emerald-300/30 bg-slate-950 px-3 py-2 text-sm font-bold text-white outline-none focus:border-emerald-300"
                >
                  <option value="">Select reference</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2">
                {categories.map((category) => {
                  const active = selected === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setReference(variable, category)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${
                        active
                          ? "border-emerald-300 bg-emerald-300 text-slate-950"
                          : "border-white/10 bg-white/5 text-slate-300 hover:border-emerald-300 hover:text-emerald-200"
                      }`}
                    >
                      {active ? "Reference: " : "Set ref: "}{category}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RiskCategoryTable({
  title,
  rows,
  downloadCSV,
  fileName,
}: {
  title: string;
  rows: Record<string, any>[];
  downloadCSV?: (text: string, name: string) => void;
  fileName: string;
}) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const preferredColumns = [
    "variable",
    "category",
    "referenceCategory",
    "comparison",
    "analysis",
    "n",
    "positiveLevel",
    "negativeLevel",
    "positiveLevelSource",
    "positiveCases",
    "negativeCases",
    "oddsRatio",
    "oddsRatioPerUnit",
    "logisticOddsRatio",
    "adjustedOddsRatio",
    "ciLower",
    "ciUpper",
    "logisticCiLower",
    "logisticCiUpper",
    "adjustedCiLower",
    "adjustedCiUpper",
    "pValue",
    "logisticPValue",
    "welchPValue",
    "chiSquarePValue",
    "fisherExactTwoSidedP",
    "primaryPMethod",
    "logisticPrimaryPMethod",
    "crudePValue",
    "minimumExpectedCell",
    "correctionUsed",
    "vif",
    "tolerance",
    "vifStatus",
    "variableMaxVIF",
    "variableMinTolerance",
    "variableVIFStatus",
    "vifSource",
    "coefficient",
    "coefficientLogOdds",
    "logisticCoefficient",
    "standardError",
    "logisticStandardError",
    "zStatistic",
    "logisticZStatistic",
    "pValueLabel",
    "interpretation",
  ];
  const discovered = tableColumns(normalizedRows);
  const columns = [
    ...preferredColumns.filter((column) => discovered.includes(column)),
    ...discovered.filter((column) => !preferredColumns.includes(column)),
  ].slice(0, 24);

  return (
    <div className="rounded-3xl border border-emerald-300/20 bg-slate-900/80 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-black text-emerald-200">{title}</h4>
          <p className="text-xs leading-5 text-slate-400">
            Standard category-wise table. Reference categories are retained but OR/AOR and p-value are marked as Reference.
          </p>
        </div>
        {downloadCSV && normalizedRows.length > 0 && (
          <button
            onClick={() => downloadCSV(csvFromGenericRows(normalizedRows), fileName)}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black hover:border-emerald-300 hover:text-emerald-300"
          >
            Export CSV
          </button>
        )}
      </div>

      {normalizedRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-slate-400">
          No category-level rows returned yet. Run risk factor analysis after selecting outcome, predictors, and reference categories.
        </div>
      ) : (
        <div className="max-h-[520px] overflow-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-950 text-slate-300">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="border-b border-white/10 px-3 py-3 font-black">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalizedRows.map((row, rowIndex) => {
                const isReference = String(row.pValueLabel || row.interpretation || "").toLowerCase().includes("reference") || row.isReference === true;
                return (
                  <tr key={rowIndex} className={`border-t border-white/5 ${isReference ? "bg-emerald-300/10" : "odd:bg-white/[0.03] hover:bg-cyan-300/5"}`}>
                    {columns.map((column) => (
                      <td key={column} className={`max-w-[260px] truncate px-3 py-2 ${isReference ? "font-bold text-emerald-100" : "text-slate-300"}`} title={shortValue(row[column])}>
                        {shortValue(row[column])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


function LogisticDiagnosticsPanel({ riskResult }: { riskResult: any }) {
  const diagnostics = riskResult?.risk?.logisticDiagnostics ?? riskResult?.risk?.multivariable ?? riskResult?.risk?.regression?.logistic;
  const univariableModels = riskResult?.risk?.univariableLogisticModels ?? riskResult?.risk?.regression?.univariable ?? [];

  if (!diagnostics && (!Array.isArray(univariableModels) || univariableModels.length === 0)) return null;

  const cards = diagnostics
    ? [
        ["Model", diagnostics.test ?? "Logistic regression"],
        ["Converged", diagnostics.converged === true ? "Yes" : diagnostics.converged === false ? "No" : "NA"],
        ["Events / non-events", `${shortValue(diagnostics.events)} / ${shortValue(diagnostics.nonEvents)}`],
        ["Iterations", shortValue(diagnostics.iterations)],
        ["LR χ²", shortValue(diagnostics.likelihoodRatioStatistic)],
        ["LR p-value", shortValue(diagnostics.likelihoodRatioPValue ?? diagnostics.pValue)],
        ["AIC", shortValue(diagnostics.aic)],
        ["McFadden R²", shortValue(diagnostics.pseudoR2McFadden)],
      ]
    : [];

  const modelRows = Array.isArray(univariableModels)
    ? univariableModels.map((entry: any) => ({
        variable: entry.variable,
        n: entry.model?.n,
        events: entry.model?.events,
        nonEvents: entry.model?.nonEvents,
        converged: entry.model?.converged,
        iterations: entry.model?.iterations,
        likelihoodRatioStatistic: entry.model?.likelihoodRatioStatistic,
        pValue: entry.model?.pValue,
        aic: entry.model?.aic,
        pseudoR2McFadden: entry.model?.pseudoR2McFadden,
        warnings: Array.isArray(entry.model?.warnings) ? entry.model.warnings.join(" | ") : "",
      }))
    : [];

  return (
    <div className="mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5">
      <div className="mb-4">
        <h4 className="text-lg font-black text-cyan-200">Logistic regression diagnostics</h4>
        <p className="text-xs leading-5 text-slate-400">
          Checks convergence, likelihood-ratio statistics, information criteria, and sparse/separation warnings from the corrected backend.
        </p>
      </div>

      {cards.length > 0 && (
        <div className="grid gap-3 md:grid-cols-4">
          {cards.map(([label, value]) => (
            <ResultCard key={String(label)} title={String(label)} value={String(value ?? "NA")} />
          ))}
        </div>
      )}

      {Array.isArray(diagnostics?.warnings) && diagnostics.warnings.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
          <p className="font-black">Model warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {diagnostics.warnings.map((warning: string, index: number) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {modelRows.length > 0 && (
        <div className="mt-5">
          <RiskCategoryTable
            title="Univariable logistic model diagnostics"
            rows={modelRows}
            fileName="egstat_n_univariable_logistic_diagnostics.csv"
          />
        </div>
      )}
    </div>
  );
}

function RiskSection(props: any) {
  const {
    riskFileName,
    setRiskFile,
    setRiskFileName,
    riskOutcome,
    setRiskOutcome,
    riskOutcomeEventLevel,
    setRiskOutcomeEventLevel,
    riskPredictors,
    setRiskPredictors,
    riskThreshold,
    setRiskThreshold,
    riskClarification,
    setRiskClarification,
    riskRows,
    setRiskRows,
    riskReferenceCategories,
    setRiskReferenceCategories,
    riskResult,
    runRiskAnalysis,
    downloadJSON,
    downloadCSV,
  } = props;

  const columns = tableColumns(riskRows ?? []);
  const riskPredictorList = String(riskPredictors || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const selectedColumns = [riskOutcome, ...riskPredictorList].filter(Boolean);
  const categoricalPredictors = riskPredictorList.filter((column) => !numericColumnNames(riskRows ?? []).includes(column));
  const outcomeLevels = uniqueColumnValues(riskRows ?? [], riskOutcome, 20);
  const outcomeIsBinary = outcomeLevels.length === 2;

  async function handleRiskFile(file: File | null) {
    setRiskFile(file);
    setRiskFileName(file?.name || "");
    if (!file) {
      setRiskRows([]);
      return;
    }

    const rows = await readSpreadsheetLikeFile(file);
    setRiskRows(rows);
    setRiskReferenceCategories({});
    setRiskOutcomeEventLevel("");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <Panel className="xl:col-span-4">
        <h3 className="mb-2 text-2xl font-black text-cyan-300">
          Risk Factor Analysis
        </h3>
        <p className="mb-4 text-sm leading-6 text-slate-400">
          Upload data, inspect it, edit values live, then click the two empty variable fields to choose the dependent and independent variables.
        </p>

        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => handleRiskFile(e.target.files?.[0] || null)}
          className="block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
        />

        {riskFileName && <p className="mt-2 text-sm text-cyan-300">Loaded: {riskFileName}</p>}

        <div className="mt-5 grid gap-4">
          <VariablePicker
            label="Dependent variable / outcome"
            value={riskOutcome}
            onChange={(value) => {
              setRiskOutcome(value);
              setRiskOutcomeEventLevel("");
            }}
            columns={columns}
            placeholder="Select dependent variable"
            helper="This should usually be binary for odds ratio/logistic regression, such as Positive/Negative or 1/0."
          />

          {riskOutcome && outcomeLevels.length > 0 && (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-4">
              <label className="mb-2 block text-sm font-black text-amber-200">
                Positive/event outcome level for OR/logistic regression
              </label>
              <select
                value={riskOutcomeEventLevel}
                onChange={(e) => setRiskOutcomeEventLevel(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white"
              >
                <option value="">Auto-detect event level</option>
                {outcomeLevels.map((level) => (
                  <option key={level} value={level}>
                    Treat “{level}” as event/positive outcome
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-amber-100/80">
                For matching manual SPSS/R/Excel analysis, select the exact event level used there. If this is wrong, odds ratios can appear inverted.
                {outcomeIsBinary ? " Binary outcome detected." : " This outcome is not binary; logistic OR will not run unless it has exactly two levels."}
              </p>
            </div>
          )}

          <VariablePicker
            label="Independent variable(s) / predictors"
            value={riskPredictors}
            onChange={(value) => {
              setRiskPredictors(value);
              const keep = new Set(String(value || "").split(",").map((x) => x.trim()).filter(Boolean));
              setRiskReferenceCategories(
                Object.fromEntries(Object.entries(riskReferenceCategories ?? {}).filter(([key]) => keep.has(key)))
              );
            }}
            columns={columns.filter((c) => c !== riskOutcome)}
            placeholder="Select independent variable"
            multiple
            helper="Select one or more predictors. Click a selected chip to remove it."
          />

          <ReferenceCategoryPanel
            rows={riskRows ?? []}
            predictors={categoricalPredictors}
            references={riskReferenceCategories ?? {}}
            setReferences={setRiskReferenceCategories}
          />

          <Input label="Selection threshold" value={riskThreshold} onChange={setRiskThreshold} />

          <AnalysisClarificationBox
            title="Data and variable clarification"
            value={riskClarification}
            onChange={setRiskClarification}
            placeholder="Example: Outcome is antimicrobial inhibition zone diameter, predictors are treatment group and dose. Numeric outcome should use linear regression/ANOVA style risk-factor screening."
          />
        </div>

        <div className="mt-6 grid gap-3">
          <button
            onClick={runRiskAnalysis}
            className="w-full rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 hover:bg-white"
          >
            Run Risk Factor Analysis on Edited Data
          </button>

          {riskRows?.length > 0 && (
            <button
              onClick={() => downloadCSV(csvFromGenericRows(riskRows), "egstat_n_risk_live_edited_data.csv")}
              className="w-full rounded-2xl border border-white/10 px-5 py-3 font-black hover:border-cyan-300 hover:text-cyan-300"
            >
              Download Edited Data CSV
            </button>
          )}

          {riskResult && (
            <button
              onClick={() => downloadJSON(riskResult, "egstat_n_risk_analysis.json")}
              className="w-full rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-600"
            >
              Download Result JSON
            </button>
          )}
        </div>
      </Panel>

      <Panel className="xl:col-span-8">
        <div className="mb-5 grid gap-4 md:grid-cols-4">
          <ResultCard title="Rows" value={String(riskRows?.length ?? 0)} />
          <ResultCard title="Columns" value={String(columns.length)} />
          <ResultCard title="Dependent" value={riskOutcome || "Not selected"} />
          <ResultCard title="Predictors" value={riskPredictors || "Not selected"} />
          <ResultCard title="Event level" value={riskOutcomeEventLevel || riskResult?.risk?.outcomeEventLevel || "Auto"} />
        </div>

        <EditableDataGrid
          title="Risk Dataset Preview and Live Editor"
          rows={riskRows ?? []}
          setRows={setRiskRows}
          selectedColumns={selectedColumns}
        />
      </Panel>

      <Panel className="xl:col-span-12">
        <h3 className="mb-4 text-2xl font-black text-cyan-300">Risk Results</h3>

        {riskResult ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <ResultCard title="Predictors" value={String(riskResult.risk?.summary?.totalPredictors ?? 0)} />
              <ResultCard title="p < 0.05" value={String(riskResult.risk?.summary?.significantAt005 ?? 0)} />
              <ResultCard title="Selected" value={String(riskResult.risk?.summary?.selectedForMultivariable ?? 0)} />
              <ResultCard title="Strongest" value={riskResult.risk?.summary?.strongestPredictor?.variable ?? "NA"} />
              <ResultCard title="Event used" value={riskResult.risk?.outcomeEventLevel ?? "NA"} />
              <ResultCard title="Non-event" value={riskResult.risk?.outcomeNonEventLevel ?? "NA"} />
              <ResultCard title="Event source" value={riskResult.risk?.positiveLevelSource ?? "NA"} />
              <ResultCard title="Max VIF" value={shortValue(riskResult.risk?.multicollinearity?.maximumVIF ?? riskResult.risk?.finalMulticollinearity?.maximumVIF ?? riskResult.risk?.candidateMulticollinearity?.maximumVIF)} />
              <ResultCard title="VIF status" value={riskResult.risk?.multicollinearity?.interpretation ?? riskResult.risk?.candidateMulticollinearity?.interpretation ?? "NA"} />
            </div>

            <LogisticDiagnosticsPanel riskResult={riskResult} />

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <RankingBars title="p-value Ranking" data={riskResult.risk?.visualization?.pValueBars ?? []} labelKey="variable" valueKey="pValue" inverse />
              <RiskForestPlot data={riskResult.risk?.visualization?.forestData ?? []} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <RiskCategoryTable
                title="Univariable category-level output"
                rows={riskResult.risk?.tables?.univariable ?? riskResult.risk?.univariableCategoryTable ?? []}
                downloadCSV={downloadCSV}
                fileName="egstat_n_univariable_category_table.csv"
              />
              <RiskCategoryTable
                title="Multivariable category-level output"
                rows={riskResult.risk?.tables?.multivariable ?? riskResult.risk?.multivariableCategoryTable ?? []}
                downloadCSV={downloadCSV}
                fileName="egstat_n_multivariable_category_table.csv"
              />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <RiskCategoryTable
                title="Candidate predictor VIF / multicollinearity"
                rows={riskResult.risk?.candidateVIFSummary ?? riskResult.risk?.candidateVIF ?? []}
                downloadCSV={downloadCSV}
                fileName="egstat_n_candidate_vif.csv"
              />
              <RiskCategoryTable
                title="Final model VIF / multicollinearity"
                rows={riskResult.risk?.vifSummary ?? riskResult.risk?.vif ?? []}
                downloadCSV={downloadCSV}
                fileName="egstat_n_final_model_vif.csv"
              />
            </div>

            <div className="mt-6">
              <OutputTableExplorer title="Risk Output Tables" result={riskResult.risk} downloadCSV={downloadCSV} />
            </div>

            <pre className="mt-6 max-h-96 overflow-auto rounded-2xl bg-black p-5 text-sm text-slate-300">
              {JSON.stringify(riskResult.risk, null, 2)}
            </pre>
          </>
        ) : (
          <p className="rounded-2xl bg-slate-900 p-6 text-slate-300">
            Upload data, select variables, optionally edit cells, then run analysis.
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
    statsTTestValueColumn,
    setStatsTTestValueColumn,
    statsTTestGroupColumn,
    setStatsTTestGroupColumn,
    statsTTestGroupA,
    setStatsTTestGroupA,
    statsTTestGroupB,
    setStatsTTestGroupB,
    statsPairedColumnA,
    setStatsPairedColumnA,
    statsPairedColumnB,
    setStatsPairedColumnB,
    statsOneSampleMean,
    setStatsOneSampleMean,
    statsOutcomeColumn,
    setStatsOutcomeColumn,
    statsPredictorColumns,
    setStatsPredictorColumns,
    statsSubjectColumn,
    setStatsSubjectColumn,
    statsAnovaValueColumn,
    setStatsAnovaValueColumn,
    statsAnovaFactorColumns,
    setStatsAnovaFactorColumns,
    statsAnovaPrimaryFactor,
    setStatsAnovaPrimaryFactor,
    statsAnovaSecondaryFactor,
    setStatsAnovaSecondaryFactor,
    statsDataClarification,
    setStatsDataClarification,
    statsTTestClarification,
    setStatsTTestClarification,
    statsAnovaClarification,
    setStatsAnovaClarification,
    statsRegressionClarification,
    setStatsRegressionClarification,
    statsRows,
    setStatsRows,
    runStatistics,
    downloadJSON,
    downloadCSV,
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

  const columns = tableColumns(statsRows ?? []);
  const numericColumns = numericColumnNames(statsRows ?? []);
  const selectedTests = new Set(String(statsTests || "").split(",").map((x) => x.trim()).filter(Boolean));
  const selectedColumns = [
    statsGroupColumn,
    statsTTestGroupColumn,
    statsTTestValueColumn,
    statsTTestGroupA,
    statsTTestGroupB,
    statsAnovaValueColumn,
    statsAnovaPrimaryFactor,
    statsAnovaSecondaryFactor,
    statsOutcomeColumn,
    statsSubjectColumn,
    ...String(statsValueColumns || "").split(",").map((x) => x.trim()),
    ...String(statsAnovaFactorColumns || "").split(",").map((x) => x.trim()),
    ...String(statsPredictorColumns || "").split(",").map((x) => x.trim()),
  ].filter(Boolean);
  const tTestGroupValues = uniqueColumnValues(statsRows ?? [], statsTTestGroupColumn || statsGroupColumn);
  const categoricalColumns = categoricalColumnNames(statsRows ?? []);
  const inferential = statsResult?.statistics?.inferentialTests ?? statsResult?.statistics?.tests ?? statsResult?.statistics?.inferential ?? [];
  const correlations = statsResult?.statistics?.correlationMatrix ?? statsResult?.statistics?.correlations ?? [];

  function toggleTest(key: string) {
    const next = new Set(selectedTests);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setStatsTests(Array.from(next).join(","));
  }

  async function handleStatsFile(file: File | null) {
    setStatsFile(file);
    setStatsFileName(file?.name || "");

    if (!file) {
      setStatsRows([]);
      return;
    }

    const rows = await readSpreadsheetLikeFile(file);
    setStatsRows(rows);

    const cols = tableColumns(rows);
    const nums = numericColumnNames(rows);
    if (!statsGroupColumn && cols.length > 0) {
      const possibleGroup = cols.find((column) => !nums.includes(column));
      if (possibleGroup) setStatsGroupColumn(possibleGroup);
    }
    if (!statsValueColumns && nums.length > 0) setStatsValueColumns(nums.slice(0, 3).join(","));
    if (!statsTTestValueColumn && nums.length > 0) setStatsTTestValueColumn(nums[0]);
    if (!statsAnovaValueColumn && nums.length > 0) setStatsAnovaValueColumn(nums[0]);
    if (!statsPairedColumnA && nums.length > 0) setStatsPairedColumnA(nums[0]);
    if (!statsPairedColumnB && nums.length > 1) setStatsPairedColumnB(nums[1]);
    if (!statsOutcomeColumn && nums.length > 0) setStatsOutcomeColumn(nums[0]);
    if (!statsPredictorColumns && cols.length > 1) setStatsPredictorColumns(cols.filter((c) => c !== nums[0]).slice(0, 5).join(","));
  }

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <Panel className="xl:col-span-4">
        <h3 className="mb-2 text-2xl font-black text-cyan-300">
          Advanced Statistics
        </h3>
        <p className="mb-4 text-sm leading-6 text-slate-400">
          Upload data, view and edit it live, then use the empty selection fields to choose group/factor and outcome/value columns.
        </p>

        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => handleStatsFile(e.target.files?.[0] || null)}
          className="block w-full rounded-xl border border-white/10 bg-slate-900 p-3"
        />

        {statsFileName && <p className="mt-2 text-sm text-cyan-300">Loaded: {statsFileName}</p>}

        <div className="mt-5 grid gap-4">
          <VariablePicker
            label="Group / factor column"
            value={statsGroupColumn}
            onChange={setStatsGroupColumn}
            columns={columns}
            placeholder="Select group/factor column"
            helper="For two-way ANOVA, select one factor here and add the second factor manually as Factor1,Factor2 if your backend expects two factors."
          />

          <VariablePicker
            label="Outcome / value column(s)"
            value={statsValueColumns}
            onChange={setStatsValueColumns}
            columns={numericColumns.length > 0 ? numericColumns : columns}
            placeholder="Select outcome/value column"
            multiple
            helper="Select one or more numeric columns for t-tests, ANOVA, correlation, and regression."
          />

          <Input label="Alpha" value={statsAlpha} onChange={setStatsAlpha} />
        </div>

        <div className="mt-5 rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-4">
          <h4 className="mb-3 text-lg font-black text-cyan-200">Test-specific setup</h4>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="mb-3 text-sm font-black text-cyan-300">Independent t-test</p>
              <VariablePicker
                label="T-test numeric value"
                value={statsTTestValueColumn}
                onChange={setStatsTTestValueColumn}
                columns={numericColumns.length > 0 ? numericColumns : columns}
                placeholder="Select numeric outcome"
              />
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <VariablePicker
                  label="T-test group column"
                  value={statsTTestGroupColumn}
                  onChange={setStatsTTestGroupColumn}
                  columns={columns}
                  placeholder="Select grouping variable"
                />
                <Input label="T-test clarification" value={statsTTestClarification} onChange={setStatsTTestClarification} />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <select
                  value={statsTTestGroupA}
                  onChange={(e) => setStatsTTestGroupA(e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900 px-3 py-3 font-bold text-white outline-none focus:border-cyan-300"
                >
                  <option value="">Group A / first category</option>
                  {tTestGroupValues.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
                <select
                  value={statsTTestGroupB}
                  onChange={(e) => setStatsTTestGroupB(e.target.value)}
                  className="rounded-xl border border-white/10 bg-slate-900 px-3 py-3 font-bold text-white outline-none focus:border-cyan-300"
                >
                  <option value="">Group B / second category</option>
                  {tTestGroupValues.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="mb-3 text-sm font-black text-cyan-300">ANOVA / category factors</p>
              <VariablePicker
                label="ANOVA value column"
                value={statsAnovaValueColumn}
                onChange={setStatsAnovaValueColumn}
                columns={numericColumns.length > 0 ? numericColumns : columns}
                placeholder="Select numeric outcome"
              />
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <VariablePicker
                  label="ANOVA factor columns"
                  value={statsAnovaFactorColumns}
                  onChange={setStatsAnovaFactorColumns}
                  columns={columns}
                  placeholder="Select categorical factor"
                  multiple
                />
                <Input label="ANOVA clarification" value={statsAnovaClarification} onChange={setStatsAnovaClarification} />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <VariablePicker
                  label="Primary factor"
                  value={statsAnovaPrimaryFactor}
                  onChange={setStatsAnovaPrimaryFactor}
                  columns={categoricalColumns.length > 0 ? categoricalColumns : columns}
                  placeholder="Select main factor"
                />
                <VariablePicker
                  label="Secondary factor"
                  value={statsAnovaSecondaryFactor}
                  onChange={setStatsAnovaSecondaryFactor}
                  columns={categoricalColumns.length > 0 ? categoricalColumns : columns}
                  placeholder="Select second factor"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="mb-3 text-sm font-black text-cyan-300">Regression / repeated-measures setup</p>
              <VariablePicker
                label="Regression outcome"
                value={statsOutcomeColumn}
                onChange={setStatsOutcomeColumn}
                columns={columns}
                placeholder="Select dependent variable"
              />
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <VariablePicker
                  label="Regression predictors"
                  value={statsPredictorColumns}
                  onChange={setStatsPredictorColumns}
                  columns={columns.filter((c) => c !== statsOutcomeColumn)}
                  placeholder="Select predictor"
                  multiple
                />
                <VariablePicker
                  label="Subject ID / block"
                  value={statsSubjectColumn}
                  onChange={setStatsSubjectColumn}
                  columns={columns}
                  placeholder="Select subject column"
                />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <VariablePicker label="Paired column A" value={statsPairedColumnA} onChange={setStatsPairedColumnA} columns={numericColumns.length > 0 ? numericColumns : columns} />
                <VariablePicker label="Paired column B" value={statsPairedColumnB} onChange={setStatsPairedColumnB} columns={numericColumns.length > 0 ? numericColumns : columns} />
                <Input label="One-sample mean" value={statsOneSampleMean} onChange={setStatsOneSampleMean} />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Input label="Regression clarification" value={statsRegressionClarification} onChange={setStatsRegressionClarification} />
                <AnalysisClarificationBox
                  title="General data clarification"
                  value={statsDataClarification}
                  onChange={setStatsDataClarification}
                  placeholder="Explain column meanings, units, group coding, repeated-measure structure, or which categories should be compared."
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900 p-4">
          <p className="mb-3 text-sm font-black text-cyan-300">Choose tests</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {availableTests.map((test) => (
              <button
                key={test.key}
                type="button"
                onClick={() => toggleTest(test.key)}
                className={`rounded-xl px-3 py-2 text-left text-xs font-black transition ${
                  selectedTests.has(test.key)
                    ? "bg-cyan-400 text-slate-950"
                    : "border border-white/10 bg-black/20 text-slate-300 hover:border-cyan-300"
                }`}
              >
                {test.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          <button
            onClick={runStatistics}
            className="w-full rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 hover:bg-white"
          >
            Run Statistics on Edited Data
          </button>

          {statsRows?.length > 0 && (
            <button
              onClick={() => downloadCSV(csvFromGenericRows(statsRows), "egstat_n_statistics_live_edited_data.csv")}
              className="w-full rounded-2xl border border-white/10 px-5 py-3 font-black hover:border-cyan-300 hover:text-cyan-300"
            >
              Download Edited Data CSV
            </button>
          )}

          {statsResult && (
            <button
              onClick={() => downloadJSON(statsResult, "egstat_n_statistics.json")}
              className="w-full rounded-2xl bg-blue-500 px-5 py-3 font-black text-white hover:bg-blue-600"
            >
              Download Result JSON
            </button>
          )}
        </div>
      </Panel>

      <Panel className="xl:col-span-8">
        <div className="mb-5 grid gap-4 md:grid-cols-4">
          <ResultCard title="Rows" value={String(statsRows?.length ?? 0)} />
          <ResultCard title="Columns" value={String(columns.length)} />
          <ResultCard title="Group" value={statsGroupColumn || "Not selected"} />
          <ResultCard title="Values" value={statsValueColumns || "Not selected"} />
        </div>

        <EditableDataGrid
          title="Statistics Dataset Preview and Live Editor"
          rows={statsRows ?? []}
          setRows={setStatsRows}
          selectedColumns={selectedColumns}
        />
      </Panel>

      <Panel className="xl:col-span-12">
        <h3 className="mb-4 text-2xl font-black text-cyan-300">Statistical Results</h3>

        {statsResult ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <ResultCard title="Rows" value={String(statsResult.statistics?.dataset?.rows ?? statsRows.length)} />
              <ResultCard title="Numeric columns" value={String(statsResult.statistics?.numericColumns?.length ?? numericColumns.length)} />
              <ResultCard title="Tests returned" value={String(inferential.length)} />
              <ResultCard title="Correlations" value={String(correlations.length)} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <RankingBars
                title="Mean Summary"
                data={statsResult.statistics?.visualization?.numericSummaryBars ?? []}
                labelKey="variable"
                valueKey="mean"
              />
              <CorrelationHeatmap data={correlations} />
            </div>

            <div className="mt-6">
              <OutputTableExplorer title="Statistics Output Tables" result={statsResult.statistics} downloadCSV={downloadCSV} />
            </div>

            {inferential.length > 0 && (
              <div className="mt-6 overflow-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Test</th>
                      <th className="px-4 py-3">Variable</th>
                      <th className="px-4 py-3">Statistic</th>
                      <th className="px-4 py-3">p-value</th>
                      <th className="px-4 py-3">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inferential.slice(0, 80).map((test: any, index: number) => (
                      <tr key={index} className="border-t border-white/5 odd:bg-white/[0.03]">
                        <td className="px-4 py-3 font-bold text-cyan-100">{test.test ?? test.method ?? "NA"}</td>
                        <td className="px-4 py-3 text-slate-300">{test.variable ?? test.valueColumn ?? test.outcome ?? test.x ?? "NA"}</td>
                        <td className="px-4 py-3 text-slate-300">{valueText(test.statistic ?? test.tStatistic ?? test.fStatistic ?? test.chiSquare ?? test.zStatistic ?? test.rho ?? test.r, 4)}</td>
                        <td className="px-4 py-3 text-slate-300">{valueText(test.pValue, 6)}</td>
                        <td className="px-4 py-3 text-slate-300">{test.significance ?? test.interpretation ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <pre className="mt-6 max-h-96 overflow-auto rounded-2xl bg-black p-5 text-sm text-slate-300">
              {JSON.stringify(statsResult.statistics, null, 2)}
            </pre>
          </>
        ) : (
          <p className="rounded-2xl bg-slate-900 p-6 text-slate-300">
            Upload data, select group/value columns, optionally edit cells, select tests, then run analysis.
          </p>
        )}
      </Panel>
    </div>
  );
}


function CorrelationHeatmap({ data }: { data: any[] }) {
  const clean = (data ?? []).filter((item) => Number.isFinite(Number(item.correlation ?? item.r ?? item.rho)));

  if (clean.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900 p-5 text-slate-300">
        No correlation matrix available yet.
      </div>
    );
  }

  const maxAbs = Math.max(...clean.map((item) => Math.abs(Number(item.correlation ?? item.r ?? item.rho))), 0.01);

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">Correlation Matrix</h4>
      <div className="grid max-h-96 gap-2 overflow-auto sm:grid-cols-2 xl:grid-cols-3">
        {clean.slice(0, 90).map((item, index) => {
          const r = Number(item.correlation ?? item.r ?? item.rho);
          const intensity = Math.min(1, Math.abs(r) / maxAbs);
          return (
            <div key={index} className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-xs font-black text-slate-300">
                  {item.x ?? item.variableX ?? item.var1 ?? "X"} ↔ {item.y ?? item.variableY ?? item.var2 ?? "Y"}
                </p>
                <span className="text-sm font-black text-cyan-200">{r.toFixed(3)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.max(6, intensity * 100)}%` }} />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {r >= 0 ? "Positive" : "Negative"} association
              </p>
            </div>
          );
        })}
      </div>
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
    downloadCSV,
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

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <RankingBars title="Movement Strength" data={networkResult.network.visualization?.movementStrengthBars ?? networkResult.network.statistics?.topNodesByMovement ?? []} labelKey="node" valueKey="weightedMovements" />
              <RankingBars title="Strongest Edges" data={networkResult.network.visualization?.strongestEdges ?? networkResult.network.strongestEdges ?? []} labelKey="edgeId" valueKey="movements" />
            </div>

            <div className="mt-6">
              <OutputTableExplorer title="Network Output Tables" result={networkResult.network} downloadCSV={downloadCSV} />
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
    log,
  } = props;

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [figurePlotStyle, setFigurePlotStyle] = useState("auto");
  const [figureStyle, setFigureStyle] = useState("journal_clean");
  const [figureFormats, setFigureFormats] = useState("png,svg,pdf");
  const [figureDpi, setFigureDpi] = useState("900");
  const [figureLayout, setFigureLayout] = useState("separate");
  const [figureTitleMode, setFigureTitleMode] = useState("none");
  const [figureTitleText, setFigureTitleText] = useState("");
  const [titleFontSize, setTitleFontSize] = useState("16");
  const [axisTitleFontSize, setAxisTitleFontSize] = useState("13");
  const [tickLabelFontSize, setTickLabelFontSize] = useState("11");
  const [fontWeight, setFontWeight] = useState("bold");
  const [transparentBackground, setTransparentBackground] = useState(false);
  const [selectedFigure, setSelectedFigure] = useState<string>("");

  const hasSequence = Boolean(fastaText.trim() || fastaFileName || alignedText.trim() || alignedFileName);
  const outputs = result?.outputs && typeof result.outputs === "object" ? result.outputs : {};

  const figureFiles = Object.entries(outputs)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => ({ key, path: String(value) }))
    .filter((item) => /\.(png|jpg|jpeg|svg|pdf)$/i.test(item.path));

  const selectedFigurePath = selectedFigure || figureFiles[0]?.path || "";

  const availableText = JSON.stringify(result || {}).toLowerCase();
  const plotStyles = [
    { id: "auto", label: "Auto best figure", needs: "Any result output", ok: true },
    { id: "phylogeny", label: "Phylogenetic tree", needs: "Tree/Newick/phylogeny output", ok: availableText.includes("tree") || availableText.includes("phylo") || analysisMode === "phylogeny" },
    { id: "heatmap", label: "Heatmap", needs: "Matrix/table/genotype-country data", ok: availableText.includes("heatmap") || availableText.includes("matrix") || availableText.includes("genotype") },
    { id: "boxplot", label: "Boxplot", needs: "Grouped numeric values", ok: availableText.includes("group") || availableText.includes("genotype") || availableText.includes("distance") },
    { id: "pca", label: "PCA plot", needs: "Numeric feature matrix or alignment distance", ok: availableText.includes("pca") || availableText.includes("distance") || availableText.includes("alignment") },
    { id: "bar", label: "Bar plot", needs: "Counts or categorical summaries", ok: availableText.includes("count") || availableText.includes("summary") || availableText.includes("classified") },
    { id: "line", label: "Line plot", needs: "Date/year/time-series values", ok: availableText.includes("year") || availableText.includes("date") || availableText.includes("temporal") },
    { id: "map", label: "Geospatial map", needs: "Latitude/longitude or country metadata", ok: availableText.includes("latitude") || availableText.includes("longitude") || availableText.includes("country") || analysisMode === "geo_spatiotemporal" },
    { id: "network", label: "Network plot", needs: "Pairwise links or transmission/importation edges", ok: availableText.includes("network") || availableText.includes("edge") || availableText.includes("link") },
    { id: "volcano", label: "Volcano plot", needs: "Effect size and p-value table", ok: availableText.includes("p_value") || availableText.includes("p-value") || availableText.includes("effect") },
    { id: "lollipop", label: "Mutation lollipop", needs: "Mutation position/frequency table", ok: availableText.includes("mutation") || availableText.includes("position") || analysisMode === "mutation" },
    { id: "density", label: "Density/ridge plot", needs: "Continuous numeric distributions", ok: availableText.includes("distribution") || availableText.includes("distance") || availableText.includes("score") },
    { id: "panel", label: "Multi-panel composite", needs: "Two or more available figures", ok: figureFiles.length >= 2 },
  ];

  const selectedPlot = plotStyles.find((item) => item.id === figurePlotStyle) || plotStyles[0];
  const figureOptions = {
    figure_plot_style: figurePlotStyle,
    figure_styles: figureStyle,
    figure_formats: figureFormats,
    figure_dpi: figureDpi,
    figure_layout: figureLayout,
    figure_title_mode: figureTitleMode,
    figure_title_text: figureTitleText,
    title_font_size: titleFontSize,
    axis_title_font_size: axisTitleFontSize,
    tick_label_font_size: tickLabelFontSize,
    font_weight: fontWeight,
    transparent_background: transparentBackground ? "true" : "false",
  };

  function renderFigure(path: string) {
    if (!path) {
      return (
        <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-slate-900/70 p-8 text-center text-sm font-bold text-slate-400">
          No live figure is available yet. Run analysis or click Generate Figures.
        </div>
      );
    }

    const url = qigenexResultUrl(path);

    if (/\.pdf$/i.test(path)) {
      return <iframe title="QI-GeneX-N figure preview" src={url} className="h-[520px] w-full rounded-2xl border border-white/10 bg-white" />;
    }

    return (
      <div className="rounded-2xl border border-white/10 bg-white p-3">
        <img src={url} alt="QI-GeneX-N generated figure" className="max-h-[620px] w-full rounded-xl object-contain" />
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-[2rem] border border-purple-300/15 bg-white/[0.04] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-purple-300">QI-GeneX-N</p>
            <h3 className="mt-2 text-2xl font-black text-white">Simple robust analysis panel</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Select one module, run it, then generate figures only when needed. Downloads and previews are proxied through Vercel to avoid broken raw backend links.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black text-slate-200">
            {loading ? "Running" : result?.status || "Ready"}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-400">Analysis module</label>
              <select value={analysisMode} onChange={(e) => setAnalysisMode(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-purple-300">
                <option value="qc">QC only</option>
                <option value="classification">Classification only</option>
                <option value="gene_orf">Gene/ORF extraction</option>
                <option value="gp5">GP5 analysis</option>
                <option value="mutation">Mutation profiling</option>
                <option value="vaccine_escape">Vaccine mismatch</option>
                <option value="phylogeny">Phylogeny</option>
                <option value="genomic_intelligence">Genomic intelligence</option>
                <option value="ml_qml">ML/QML</option>
                <option value="fitness">Fitness landscape</option>
                <option value="geo_spatiotemporal">Geo-spatiotemporal</option>
                <option value="visualization">Figures only</option>
                <option value="report_package">Report/package</option>
                <option value="complete">Complete workflow</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-400">Sequence mode</label>
              <select value={sequenceMode} onChange={(e) => setSequenceMode(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-purple-300">
                <option value="unaligned">Unaligned FASTA</option>
                <option value="aligned">Aligned FASTA</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-400">Upload FASTA</label>
              <input
                type="file"
                accept=".fa,.fasta,.fas,.aln,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (sequenceMode === "aligned") {
                    setAlignedFile(file);
                    setAlignedFileName(file?.name || "");
                  } else {
                    setFastaFile(file);
                    setFastaFileName(file?.name || "");
                  }
                }}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-300"
              />
              <p className="mt-2 text-xs font-bold text-purple-200">{sequenceMode === "aligned" ? alignedFileName : fastaFileName}</p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.2em] text-slate-400">Paste FASTA</label>
            <textarea
              rows={10}
              value={sequenceMode === "aligned" ? alignedText : fastaText}
              onChange={(e) => (sequenceMode === "aligned" ? setAlignedText(e.target.value) : setFastaText(e.target.value))}
              placeholder={">sample_1\nATG..."}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 font-mono text-sm text-white outline-none focus:border-purple-300"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={loading || !hasSequence} onClick={() => runQigenexAnalysis("analysis", figureOptions)} className="rounded-2xl bg-purple-400 px-6 py-3 font-black text-slate-950 shadow-lg shadow-purple-400/20 transition hover:bg-white disabled:opacity-50">
            Run selected analysis
          </button>
          <button disabled={loading || !hasSequence} onClick={() => runQigenexAnalysis("figures", figureOptions)} className="rounded-2xl bg-cyan-400 px-6 py-3 font-black text-slate-950 shadow-lg shadow-cyan-400/20 transition hover:bg-white disabled:opacity-50">
            Generate figures
          </button>
          <button disabled={loading || !hasSequence} onClick={() => runQigenexAnalysis("package", figureOptions)} className="rounded-2xl bg-emerald-400 px-6 py-3 font-black text-slate-950 shadow-lg shadow-emerald-400/20 transition hover:bg-white disabled:opacity-50">
            Report package
          </button>
          <button disabled={loading} onClick={clearQigenexInputs} className="rounded-2xl border border-white/10 px-6 py-3 font-black text-slate-200 hover:border-red-300 hover:text-red-200 disabled:opacity-50">
            Clear
          </button>
          <button onClick={() => setShowAdvanced(!showAdvanced)} className="rounded-2xl border border-white/10 px-6 py-3 font-black text-slate-200 hover:border-purple-300 hover:text-purple-200">
            {showAdvanced ? "Hide options" : "Figure/data options"}
          </button>
          {result && (
            <button onClick={() => downloadJSON(result, "qigenex_result.json")} className="rounded-2xl bg-blue-500 px-6 py-3 font-black text-white hover:bg-blue-400">
              Download JSON
            </button>
          )}
        </div>
      </div>

      {showAdvanced && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <h4 className="mb-4 text-xl font-black text-purple-200">Figure style</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Plot type</label>
                <select value={figurePlotStyle} onChange={(e) => setFigurePlotStyle(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  {plotStyles.map((style) => (
                    <option key={style.id} value={style.id}>{style.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Design</label>
                <select value={figureStyle} onChange={(e) => setFigureStyle(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="journal_clean">Journal clean</option>
                  <option value="journal_colorblind">Colorblind</option>
                  <option value="journal_mono">Mono</option>
                  <option value="presentation_dark">Presentation dark</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Formats</label>
                <input value={figureFormats} onChange={(e) => setFigureFormats(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">DPI</label>
                <select value={figureDpi} onChange={(e) => setFigureDpi(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="300">300</option>
                  <option value="600">600</option>
                  <option value="900">900</option>
                  <option value="1200">1200</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Layout</label>
                <select value={figureLayout} onChange={(e) => setFigureLayout(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="separate">Separate figures</option>
                  <option value="panel">Panel/composite</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-400">Title</label>
                <select value={figureTitleMode} onChange={(e) => setFigureTitleMode(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="none">No upper title</option>
                  <option value="auto">Auto title</option>
                  <option value="custom">Custom title</option>
                </select>
              </div>
              <input value={figureTitleText} onChange={(e) => setFigureTitleText(e.target.value)} placeholder="Custom title" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white md:col-span-2" />
              <input value={titleFontSize} onChange={(e) => setTitleFontSize(e.target.value)} placeholder="Title font size" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              <input value={axisTitleFontSize} onChange={(e) => setAxisTitleFontSize(e.target.value)} placeholder="Axis title font size" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              <input value={tickLabelFontSize} onChange={(e) => setTickLabelFontSize(e.target.value)} placeholder="Tick label font size" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              <select value={fontWeight} onChange={(e) => setFontWeight(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="black">Black</option>
              </select>
              <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-200 md:col-span-2">
                <input type="checkbox" checked={transparentBackground} onChange={(e) => setTransparentBackground(e.target.checked)} />
                Transparent background
              </label>
            </div>
            <div className={`mt-4 rounded-2xl border p-4 text-sm font-bold ${selectedPlot.ok ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-100" : "border-amber-300/30 bg-amber-400/10 text-amber-100"}`}>
              {selectedPlot.ok ? `Available: ${selectedPlot.label}` : `Not enough data for ${selectedPlot.label}. Required: ${selectedPlot.needs}. Choose another style or run the required analysis first.`}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
            <h4 className="mb-4 text-xl font-black text-purple-200">Optional metadata</h4>
            <div className="grid gap-3">
              <textarea rows={3} value={referenceText} onChange={(e) => setReferenceText(e.target.value)} placeholder="Optional reference sequence text" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              <textarea rows={3} value={vaccineStrainText} onChange={(e) => setVaccineStrainText(e.target.value)} placeholder="Optional vaccine strain text" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              <textarea rows={4} value={geoRowsText} onChange={(e) => setGeoRowsText(e.target.value)} placeholder="Optional geospatial metadata rows" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              <textarea rows={4} value={animalRowsText} onChange={(e) => setAnimalRowsText(e.target.value)} placeholder="Optional animal metadata rows" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              <div className="grid gap-3 md:grid-cols-2">
                <input type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(e) => { const file = e.target.files?.[0] || null; setGeoFile(file); setGeoFileName(file?.name || ""); }} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-300" />
                <input type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(e) => { const file = e.target.files?.[0] || null; setAnimalFile(file); setAnimalFileName(file?.name || ""); }} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-slate-300" />
              </div>
              <p className="text-xs text-slate-500">Geo file: {geoFileName || "none"} | Animal file: {animalFileName || "none"}</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-2xl font-black text-purple-200">Results and live figure viewer</h3>
            <p className={`mt-1 text-sm font-black ${qigenexStatusColor(result?.status)}`}>Status: {result?.status || "not submitted"}</p>
          </div>
          {selectedFigurePath && (
            <a href={qigenexResultUrl(selectedFigurePath)} download={qigenexDownloadName(selectedFigurePath)} className="rounded-2xl bg-purple-400 px-5 py-3 text-sm font-black text-slate-950 hover:bg-white">
              Download selected figure
            </a>
          )}
        </div>

        {result && (
          <div className="mb-5 grid gap-3 md:grid-cols-4">
            <ResultCard title="Job ID" value={result.job_id || "NA"} />
            <ResultCard title="Message" value={result.message || result.error || "NA"} />
            <ResultCard title="Total sequences" value={String(result.qc_summary?.total_sequences ?? result.summary?.total_sequences ?? "NA")} />
            <ResultCard title="Selected analysis" value={result.selected_analysis || analysisMode} />
          </div>
        )}

        {figureFiles.length > 0 && (
          <div className="mb-4 flex gap-3 overflow-x-auto pb-2">
            {figureFiles.map((file) => (
              <button key={`${file.key}-${file.path}`} onClick={() => setSelectedFigure(file.path)} className={`min-w-[180px] rounded-2xl border p-3 text-left text-xs font-black transition ${selectedFigurePath === file.path ? "border-purple-300 bg-purple-400/20 text-purple-100" : "border-white/10 bg-slate-900 text-slate-300 hover:border-purple-300/50"}`}>
                {file.key.replace(/_/g, " ")}
                <span className="mt-1 block truncate text-[10px] text-slate-500">{qigenexDownloadName(file.path)}</span>
              </button>
            ))}
          </div>
        )}

        {renderFigure(selectedFigurePath)}

        {result?.outputs && (
          <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(result.outputs).map(([key, value]) => {
              if (typeof value !== "string") return null;
              return (
                <a key={key} href={qigenexResultUrl(value)} download={qigenexDownloadName(value)} className="rounded-2xl border border-white/10 bg-slate-900 p-4 text-sm font-bold text-purple-200 hover:border-purple-300">
                  Download {key.replace(/_/g, " ")}
                  <span className="mt-1 block truncate text-xs text-slate-500">{qigenexDownloadName(value)}</span>
                </a>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-[2rem] border border-white/10 bg-black/30 p-5">
        <h3 className="mb-3 text-xl font-black text-purple-200">Console</h3>
        <div className="max-h-72 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-xs leading-6 text-emerald-200">
          {log.map((line: string, index: number) => (
            <div key={`${line}-${index}`}>{line}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

function QigenexResultsDashboard() {
  return null;
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
  const [labelMode, setLabelMode] = useState<"all" | "selected" | "none">("selected");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const size = 760;
  const center = size / 2;
  const scale = 285;

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

  const viewSize = size / zoom;
  const viewBox = `${(size - viewSize) / 2 + pan.x} ${(size - viewSize) / 2 + pan.y} ${viewSize} ${viewSize}`;

  function clampZoom(value: number) {
    return Math.min(3.5, Math.max(0.55, value));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function nodeXY(id: string) {
    const n = nodes.find((x: any) => x.id === id);
    if (!n) return null;
    return {
      node: n,
      x: center + Number(n.x ?? 0) * scale,
      y: center + Number(n.y ?? 0) * scale,
    };
  }

  function curvedPath(s: { x: number; y: number }, t: { x: number; y: number }, index: number) {
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;
    const bend = ((index % 5) - 2) * 10;
    const midX = (s.x + t.x) / 2 + normalX * bend;
    const midY = (s.y + t.y) / 2 + normalY * bend;
    return `M ${s.x} ${s.y} Q ${midX} ${midY} ${t.x} ${t.y}`;
  }

  return (
    <div className="mt-6 rounded-[2rem] border border-cyan-300/20 bg-gradient-to-br from-slate-950 via-black to-cyan-950/30 p-5 shadow-2xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-xl font-black text-cyan-300">Interactive Network Intelligence</h4>
          <p className="text-sm text-slate-400">
            Zoom, pan, click nodes, filter movement intensity, and inspect contact pathways without arrows.
          </p>
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

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
        <button
          onClick={() => setZoom((z) => clampZoom(z + 0.18))}
          className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-white"
        >
          Zoom +
        </button>
        <button
          onClick={() => setZoom((z) => clampZoom(z - 0.18))}
          className="rounded-xl bg-cyan-400/20 px-4 py-2 text-sm font-black text-cyan-100 hover:bg-cyan-400 hover:text-slate-950"
        >
          Zoom −
        </button>
        <button
          onClick={resetView}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-black text-slate-200 hover:border-cyan-300 hover:text-cyan-200"
        >
          Reset view
        </button>
        <button
          onClick={() => setPan((p) => ({ ...p, x: p.x - 45 }))}
          className="rounded-xl border border-white/10 px-3 py-2 text-sm font-black hover:border-cyan-300"
        >
          ←
        </button>
        <button
          onClick={() => setPan((p) => ({ ...p, x: p.x + 45 }))}
          className="rounded-xl border border-white/10 px-3 py-2 text-sm font-black hover:border-cyan-300"
        >
          →
        </button>
        <button
          onClick={() => setPan((p) => ({ ...p, y: p.y - 45 }))}
          className="rounded-xl border border-white/10 px-3 py-2 text-sm font-black hover:border-cyan-300"
        >
          ↑
        </button>
        <button
          onClick={() => setPan((p) => ({ ...p, y: p.y + 45 }))}
          className="rounded-xl border border-white/10 px-3 py-2 text-sm font-black hover:border-cyan-300"
        >
          ↓
        </button>
        <span className="ml-auto rounded-xl bg-black/40 px-3 py-2 text-xs font-black text-slate-300">
          Zoom {zoom.toFixed(2)}× • drag canvas to pan
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <div className="relative h-[540px] overflow-hidden rounded-[1.5rem] border border-white/10 bg-[radial-gradient(circle_at_center,rgba(8,145,178,.18),rgba(2,6,23,.98)_58%)] shadow-inner">
            <svg
              width="100%"
              height="100%"
              viewBox={viewBox}
              className="h-full w-full cursor-grab active:cursor-grabbing"
              onWheel={(e) => {
                e.preventDefault();
                const direction = e.deltaY > 0 ? -0.12 : 0.12;
                setZoom((z) => clampZoom(z + direction));
              }}
              onMouseDown={(e) => setDragStart({ x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y })}
              onMouseMove={(e) => {
                if (!dragStart) return;
                const factor = viewSize / Math.max(1, e.currentTarget.clientWidth);
                setPan({
                  x: dragStart.panX - (e.clientX - dragStart.x) * factor,
                  y: dragStart.panY - (e.clientY - dragStart.y) * factor,
                });
              }}
              onMouseUp={() => setDragStart(null)}
              onMouseLeave={() => setDragStart(null)}
            >
              <defs>
                <radialGradient id="networkNodeFill" cx="35%" cy="28%" r="70%">
                  <stop offset="0%" stopColor="rgb(255,255,255)" stopOpacity="1" />
                  <stop offset="42%" stopColor="rgb(103,232,249)" stopOpacity="0.96" />
                  <stop offset="100%" stopColor="rgb(14,165,233)" stopOpacity="0.72" />
                </radialGradient>
                <linearGradient id="networkEdgeStroke" x1="0%" x2="100%" y1="0%" y2="0%">
                  <stop offset="0%" stopColor="rgb(34,211,238)" stopOpacity="0.28" />
                  <stop offset="50%" stopColor="rgb(125,211,252)" stopOpacity="0.88" />
                  <stop offset="100%" stopColor="rgb(168,85,247)" stopOpacity="0.34" />
                </linearGradient>
                <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {filteredEdges.map((e: any, i: number) => {
                const s = nodeXY(e.source);
                const t = nodeXY(e.target);
                if (!s || !t) return null;
                const isFocused = selectedNode && (e.source === selectedNode || e.target === selectedNode);
                const width = 1.25 + (Number(e.movements ?? 1) / maxMovements) * 9;
                const path = curvedPath(s, t, i);

                return (
                  <g key={`${e.source}-${e.target}-${i}`} onMouseEnter={() => setHoveredEdge(e)} onMouseLeave={() => setHoveredEdge(null)}>
                    <path
                      d={path}
                      fill="none"
                      stroke={isFocused ? "rgba(251,191,36,.35)" : "rgba(34,211,238,.16)"}
                      strokeWidth={width + 12}
                      strokeLinecap="round"
                    />
                    <path
                      d={path}
                      fill="none"
                      stroke={isFocused ? "rgba(251,191,36,.95)" : "url(#networkEdgeStroke)"}
                      strokeWidth={width}
                      strokeLinecap="round"
                      strokeDasharray={isFocused ? "none" : "1 0"}
                      opacity={isFocused ? 0.98 : 0.72}
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
                const movementStrength = Number(n.weightedMovements ?? n.totalMovements ?? 0);
                const radius = 12 + (degree / maxDegree) * 24 + Math.min(10, Math.log1p(movementStrength));
                const showLabel = labelMode === "all" || (labelMode === "selected" && (isSelected || isNeighbor));

                return (
                  <g key={n.id} onClick={() => setSelectedNode(n.id)} className="cursor-pointer">
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 14}
                      fill={isSelected ? "rgba(251,191,36,.2)" : isNeighbor ? "rgba(34,211,238,.16)" : "rgba(15,23,42,.18)"}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 5}
                      fill="none"
                      stroke={isSelected ? "rgba(251,191,36,.85)" : isNeighbor ? "rgba(34,211,238,.55)" : "rgba(255,255,255,.14)"}
                      strokeWidth={isSelected ? 4 : 1.5}
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={radius}
                      fill="url(#networkNodeFill)"
                      stroke={isSelected ? "rgb(251,191,36)" : "rgba(255,255,255,.76)"}
                      strokeWidth={isSelected ? 4 : 1.5}
                      filter={isSelected || isNeighbor ? "url(#softGlow)" : undefined}
                    />
                    <text x={x} y={y + 4} textAnchor="middle" fill="rgb(15,23,42)" fontSize="12" fontWeight="900">
                      {degree}
                    </text>
                    {showLabel && (
                      <g>
                        <rect x={x + radius + 6} y={y - 13} width={String(n.id).length * 7.5 + 14} height="25" rx="10" fill="rgba(2,6,23,.78)" stroke="rgba(255,255,255,.12)" />
                        <text x={x + radius + 13} y={y + 5} fill="white" fontSize="13" fontWeight="900">
                          {n.id}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
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
              <p>Movement strength: <b className="text-white">{valueText(selectedNodeData?.weightedMovements ?? selectedNodeData?.totalMovements, 0)}</b></p>
              <p>Neighbors: <b className="text-white">{Math.max(0, neighborIds.size - 1)}</b></p>
              <p>Visible edges: <b className="text-white">{filteredEdges.length}</b></p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
            <h5 className="mb-3 font-black text-cyan-300">Edge Inspector</h5>
            {hoveredEdge ? (
              <div className="grid gap-2 text-sm text-slate-300">
                <p><b className="text-white">{hoveredEdge.source}</b> — <b className="text-white">{hoveredEdge.target}</b></p>
                <p>Type: <b>{hoveredEdge.edgeType ?? hoveredEdge.type ?? "movement"}</b></p>
                <p>Distance: <b>{valueText(hoveredEdge.distanceKm, 2)} km</b></p>
                <p>Movements: <b>{valueText(hoveredEdge.movements, 0)}</b></p>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Hover any curved connection to inspect movement and distance.</p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
            <h5 className="mb-3 font-black text-cyan-300">Complexity Signals</h5>
            <div className="grid gap-3">
              <ResultCard title="Visible Nodes" value={String(shownNodeIds.size)} />
              <ResultCard title="Visible Edges" value={String(filteredEdges.length)} />
              <ResultCard title="Max Degree" value={String(maxDegree)} />
              <ResultCard title="Zoom" value={`${zoom.toFixed(2)}×`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
