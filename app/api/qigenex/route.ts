import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type AnalysisMode =
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
  | "bacterial_genome_download"
  | "bacterial_wgs_analysis";

const ANALYSES: AnalysisMode[] = [
  "complete",
  "alignment",
  "qc",
  "classification",
  "gene_orf",
  "gp5",
  "mutation",
  "fitness",
  "evolution",
  "phylogeny",
  "beast_tmrca",
  "transmission",
  "genomic_intelligence",
  "ml_qml",
  "antigenic_drift",
  "antigenic_shift",
  "vaccine_escape",
  "vaccine_matching",
  "host_adaptation",
  "immune_escape",
  "recombination",
  "phylodynamics",
  "selection_pressure",
  "outbreak_source",
  "lineage_replacement",
  "source_sink",
  "within_host_evolution",
  "cross_species_jump",
  "forecasting",
  "geo_spatiotemporal",
  "animal_host",
  "visualization",
  "bacterial_wgs_phylogeny",
  "bacterial_partial_phylogeny",
  "bacterial_pangenome",
  "bacterial_amr",
  "bacterial_virulence",
  "bacterial_strain_serovar",
  "bacterial_antigen",
  "bacterial_mlst",
  "bacterial_plasmid",
  "bacterial_wgs_analysis",
  "bacterial_genome_download",
  "report_package",
];

