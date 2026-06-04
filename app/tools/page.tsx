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
  | "beast_tmrca"
  | "transmission"
  | "genomic_intelligence"
  | "ml_qml"
  | "antigenic_drift"
  | "antigenic_shift"
  | "vaccine_escape"
  | "vaccine_matching"
  | "host_adaptation"
  | "immune_escape"
  | "recombination"
  | "phylodynamics"
  | "selection_pressure"
  | "outbreak_source"
  | "lineage_replacement"
  | "source_sink"
  | "within_host_evolution"
  | "cross_species_jump"
  | "forecasting"
  | "geo_spatiotemporal"
  | "animal_host"
  | "visualization"
  | "report_package"
  | "bacterial_wgs_phylogeny"
  | "bacterial_partial_phylogeny"
  | "bacterial_pangenome"
  | "bacterial_amr"
  | "bacterial_virulence"
  | "bacterial_strain_serovar"
  | "bacterial_antigen"
  | "bacterial_mlst"
  | "bacterial_plasmid"
  | "bacterial_genome_download";

type QigenexAction = "analysis" | "figures" | "package";

type QigenexFigureOptions = {
  figure_type?: string;
  figure_plot_style?: string;
  figure_designs?: string;
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
  tree_inference_method?: string;
  beast_tmrca?: string;
  beast_clock_model?: string;
  beast_chain_length?: string;
  tmrca_substitution_rate?: string;
  transmission_mode?: string;
  nt_distance_threshold?: string;
  fitness_figure_designs?: string;
  novel_hypothesis?: string;
  metadata_schema_preset?: string;
  metadata_template_fields?: string;
  metadata_required_fields?: string;
  auto_enrich_metadata?: string;
  auto_geocode_country?: string;
  auto_typing?: string;
  node_color_by?: string;
  node_shape_by?: string;
  map_projection?: string;
  map_background?: string;
  map_extent?: string;
  route_level?: string;
  aggregate_routes?: string;
  arrow_style?: string;
  arrow_width_by?: string;
  arrow_color_by?: string;
  arrowhead_style?: string;
  line_curve_style?: string;
  max_routes?: string;
  route_support_threshold?: string;
  bacterial_mode?: string;
  genome_query_count?: string;
  genome_source?: string;
  genome_download_strategy?: string;
  genome_host_filter?: string;
  genome_country_filter?: string;
  genome_year_filter?: string;
  genome_per_year?: string;
  ani_threshold?: string;
  mash_distance_threshold?: string;
  use_manual_genomes?: string;
  run_pangenome?: string;
  run_amr?: string;
  run_virulence?: string;
  run_serovar?: string;
  run_antigen?: string;
  run_mlst?: string;
  targetGenomeFile?: File | null;
  manualComparableGenomeFile?: File | null;
  bacterial_wgs_task?: string;
  bacterial_wgs_figure_type?: string;
  bacterial_wgs_figure_designs?: string;
  comparable_genome_mode?: string;
  download_taxon_name?: string;
  comparable_genome_class?: string;
  comparable_host_groups?: string;
  comparable_environment_groups?: string;
  comparable_state_groups?: string;
  comparable_genome_purpose?: string;
  download_representative_only?: string;
  include_reference_genomes?: string;
  bacterial_tree_workflow?: string;
  pangenome_workflow?: string;
  bacterial_output_package?: string;
  metadataFile?: File | null;
  metadataText?: string;
  metadata_preset?: string;
};


type QigenexMetadataPreset =
  | "public_health_genomics"
  | "transmission_map"
  | "bacterial_wgs"
  | "bacterial_partial"
  | "pangenome"
  | "amr_virulence"
  | "custom";

type QigenexMetadataRow = Record<string, string>;

const QIGENEX_METADATA_PRESETS: Record<QigenexMetadataPreset, { label: string; columns: string[]; sampleRows: QigenexMetadataRow[] }> = {
  public_health_genomics: {
    label: "Public-health genomic metadata",
    columns: ["sample_id", "strain", "accession", "country", "latitude", "longitude", "collection_date", "year", "host", "species", "genotype", "lineage", "clade", "source", "isolation_site", "study_id"],
    sampleRows: [
      { sample_id: "ISO_001", strain: "Strain_A", accession: "", country: "Bangladesh", latitude: "23.6850", longitude: "90.3563", collection_date: "2026-01-01", year: "2026", host: "swine", species: "PRRSV", genotype: "", lineage: "", clade: "", source: "clinical", isolation_site: "lung", study_id: "Study_1" },
      { sample_id: "ISO_002", strain: "Strain_B", accession: "", country: "India", latitude: "20.5937", longitude: "78.9629", collection_date: "2026-01-05", year: "2026", host: "swine", species: "PRRSV", genotype: "", lineage: "", clade: "", source: "clinical", isolation_site: "serum", study_id: "Study_1" },
      { sample_id: "ISO_003", strain: "Strain_C", accession: "", country: "China", latitude: "35.8617", longitude: "104.1954", collection_date: "2025-12-20", year: "2025", host: "swine", species: "PRRSV", genotype: "", lineage: "", clade: "", source: "farm", isolation_site: "lymph_node", study_id: "Study_1" },
    ],
  },
  transmission_map: {
    label: "Transmission / phylogeographic map metadata",
    columns: ["sample_id", "strain", "country", "admin_region", "latitude", "longitude", "collection_date", "year", "host", "genotype", "lineage", "source_country", "sink_country", "route_support", "nt_distance", "cluster_id"],
    sampleRows: [
      { sample_id: "ISO_001", strain: "Strain_A", country: "Bangladesh", admin_region: "Mymensingh", latitude: "24.7471", longitude: "90.4203", collection_date: "2026-01-01", year: "2026", host: "swine", genotype: "auto", lineage: "auto", source_country: "Bangladesh", sink_country: "India", route_support: "5", nt_distance: "0.004", cluster_id: "C1" },
      { sample_id: "ISO_002", strain: "Strain_B", country: "India", admin_region: "West Bengal", latitude: "22.9868", longitude: "87.8550", collection_date: "2026-01-05", year: "2026", host: "swine", genotype: "auto", lineage: "auto", source_country: "India", sink_country: "China", route_support: "3", nt_distance: "0.007", cluster_id: "C1" },
      { sample_id: "ISO_003", strain: "Strain_C", country: "China", admin_region: "Guangxi", latitude: "23.8298", longitude: "108.7881", collection_date: "2025-12-20", year: "2025", host: "swine", genotype: "auto", lineage: "auto", source_country: "China", sink_country: "Vietnam", route_support: "2", nt_distance: "0.010", cluster_id: "C2" },
    ],
  },
  bacterial_wgs: {
    label: "Bacterial WGS metadata",
    columns: ["sample_id", "assembly_accession", "organism", "strain", "serovar", "sequence_type", "country", "latitude", "longitude", "collection_date", "year", "host", "source", "isolation_site", "biosample", "bioproject"],
    sampleRows: [
      { sample_id: "BACT_001", assembly_accession: "", organism: "Salmonella enterica", strain: "BAU_01", serovar: "auto", sequence_type: "auto", country: "Bangladesh", latitude: "23.6850", longitude: "90.3563", collection_date: "2026-01-01", year: "2026", host: "poultry", source: "meat", isolation_site: "carcass", biosample: "", bioproject: "" },
      { sample_id: "BACT_002", assembly_accession: "", organism: "Salmonella enterica", strain: "BAU_02", serovar: "auto", sequence_type: "auto", country: "India", latitude: "20.5937", longitude: "78.9629", collection_date: "2025-11-12", year: "2025", host: "human", source: "clinical", isolation_site: "stool", biosample: "", bioproject: "" },
      { sample_id: "BACT_003", assembly_accession: "", organism: "Salmonella enterica", strain: "BAU_03", serovar: "auto", sequence_type: "auto", country: "China", latitude: "35.8617", longitude: "104.1954", collection_date: "2024-08-15", year: "2024", host: "swine", source: "farm", isolation_site: "feces", biosample: "", bioproject: "" },
    ],
  },
  bacterial_partial: {
    label: "Bacterial partial-gene metadata",
    columns: ["sample_id", "accession", "organism", "gene", "primer_set", "amplicon_size", "country", "collection_date", "year", "host", "source", "strain", "serovar", "sequence_type"],
    sampleRows: [
      { sample_id: "PART_001", accession: "", organism: "Lactobacillus fermentum", gene: "16S rRNA", primer_set: "27F/1492R", amplicon_size: "1500", country: "Bangladesh", collection_date: "2026-01-01", year: "2026", host: "food", source: "culture", strain: "Lacto_BAU", serovar: "", sequence_type: "" },
      { sample_id: "PART_002", accession: "", organism: "Pseudomonas spp.", gene: "16S rRNA", primer_set: "27F/1492R", amplicon_size: "1500", country: "Bangladesh", collection_date: "2026-01-02", year: "2026", host: "environment", source: "water", strain: "P_BAU", serovar: "", sequence_type: "" },
    ],
  },
  pangenome: {
    label: "Pangenome metadata",
    columns: ["sample_id", "assembly_accession", "organism", "strain", "country", "year", "host", "source", "serovar", "sequence_type", "genome_size", "n50", "contigs", "gc_percent", "included_group"],
    sampleRows: [
      { sample_id: "PAN_001", assembly_accession: "", organism: "Enterococcus faecium", strain: "EFM_01", country: "Bangladesh", year: "2026", host: "poultry", source: "meat", serovar: "", sequence_type: "auto", genome_size: "", n50: "", contigs: "", gc_percent: "", included_group: "query" },
      { sample_id: "PAN_002", assembly_accession: "", organism: "Enterococcus faecium", strain: "EFM_02", country: "India", year: "2025", host: "human", source: "clinical", serovar: "", sequence_type: "auto", genome_size: "", n50: "", contigs: "", gc_percent: "", included_group: "reference" },
    ],
  },
  amr_virulence: {
    label: "AMR / virulence metadata",
    columns: ["sample_id", "organism", "strain", "country", "year", "host", "source", "phenotype", "antibiotics_tested", "amr_genes", "virulence_genes", "plasmids", "serovar", "sequence_type"],
    sampleRows: [
      { sample_id: "AMR_001", organism: "Salmonella enterica", strain: "rk_bau_01", country: "Bangladesh", year: "2026", host: "poultry", source: "carcass", phenotype: "MDR", antibiotics_tested: "AMP,CTX,GEN,CIP", amr_genes: "auto", virulence_genes: "auto", plasmids: "auto", serovar: "auto", sequence_type: "auto" },
      { sample_id: "AMR_002", organism: "Escherichia coli", strain: "EC_01", country: "Bangladesh", year: "2025", host: "cattle", source: "feces", phenotype: "auto", antibiotics_tested: "", amr_genes: "auto", virulence_genes: "auto", plasmids: "auto", serovar: "auto", sequence_type: "auto" },
    ],
  },
  custom: {
    label: "Custom editable sheet",
    columns: ["sample_id", "country", "collection_date", "host", "genotype", "lineage", "latitude", "longitude", "notes"],
    sampleRows: [
      { sample_id: "Sample_1", country: "", collection_date: "", host: "", genotype: "", lineage: "", latitude: "", longitude: "", notes: "" },
      { sample_id: "Sample_2", country: "", collection_date: "", host: "", genotype: "", lineage: "", latitude: "", longitude: "", notes: "" },
    ],
  },
};

function makeMetadataRows(columns: string[], rows: QigenexMetadataRow[]) {
  return rows.map((row) => {
    const out: QigenexMetadataRow = {};
    columns.forEach((col) => {
      out[col] = row[col] ?? "";
    });
    return out;
  });
}

function metadataRowsToCsv(columns: string[], rows: QigenexMetadataRow[]) {
  const escape = (value: string) => {
    const raw = String(value ?? "");
    return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((col) => escape(row[col] ?? "")).join(","))].join("\n");
}

function metadataRowsToFile(columns: string[], rows: QigenexMetadataRow[], filename = "qigenex_metadata_template.csv") {
  return new File([metadataRowsToCsv(columns, rows)], filename, { type: "text/csv;charset=utf-8" });
}

