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
  | "genomic_intelligence"
  | "ml_qml"
  | "antigenic_drift"
  | "antigenic_shift"
  | "vaccine_escape"
  | "geo_spatiotemporal"
  | "animal_host"
  | "visualization"
  | "report_package";

function backendUrl() {
  return (process.env.QIGENEX_BACKEND_URL || "http://140.245.47.234").replace(/\/+$/, "");
}

function clean(value: FormDataEntryValue | null | undefined, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeAnalysis(value: FormDataEntryValue | null): AnalysisMode {
  const v = clean(value, "qc").toLowerCase() as AnalysisMode;
  const allowed: AnalysisMode[] = [
    "complete", "alignment", "qc", "classification", "gene_orf", "gp5",
    "mutation", "fitness", "evolution", "phylogeny", "genomic_intelligence",
    "ml_qml", "antigenic_drift", "antigenic_shift", "vaccine_escape",
    "geo_spatiotemporal", "animal_host", "visualization", "report_package",
  ];
  return allowed.includes(v) ? v : "qc";
}

function makeTextFile(text: string, filename: string, type = "text/plain") {
  return new File([text], filename, { type });
}

function appendIfPresent(target: FormData, source: FormData, key: string, targetKey = key) {
  const value = source.get(key);
  if (value === null || value === undefined) return;
  if (value instanceof File) {
    if (value.size > 0) target.append(targetKey, value, value.name || key);
    return;
  }
  const text = String(value).trim();
  if (text) target.append(targetKey, text);
}

function safeFilename(path: string) {
  return (path.split("/").pop() || "qigenex_result").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function parseJson(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    return {
      ok: false,
      data: {
        status: "error",
        error: "Backend did not return JSON.",
        backendStatus: response.status,
        details: text.slice(0, 2000),
      },
    };
  }
  return { ok: true, data: await response.json() };
}

function flagsFor(mode: AnalysisMode) {
  const flags: Record<string, string> = {
    run_phylogeny: "false",
    run_ml: "false",
    run_qml: "false",
    run_fitness: "false",
    run_geospatial: "false",
    run_report: "false",
    run_visualization: "true",
    run_composite_figures: "false",
    run_packaging: "false",
  };

  if (mode === "complete") {
    Object.keys(flags).forEach((k) => (flags[k] = "true"));
    return flags;
  }

  if (["phylogeny", "evolution", "antigenic_drift", "antigenic_shift", "genomic_intelligence"].includes(mode)) {
    flags.run_phylogeny = "true";
  }

  if (mode === "ml_qml") {
    flags.run_ml = "true";
    flags.run_qml = "true";
  }

  if (mode === "fitness") flags.run_fitness = "true";
  if (mode === "geo_spatiotemporal") flags.run_geospatial = "true";
  if (mode === "report_package") {
    flags.run_report = "true";
    flags.run_packaging = "true";
    flags.run_composite_figures = "true";
  }

  return flags;
}

function modeHint(mode: AnalysisMode) {
  return ["complete", "phylogeny", "evolution", "genomic_intelligence", "ml_qml", "fitness", "geo_spatiotemporal"].includes(mode)
    ? "standard"
    : "fast";
}

function figureSetFor(mode: AnalysisMode) {
  if (mode === "complete") return "full";
  if (["phylogeny", "evolution", "antigenic_drift", "antigenic_shift", "genomic_intelligence"].includes(mode)) return "phylogeny";
  if (["mutation", "vaccine_escape", "gp5"].includes(mode)) return "mutation";
  if (["qc", "classification"].includes(mode)) return "qc";
  if (mode === "ml_qml") return "ml_qml";
  if (mode === "fitness") return "fitness";
  return "basic";
}

function treeDesignFor(raw: string) {
  if (!raw || raw === "auto") return "publication_composite,rectangular_phylogram,circular_phylogram,genotype_colored_tree,genotype_country_heatmap,clustering_scatter";
  if (raw === "panel") return "publication_composite";
  if (raw === "phylogeny") return "publication_composite,rectangular_phylogram,circular_phylogram";
  return raw;
}

async function proxyDownload(cleanPath: string) {
  const base = backendUrl();
  let response = await fetch(`${base}${cleanPath}`, { method: "GET", cache: "no-store" });

  if (!response.ok && cleanPath.startsWith("/results/")) {
    const parts = cleanPath.split("/").filter(Boolean);
    if (parts.length >= 3) {
      const [, jobId, ...fileParts] = parts;
      const filename = fileParts.join("/");
      response = await fetch(`${base}/jobs/${encodeURIComponent(jobId)}/download/${encodeURIComponent(filename)}`, {
        method: "GET",
        cache: "no-store",
      });
    }
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to download backend file.",
        backendStatus: response.status,
        path: cleanPath,
      },
      { status: response.status }
    );
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

    if (path) {
      const cleanPath = path.startsWith("/") ? path : `/${path}`;
      if (!cleanPath.startsWith("/results/") && !cleanPath.startsWith("/jobs/")) {
        return NextResponse.json({ status: "error", error: "Invalid result path." }, { status: 400 });
      }
      return proxyDownload(cleanPath);
    }

    if (jobId) {
      const response = await fetch(`${backendUrl()}/jobs/${encodeURIComponent(jobId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const parsed = await parseJson(response);
      return NextResponse.json(parsed.data, { status: parsed.ok ? response.status : 502 });
    }

    const health = await fetch(`${backendUrl()}/health`, { method: "GET", cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);

    return NextResponse.json({
      status: "running",
      route: "/api/qigenex",
      backendUrl: backendUrl(),
      backendHealth: health,
      behavior: "single selected analysis; related text outputs and figures are generated automatically",
    });
  } catch (error) {
    return NextResponse.json({ status: "error", error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const incoming = await req.formData();
    const selected = normalizeAnalysis(incoming.get("selected_analysis") || incoming.get("analysisMode"));
    const form = new FormData();

    form.append("mode", clean(incoming.get("mode"), modeHint(selected)));
    form.append("selected_analysis", selected);
    form.append("analysisMode", selected);
    form.append("action", "analysis");

    const flags = flagsFor(selected);
    Object.entries(flags).forEach(([key, value]) => form.set(key, value));

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

    const metadataDirect = incoming.get("metadata");
    const geoFile = incoming.get("geoFile");
    const animalFile = incoming.get("animalFile");
    const metadataText = clean(incoming.get("metadataText"));
    const geoRowsText = clean(incoming.get("geoRowsText"));
    const animalRowsText = clean(incoming.get("animalRowsText"));

    if (metadataDirect instanceof File && metadataDirect.size > 0) {
      form.append("metadata", metadataDirect, metadataDirect.name || "metadata.tsv");
    } else if (geoFile instanceof File && geoFile.size > 0) {
      form.append("metadata", geoFile, geoFile.name || "metadata.tsv");
    } else if (metadataText) {
      form.append("metadata", makeTextFile(metadataText, "metadata.tsv", "text/tab-separated-values"));
    } else if (geoRowsText) {
      form.append("metadata", makeTextFile(geoRowsText, "metadata.csv", "text/csv"));
    } else if (animalFile instanceof File && animalFile.size > 0) {
      form.append("metadata", animalFile, animalFile.name || "animal_metadata.tsv");
    } else if (animalRowsText) {
      form.append("metadata", makeTextFile(animalRowsText, "animal_metadata.csv", "text/csv"));
    }

    appendIfPresent(form, incoming, "referenceText");
    appendIfPresent(form, incoming, "vaccineStrainText");
    appendIfPresent(form, incoming, "notes");

    const figurePlotStyle = clean(incoming.get("figure_plot_style"), "auto");

    form.set("figure_set", figureSetFor(selected));
    form.set("figure_plot_style", figurePlotStyle);
    form.set("figure_styles", clean(incoming.get("figure_styles"), "journal_clean"));
    form.set("figure_formats", clean(incoming.get("figure_formats"), "png,svg,pdf"));
    form.set("figure_dpi", clean(incoming.get("figure_dpi"), "900"));
    form.set("figure_layout", clean(incoming.get("figure_layout"), "separate"));
    form.set("figure_title_mode", clean(incoming.get("figure_title_mode"), "full"));
    form.set("phylogeny_tree_designs", treeDesignFor(figurePlotStyle));
    form.set("phylogeny_title_mode", clean(incoming.get("figure_title_mode"), "full"));
    form.set("phylogeny_font_size", clean(incoming.get("x_title_font_size"), "12"));
    form.set("phylogeny_font_weight", clean(incoming.get("x_title_font_weight"), "bold"));
    form.set("phylogeny_panel_mode", clean(incoming.get("figure_layout"), "separate"));
    form.set("phylogeny_color_by", "auto");
    form.set("phylogeny_max_tips", "1200");

    const response = await fetch(`${backendUrl()}/jobs/analyze`, {
      method: "POST",
      body: form,
      cache: "no-store",
    });

    const parsed = await parseJson(response);

    if (!parsed.ok) return NextResponse.json(parsed.data, { status: 502 });

    return NextResponse.json(
      {
        ...parsed.data,
        selected_analysis: selected,
        backend_flags: flags,
        bridge: {
          route: "/api/qigenex",
          backendUrl: backendUrl(),
          backendStatus: response.status,
        },
      },
      { status: response.status }
    );
  } catch (error) {
    return NextResponse.json({ status: "error", error: String(error) }, { status: 500 });
  }
}