const FIGURE_DEFAULTS: Record<string, string[]> = {
  phylogenetic_tree: [
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
  beast_tmrca: [
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
  transmission_distance: [
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
  fitness_landscape: [
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
  mutation_plot: [
    "mutation_lollipop",
    "mutation_heatmap",
    "mutation_spectrum_bar",
    "mutation_domain_divergence",
    "hotspot_rank_bar",
    "temporal_hotspot_line",
    "co_mutation_network",
    "protein_landscape_dual",
    "escape_mutation_panel",
    "selection_site_map",
    "variant_signature_plot",
    "mutation_burden_radar",
  ],
  recombination_plot: [
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
  bacterial_phylogeny_plot: [
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
  bacterial_pangenome_plot: [
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
  bacterial_amr_plot: [
    "amr_gene_heatmap",
    "amr_class_bar",
    "resistome_tree_annotation",
    "amr_presence_matrix",
    "amr_genotype_network",
    "mar_index_plot",
    "amr_country_host_panel",
    "amr_composite_panel",
  ],
  bacterial_virulence_plot: [
    "virulence_gene_heatmap",
    "pathogenicity_island_map",
    "toxin_adhesion_invasion_panel",
    "virulence_tree_annotation",
    "vfdb_category_bar",
    "virulence_composite_panel",
  ],
  bacterial_typing_plot: [
    "serovar_summary_bar",
    "mlst_sequence_type_bar",
    "antigen_profile_matrix",
    "strain_cluster_tree",
    "typing_confidence_plot",
    "serovar_country_host_panel",
  ],
  hypothesis_plot: [
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
  qc_summary_plot: [
    "qc_dashboard",
    "length_gc_scatter",
    "ambiguity_heatmap",
    "coverage_bar",
    "pass_fail_waterfall",
    "missingness_histogram",
  ],
  map_spatiotemporal_plot: [
    "rectangular_route_map",
    "round_projection_map",
    "country_bubble_map",
    "choropleth_map",
    "timeline_map_panel",
    "flow_network_map",
    "spatiotemporal_heatmap",
    "route_animation_frames",
    "source_sink_map",
    "lineage_route_map",
    "host_shape_map",
    "import_export_balance_map",
    "route_support_map",
    "map_composite_panel",
  ],
  ml_qml_performance_plot: [
    "confusion_matrix",
    "roc_pr_curves",
    "feature_importance_bar",
    "shap_summary",
    "embedding_projection",
    "model_comparison_panel",
    "uncertainty_calibration",
    "quantum_kernel_map",
  ],
};

const ANALYSIS_TO_FIGURES: Record<string, string[]> = {
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
  bacterial_wgs_analysis: ["bacterial_phylogeny_plot", "bacterial_pangenome_plot", "bacterial_amr_plot", "bacterial_virulence_plot", "bacterial_typing_plot"],
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
  complete: Object.keys(FIGURE_DEFAULTS),
};

function backendUrl() {
  return (process.env.QIGENEX_BACKEND_URL || "http://140.245.47.234").replace(/\/+$/, "");
}

function clean(value: FormDataEntryValue | null | undefined, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeAnalysis(value: FormDataEntryValue | null | undefined): AnalysisMode {
  const raw = clean(value, "phylogeny").toLowerCase() as AnalysisMode;
  return ANALYSES.includes(raw) ? raw : "phylogeny";
}

function normalizeFigureType(raw: string, selected: AnalysisMode) {
  const value = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (value && FIGURE_DEFAULTS[value]) return value;
  return (ANALYSIS_TO_FIGURES[selected] || ["phylogenetic_tree"])[0];
}

function splitCsv(value: string) {
  return value.split(",").map((x) => x.trim()).filter(Boolean);
}

function normalizeDesigns(figureType: string, value: string) {
  const requested = splitCsv(value);
  const allowed = FIGURE_DEFAULTS[figureType] || FIGURE_DEFAULTS.phylogenetic_tree;
  if (!requested.length || requested.includes("all")) return allowed.slice(0, 3);
  const valid = requested.filter((x) => allowed.includes(x));
  return valid.length ? valid : allowed.slice(0, 3);
}

function makeTextFile(text: string, filename: string, type = "text/plain") {
  return new File([text], filename, { type });
}

function safeFilename(path: string) {
  return (path.split("/").pop() || "qigenex_result").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function parseJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      data: {
        status: "error",
        error: "Backend did not return JSON.",
        backendStatus: response.status,
        details: (await response.text()).slice(0, 2000),
      },
    };
  }
  return { ok: true, data: await response.json() };
}

function selectedFlags(mode: AnalysisMode, figureType: string, layout: string) {
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
    run_composite_figures: layout === "panel" ? "true" : "false",
    run_packaging: "false",
  };

  const mutationModes = ["mutation", "vaccine_escape", "vaccine_matching", "gp5", "antigenic_drift", "immune_escape", "selection_pressure", "recombination"];
  const phylogenyModes = ["phylogeny", "evolution", "genomic_intelligence", "antigenic_drift", "antigenic_shift", "beast_tmrca", "transmission", "recombination", "phylodynamics", "outbreak_source", "lineage_replacement", "source_sink", "cross_species_jump"];
  const fitnessModes = ["fitness", "host_adaptation", "immune_escape", "selection_pressure", "within_host_evolution", "forecasting"];
  const geospatialModes = ["geo_spatiotemporal", "animal_host", "transmission", "source_sink", "outbreak_source"];
  const bacterialModes = ["bacterial_wgs_analysis", "bacterial_wgs_phylogeny", "bacterial_partial_phylogeny", "bacterial_pangenome", "bacterial_amr", "bacterial_virulence", "bacterial_strain_serovar", "bacterial_antigen", "bacterial_mlst", "bacterial_plasmid", "bacterial_genome_download"];

  if (mode === "complete") {
    Object.keys(flags).forEach((key) => (flags[key] = "true"));
    return flags;
  }

  if (mode === "alignment") flags.run_alignment = "true";
  if (mode === "qc") flags.run_qc = "true";
  if (mode === "classification") flags.run_classification = "true";
  if (mode === "gene_orf") flags.run_gene_orf = "true";
  if (mode === "gp5") flags.run_gp5 = "true";
  if (mutationModes.includes(mode)) flags.run_mutation = "true";
  if (phylogenyModes.includes(mode)) flags.run_phylogeny = "true";
  if (mode === "ml_qml") {
    flags.run_ml = "true";
    flags.run_qml = "true";
  }
  if (fitnessModes.includes(mode)) flags.run_fitness = "true";
  if (geospatialModes.includes(mode)) flags.run_geospatial = "true";
  if (bacterialModes.includes(mode)) {
    flags.run_qc = "true";
    flags.run_classification = "true";
    flags.run_phylogeny = "true";
    flags.run_visualization = "true";
    if (mode === "bacterial_pangenome") flags.run_pangenome = "true";
    if (["bacterial_amr", "bacterial_plasmid"].includes(mode)) flags.run_amr = "true";
    if (mode === "bacterial_virulence") flags.run_virulence = "true";
    if (["bacterial_strain_serovar", "bacterial_antigen", "bacterial_mlst"].includes(mode)) flags.run_typing = "true";
  }

  if (mode === "report_package") {
    flags.run_report = "true";
    flags.run_packaging = "true";
  }

  if (figureType === "beast_tmrca") flags.run_phylogeny = "true";
  if (figureType === "transmission_distance") {
    flags.run_phylogeny = "true";
    flags.run_geospatial = "true";
  }
  if (figureType === "fitness_landscape") flags.run_fitness = "true";
  if (figureType === "mutation_plot" || figureType === "recombination_plot") flags.run_mutation = "true";

  return flags;
}

function figureSetFor(mode: AnalysisMode, figureType: string) {
  if (mode === "complete") return "full";
  if (["phylogenetic_tree", "beast_tmrca", "transmission_distance", "recombination_plot"].includes(figureType)) return "phylogeny";
  if (figureType === "fitness_landscape") return "fitness";
  if (figureType === "mutation_plot") return "mutation";
  if (figureType === "ml_qml_performance_plot") return "ml_qml";
  if (figureType === "map_spatiotemporal_plot") return "geospatial";
  if (figureType === "qc_summary_plot") return "qc";
  if (figureType === "hypothesis_plot") return "hypothesis";
  if (figureType.startsWith("bacterial_")) return "bacterial";
  return "basic";
}

async function proxyDownload(cleanPath: string) {
  const base = backendUrl();
  let response = await fetch(`${base}${cleanPath}`, { cache: "no-store" });

  if (!response.ok && cleanPath.startsWith("/results/")) {
    const parts = cleanPath.split("/").filter(Boolean);
    if (parts.length >= 3) {
      const [, jobId, ...fileParts] = parts;
      response = await fetch(`${base}/jobs/${encodeURIComponent(jobId)}/download/${encodeURIComponent(fileParts.join("/"))}`, { cache: "no-store" });
    }
  }

  if (!response.ok) {
    return NextResponse.json({ status: "error", error: "Download failed.", backendStatus: response.status, path: cleanPath }, { status: response.status });
  }

  const headers = new Headers();
  headers.set("Content-Type", response.headers.get("content-type") || "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${safeFilename(cleanPath)}"`);
  headers.set("Cache-Control", "no-store");
  return new NextResponse(await response.arrayBuffer(), { status: 200, headers });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const path = searchParams.get("path");
    const catalog = searchParams.get("catalog");

    if (catalog) {
      return NextResponse.json({
        status: "ok",
        analyses: ANALYSES,
        figureDefaults: FIGURE_DEFAULTS,
        analysisToFigures: ANALYSIS_TO_FIGURES,
        backendUrl: backendUrl(),
      });
    }

    if (path) {
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      if (!cleanPath.startsWith("/results/") && !cleanPath.startsWith("/jobs/")) {
        return NextResponse.json({ status: "error", error: "Invalid result path." }, { status: 400 });
      }
      return proxyDownload(cleanPath);
    }

    if (jobId) {
      const response = await fetch(`${backendUrl()}/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
      const parsed = await parseJson(response);
      return NextResponse.json(parsed.data, { status: parsed.ok ? response.status : 502 });
    }

    const health = await fetch(`${backendUrl()}/health`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    return NextResponse.json({ status: "running", route: "/api/qigenex", backendUrl: backendUrl(), backendHealth: health });
  } catch (error) {
    return NextResponse.json({ status: "error", error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const cancelJobId = url.searchParams.get("job_id");

    if (action === "cancel") {
      if (!cancelJobId) {
        return NextResponse.json({ status: "error", error: "Missing job_id for cancellation." }, { status: 400 });
      }
      const response = await fetch(`${backendUrl()}/jobs/${encodeURIComponent(cancelJobId)}/cancel`, {
        method: "POST",
        cache: "no-store",
      });
      const parsed = await parseJson(response);
      return NextResponse.json(parsed.data, { status: parsed.ok ? response.status : 502 });
    }

    const incoming = await req.formData();
    const selected = normalizeAnalysis(incoming.get("selected_analysis") || incoming.get("analysisMode"));
    const requestedFigure = clean(incoming.get("figure_type"), "");
    const bacterialFigure = clean(incoming.get("bacterial_wgs_figure_type"), "");
    const figureType = normalizeFigureType(selected === "bacterial_wgs_analysis" && bacterialFigure ? bacterialFigure : requestedFigure, selected);
    const designs = normalizeDesigns(
      figureType,
      clean(
        selected === "bacterial_wgs_analysis"
          ? incoming.get("bacterial_wgs_figure_designs") || incoming.get("figure_designs")
          : incoming.get("figure_designs") || incoming.get("phylogeny_tree_designs") || incoming.get("fitness_figure_designs"),
        ""
      )
    );
    const layout = clean(incoming.get("figure_layout"), "separate");
    const form = new FormData();

    const fastaDirect = incoming.get("fasta");
    const fastaFile = incoming.get("fastaFile");
    const alignedFile = incoming.get("alignedFile");
    const fastaText = clean(incoming.get("fastaText"));
    const alignedText = clean(incoming.get("alignedText"));

    if (fastaDirect instanceof File && fastaDirect.size > 0) {
      form.append("fasta", fastaDirect, fastaDirect.name || "input.fasta");
    } else if (fastaFile instanceof File && fastaFile.size > 0) {
      form.append("fasta", fastaFile, fastaFile.name || "input.fasta");
    } else if (alignedFile instanceof File && alignedFile.size > 0) {
      form.append("fasta", alignedFile, alignedFile.name || "aligned_input.fasta");
    } else if (fastaText) {
      form.append("fasta", makeTextFile(fastaText, "pasted_input.fasta"));
    } else if (alignedText) {
      form.append("fasta", makeTextFile(alignedText, "pasted_aligned_input.fasta"));
    } else {
      return NextResponse.json({ status: "error", error: "No FASTA input found." }, { status: 400 });
    }

    const targetGenomeFile = incoming.get("targetGenomeFile");
    const manualComparableGenomeFile = incoming.get("manualComparableGenomeFile");
    if (targetGenomeFile instanceof File && targetGenomeFile.size > 0) {
      form.append("target_genome", targetGenomeFile, targetGenomeFile.name || "target_genome.fasta");
      form.append("targetGenomeFile", targetGenomeFile, targetGenomeFile.name || "target_genome.fasta");
    }
    if (manualComparableGenomeFile instanceof File && manualComparableGenomeFile.size > 0) {
      form.append("manual_comparable_genomes", manualComparableGenomeFile, manualComparableGenomeFile.name || "manual_comparable_genomes.fasta");
      form.append("manualComparableGenomeFile", manualComparableGenomeFile, manualComparableGenomeFile.name || "manual_comparable_genomes.fasta");
    }

    const metadata = incoming.get("metadata");
    const geoFile = incoming.get("geoFile");
    const animalFile = incoming.get("animalFile");
    const metadataText = clean(incoming.get("metadataText"));
    const geoRowsText = clean(incoming.get("geoRowsText"));
    const animalRowsText = clean(incoming.get("animalRowsText"));

    if (metadata instanceof File && metadata.size > 0) form.append("metadata", metadata, metadata.name || "metadata.tsv");
    else if (geoFile instanceof File && geoFile.size > 0) form.append("metadata", geoFile, geoFile.name || "metadata.tsv");
    else if (animalFile instanceof File && animalFile.size > 0) form.append("metadata", animalFile, animalFile.name || "animal_metadata.tsv");
    else if (metadataText) form.append("metadata", makeTextFile(metadataText, "metadata.tsv", "text/tab-separated-values"));
    else if (geoRowsText) form.append("metadata", makeTextFile(geoRowsText, "metadata.csv", "text/csv"));
    else if (animalRowsText) form.append("metadata", makeTextFile(animalRowsText, "animal_metadata.csv", "text/csv"));

    const standardModes = ["complete", "phylogeny", "evolution", "genomic_intelligence", "fitness", "geo_spatiotemporal", "ml_qml", "beast_tmrca", "transmission", "recombination", "phylodynamics", "source_sink", "outbreak_source", "forecasting"];
    form.set("mode", clean(incoming.get("mode"), standardModes.includes(selected) ? "standard" : "fast"));
    form.set("selected_analysis", selected);
    form.set("analysisMode", selected);
    form.set("action", clean(incoming.get("action"), "analysis"));
    form.set("run_only_selected", selected === "complete" ? "false" : "true");
    form.set("module_scope", selected);

    const flags = selectedFlags(selected, figureType, layout);
    Object.entries(flags).forEach(([key, value]) => form.set(key, value));

    form.set("figure_set", figureSetFor(selected, figureType));
    form.set("figure_type", figureType);
    form.set("figure_plot_style", clean(incoming.get("figure_plot_style"), figureType));
    form.set("figure_designs", designs.join(","));
    form.set("figure_styles", clean(incoming.get("figure_styles"), "journal_clean"));
    form.set("figure_formats", clean(incoming.get("figure_formats"), "png,svg,pdf"));
    form.set("figure_dpi", clean(incoming.get("figure_dpi"), "900"));
    form.set("figure_layout", layout);
    form.set("panel_mode", layout);
    form.set("separate_or_panel", layout);
    form.set("figure_title_mode", clean(incoming.get("figure_title_mode"), "full"));
    form.set("figure_title_text", clean(incoming.get("figure_title_text")));
    form.set("figure_title_font_size", clean(incoming.get("figure_title_font_size"), "16"));
    form.set("x_title_font_size", clean(incoming.get("x_title_font_size"), "13"));
    form.set("y_title_font_size", clean(incoming.get("y_title_font_size"), "13"));
    form.set("x_label_font_size", clean(incoming.get("x_label_font_size"), "11"));
    form.set("y_label_font_size", clean(incoming.get("y_label_font_size"), "11"));
    form.set("figure_title_font_weight", clean(incoming.get("figure_title_font_weight"), "bold"));
    form.set("x_title_font_weight", clean(incoming.get("x_title_font_weight"), "bold"));
    form.set("y_title_font_weight", clean(incoming.get("y_title_font_weight"), "bold"));
    form.set("transparent_background", clean(incoming.get("transparent_background"), "false"));
    form.set("tree_inference_method", clean(incoming.get("tree_inference_method"), "maximum_likelihood"));

    form.set("phylogeny_tree_designs", ["phylogenetic_tree", "beast_tmrca", "transmission_distance", "recombination_plot"].includes(figureType) ? designs.join(",") : "");
    form.set("phylogeny_title_mode", clean(incoming.get("phylogeny_title_mode"), "full"));
    form.set("phylogeny_font_size", clean(incoming.get("phylogeny_font_size") || incoming.get("x_title_font_size"), "12"));
    form.set("phylogeny_font_weight", clean(incoming.get("phylogeny_font_weight") || incoming.get("x_title_font_weight"), "bold"));
    form.set("phylogeny_panel_mode", layout);
    form.set("phylogeny_color_by", clean(incoming.get("phylogeny_color_by"), "auto"));
    form.set("phylogeny_max_tips", clean(incoming.get("phylogeny_max_tips"), "2500"));

    form.set("run_beast_tmrca", clean(incoming.get("run_beast_tmrca") || incoming.get("beast_tmrca"), figureType === "beast_tmrca" ? "true" : "false"));
    form.set("beast_tmrca", clean(incoming.get("beast_tmrca"), figureType === "beast_tmrca" ? "true" : "false"));
    form.set("beast_clock_model", clean(incoming.get("beast_clock_model"), "relaxed_lognormal"));
    form.set("beast_chain_length", clean(incoming.get("beast_chain_length"), "10000000"));
    form.set("tmrca_substitution_rate", clean(incoming.get("tmrca_substitution_rate"), "0.001"));
    form.set("transmission_mode", clean(incoming.get("transmission_mode"), "standard"));
    form.set("nt_distance_threshold", clean(incoming.get("nt_distance_threshold"), "0.015"));
    form.set("fitness_figure_designs", figureType === "fitness_landscape" ? designs.join(",") : clean(incoming.get("fitness_figure_designs"), ""));
    form.set("novel_hypothesis", clean(incoming.get("novel_hypothesis"), "auto"));

    const referenceText = clean(incoming.get("referenceText"));
    const vaccineStrainText = clean(incoming.get("vaccineStrainText"));
    const notes = clean(incoming.get("notes"));
    if (referenceText) form.set("referenceText", referenceText);
    if (vaccineStrainText) form.set("vaccineStrainText", vaccineStrainText);
    if (notes) form.set("notes", notes);

    // Keep metadata explicit for newer backend modules.
    form.set("sequence_metadata_hint", "metadata is forwarded from metadata/geoFile/geoRowsText/animalFile/animalRowsText when provided");
    form.set("metadata_required_for", "beast_tmrca,transmission,source_sink,host_adaptation,geo_spatiotemporal,forecasting");

    const advancedForwardFields = [
      "metadata_schema_preset",
      "metadata_template_fields",
      "metadata_required_fields",
      "auto_enrich_metadata",
      "auto_geocode_country",
      "auto_typing",
      "node_color_by",
      "node_shape_by",
      "map_projection",
      "map_background",
      "map_extent",
      "route_level",
      "aggregate_routes",
      "arrow_style",
      "arrow_width_by",
      "arrow_color_by",
      "arrowhead_style",
      "line_curve_style",
      "max_routes",
      "route_support_threshold",
      "bacterial_mode",
      "genome_query_count",
      "genome_source",
      "genome_download_strategy",
      "genome_host_filter",
      "genome_country_filter",
      "genome_year_filter",
      "genome_per_year",
      "ani_threshold",
      "mash_distance_threshold",
      "use_manual_genomes",
      "run_pangenome",
      "run_amr",
      "run_virulence",
      "run_serovar",
      "run_antigen",
      "run_mlst",
      "target_genome_required",
      "target_genome_input_mode",
      "comparable_genome_mode",
      "download_taxon_name",
      "comparable_genome_class",
      "comparable_host_groups",
      "comparable_environment_groups",
      "comparable_state_groups",
      "comparable_genome_purpose",
      "download_representative_only",
      "include_reference_genomes",
      "bacterial_tree_workflow",
      "pangenome_workflow",
      "bacterial_output_package",
      "bacterial_wgs_task",
      "bacterial_wgs_figure_type",
      "bacterial_wgs_figure_designs",
    ];

    advancedForwardFields.forEach((field) => {
      const value = incoming.get(field);
      if (value !== null && value !== undefined) form.set(field, clean(value));
    });

    form.set("metadata_prebuilt_field_names", clean(incoming.get("metadata_template_fields"), "sample_id,strain,accession,country,latitude,longitude,collection_date,year,host,species,genotype,lineage,serovar,clade,source,isolation_site,study_id"));
    form.set("metadata_entry_mode", "excel_like_grid");
    form.set("metadata_grid_enabled", "true");
    form.set("metadata_grid_version", "v14_fixed_scope");
    form.set("map_arrow_customization_enabled", "true");
    form.set("country_route_aggregation", clean(incoming.get("aggregate_routes"), "true"));
    form.set("bacterial_genome_analysis_enabled", selected.startsWith("bacterial_") ? "true" : "false");
    form.set("bacterial_comparable_download_ui", "enabled");
    form.set("target_genome_input_policy", selected.startsWith("bacterial_") ? "manual_required" : "optional");

    const response = await fetch(`${backendUrl()}/jobs/analyze`, {
      method: "POST",
      body: form,
      cache: "no-store",
    });

    const parsed = await parseJson(response);
    if (!parsed.ok) return NextResponse.json(parsed.data, { status: 502 });

    return NextResponse.json({
      ...parsed.data,
      selected_analysis: selected,
      selected_figure_type: figureType,
      selected_figure_designs: designs,
      selected_hypothesis: clean(incoming.get("novel_hypothesis"), "auto"),
      backend_flags: flags,
      bridge: { route: "/api/qigenex", backendUrl: backendUrl(), backendStatus: response.status },
    }, { status: response.status });
  } catch (error) {
    return NextResponse.json({ status: "error", error: String(error) }, { status: 500 });
  }
}