function splitFieldNames(value: string) {
  return value.split(",").map((x) => x.trim()).filter(Boolean);
}


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
  "https://api.fnunahiduzzaman.com";

const EGSTAT_N_VERSION = "1.6.4";
const QIGENEX_N_VERSION = "1.6.1";
// frontend patch: qigenex_frontend_https_cors_fallback_v22_BUILD_FIXED
const TOOL_DEVELOPER = "FNU Nahiduzzaman";
const TOOL_RIGHTS_NOTICE = "These tools are developed by FNU Nahiduzzaman. All rights reserved.";
const TOOL_WELCOME_MESSAGE =
  "Welcome to the integrated EGStat-N and QI-GeneX-N research workspace. Select a tool, upload your dataset or genome file, run the selected analysis, and download publication-ready outputs.";


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



function safeStringify(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function backendErrorMessage(data: any, fallback: string) {
  const raw = data?.detail ?? data?.error ?? data?.message ?? data?.reason ?? fallback;
  const text = safeStringify(raw);
  return text && text !== "{}" ? text : fallback;
}

async function readApiJsonResponse(response: Response) {
  const text = await response.text();

  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const cleaned = text.slice(0, 700).replace(/\s+/g, " ").trim();
    throw new Error(
      `Server returned non-JSON response (${response.status} ${response.statusText}): ${cleaned || "empty response"}`
    );
  }

  if (!response.ok || data?.status === "error") {
    throw new Error(backendErrorMessage(data, `Request failed: ${response.status} ${response.statusText}`));
  }

  return data;
}

function qigenexApiUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${QIGENEX_PUBLIC_BACKEND}${cleanPath}`;
}

function qigenexProxyJobUrl(jobId: string) {
  return `/api/qigenex?job_id=${encodeURIComponent(jobId)}`;
}

async function fetchQigenexJobJson(jobId: string) {
  try {
    const response = await fetch(qigenexApiUrl(`/jobs/${encodeURIComponent(jobId)}`), {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
    });
    return await readApiJsonResponse(response);
  } catch (directError) {
    const response = await fetch(qigenexProxyJobUrl(jobId), {
      method: "GET",
      cache: "no-store",
    });
    const data = await readApiJsonResponse(response);
    return {
      ...data,
      transport_note: `Direct API status fetch failed and proxy fallback was used: ${safeStringify(directError)}`,
    };
  }
}

async function cancelQigenexJobRequest(jobId: string) {
  try {
    const response = await fetch(qigenexApiUrl(`/jobs/${encodeURIComponent(jobId)}/cancel`), {
      method: "POST",
      cache: "no-store",
      credentials: "omit",
    });
    return await readApiJsonResponse(response);
  } catch (directError) {
    const response = await fetch(`/api/qigenex?job_id=${encodeURIComponent(jobId)}&action=cancel`, {
      method: "POST",
      cache: "no-store",
    });
    const data = await readApiJsonResponse(response);
    return {
      ...data,
      transport_note: `Direct API cancel failed and proxy fallback was used: ${safeStringify(directError)}`,
    };
  }
}

async function submitQigenexForm(formData: FormData) {
  try {
    const response = await fetch(qigenexApiUrl("/jobs/analyze"), {
      method: "POST",
      body: formData,
      credentials: "omit",
    });
    const data = await readApiJsonResponse(response);
    return {
      ...data,
      upload_transport: "direct_https_fastapi",
      backend_url: QIGENEX_PUBLIC_BACKEND,
    };
  } catch (directError) {
    // Fallback keeps the app usable when a browser/network blocks cross-origin direct upload.
    // For very large files the proxy can still hit hosting limits, but it will return a readable JSON error.
    const response = await fetch("/api/qigenex", {
      method: "POST",
      body: formData,
      cache: "no-store",
    });
    try {
      const data = await readApiJsonResponse(response);
      return {
        ...data,
        upload_transport: "nextjs_proxy_fallback",
        backend_url: QIGENEX_PUBLIC_BACKEND,
        direct_upload_error: safeStringify(directError),
      };
    } catch (proxyError) {
      throw new Error(
        `Direct HTTPS upload failed: ${safeStringify(directError)}. Proxy fallback failed: ${safeStringify(proxyError)}. Backend URL: ${QIGENEX_PUBLIC_BACKEND}`
      );
    }
  }
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
  const [qigenexFastaName, setQigenexFastaFileName] = useState("");
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
    `> ${TOOL_WELCOME_MESSAGE}`,
    `> EGStat-N v${EGSTAT_N_VERSION} initialized.`,
    `> QI-GeneX-N v${QIGENEX_N_VERSION} ready.`,
    `> ${TOOL_RIGHTS_NOTICE}`,
    `> QI-GeneX-N backend: ${QIGENEX_PUBLIC_BACKEND}`,
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
    let lastMessage = "";
    let lastPercent = -1;

    while (true) {
      const data = await fetchQigenexJobJson(jobId);
      setQigenexResult(data);

      const state = String(data.status || data.state || "").toLowerCase();
      const percentValue = Number(data.progress_percent ?? data.percent ?? 0);
      const message = String(data.message || data.current_step || state || "Analysis is in progress.")
        .replace(/REAL BEAST\/tMRCA running/gi, "BEAST/tMRCA analysis in progress")
        .replace(/REAL BEAST running/gi, "BEAST/tMRCA analysis in progress")
        .replace(/Real BEAST/gi, "BEAST/tMRCA analysis")
        .replace(/QI-GeneX-N still running:\s*/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (state === "completed") {
        pushLog([
          "> QI-GeneX-N completed.",
          `> Status: ${data.message ?? "completed"}.`,
          `> Outputs available: ${Object.keys(data.outputs ?? {}).length}.`,
        ]);
        return data;
      }

      if (state === "failed" || state === "error") {
        pushLog([`> QI-GeneX-N failed: ${data.message || data.error || "Unknown error"}`]);
        return data;
      }

      if (state === "cancelled") {
        pushLog(["> QI-GeneX-N cancelled."]);
        return data;
      }

      if (message !== lastMessage || percentValue !== lastPercent) {
        pushLog([`> QI-GeneX-N: ${message}${Number.isFinite(percentValue) && percentValue > 0 ? ` (${percentValue}%)` : ""}`]);
        lastMessage = message;
        lastPercent = percentValue;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  async function cancelQigenexJob(jobId?: string) {
    const target = jobId || qigenexResult?.job_id;
    if (!target) {
      pushLog(["> ERROR: No QI-GeneX-N job ID is available for cancellation."]);
      return;
    }

    const data = await cancelQigenexJobRequest(target);
    setQigenexResult(data);
    pushLog([data.status === "cancelled" ? "> QI-GeneX-N cancellation requested." : `> QI-GeneX-N cancel response: ${data.message || data.error || data.status}`]);
  }

  async function runQigenexAnalysis(
    action: QigenexAction = "analysis",
    figureOptions: QigenexFigureOptions = {}
  ) {
    const hasSequence =
      qigenexFastaText.trim() ||
      qigenexFastaFile ||
      figureOptions.targetGenomeFile ||
      qigenexAlignedText.trim() ||
      qigenexAlignedFile;

    if (!hasSequence) {
      pushLog(["> ERROR: FASTA input is required."]);
      return;
    }

    const formData = new FormData();

    const standardModes = [
      "complete",
      "phylogeny",
      "evolution",
      "genomic_intelligence",
      "fitness",
      "geo_spatiotemporal",
      "ml_qml",
      "beast_tmrca",
      "transmission",
    ];

    const selectedBackendMode = standardModes.includes(qigenexAnalysisMode) ? "standard" : "fast";
    const figureType = figureOptions.figure_type || "auto";
    const figureDesigns = figureOptions.figure_designs || "";
    const figureSet =
      figureType.includes("fitness") || qigenexAnalysisMode === "fitness"
        ? "fitness"
        : figureType.includes("transmission") || qigenexAnalysisMode === "transmission"
        ? "geospatial"
        : figureType.includes("beast") || figureType.includes("phylogenetic") || qigenexAnalysisMode === "phylogeny"
        ? "phylogeny"
        : qigenexAnalysisMode === "mutation" || qigenexAnalysisMode === "vaccine_escape"
        ? "mutation"
        : qigenexAnalysisMode === "ml_qml"
        ? "ml_qml"
        : qigenexAnalysisMode === "geo_spatiotemporal"
        ? "geospatial"
        : qigenexAnalysisMode === "complete"
        ? "full"
        : "qc";

    formData.append("action", action || "analysis");
    formData.append("analysisMode", qigenexAnalysisMode);
    formData.append("selected_analysis", qigenexAnalysisMode);
    formData.append("sequenceMode", qigenexSequenceMode);
    formData.append("tool", "QI-GeneX-N");
    formData.append("tool_version", QIGENEX_N_VERSION);
    formData.append("developer", TOOL_DEVELOPER);
    formData.append("rights_notice", TOOL_RIGHTS_NOTICE);
    formData.append("mode", selectedBackendMode);
    formData.append("run_only_selected", qigenexAnalysisMode === "complete" ? "false" : "true");
    formData.append("module_scope", qigenexAnalysisMode);

    const flags: Record<string, string> = {
      run_alignment: "false",
      run_qc: "false",
      run_classification: "false",
      run_gene_orf: "false",
      run_gp5: "false",
      run_mutation: "false",
      run_phylogeny: "false",
      run_ml: "false",
      run_qml: "false",
      run_fitness: "false",
      run_geospatial: "false",
      run_report: "false",
      run_visualization: "true",
      run_composite_figures: figureOptions.figure_layout === "panel" ? "true" : "false",
      run_packaging: "false",
    };

    if (qigenexAnalysisMode === "complete") {
      Object.keys(flags).forEach((key) => {
        flags[key] = "true";
      });
    } else {
      if (qigenexAnalysisMode === "alignment") flags.run_alignment = "true";
      if (qigenexAnalysisMode === "qc") flags.run_qc = "true";
      if (qigenexAnalysisMode === "classification") flags.run_classification = "true";
      if (qigenexAnalysisMode === "gene_orf") flags.run_gene_orf = "true";
      if (qigenexAnalysisMode === "gp5") flags.run_gp5 = "true";
      if (["mutation", "vaccine_escape", "antigenic_drift", "antigenic_shift"].includes(qigenexAnalysisMode)) flags.run_mutation = "true";
      if (["phylogeny", "evolution", "genomic_intelligence", "antigenic_drift", "antigenic_shift", "beast_tmrca", "transmission"].includes(qigenexAnalysisMode)) flags.run_phylogeny = "true";
      if (qigenexAnalysisMode === "ml_qml") {
        flags.run_ml = "true";
        flags.run_qml = "true";
      }
      if (["fitness", "host_adaptation", "immune_escape"].includes(qigenexAnalysisMode)) flags.run_fitness = "true";
      if (["geo_spatiotemporal", "animal_host", "transmission"].includes(qigenexAnalysisMode)) flags.run_geospatial = "true";
      if (qigenexAnalysisMode === "report_package") {
        flags.run_report = "true";
        flags.run_packaging = "true";
      }
    }

    if (figureType.includes("beast")) flags.run_phylogeny = "true";
    if (figureType.includes("transmission")) {
      flags.run_phylogeny = "true";
      flags.run_geospatial = "true";
    }
    if (figureType.includes("fitness")) flags.run_fitness = "true";

    Object.entries(flags).forEach(([key, value]) => formData.append(key, value));

    formData.append("figure_set", figureSet);
    formData.append("figure_type", figureType);
    formData.append("figure_plot_style", figureOptions.figure_plot_style || figureType);
    formData.append("figure_designs", figureDesigns);
    formData.append("figure_styles", figureOptions.figure_styles || "journal_clean");
    formData.append("figure_formats", figureOptions.figure_formats || "png,svg,pdf");
    formData.append("figure_dpi", figureOptions.figure_dpi || "900");
    formData.append("figure_layout", figureOptions.figure_layout || "separate");
    formData.append("panel_mode", figureOptions.figure_layout || "separate");
    formData.append("separate_or_panel", figureOptions.figure_layout || "separate");
    formData.append("figure_title_mode", figureOptions.figure_title_mode || "full");
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

    formData.append("tree_inference_method", figureOptions.tree_inference_method || "maximum_likelihood");
    formData.append("phylogeny_tree_designs", figureType.includes("phylogenetic") || figureType.includes("beast") || figureType.includes("transmission") ? figureDesigns : "");
    formData.append("phylogeny_title_mode", figureOptions.figure_title_mode || "full");
    formData.append("phylogeny_font_size", figureOptions.axis_title_font_size || "12");
    formData.append("phylogeny_font_weight", figureOptions.font_weight || "bold");
    formData.append("phylogeny_panel_mode", figureOptions.figure_layout || "separate");
    formData.append("phylogeny_color_by", "auto");
    formData.append("phylogeny_max_tips", "2500");

    formData.append("run_beast_tmrca", figureOptions.beast_tmrca || (figureType.includes("beast") ? "true" : "false"));
    formData.append("beast_tmrca", figureOptions.beast_tmrca || (figureType.includes("beast") ? "true" : "false"));
    formData.append("beast_clock_model", figureOptions.beast_clock_model || "relaxed_lognormal");
    formData.append("beast_chain_length", figureOptions.beast_chain_length || "10000000");
    formData.append("tmrca_substitution_rate", figureOptions.tmrca_substitution_rate || "0.001");
    formData.append("transmission_mode", figureOptions.transmission_mode || "standard");
    formData.append("nt_distance_threshold", figureOptions.nt_distance_threshold || "0.015");
    formData.append("metadata_schema_preset", figureOptions.metadata_schema_preset || "viral_bacterial_public_health");
    formData.append("metadata_template_fields", figureOptions.metadata_template_fields || "");
    formData.append("metadata_required_fields", figureOptions.metadata_required_fields || "");
    formData.append("auto_enrich_metadata", figureOptions.auto_enrich_metadata || "true");
    formData.append("auto_geocode_country", figureOptions.auto_geocode_country || "true");
    formData.append("auto_typing", figureOptions.auto_typing || "true");
    formData.append("node_color_by", figureOptions.node_color_by || "dominant_genotype");
    formData.append("node_shape_by", figureOptions.node_shape_by || "dominant_host");

    formData.append("map_projection", figureOptions.map_projection || "rectangular");
    formData.append("map_background", figureOptions.map_background || "natural_earth_clean");
    formData.append("map_extent", figureOptions.map_extent || "world");
    formData.append("route_level", figureOptions.route_level || "country");
    formData.append("aggregate_routes", figureOptions.aggregate_routes || "true");
    formData.append("arrow_style", figureOptions.arrow_style || "curved_arrow");
    formData.append("arrow_width_by", figureOptions.arrow_width_by || "route_support");
    formData.append("arrow_color_by", figureOptions.arrow_color_by || "dominant_genotype");
    formData.append("arrowhead_style", figureOptions.arrowhead_style || "standard_filled");
    formData.append("line_curve_style", figureOptions.line_curve_style || "great_circle_curve");
    formData.append("max_routes", figureOptions.max_routes || "80");
    formData.append("route_support_threshold", figureOptions.route_support_threshold || "1");

    formData.append("bacterial_mode", figureOptions.bacterial_mode || "wgs");
    formData.append("genome_query_count", figureOptions.genome_query_count || "50");
    formData.append("genome_source", figureOptions.genome_source || "ncbi_assembly");
    formData.append("genome_download_strategy", figureOptions.genome_download_strategy || "ani_mash_balanced");
    formData.append("genome_host_filter", figureOptions.genome_host_filter || "");
    formData.append("genome_country_filter", figureOptions.genome_country_filter || "");
    formData.append("genome_year_filter", figureOptions.genome_year_filter || "");
    formData.append("genome_per_year", figureOptions.genome_per_year || "5");
    formData.append("ani_threshold", figureOptions.ani_threshold || "95");
    formData.append("mash_distance_threshold", figureOptions.mash_distance_threshold || "0.05");
    formData.append("target_genome_required", figureOptions.bacterial_wgs_task ? "true" : "false");
    formData.append("target_genome_input_mode", "manual_upload");
    formData.append("comparable_genome_mode", figureOptions.comparable_genome_mode || "auto_download");
    formData.append("download_taxon_name", figureOptions.download_taxon_name || "auto_from_target");
    formData.append("comparable_genome_class", figureOptions.comparable_genome_class || "balanced");
    formData.append("comparable_host_groups", figureOptions.comparable_host_groups || "human,poultry,swine,cattle,environment");
    formData.append("comparable_environment_groups", figureOptions.comparable_environment_groups || "clinical,farm,slaughterhouse,food,water");
    formData.append("comparable_state_groups", figureOptions.comparable_state_groups || "clinical,outbreak,surveillance,reference");
    formData.append("comparable_genome_purpose", figureOptions.comparable_genome_purpose || figureOptions.bacterial_wgs_task || "phylogeny");
    formData.append("download_representative_only", figureOptions.download_representative_only || "true");
    formData.append("include_reference_genomes", figureOptions.include_reference_genomes || "true");
    formData.append("bacterial_tree_workflow", figureOptions.bacterial_tree_workflow || "ani_mash_core_snp");
    formData.append("pangenome_workflow", figureOptions.pangenome_workflow || "panaroo_roary");
    formData.append("bacterial_output_package", figureOptions.bacterial_output_package || "standard_plus_figures");
    formData.append("bacterial_wgs_task", figureOptions.bacterial_wgs_task || "phylogeny");
    formData.append("bacterial_wgs_figure_type", figureOptions.bacterial_wgs_figure_type || "bacterial_phylogeny_plot");
    formData.append("bacterial_wgs_figure_designs", figureOptions.bacterial_wgs_figure_designs || "wgs_ani_mash_tree,metadata_annotated_tree,ani_heatmap_tree");
    formData.append("use_manual_genomes", figureOptions.use_manual_genomes || "true");
    formData.append("run_pangenome", figureOptions.run_pangenome || (qigenexAnalysisMode === "bacterial_pangenome" ? "true" : "false"));
    formData.append("run_amr", figureOptions.run_amr || (qigenexAnalysisMode === "bacterial_amr" ? "true" : "false"));
    formData.append("run_virulence", figureOptions.run_virulence || (qigenexAnalysisMode === "bacterial_virulence" ? "true" : "false"));
    formData.append("run_serovar", figureOptions.run_serovar || (qigenexAnalysisMode === "bacterial_strain_serovar" ? "true" : "false"));
    formData.append("run_antigen", figureOptions.run_antigen || (qigenexAnalysisMode === "bacterial_antigen" ? "true" : "false"));
    formData.append("run_mlst", figureOptions.run_mlst || (qigenexAnalysisMode === "bacterial_mlst" ? "true" : "false"));
    formData.append("fitness_figure_designs", figureOptions.fitness_figure_designs || (figureType.includes("fitness") ? figureDesigns : ""));

    if (qigenexFastaText.trim()) formData.append("fastaText", qigenexFastaText);
    if (qigenexFastaFile) formData.append("fastaFile", qigenexFastaFile);
    if (qigenexAlignedText.trim()) formData.append("alignedText", qigenexAlignedText);
    if (qigenexAlignedFile) formData.append("alignedFile", qigenexAlignedFile);
    if (qigenexReferenceText.trim()) formData.append("referenceText", qigenexReferenceText);
    if (qigenexVaccineStrainText.trim()) formData.append("vaccineStrainText", qigenexVaccineStrainText);
    if (figureOptions.targetGenomeFile) formData.append("targetGenomeFile", figureOptions.targetGenomeFile, figureOptions.targetGenomeFile.name || "target_genome.fasta");
    if (figureOptions.manualComparableGenomeFile) formData.append("manualComparableGenomeFile", figureOptions.manualComparableGenomeFile, figureOptions.manualComparableGenomeFile.name || "manual_comparable_genomes.fasta");
    if (qigenexGeoFile) formData.append("geoFile", qigenexGeoFile);
    if (qigenexGeoRowsText.trim()) formData.append("geoRowsText", qigenexGeoRowsText);
    if (qigenexAnimalFile) formData.append("animalFile", qigenexAnimalFile);
    if (qigenexAnimalRowsText.trim()) formData.append("animalRowsText", qigenexAnimalRowsText);
    if (figureOptions.metadataFile) {
      formData.append("metadata", figureOptions.metadataFile, figureOptions.metadataFile.name || "qigenex_metadata.csv");
    }
    if (figureOptions.metadataText?.trim()) {
      formData.append("metadataText", figureOptions.metadataText);
    }
    if (qigenexNotes.trim()) formData.append("notes", qigenexNotes);

    setQigenexLoading(true);
    setQigenexResult(null);

    try {
      const data = await submitQigenexForm(formData);

      if (data.status === "error") {
        setQigenexResult(data);
        pushLog([`> QI-GeneX-N ERROR: ${backendErrorMessage(data, "QI-GeneX-N analysis failed.")}`]);
        return;
      }

      setQigenexResult(data);
      const jobId = data.job_id;

      pushLog([
        "> QI-GeneX-N submitted.",
        `> Module: ${qigenexAnalysisMode}.`,
        `> Figure: ${figureType}.`,
        `> Job ID: ${jobId}`,
        `> Upload transport: ${data.upload_transport || "unknown"}; backend=${data.backend_url || QIGENEX_PUBLIC_BACKEND}.`,
        ...(data.direct_upload_error ? [`> Direct upload fallback reason: ${data.direct_upload_error}`] : []),
        ...(figureOptions.bacterial_wgs_task ? [
          `> Bacterial workflow: target genome manual upload; comparable genomes=${figureOptions.comparable_genome_mode || "auto_download"}.`,
          `> Comparable filters: host=${figureOptions.comparable_host_groups || "none"}; environment=${figureOptions.comparable_environment_groups || "none"}; state=${figureOptions.comparable_state_groups || "none"}.`,
        ] : []),
        "> Polling status.",
      ]);

      if (jobId) await pollQigenexJob(jobId);
    } catch (error) {
      const message = safeStringify(error);
      setQigenexResult({ status: "error", error: message });
      pushLog([
        `> QI-GeneX-N connection ERROR: ${message}`,
        `> Backend URL: ${QIGENEX_PUBLIC_BACKEND}`,
        "> The app now tries direct HTTPS upload first and then a Next.js proxy fallback with readable JSON errors.",
      ]);
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
                {TOOL_WELCOME_MESSAGE}
              </p>
              <div className="mt-5 grid max-w-4xl gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">EGStat-N</p>
                  <p className="mt-1 text-2xl font-black text-white">v{EGSTAT_N_VERSION}</p>
                </div>
                <div className="rounded-2xl border border-purple-300/20 bg-purple-300/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-200">QI-GeneX-N</p>
                  <p className="mt-1 text-2xl font-black text-white">v{QIGENEX_N_VERSION}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-4">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">Developer</p>
                  <p className="mt-1 text-sm font-bold text-white">{TOOL_DEVELOPER}</p>
                </div>
              </div>
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                {TOOL_RIGHTS_NOTICE}
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
            <h2 className="text-4xl font-black text-cyan-200">EGStat-N <span className="text-xl text-cyan-100/70">v{EGSTAT_N_VERSION}</span></h2>
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
            <h2 className="text-4xl font-black text-purple-200">QI-GeneX-N <span className="text-xl text-purple-100/70">v{QIGENEX_N_VERSION}</span></h2>
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
                  EGStat-N <span className="text-base text-cyan-100/70">v{EGSTAT_N_VERSION}</span>
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
                  QI-GeneX-N <span className="text-base text-purple-100/70">v{QIGENEX_N_VERSION}</span>
                </h2>
                <p className="text-sm text-slate-400">
                  Selected analysis
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
                fastaFileName={qigenexFastaName}
                  fastaFile={qigenexFastaFile}
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
  // v22_no_pushlog_scope_fix: QigenexSection must not call parent-only logging directly.
  const {
    sequenceMode,
    setSequenceMode,
    analysisMode,
    setAnalysisMode,
    fastaFileName,
    fastaFile,
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

  const [moreOpen, setMoreOpen] = useState(false);
  const [resultView, setResultView] = useState<"text" | "figures" | "log">("figures");
  const [figureType, setFigureType] = useState("phylogenetic_tree");
  const [selectedDesigns, setSelectedDesigns] = useState<string[]>(["rectangular_phylogram", "circular_phylogram", "publication_composite_tree"]);
  const [figureFormats, setFigureFormats] = useState("png,svg,pdf");
  const [figureDpi, setFigureDpi] = useState("900");
  const [figureLayout, setFigureLayout] = useState("separate");
  const [titleMode, setTitleMode] = useState("full");
  const [treeMethod, setTreeMethod] = useState("maximum_likelihood");
  const [beastClock, setBeastClock] = useState("relaxed_lognormal");
  const [beastChain, setBeastChain] = useState("10000000");
  const [tmrcaRate, setTmrcaRate] = useState("0.001");
  const [transmissionMode, setTransmissionMode] = useState("standard");
  const [ntThreshold, setNtThreshold] = useState("0.015");
  const [hypothesis, setHypothesis] = useState("auto");
  const [selectedFigure, setSelectedFigure] = useState("");
  const [selectedText, setSelectedText] = useState("");

  const [metadataPreset, setMetadataPreset] = useState<QigenexMetadataPreset>("public_health_genomics");
  const [metadataColumns, setMetadataColumns] = useState<string[]>(QIGENEX_METADATA_PRESETS.public_health_genomics.columns);
  const [metadataRows, setMetadataRows] = useState<QigenexMetadataRow[]>(makeMetadataRows(QIGENEX_METADATA_PRESETS.public_health_genomics.columns, QIGENEX_METADATA_PRESETS.public_health_genomics.sampleRows));
  const [metadataFields, setMetadataFields] = useState(QIGENEX_METADATA_PRESETS.public_health_genomics.columns.join(","));
  const [requiredMetadataFields, setRequiredMetadataFields] = useState("sample_id,country,collection_date,host");
  const [autoEnrichMetadata, setAutoEnrichMetadata] = useState("true");
  const [autoGeocodeCountry, setAutoGeocodeCountry] = useState("true");
  const [autoTyping, setAutoTyping] = useState("true");

  const [mapProjection, setMapProjection] = useState("rectangular");
  const [mapBackground, setMapBackground] = useState("natural_earth_clean");
  const [mapExtent, setMapExtent] = useState("world");
  const [routeLevel, setRouteLevel] = useState("country");
  const [aggregateRoutes, setAggregateRoutes] = useState("true");
  const [arrowStyle, setArrowStyle] = useState("curved_arrow");
  const [arrowWidthBy, setArrowWidthBy] = useState("route_support");
  const [arrowColorBy, setArrowColorBy] = useState("dominant_genotype");
  const [arrowheadStyle, setArrowheadStyle] = useState("standard_filled");
  const [lineCurveStyle, setLineCurveStyle] = useState("great_circle_curve");
  const [nodeColorBy, setNodeColorBy] = useState("dominant_genotype");
  const [nodeShapeBy, setNodeShapeBy] = useState("dominant_host");
  const [maxRoutes, setMaxRoutes] = useState("80");
  const [routeSupportThreshold, setRouteSupportThreshold] = useState("1");

  const [bacterialMode, setBacterialMode] = useState("wgs");
  const [genomeSource, setGenomeSource] = useState("ncbi_assembly");
  const [genomeQueryCount, setGenomeQueryCount] = useState("50");
  const [genomeDownloadStrategy, setGenomeDownloadStrategy] = useState("ani_mash_balanced");
  const [genomeHostFilter, setGenomeHostFilter] = useState("swine,cattle,poultry,human,goat,sheep,dog,cat,wild_boar,wild_bird,water,food,environment,unknown");
  const [genomeCountryFilter, setGenomeCountryFilter] = useState("auto");
  const [genomeYearFilter, setGenomeYearFilter] = useState("auto");
  const [genomePerYear, setGenomePerYear] = useState("5");
  const [aniThreshold, setAniThreshold] = useState("95");
  const [mashDistanceThreshold, setMashDistanceThreshold] = useState("0.05");

  const [targetGenomeFile, setTargetGenomeFile] = useState<File | null>(null);
  const [targetGenomeFileName, setTargetGenomeFileName] = useState("");
  const [manualComparableGenomeFile, setManualComparableGenomeFile] = useState<File | null>(null);
  const [manualComparableGenomeFileName, setManualComparableGenomeFileName] = useState("");
  const [comparableGenomeMode, setComparableGenomeMode] = useState("auto_download");
  const [downloadTaxonName, setDownloadTaxonName] = useState("auto_from_target");
  const [comparableGenomeClass, setComparableGenomeClass] = useState("balanced");
  const [comparableHostGroups, setComparableHostGroups] = useState<string[]>(["human", "poultry", "swine", "cattle", "environment"]);
  const [comparableEnvironmentGroups, setComparableEnvironmentGroups] = useState<string[]>(["clinical", "farm", "slaughterhouse", "food", "water"]);
  const [comparableStateGroups, setComparableStateGroups] = useState<string[]>(["clinical", "outbreak", "surveillance", "reference"]);
  const [comparableGenomePurpose, setComparableGenomePurpose] = useState("phylogeny");
  const [downloadRepresentativeOnly, setDownloadRepresentativeOnly] = useState("true");
  const [includeReferenceGenomes, setIncludeReferenceGenomes] = useState("true");
  const [bacterialTreeWorkflow, setBacterialTreeWorkflow] = useState("ani_mash_core_snp");
  const [pangenomeWorkflow, setPangenomeWorkflow] = useState("panaroo_roary");
  const [bacterialOutputPackage, setBacterialOutputPackage] = useState("standard_plus_figures");
  const [bacterialWgsTask, setBacterialWgsTask] = useState("phylogeny");
  const [bacterialWgsFigureType, setBacterialWgsFigureType] = useState("bacterial_phylogeny_plot");
  const [bacterialWgsFigureDesigns, setBacterialWgsFigureDesigns] = useState<string[]>(["wgs_ani_mash_tree", "metadata_annotated_tree", "ani_heatmap_tree"]);

  const hasSequence = Boolean(fastaText.trim() || fastaFileName || alignedText.trim() || alignedFileName);

  const analysisList = [
    { id: "qc", label: "QC" },
    { id: "classification", label: "Classification" },
    { id: "gene_orf", label: "Gene / ORF" },
    { id: "gp5", label: "GP5" },
    { id: "mutation", label: "Mutation" },
    { id: "vaccine_escape", label: "Vaccine escape" },
    { id: "vaccine_matching", label: "Vaccine matching" },
    { id: "phylogeny", label: "Phylogeny" },
    { id: "beast_tmrca", label: "BEAST / tMRCA" },
    { id: "transmission", label: "Transmission" },
    { id: "recombination", label: "Recombination" },
    { id: "phylodynamics", label: "Phylodynamics" },
    { id: "outbreak_source", label: "Outbreak source" },
    { id: "source_sink", label: "Source–sink" },
    { id: "lineage_replacement", label: "Lineage replacement" },
    { id: "fitness", label: "Fitness landscape" },
    { id: "selection_pressure", label: "Selection pressure" },
    { id: "host_adaptation", label: "Host adaptation" },
    { id: "immune_escape", label: "Immune escape" },
    { id: "within_host_evolution", label: "Within-host evolution" },
    { id: "cross_species_jump", label: "Cross-species jump" },
    { id: "forecasting", label: "Forecasting" },
    { id: "antigenic_drift", label: "Antigenic drift" },
    { id: "antigenic_shift", label: "Antigenic shift" },
    { id: "geo_spatiotemporal", label: "Geo-temporal" },
    { id: "animal_host", label: "Animal / host" },
    { id: "ml_qml", label: "ML/QML" },
    { id: "genomic_intelligence", label: "Genomic intelligence" },
    { id: "bacterial_wgs_analysis", label: "Bacterial WGS Analysis" },
    { id: "report_package", label: "Report" },
    { id: "complete", label: "Complete" },
  ];

  const figureCatalog: Record<string, { label: string; designs: string[] }> = {
    phylogenetic_tree: {
      label: "Phylogenetic tree",
      designs: [
        "rectangular_phylogram",
        "rectangular_cladogram",
        "circular_phylogram",
        "circular_cladogram",
        "fan_tree",
        "unrooted_equal_angle",
        "time_scaled_tree",
        "genotype_colored_tree",
        "country_colored_tree",
        "host_colored_tree",
        "metadata_annotated_tree",
        "density_collapsed_tree",
        "root_to_tip_regression_tree",
        "mutation_annotated_tree",
        "publication_composite_tree",
      ],
    },
    beast_tmrca: {
      label: "BEAST / tMRCA",
      designs: [
        "beast_mcc_tree",
        "beast_timeline_tmrca",
        "beast_skyline_plot",
        "beast_hpd_bars",
        "beast_lineage_through_time",
        "beast_location_transition",
        "beast_clade_age_heatmap",
        "beast_tree_density_cloud",
        "beast_temporal_scatter",
        "beast_clock_rate_panel",
        "beast_trait_summary",
        "beast_dual_panel",
      ],
    },
    transmission_distance: {
      label: "Transmission",
      designs: [
        "nt_distance_network",
        "minimum_spanning_network",
        "phylogeo_importation_map",
        "country_source_sink_bars",
        "country_sharing_heatmap",
        "cluster_enrichment_bars",
        "lineage_persistence_panel",
        "annual_transmission_events",
        "route_support_map",
        "nt_distance_histogram",
        "transmission_sankey",
        "transmission_composite_panel",
      ],
    },
    fitness_landscape: {
      label: "Fitness landscape",
      designs: [
        "mountain_3d_transmission",
        "ridge_landscape",
        "contour_surface",
        "peak_valley_map",
        "sequence_space_scatter",
        "fitness_walk_paths",
        "host_shift_surface",
        "fitness_heat_raster",
        "epistasis_network",
        "fitness_vs_time",
        "fitness_vs_genotype_box",
        "fitness_composite_panel",
      ],
    },
    mutation_plot: {
      label: "Mutation plot",
      designs: [
        "mutation_lollipop",
        "mutation_heatmap",
        "mutation_spectrum_bar",
        "mutation_domain_divergence",
        "hotspot_rank_bar",
        "temporal_hotspot_line",
        "co_mutation_network",
        "protein_landscape_dual",
      ],
    },
    recombination_plot: {
      label: "Recombination",
      designs: [
        "recombination_breakpoint_map",
        "parental_mosaic_plot",
        "similarity_scan",
        "bootscan_panel",
        "recombination_network",
        "segment_origin_heatmap",
        "recombination_hotspot_lollipop",
        "lineage_mosaic_tree",
        "breakpoint_density_plot",
        "recombination_composite",
      ],
    },
    bacterial_phylogeny_plot: {
      label: "Bacterial phylogeny",
      designs: [
        "wgs_ani_mash_tree",
        "core_snp_ml_tree",
        "core_gene_tree",
        "partial_gene_tree",
        "clade_rectangular_tree",
        "clade_circular_tree",
        "metadata_annotated_tree",
        "host_country_lineage_tree",
        "ani_heatmap_tree",
        "mash_distance_network",
        "clade_distribution_bars",
        "phylogeny_composite_panel",
      ],
    },
    bacterial_pangenome_plot: {
      label: "Pangenome",
      designs: [
        "pan_core_gene_curve",
        "gene_presence_absence_heatmap",
        "accessory_gene_tree",
        "functional_category_bar",
        "gene_accumulation_box",
        "shell_cloud_partition",
        "pangenome_pca",
        "roary_panaroo_summary",
        "pangenome_composite_panel",
      ],
    },
    bacterial_amr_plot: {
      label: "AMR profile",
      designs: [
        "amr_gene_heatmap",
        "amr_class_bar",
        "resistome_tree_annotation",
        "amr_presence_matrix",
        "amr_genotype_network",
        "mar_index_plot",
        "amr_country_host_panel",
        "amr_composite_panel",
      ],
    },
    bacterial_virulence_plot: {
      label: "Virulence profile",
      designs: [
        "virulence_gene_heatmap",
        "pathogenicity_island_map",
        "toxin_adhesion_invasion_panel",
        "virulence_tree_annotation",
        "vfdb_category_bar",
        "virulence_composite_panel",
      ],
    },
    bacterial_typing_plot: {
      label: "Strain / serovar / antigen typing",
      designs: [
        "serovar_summary_bar",
        "mlst_sequence_type_bar",
        "antigen_profile_matrix",
        "strain_cluster_tree",
        "typing_confidence_plot",
        "serovar_country_host_panel",
      ],
    },
    hypothesis_plot: {
      label: "Hypothesis test",
      designs: [
        "hypothesis_scorecard",
        "evidence_weight_radar",
        "support_heatmap",
        "causal_pathway_panel",
        "model_comparison_panel",
        "uncertainty_interval_plot",
        "sensitivity_tornado",
        "counterfactual_projection",
        "risk_shift_waterfall",
        "decision_matrix",
      ],
    },
    qc_summary_plot: {
      label: "QC plot",
      designs: ["qc_dashboard", "length_gc_scatter", "ambiguity_heatmap", "coverage_bar", "pass_fail_waterfall", "missingness_histogram"],
    },
    map_spatiotemporal_plot: {
      label: "Map / timeline",
      designs: ["rectangular_route_map", "round_projection_map", "country_bubble_map", "choropleth_map", "timeline_map_panel", "flow_network_map", "spatiotemporal_heatmap", "route_animation_frames", "source_sink_map", "lineage_route_map", "host_shape_map", "import_export_balance_map", "route_support_map", "map_composite_panel"],
    },
    ml_qml_performance_plot: {
      label: "ML/QML plot",
      designs: ["confusion_matrix", "roc_pr_curves", "feature_importance_bar", "shap_summary", "embedding_projection", "model_comparison_panel", "uncertainty_calibration", "quantum_kernel_map"],
    },
  };

  const figureForAnalysis: Record<string, string[]> = {
    qc: ["qc_summary_plot"],
    classification: ["qc_summary_plot", "phylogenetic_tree"],
    gene_orf: ["mutation_plot", "qc_summary_plot"],
    gp5: ["mutation_plot", "phylogenetic_tree"],
    mutation: ["mutation_plot"],
    vaccine_escape: ["mutation_plot", "fitness_landscape", "hypothesis_plot"],
    vaccine_matching: ["mutation_plot", "phylogenetic_tree", "hypothesis_plot"],
    phylogeny: ["phylogenetic_tree", "beast_tmrca", "transmission_distance"],
    beast_tmrca: ["beast_tmrca", "phylogenetic_tree"],
    transmission: ["transmission_distance", "phylogenetic_tree", "beast_tmrca"],
    recombination: ["recombination_plot", "phylogenetic_tree", "mutation_plot"],
    phylodynamics: ["beast_tmrca", "transmission_distance", "phylogenetic_tree"],
    outbreak_source: ["transmission_distance", "map_spatiotemporal_plot", "phylogenetic_tree"],
    source_sink: ["transmission_distance", "map_spatiotemporal_plot"],
    lineage_replacement: ["phylogenetic_tree", "beast_tmrca", "hypothesis_plot"],
    fitness: ["fitness_landscape", "transmission_distance"],
    selection_pressure: ["fitness_landscape", "mutation_plot", "hypothesis_plot"],
    host_adaptation: ["fitness_landscape", "phylogenetic_tree", "hypothesis_plot"],
    immune_escape: ["fitness_landscape", "mutation_plot", "hypothesis_plot"],
    within_host_evolution: ["fitness_landscape", "mutation_plot", "beast_tmrca"],
    cross_species_jump: ["phylogenetic_tree", "fitness_landscape", "hypothesis_plot"],
    forecasting: ["fitness_landscape", "map_spatiotemporal_plot", "hypothesis_plot"],
    antigenic_drift: ["phylogenetic_tree", "mutation_plot", "beast_tmrca"],
    antigenic_shift: ["phylogenetic_tree", "recombination_plot", "transmission_distance"],
    geo_spatiotemporal: ["map_spatiotemporal_plot", "transmission_distance"],
    animal_host: ["map_spatiotemporal_plot", "phylogenetic_tree", "fitness_landscape"],
    ml_qml: ["ml_qml_performance_plot"],
    genomic_intelligence: ["phylogenetic_tree", "transmission_distance", "fitness_landscape", "mutation_plot", "hypothesis_plot"],
    bacterial_wgs_analysis: ["bacterial_phylogeny_plot"],
    bacterial_wgs_phylogeny: ["bacterial_phylogeny_plot", "map_spatiotemporal_plot", "bacterial_typing_plot"],
    bacterial_partial_phylogeny: ["bacterial_phylogeny_plot", "bacterial_typing_plot"],
    bacterial_pangenome: ["bacterial_pangenome_plot", "bacterial_phylogeny_plot"],
    bacterial_amr: ["bacterial_amr_plot", "bacterial_phylogeny_plot"],
    bacterial_virulence: ["bacterial_virulence_plot", "bacterial_phylogeny_plot"],
    bacterial_strain_serovar: ["bacterial_typing_plot", "bacterial_phylogeny_plot"],
    bacterial_antigen: ["bacterial_typing_plot"],
    bacterial_mlst: ["bacterial_typing_plot", "bacterial_phylogeny_plot"],
    bacterial_plasmid: ["bacterial_amr_plot", "bacterial_phylogeny_plot"],
    bacterial_genome_download: ["bacterial_phylogeny_plot", "bacterial_pangenome_plot", "bacterial_amr_plot"],
    report_package: ["qc_summary_plot"],
    complete: Object.keys(figureCatalog),
  };

  const hypothesisList = [
    { id: "auto", label: "Auto" },
    { id: "vaccine_escape_driven_emergence", label: "Vaccine-escape emergence" },
    { id: "fitness_peak_shift", label: "Fitness peak shift" },
    { id: "nt_distance_supported_transmission", label: "NT-distance transmission" },
    { id: "source_sink_regional_seeding", label: "Source–sink seeding" },
    { id: "tmrca_recent_introduction", label: "Recent introduction / tMRCA" },
    { id: "host_adaptation_signature", label: "Host-adaptation signature" },
    { id: "recombination_generated_lineage", label: "Recombination-generated lineage" },
    { id: "immune_pressure_selection", label: "Immune-pressure selection" },
    { id: "lineage_replacement_event", label: "Lineage replacement event" },
  ];

  const availableFigureTypes = figureForAnalysis[analysisMode] || ["phylogenetic_tree"];
  const currentFigureType = availableFigureTypes.includes(figureType) ? figureType : availableFigureTypes[0];
  const currentDesigns = figureCatalog[currentFigureType]?.designs || [];

  useEffect(() => {
    const firstType = (figureForAnalysis[analysisMode] || ["phylogenetic_tree"])[0];
    setFigureType(firstType);
    setSelectedDesigns((figureCatalog[firstType]?.designs || []).slice(0, 3));
  }, [analysisMode]);

  useEffect(() => {
    const firstThree = (figureCatalog[figureType]?.designs || []).slice(0, 3);
    setSelectedDesigns(firstThree);
  }, [figureType]);

  const outputs = result?.outputs && typeof result.outputs === "object" ? result.outputs : {};
  const outputItems = Object.entries(outputs)
    .filter(([, value]) => typeof value === "string")
    .map(([key, value]) => ({ key, path: String(value), filename: qigenexDownloadName(String(value)) }));

  const textItems = outputItems.filter((item) =>
    /\.(csv|tsv|txt|json|xlsx|xls|fasta|fa|fas|fna|treefile|nwk|newick|log|md|html|xml)$/i.test(item.path)
  );
  const figureItemsRaw = outputItems.filter((item) =>
    /\.(png|jpg|jpeg|svg|pdf|webp)$/i.test(item.path)
  );

  const selectedDesignTokens = selectedDesigns.map((x) => x.toLowerCase());
  const figureContextTokens = [figureType, ...selectedDesignTokens]
    .map((x) => x.toLowerCase().replace(/_/g, " "))
    .flatMap((x) => [x, x.replace(/ /g, "_")]);

  const figureItemsFiltered = figureItemsRaw.filter((item) => {
    const name = item.filename.toLowerCase();
    const path = item.path.toLowerCase();
    if (figureType === "transmission_distance") {
      return /(transmission|route|country|source|sink|sharing|lineage|map|sankey)/i.test(name + " " + path);
    }
    if (figureType === "map_spatiotemporal_plot") {
      return /(map|route|country|geo|spatio|source|sink|timeline)/i.test(name + " " + path);
    }
    if (figureType.includes("bacterial")) {
      return /(bacterial|amr|virulence|pangenome|serovar|mlst|ani|mash|strain|antigen|tree|phylo)/i.test(name + " " + path);
    }
    return figureContextTokens.some((token) => token && (name.includes(token) || path.includes(token))) || figureItemsRaw.length <= 3;
  });

  const figureItems = figureItemsFiltered.length ? figureItemsFiltered : figureItemsRaw;

  const selectedFigurePath = selectedFigure || figureItems[0]?.path || "";
  const selectedTextPath = selectedText || textItems[0]?.path || "";

  function toggleDesign(id: string) {
    setSelectedDesigns((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  }

  function runNow() {
    runQigenexAnalysis("analysis", {
      figure_type: showBacterialWgsPanel ? bacterialWgsFigureType : currentFigureType,
      figure_plot_style: currentFigureType,
      figure_designs: (showBacterialWgsPanel ? bacterialWgsFigureDesigns : selectedDesigns).join(","),
      figure_styles: "journal_clean",
      figure_formats: figureFormats,
      figure_dpi: figureDpi,
      figure_layout: figureLayout,
      figure_title_mode: titleMode,
      title_font_size: "16",
      axis_title_font_size: "13",
      tick_label_font_size: "11",
      font_weight: "bold",
      transparent_background: "false",
      tree_inference_method: treeMethod,
      beast_tmrca: currentFigureType === "beast_tmrca" ? "true" : "false",
      beast_clock_model: beastClock,
      beast_chain_length: beastChain,
      tmrca_substitution_rate: tmrcaRate,
      transmission_mode: transmissionMode,
      nt_distance_threshold: ntThreshold,
      fitness_figure_designs: currentFigureType === "fitness_landscape" ? selectedDesigns.join(",") : "",
      bacterial_wgs_task: bacterialWgsTask,
      bacterial_wgs_figure_type: bacterialWgsFigureType,
      bacterial_wgs_figure_designs: bacterialWgsFigureDesigns.join(","),
      comparable_genome_mode: comparableGenomeMode,
      download_taxon_name: downloadTaxonName,
      comparable_genome_class: comparableGenomeClass,
      comparable_host_groups: comparableHostGroups.join(","),
      comparable_environment_groups: comparableEnvironmentGroups.join(","),
      comparable_state_groups: comparableStateGroups.join(","),
      comparable_genome_purpose: comparableGenomePurpose,
      download_representative_only: downloadRepresentativeOnly,
      include_reference_genomes: includeReferenceGenomes,
      bacterial_tree_workflow: bacterialTreeWorkflow,
      pangenome_workflow: pangenomeWorkflow,
      bacterial_output_package: bacterialOutputPackage,
      targetGenomeFile: targetGenomeFile,
      manualComparableGenomeFile: manualComparableGenomeFile,
      novel_hypothesis: hypothesis,
      metadataFile: metadataRowsToFile(metadataColumns, metadataRows, `qigenex_${metadataPreset}_metadata.csv`),
      metadataText: metadataRowsToCsv(metadataColumns, metadataRows),
      metadata_preset: metadataPreset,
      metadata_schema_preset: metadataPreset,
      metadata_template_fields: metadataFields,
      metadata_required_fields: requiredMetadataFields,
      auto_enrich_metadata: autoEnrichMetadata,
      auto_geocode_country: autoGeocodeCountry,
      auto_typing: autoTyping,
      node_color_by: nodeColorBy,
      node_shape_by: nodeShapeBy,
      map_projection: mapProjection,
      map_background: mapBackground,
      map_extent: mapExtent,
      route_level: routeLevel,
      aggregate_routes: aggregateRoutes,
      arrow_style: arrowStyle,
      arrow_width_by: arrowWidthBy,
      arrow_color_by: arrowColorBy,
      arrowhead_style: arrowheadStyle,
      line_curve_style: lineCurveStyle,
      max_routes: maxRoutes,
      route_support_threshold: routeSupportThreshold,
      bacterial_mode: bacterialMode,
      genome_query_count: genomeQueryCount,
      genome_source: genomeSource,
      genome_download_strategy: genomeDownloadStrategy,
      genome_host_filter: genomeHostFilter,
      genome_country_filter: genomeCountryFilter,
      genome_year_filter: genomeYearFilter,
      genome_per_year: genomePerYear,
      ani_threshold: aniThreshold,
      mash_distance_threshold: mashDistanceThreshold,
      use_manual_genomes: "true",
      run_pangenome: showBacterialWgsPanel && bacterialWgsTask === "pangenome" ? "true" : analysisMode === "bacterial_pangenome" ? "true" : "false",
      run_amr: showBacterialWgsPanel && bacterialWgsTask === "amr" ? "true" : analysisMode === "bacterial_amr" ? "true" : "false",
      run_virulence: showBacterialWgsPanel && bacterialWgsTask === "virulence" ? "true" : analysisMode === "bacterial_virulence" ? "true" : "false",
      run_serovar: showBacterialWgsPanel && bacterialWgsTask === "typing" ? "true" : analysisMode === "bacterial_strain_serovar" ? "true" : "false",
      run_antigen: showBacterialWgsPanel && bacterialWgsTask === "antigen" ? "true" : analysisMode === "bacterial_antigen" ? "true" : "false",
      run_mlst: showBacterialWgsPanel && bacterialWgsTask === "mlst" ? "true" : analysisMode === "bacterial_mlst" ? "true" : "false",
    });
  }


  async function cancelQigenexJob(jobId?: string) {
    const target = jobId || result?.job_id;
    if (!target) {
      console.warn("No QI-GeneX-N job ID is available for cancellation.");
      return;
    }

    try {
      const response = await fetch(`/api/qigenex?job_id=${encodeURIComponent(target)}&action=cancel`, {
        method: "POST",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      console.info("QI-GeneX-N cancel response:", data);
    } catch (error) {
      console.error("QI-GeneX-N cancel failed:", error);
    }
  }

  function renderFigure(path: string) {
    if (!path) {
      return <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950 p-6 text-sm text-slate-400">No figure yet.</div>;
    }

    const url = qigenexResultUrl(path);
    if (/\.pdf$/i.test(path)) {
      return <iframe title="QI-GeneX-N figure preview" src={url} className="h-[760px] w-full rounded-2xl border border-white/10 bg-white" />;
    }


  return (
      <div className="rounded-2xl border border-white/10 bg-white p-3">
        <img src={url} alt="QI-GeneX-N figure" className="max-h-[760px] w-full rounded-xl object-contain" />
      </div>
    );
  }



  function toggleStringSelection(value: string, selected: string[], setter: (items: string[]) => void) {
    setter(selected.includes(value) ? selected.filter((x) => x !== value) : [...selected, value]);
  }

  const showBacterialWgsPanel = analysisMode === "bacterial_wgs_analysis";

  function applyMetadataPreset(preset: QigenexMetadataPreset) {
    const template = QIGENEX_METADATA_PRESETS[preset];
    setMetadataPreset(preset);
    setMetadataColumns(template.columns);
    setMetadataRows(makeMetadataRows(template.columns, template.sampleRows));
    setMetadataFields(template.columns.join(","));
    setRequiredMetadataFields(
      preset === "bacterial_wgs"
        ? "sample_id,organism,country,collection_date,host"
        : preset === "transmission_map"
        ? "sample_id,country,collection_date,host,source_country,sink_country"
        : "sample_id,country,collection_date,host"
    );
    console.info(`Metadata sheet preset loaded: ${template.label}. Columns=${template.columns.length}; rows=${template.sampleRows.length}.`);
  }

  function updateMetadataCell(rowIndex: number, column: string, value: string) {
    setMetadataRows((old) =>
      old.map((row, i) => (i === rowIndex ? { ...row, [column]: value } : row))
    );
  }

  function addMetadataRow() {
    const blank: QigenexMetadataRow = {};
    metadataColumns.forEach((col) => {
      blank[col] = "";
    });
    blank.sample_id = `Sample_${metadataRows.length + 1}`;
    setMetadataRows((old) => [...old, blank]);
  }

  function removeMetadataRow(rowIndex: number) {
    setMetadataRows((old) => old.filter((_, i) => i !== rowIndex));
  }

  function addMetadataColumn() {
    const cleanName = `custom_field_${metadataColumns.length + 1}`;
    if (metadataColumns.includes(cleanName)) return;
    setMetadataColumns((old) => [...old, cleanName]);
    setMetadataRows((old) => old.map((row) => ({ ...row, [cleanName]: "" })));
    setMetadataFields((old) => [...splitFieldNames(old), cleanName].join(","));
  }

  function rebuildMetadataColumnsFromFieldText() {
    const cols = splitFieldNames(metadataFields);
    if (!cols.length) return;
    setMetadataColumns(cols);
    setMetadataRows((old) =>
      old.length
        ? old.map((row) => {
            const next: QigenexMetadataRow = {};
            cols.forEach((col) => {
              next[col] = row[col] ?? "";
            });
            return next;
          })
        : makeMetadataRows(cols, [{}])
    );
  }


  function renameMetadataColumn(columnIndex: number, value: string) {
    const cleanName = value.trim().replace(/\s+/g, "_");
    if (!cleanName) return;
    const oldColumn = metadataColumns[columnIndex];
    if (!oldColumn || oldColumn === cleanName) return;
    if (metadataColumns.includes(cleanName)) return;

    setMetadataColumns((old) => old.map((col, i) => (i === columnIndex ? cleanName : col)));
    setMetadataRows((old) =>
      old.map((row) => {
        const next = { ...row };
        next[cleanName] = next[oldColumn] ?? "";
        delete next[oldColumn];
        return next;
      })
    );
    setMetadataFields((old) => splitFieldNames(old).map((col) => (col === oldColumn ? cleanName : col)).join(","));
  }

  function removeMetadataColumn(column: string) {
    if (["sample_id"].includes(column)) return;
    setMetadataColumns((old) => old.filter((col) => col !== column));
    setMetadataRows((old) =>
      old.map((row) => {
        const next = { ...row };
        delete next[column];
        return next;
      })
    );
    setMetadataFields((old) => splitFieldNames(old).filter((col) => col !== column).join(","));
  }

  function downloadMetadataTemplate() {
    const csv = metadataRowsToCsv(metadataColumns, metadataRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `qigenex_${metadataPreset}_metadata_template.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }


  return (
    <section className="space-y-5">
      <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/80 p-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_auto]">
          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Input</label>
            <input
              type="file"
              accept=".fasta,.fa,.fas,.fna,.txt,.aln"
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
              className="block w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm text-slate-300 file:mr-3 file:rounded-xl file:border-0 file:bg-purple-400 file:px-3 file:py-2 file:font-black file:text-slate-950"
            />
            <p className="mt-2 truncate text-xs text-slate-500">{fastaFileName || alignedFileName || "FASTA required"}</p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Analysis</label>
            <select value={analysisMode} onChange={(e) => setAnalysisMode(e.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none">
              {analysisList.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>

          {!showBacterialWgsPanel && (
            <div>
              <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Figure</label>
              <select value={currentFigureType} onChange={(e) => setFigureType(e.target.value)} className="w-full rounded-[1.2rem] border border-white/10 bg-slate-900 px-4 py-4 text-sm font-black text-white outline-none focus:border-cyan-300">
                {availableFigureTypes.map((item) => (
                  <option key={item} value={item}>{figureCatalog[item]?.label || item}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-end gap-3">
            <button onClick={runNow} disabled={loading || !hasSequence || selectedDesigns.length === 0} className="rounded-2xl bg-purple-400 px-6 py-3 text-sm font-black text-slate-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">
              {loading ? "Running" : "Run"}
            </button>
            <button onClick={() => setMoreOpen(!moreOpen)} className="rounded-2xl border border-white/10 bg-slate-900 px-5 py-3 text-sm font-black text-white hover:border-purple-300">
              {moreOpen ? "Less" : "More"}
            </button>
          </div>
        </div>


        {showBacterialWgsPanel && (
          <div className="mt-5 rounded-[1.4rem] border border-emerald-300/20 bg-slate-950/90 p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.22em] text-emerald-200">Bacterial genome workflow</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  Target genome is always uploaded manually. Comparable genomes can be downloaded automatically or uploaded manually, then filtered by host, environment/source, country/year and analysis purpose.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-black text-emerald-100">
                Target required
              </div>
            </div>


            <div className="mb-4 rounded-2xl border border-emerald-300/10 bg-slate-900/50 p-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Bacterial WGS task</label>
                  <select
                    value={bacterialWgsTask}
                    onChange={(e) => {
                      const task = e.target.value;
                      setBacterialWgsTask(task);
                      const nextFigure =
                        task === "pangenome" ? "bacterial_pangenome_plot" :
                        task === "amr" ? "bacterial_amr_plot" :
                        task === "virulence" ? "bacterial_virulence_plot" :
                        ["typing", "antigen", "mlst"].includes(task) ? "bacterial_typing_plot" :
                        "bacterial_phylogeny_plot";
                      setBacterialWgsFigureType(nextFigure);
                      setBacterialWgsFigureDesigns((figureCatalog[nextFigure]?.designs || ["wgs_ani_mash_tree"]).slice(0, 3));
                      setComparableGenomePurpose(task);
                    }}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-black text-white"
                  >
                    <option value="phylogeny">Phylogenetic analysis</option>
                    <option value="pangenome">Pangenome analysis</option>
                    <option value="amr">AMR gene profiling</option>
                    <option value="virulence">Virulence/pathogenic gene profiling</option>
                    <option value="typing">Strain / serovar identification</option>
                    <option value="antigen">Antigen profiling</option>
                    <option value="mlst">MLST typing</option>
                    <option value="combined">Combined bacterial genome analysis</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Result / figure family</label>
                  <select
                    value={bacterialWgsFigureType}
                    onChange={(e) => {
                      setBacterialWgsFigureType(e.target.value);
                      setBacterialWgsFigureDesigns((figureCatalog[e.target.value]?.designs || []).slice(0, 3));
                    }}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-black text-white"
                  >
                    {["bacterial_phylogeny_plot", "bacterial_pangenome_plot", "bacterial_amr_plot", "bacterial_virulence_plot", "bacterial_typing_plot", "map_spatiotemporal_plot"].map((item) => (
                      <option key={item} value={item}>{figureCatalog[item]?.label || item}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Output design mode</label>
                  <select value={bacterialOutputPackage} onChange={(e) => setBacterialOutputPackage(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-black text-white">
                    <option value="standard_plus_figures">Standard + figures</option>
                    <option value="publication_ready">Publication-ready</option>
                    <option value="minimal_fast">Minimal fast</option>
                    <option value="full_research">Full research package</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Designs for selected bacterial task</p>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {(figureCatalog[bacterialWgsFigureType]?.designs || []).map((design) => (
                    <button
                      key={design}
                      type="button"
                      onClick={() =>
                        setBacterialWgsFigureDesigns((old) =>
                          old.includes(design) ? old.filter((x) => x !== design) : [...old, design]
                        )
                      }
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-black ${
                        bacterialWgsFigureDesigns.includes(design)
                          ? "border-emerald-300 bg-emerald-300/15 text-emerald-100"
                          : "border-white/10 bg-slate-950 text-slate-300"
                      }`}
                    >
                      {design.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Target genome(s)</label>
                <input
                  type="file"
                  accept=".fasta,.fa,.fna,.ffn,.faa,.fas,.gz,.zip"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setTargetGenomeFile(file);
                    setTargetGenomeFileName(file?.name || "");
                    if (file && !fastaFile) {
                      setFastaFile(file);
                      setFastaFileName(file.name);
                    }
                  }}
                  className="block w-full text-sm text-slate-200 file:mr-3 file:rounded-xl file:border-0 file:bg-purple-300 file:px-4 file:py-2 file:font-black file:text-slate-950"
                />
                <p className="mt-2 break-all text-xs font-semibold text-slate-400">{targetGenomeFileName || fastaFileName || "No target genome selected"}</p>
                <p className="mt-2 text-xs text-slate-500">Use assembled genome FASTA/contigs. This file is also used as the main FASTA input.</p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Comparable genome source</label>
                <select value={comparableGenomeMode} onChange={(e) => setComparableGenomeMode(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="auto_download">Automatically download comparable genomes</option>
                  <option value="manual_upload">Manual comparable genome upload only</option>
                  <option value="auto_plus_manual">Auto download + manual uploaded genomes</option>
                </select>

                {(comparableGenomeMode === "manual_upload" || comparableGenomeMode === "auto_plus_manual") && (
                  <div className="mt-3">
                    <input
                      type="file"
                      accept=".fasta,.fa,.fna,.ffn,.faa,.fas,.gz,.zip"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setManualComparableGenomeFile(file);
                        setManualComparableGenomeFileName(file?.name || "");
                      }}
                      className="block w-full text-sm text-slate-200 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-300 file:px-4 file:py-2 file:font-black file:text-slate-950"
                    />
                    <p className="mt-2 break-all text-xs font-semibold text-slate-400">{manualComparableGenomeFileName || "No manual comparable genome file selected"}</p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Workflow algorithm</label>
                <select value={comparableGenomePurpose} onChange={(e) => setComparableGenomePurpose(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="phylogeny">Phylogeny</option>
                  <option value="pangenome">Pangenome</option>
                  <option value="amr">AMR profiling</option>
                  <option value="virulence">Virulence profiling</option>
                  <option value="typing">Serovar / MLST / antigen typing</option>
                  <option value="combined">Combined bacterial genome analysis</option>
                </select>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <select value={bacterialTreeWorkflow} onChange={(e) => setBacterialTreeWorkflow(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white">
                    <option value="ani_mash_core_snp">ANI + Mash + core SNP</option>
                    <option value="core_snp_only">Core SNP tree</option>
                    <option value="core_gene_alignment">Core gene alignment</option>
                    <option value="partial_gene_tree">Partial gene tree</option>
                  </select>
                  <select value={bacterialOutputPackage} onChange={(e) => setBacterialOutputPackage(e.target.value)} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white">
                    <option value="standard_plus_figures">Standard + figures</option>
                    <option value="publication_ready">Publication-ready</option>
                    <option value="minimal_fast">Minimal fast</option>
                    <option value="full_research">Full research package</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Taxon / organism query</label>
                <input value={downloadTaxonName} onChange={(e) => setDownloadTaxonName(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="auto_from_target or Salmonella enterica" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Genome selection class</label>
                <select value={comparableGenomeClass} onChange={(e) => setComparableGenomeClass(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                  <option value="balanced">Balanced</option>
                  <option value="host_wise">Host-wise</option>
                  <option value="country_wise">Country-wise</option>
                  <option value="year_wise">Year-wise</option>
                  <option value="ani_nearest">ANI nearest</option>
                  <option value="mash_diverse">Mash diverse</option>
                  <option value="reference_representative">Reference representative</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Comparable genomes</label>
                <input value={genomeQueryCount} onChange={(e) => setGenomeQueryCount(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Per year</label>
                <input value={genomePerYear} onChange={(e) => setGenomePerYear(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Host selection</p>
                <div className="flex flex-wrap gap-2">
                  {["human", "poultry", "swine", "cattle", "goat", "sheep", "dog", "cat", "wild_bird", "wild_boar", "fish", "food", "environment", "unknown"].map((item) => (
                    <button key={item} type="button" onClick={() => toggleStringSelection(item, comparableHostGroups, setComparableHostGroups)} className={`rounded-xl px-3 py-2 text-xs font-black ${comparableHostGroups.includes(item) ? "bg-emerald-300 text-slate-950" : "bg-slate-950 text-slate-300 ring-1 ring-white/10"}`}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Environment / source</p>
                <div className="flex flex-wrap gap-2">
                  {["clinical", "farm", "slaughterhouse", "food", "meat", "milk", "water", "soil", "wastewater", "wildlife", "hospital", "market", "reference"].map((item) => (
                    <button key={item} type="button" onClick={() => toggleStringSelection(item, comparableEnvironmentGroups, setComparableEnvironmentGroups)} className={`rounded-xl px-3 py-2 text-xs font-black ${comparableEnvironmentGroups.includes(item) ? "bg-cyan-300 text-slate-950" : "bg-slate-950 text-slate-300 ring-1 ring-white/10"}`}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-4">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">State / sampling class</p>
                <div className="flex flex-wrap gap-2">
                  {["clinical", "carrier", "outbreak", "surveillance", "reference", "environmental", "foodborne", "zoonotic", "unknown"].map((item) => (
                    <button key={item} type="button" onClick={() => toggleStringSelection(item, comparableStateGroups, setComparableStateGroups)} className={`rounded-xl px-3 py-2 text-xs font-black ${comparableStateGroups.includes(item) ? "bg-purple-300 text-slate-950" : "bg-slate-950 text-slate-300 ring-1 ring-white/10"}`}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Country filter</label>
                <input value={genomeCountryFilter} onChange={(e) => setGenomeCountryFilter(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="auto or Bangladesh,India,China" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Year filter</label>
                <input value={genomeYearFilter} onChange={(e) => setGenomeYearFilter(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" placeholder="auto or 2015-2026" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Representative only</label>
                <select value={downloadRepresentativeOnly} onChange={(e) => setDownloadRepresentativeOnly(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                  <option value="true">Yes, reduce duplicates</option>
                  <option value="false">No, keep all matches</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Reference genomes</label>
                <select value={includeReferenceGenomes} onChange={(e) => setIncludeReferenceGenomes(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                  <option value="true">Include references</option>
                  <option value="false">Exclude references</option>
                </select>
              </div>
            </div>
          </div>
        )}


        {moreOpen && (
          <div className="mt-5 space-y-5 rounded-2xl border border-white/10 bg-slate-900/70 p-4">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-black text-white">Designs</p>
                <button onClick={() => setSelectedDesigns(currentDesigns)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300 hover:border-purple-300">Select all</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {currentDesigns.map((id) => (
                  <button key={id} type="button" onClick={() => toggleDesign(id)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold ${selectedDesigns.includes(id) ? "border-purple-300 bg-purple-400/15 text-purple-100" : "border-white/10 bg-slate-950 text-slate-300"}`}>
                    {id.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Sequence mode</label>
                <select value={sequenceMode} onChange={(e) => setSequenceMode(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="unaligned">Unaligned</option>
                  <option value="aligned">Aligned</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Formats</label>
                <input value={figureFormats} onChange={(e) => setFigureFormats(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">DPI</label>
                <input value={figureDpi} onChange={(e) => setFigureDpi(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Layout</label>
                <select value={figureLayout} onChange={(e) => setFigureLayout(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="separate">Separate</option>
                  <option value="panel">Panel</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Title</label>
                <select value={titleMode} onChange={(e) => setTitleMode(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="full">Full</option>
                  <option value="short">Short</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Tree method</label>
                <select value={treeMethod} onChange={(e) => setTreeMethod(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="maximum_likelihood">ML</option>
                  <option value="neighbor_joining">NJ</option>
                  <option value="bayesian">Bayesian</option>
                  <option value="parsimony">Parsimony</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Transmission</label>
                <select value={transmissionMode} onChange={(e) => setTransmissionMode(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                  <option value="standard">Standard</option>
                  <option value="nt_distance">NT distance</option>
                  <option value="phylogenetic">Phylogenetic</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">NT threshold</label>
                <input value={ntThreshold} onChange={(e) => setNtThreshold(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
              </div>
            </div>

            <details className="rounded-2xl border border-cyan-300/20 bg-slate-950 p-4" open>
              <summary className="cursor-pointer text-sm font-black text-cyan-200">Metadata sheet and image/map customization</summary>

              <div className="mt-4 rounded-2xl border border-cyan-300/10 bg-slate-900/50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">Excel-like metadata entry sheet</p>
                    <p className="text-xs font-semibold text-slate-400">Choose a preset, edit cells directly, add rows/columns, then submit. This sheet is sent as a real CSV metadata file.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={addMetadataRow} className="rounded-xl bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 hover:bg-white">Add row</button>
                    <button type="button" onClick={addMetadataColumn} className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-black text-white ring-1 ring-white/10 hover:bg-slate-700">Add column</button>
                    <button type="button" onClick={downloadMetadataTemplate} className="rounded-xl bg-purple-300 px-3 py-2 text-xs font-black text-slate-950 hover:bg-white">Download metadata CSV</button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Metadata preset</label>
                    <select value={metadataPreset} onChange={(e) => applyMetadataPreset(e.target.value as QigenexMetadataPreset)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      {Object.entries(QIGENEX_METADATA_PRESETS).map(([key, item]) => (
                        <option key={key} value={key}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Auto enrich metadata</label>
                    <select value={autoEnrichMetadata} onChange={(e) => setAutoEnrichMetadata(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Auto country coordinates</label>
                    <select value={autoGeocodeCountry} onChange={(e) => setAutoGeocodeCountry(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      <option value="true">Use country centroids if lat/lon missing</option>
                      <option value="false">Use uploaded coordinates only</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Auto typing</label>
                    <select value={autoTyping} onChange={(e) => setAutoTyping(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      <option value="true">Infer genotype/lineage/serovar</option>
                      <option value="false">Use metadata only</option>
                    </select>
                  </div>
                </div>

                <div className="mt-4 overflow-auto rounded-2xl border border-white/10 bg-slate-950">
                  <table className="min-w-[1200px] w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-900 text-slate-300">
                      <tr>
                        <th className="border-b border-white/10 px-3 py-2 font-black uppercase tracking-[0.12em]">#</th>
                        {metadataColumns.map((col, colIndex) => (
                          <th key={col} className="border-b border-white/10 px-3 py-2">
                            <div className="flex min-w-[150px] items-center gap-2">
                              <input
                                value={col}
                                onChange={(e) => renameMetadataColumn(colIndex, e.target.value)}
                                className="w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-cyan-100 outline-none focus:border-cyan-300"
                              />
                              {col !== "sample_id" && (
                                <button type="button" onClick={() => removeMetadataColumn(col)} className="rounded-md bg-red-400/90 px-2 py-1 text-[10px] font-black text-slate-950 hover:bg-white">
                                  ×
                                </button>
                              )}
                            </div>
                          </th>
                        ))}
                        <th className="border-b border-white/10 px-3 py-2 font-black uppercase tracking-[0.12em]">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metadataRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="odd:bg-slate-900/40 even:bg-slate-950">
                          <td className="border-b border-white/5 px-3 py-2 font-black text-cyan-200">{rowIndex + 1}</td>
                          {metadataColumns.map((col) => (
                            <td key={col} className="border-b border-white/5 px-2 py-2">
                              <input
                                value={row[col] ?? ""}
                                onChange={(e) => updateMetadataCell(rowIndex, col, e.target.value)}
                                className="w-full min-w-[120px] rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-cyan-300"
                              />
                            </td>
                          ))}
                          <td className="border-b border-white/5 px-2 py-2">
                            <button type="button" onClick={() => removeMetadataRow(rowIndex)} className="rounded-lg bg-red-400/90 px-2 py-1 text-xs font-black text-slate-950 hover:bg-white">
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <details className="mt-3 rounded-2xl border border-white/10 bg-slate-950 p-3">
                  <summary className="cursor-pointer text-xs font-black text-slate-300">Advanced field-name editor</summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Current column names</label>
                      <textarea value={metadataFields} onChange={(e) => setMetadataFields(e.target.value)} className="h-20 w-full rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white" />
                      <button type="button" onClick={rebuildMetadataColumnsFromFieldText} className="mt-2 rounded-xl bg-slate-800 px-3 py-2 text-xs font-black text-white ring-1 ring-white/10 hover:bg-slate-700">Rebuild sheet from names</button>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Required fields</label>
                      <textarea value={requiredMetadataFields} onChange={(e) => setRequiredMetadataFields(e.target.value)} className="h-20 w-full rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white" />
                    </div>
                  </div>
                </details>
              </div>

              <div className="mt-4 rounded-2xl border border-purple-300/10 bg-slate-900/40 p-4">
                <p className="mb-3 text-sm font-black text-white">Map and plot style controls</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Map projection</label>
                    <select value={mapProjection} onChange={(e) => setMapProjection(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      <option value="rectangular">Rectangular</option>
                      <option value="round_robinson">Round / Robinson</option>
                      <option value="orthographic">Globe / orthographic</option>
                      <option value="mercator">Mercator</option>
                      <option value="plate_carree">PlateCarree</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Map background</label>
                    <select value={mapBackground} onChange={(e) => setMapBackground(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      <option value="natural_earth_clean">Natural Earth clean</option>
                      <option value="white_publication">White publication</option>
                      <option value="light_ocean">Light ocean</option>
                      <option value="dark_map">Dark map</option>
                      <option value="border_only">Border only</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Arrow style</label>
                    <select value={arrowStyle} onChange={(e) => setArrowStyle(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      <option value="curved_arrow">Curved arrow</option>
                      <option value="straight_arrow">Straight arrow</option>
                      <option value="great_circle_arrow">Great-circle arrow</option>
                      <option value="bezier_arrow">Bezier arrow</option>
                      <option value="dashed_route_arrow">Dashed route arrow</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Arrowhead</label>
                    <select value={arrowheadStyle} onChange={(e) => setArrowheadStyle(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      <option value="standard_filled">Standard filled</option>
                      <option value="large_filled">Large filled</option>
                      <option value="small_clean">Small clean</option>
                      <option value="wedge">Wedge</option>
                      <option value="triangle">Triangle</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Arrow width by</label>
                    <select value={arrowWidthBy} onChange={(e) => setArrowWidthBy(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      <option value="route_support">Route support</option>
                      <option value="sequence_count">Sequence count</option>
                      <option value="mean_nt_distance">Mean NT distance</option>
                      <option value="same_lineage_count">Same-lineage count</option>
                      <option value="equal">Equal width</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Arrow color by</label>
                    <select value={arrowColorBy} onChange={(e) => setArrowColorBy(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      <option value="dominant_genotype">Dominant genotype</option>
                      <option value="dominant_lineage">Dominant lineage</option>
                      <option value="source_country">Source country</option>
                      <option value="sink_country">Sink country</option>
                      <option value="route_support">Route support</option>
                      <option value="single_color">Single color</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Line curve</label>
                    <select value={lineCurveStyle} onChange={(e) => setLineCurveStyle(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                      <option value="great_circle_curve">Great-circle curve</option>
                      <option value="quadratic_curve">Quadratic curve</option>
                      <option value="soft_arc">Soft arc</option>
                      <option value="straight">Straight</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Node color / shape</label>
                    <div className="grid grid-cols-2 gap-2">
                      <select value={nodeColorBy} onChange={(e) => setNodeColorBy(e.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                        <option value="dominant_genotype">Genotype</option>
                        <option value="dominant_lineage">Lineage</option>
                        <option value="country">Country</option>
                        <option value="host">Host</option>
                      </select>
                      <select value={nodeShapeBy} onChange={(e) => setNodeShapeBy(e.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                        <option value="dominant_host">Host</option>
                        <option value="dominant_genotype">Genotype</option>
                        <option value="sample_source">Sample source</option>
                        <option value="equal">Equal</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </details>

<details className="rounded-2xl border border-white/10 bg-slate-950 p-4">
              <summary className="cursor-pointer text-sm font-black text-emerald-200">Bacterial genome analysis options</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Bacterial mode</label>
                  <select value={bacterialMode} onChange={(e) => setBacterialMode(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                    <option value="wgs">WGS / assembled genome</option>
                    <option value="partial_gene">Partial gene</option>
                    <option value="hybrid">Hybrid WGS + partial</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Genome source</label>
                  <select value={genomeSource} onChange={(e) => setGenomeSource(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                    <option value="ncbi_assembly">NCBI Assembly</option>
                    <option value="ncbi_genbank">NCBI GenBank</option>
                    <option value="refseq">RefSeq</option>
                    <option value="manual_only">Manual upload only</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Required genomes</label>
                  <input value={genomeQueryCount} onChange={(e) => setGenomeQueryCount(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Download strategy</label>
                  <select value={genomeDownloadStrategy} onChange={(e) => setGenomeDownloadStrategy(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                    <option value="ani_mash_balanced">ANI + Mash balanced</option>
                    <option value="host_balanced">Host-balanced</option>
                    <option value="country_balanced">Country-balanced</option>
                    <option value="year_balanced">Year-balanced</option>
                    <option value="closest_ani">Closest ANI</option>
                    <option value="diverse_mash">Diverse Mash distance</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">ANI threshold</label>
                  <input value={aniThreshold} onChange={(e) => setAniThreshold(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Mash distance threshold</label>
                  <input value={mashDistanceThreshold} onChange={(e) => setMashDistanceThreshold(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Per-year limit</label>
                  <input value={genomePerYear} onChange={(e) => setGenomePerYear(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Country filter</label>
                  <input value={genomeCountryFilter} onChange={(e) => setGenomeCountryFilter(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Host filter</label>
                  <textarea value={genomeHostFilter} onChange={(e) => setGenomeHostFilter(e.target.value)} className="h-16 w-full rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white" />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Year filter</label>
                  <textarea value={genomeYearFilter} onChange={(e) => setGenomeYearFilter(e.target.value)} className="h-16 w-full rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white" placeholder="auto or 2010-2026 or 2020:5,2021:5" />
                </div>
              </div>
            </details>

            <details className="rounded-2xl border border-white/10 bg-slate-950 p-4">
              <summary className="cursor-pointer text-sm font-black text-purple-200">BEAST / tMRCA settings</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Clock</label>
                  <select value={beastClock} onChange={(e) => setBeastClock(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
                    <option value="strict">Strict</option>
                    <option value="relaxed_lognormal">Relaxed lognormal</option>
                    <option value="relaxed_exponential">Relaxed exponential</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Chain</label>
                  <input value={beastChain} onChange={(e) => setBeastChain(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Substitution rate</label>
                  <input value={tmrcaRate} onChange={(e) => setTmrcaRate(e.target.value)} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white" />
                </div>
              </div>
            </details>

            <details className="rounded-2xl border border-white/10 bg-slate-950 p-4">
              <summary className="cursor-pointer text-sm font-black text-slate-200">Input fields</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <textarea value={fastaText} onChange={(e) => setFastaText(e.target.value)} placeholder="Paste FASTA" className="h-28 rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white" />
                <textarea value={alignedText} onChange={(e) => setAlignedText(e.target.value)} placeholder="Paste aligned FASTA" className="h-28 rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white" />
                <textarea value={referenceText} onChange={(e) => setReferenceText(e.target.value)} placeholder="Reference FASTA / strain" className="h-24 rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white" />
                <textarea value={vaccineStrainText} onChange={(e) => setVaccineStrainText(e.target.value)} placeholder="Vaccine strain FASTA / IDs" className="h-24 rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white" />

                <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-purple-200">Sequence metadata</div>
                  <input type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(e) => { const file = e.target.files?.[0] || null; setGeoFile(file); setGeoFileName(file?.name || ""); }} className="block w-full text-sm text-slate-300" />
                  <div className="mt-2 truncate text-xs text-slate-400">{geoFileName || "sample_id, country, year, genotype, host, latitude, longitude"}</div>
                  <textarea value={geoRowsText} onChange={(e) => setGeoRowsText(e.target.value)} placeholder="sample_id,country,year,genotype,host,latitude,longitude" className="mt-3 h-24 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white" />
                </div>

                <div className="rounded-xl border border-white/10 bg-slate-900 p-3">
                  <div className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-200">Animal / host metadata</div>
                  <input type="file" accept=".csv,.tsv,.txt,.xlsx" onChange={(e) => { const file = e.target.files?.[0] || null; setAnimalFile(file); setAnimalFileName(file?.name || ""); }} className="block w-full text-sm text-slate-300" />
                  <div className="mt-2 truncate text-xs text-slate-400">{animalFileName || "animal_id, sample_id, species, age, sex, disease_state"}</div>
                  <textarea value={animalRowsText} onChange={(e) => setAnimalRowsText(e.target.value)} placeholder="animal_id,sample_id,species,age,sex,disease_state" className="mt-3 h-24 w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white" />
                </div>

                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes / logic for analysis" className="h-20 rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white md:col-span-2" />
              </div>
            </details>
          </div>
        )}
      </div>

      <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/80 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button onClick={() => setResultView("figures")} className={`rounded-xl px-4 py-2 text-sm font-black ${resultView === "figures" ? "bg-cyan-400 text-slate-950" : "bg-slate-900 text-slate-300"}`}>Figures</button>
            <button onClick={() => setResultView("text")} className={`rounded-xl px-4 py-2 text-sm font-black ${resultView === "text" ? "bg-purple-400 text-slate-950" : "bg-slate-900 text-slate-300"}`}>Text data</button>
            <button onClick={() => setResultView("log")} className={`rounded-xl px-4 py-2 text-sm font-black ${resultView === "log" ? "bg-emerald-400 text-slate-950" : "bg-slate-900 text-slate-300"}`}>Log</button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm font-bold text-slate-400">
            <span>Job: <span className="text-cyan-300">{result?.job_id || "NA"}</span></span>
            {result?.job_id && !["completed", "failed", "cancelled"].includes(String(result?.status || result?.state || "").toLowerCase()) && (
              <button onClick={() => cancelQigenexJob(String(result.job_id))} className="rounded-xl bg-red-400 px-3 py-2 text-xs font-black text-slate-950 hover:bg-white">
                Cancel
              </button>
            )}
          </div>
        </div>

        {resultView === "figures" && (
          <div className="grid gap-4 xl:grid-cols-[0.35fr_0.65fr]">
            <div className="space-y-2">
              {figureItems.length === 0 ? (
                <div className="rounded-xl bg-slate-900 p-4 text-sm text-slate-400">No figures yet.</div>
              ) : figureItems.map((item) => (
                <button key={item.path} onClick={() => setSelectedFigure(item.path)} className={`w-full rounded-xl border p-3 text-left text-xs font-bold ${selectedFigurePath === item.path ? "border-cyan-300 bg-cyan-400/10 text-cyan-100" : "border-white/10 bg-slate-900 text-slate-300"}`}>
                  {item.filename}
                </button>
              ))}
            </div>
            <div>{renderFigure(selectedFigurePath)}</div>
          </div>
        )}

        {resultView === "text" && (
          <div className="grid gap-4 xl:grid-cols-[0.35fr_0.65fr]">
            <div className="space-y-2">
              {textItems.length === 0 ? (
                <div className="rounded-xl bg-slate-900 p-4 text-sm text-slate-400">No text outputs yet.</div>
              ) : textItems.map((item) => (
                <button key={item.path} onClick={() => setSelectedText(item.path)} className={`w-full rounded-xl border p-3 text-left text-xs font-bold ${selectedTextPath === item.path ? "border-purple-300 bg-purple-400/10 text-purple-100" : "border-white/10 bg-slate-900 text-slate-300"}`}>
                  {item.filename}
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900 p-5 text-sm text-slate-300">
              {selectedTextPath ? (
                <a href={qigenexResultUrl(selectedTextPath)} download={qigenexDownloadName(selectedTextPath)} className="rounded-xl bg-purple-400 px-4 py-3 font-black text-slate-950">
                  Download selected text file
                </a>
              ) : "No file selected."}
            </div>
          </div>
        )}

        {resultView === "log" && (
          <div className="max-h-80 overflow-auto rounded-2xl bg-black/40 p-4 font-mono text-xs leading-6 text-emerald-200">
            {log.map((line: string, idx: number) => <div key={`${idx}-${line}`}>{line}</div>)}
          </div>
        )}
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
