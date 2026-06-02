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

type QigenexAction = "analysis" | "figures" | "package";

function normalizeBackendUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function getBackendUrl() {
  return process.env.QIGENEX_BACKEND_URL
    ? normalizeBackendUrl(process.env.QIGENEX_BACKEND_URL)
    : "";
}

function cleanText(value: FormDataEntryValue | null | undefined, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function boolText(value: FormDataEntryValue | null | undefined, fallback = false) {
  const text = cleanText(value).toLowerCase();
  if (!text) return fallback ? "true" : "false";
  return ["1", "true", "yes", "y", "on"].includes(text) ? "true" : "false";
}

function makeTextFile(text: string, filename: string, type = "text/plain") {
  return new File([text], filename, { type });
}

function appendIfPresent(
  target: FormData,
  source: FormData,
  sourceKey: string,
  targetKey = sourceKey
) {
  const value = source.get(sourceKey);
  if (value === null || value === undefined) return;

  if (value instanceof File) {
    if (value.size > 0) target.append(targetKey, value, value.name || sourceKey);
    return;
  }

  const text = String(value).trim();
  if (text) target.append(targetKey, text);
}

function safeFilename(path: string) {
  const filename = path.split("/").pop() || "qigenex_result";
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isAllowedResultPath(path: string) {
  return path.startsWith("/results/") || path.startsWith("/jobs/");
}

async function readJsonResponse(response: Response) {
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

  return {
    ok: true,
    data: await response.json(),
  };
}

function normalizeAnalysisMode(value: FormDataEntryValue | null): AnalysisMode {
  const mode = cleanText(value, "complete").toLowerCase() as AnalysisMode;
  const allowed: AnalysisMode[] = [
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
    "genomic_intelligence",
    "ml_qml",
    "antigenic_drift",
    "antigenic_shift",
    "vaccine_escape",
    "geo_spatiotemporal",
    "animal_host",
    "visualization",
    "report_package",
  ];
  return allowed.includes(mode) ? mode : "complete";
}

function normalizeAction(value: FormDataEntryValue | null): QigenexAction {
  const action = cleanText(value, "analysis").toLowerCase();
  if (action === "figures" || action === "package") return action;
  return "analysis";
}

function modeFromAnalysis(analysisMode: AnalysisMode, action: QigenexAction) {
  if (action === "figures" || action === "package") return "advanced";

  const standardModes: AnalysisMode[] = [
    "complete",
    "phylogeny",
    "evolution",
    "genomic_intelligence",
    "ml_qml",
    "fitness",
    "geo_spatiotemporal",
    "antigenic_drift",
    "antigenic_shift",
  ];

  return standardModes.includes(analysisMode) ? "standard" : "fast";
}

function backendFlagsFor(analysisMode: AnalysisMode, action: QigenexAction) {
  const flags: Record<string, string> = {
    run_phylogeny: "false",
    run_ml: "false",
    run_qml: "false",
    run_fitness: "false",
    run_geospatial: "false",
    run_report: "false",
    run_visualization: "false",
    run_composite_figures: "false",
    run_packaging: "false",
  };

  if (action === "figures") {
    flags.run_visualization = "true";
    flags.run_composite_figures = "true";
    return flags;
  }

  if (action === "package") {
    flags.run_report = "true";
    flags.run_visualization = "true";
    flags.run_composite_figures = "true";
    flags.run_packaging = "true";
    return flags;
  }

  switch (analysisMode) {
    case "complete":
      Object.keys(flags).forEach((key) => {
        flags[key] = "true";
      });
      break;
    case "phylogeny":
    case "evolution":
    case "antigenic_drift":
    case "antigenic_shift":
      flags.run_phylogeny = "true";
      break;
    case "genomic_intelligence":
      flags.run_phylogeny = "true";
      break;
    case "ml_qml":
      flags.run_ml = "true";
      flags.run_qml = "true";
      break;
    case "fitness":
      flags.run_fitness = "true";
      break;
    case "geo_spatiotemporal":
      flags.run_geospatial = "true";
      break;
    case "visualization":
      flags.run_visualization = "true";
      flags.run_composite_figures = "true";
      break;
    case "report_package":
      flags.run_report = "true";
      flags.run_packaging = "true";
      break;
    default:
      break;
  }

  return flags;
}

export async function GET(req: NextRequest) {
  try {
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      return NextResponse.json(
        {
          status: "error",
          error: "QIGENEX_BACKEND_URL is not configured.",
          fix: "Add QIGENEX_BACKEND_URL=http://140.245.47.234 in Vercel environment variables, then redeploy.",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const resultPath = searchParams.get("path");

    if (resultPath) {
      const cleanPath = resultPath.startsWith("/") ? resultPath : `/${resultPath}`;

      if (!isAllowedResultPath(cleanPath)) {
        return NextResponse.json(
          {
            status: "error",
            error: "Invalid result path. Only /results/... or /jobs/... paths are allowed.",
            path: cleanPath,
          },
          { status: 400 }
        );
      }

      let backendFileUrl = `${backendUrl}${cleanPath}`;
      let backendResponse = await fetch(backendFileUrl, {
        method: "GET",
        cache: "no-store",
      });

      if (!backendResponse.ok && cleanPath.startsWith("/results/")) {
        const parts = cleanPath.split("/").filter(Boolean);
        if (parts.length >= 3) {
          const [, resultJobId, ...fileParts] = parts;
          const filename = fileParts.join("/");
          backendFileUrl = `${backendUrl}/jobs/${encodeURIComponent(resultJobId)}/download/${encodeURIComponent(filename)}`;
          backendResponse = await fetch(backendFileUrl, {
            method: "GET",
            cache: "no-store",
          });
        }
      }

      if (!backendResponse.ok) {
        return NextResponse.json(
          {
            status: "error",
            error: "Failed to download backend result file.",
            backendStatus: backendResponse.status,
            path: cleanPath,
            backendFileUrl,
          },
          { status: backendResponse.status }
        );
      }

      const arrayBuffer = await backendResponse.arrayBuffer();
      const filename = safeFilename(cleanPath);
      const headers = new Headers();

      headers.set(
        "Content-Type",
        backendResponse.headers.get("content-type") || "application/octet-stream"
      );
      headers.set("Content-Disposition", `attachment; filename="${filename}"`);
      headers.set("Cache-Control", "no-store");

      return new NextResponse(arrayBuffer, { status: 200, headers });
    }

    if (jobId) {
      const response = await fetch(`${backendUrl}/jobs/${encodeURIComponent(jobId)}`, {
        method: "GET",
        cache: "no-store",
      });

      const parsed = await readJsonResponse(response);

      if (!parsed.ok) {
        return NextResponse.json(parsed.data, { status: 502 });
      }

      return NextResponse.json(
        {
          ...parsed.data,
          bridge: {
            route: "/api/qigenex",
            backendUrl,
            backendStatus: response.status,
            jobId,
          },
        },
        { status: response.status }
      );
    }

    const healthResponse = await fetch(`${backendUrl}/health`, {
      method: "GET",
      cache: "no-store",
    }).catch(() => null);

    const backendHealth =
      healthResponse && healthResponse.ok ? await healthResponse.json().catch(() => null) : null;

    return NextResponse.json({
      status: "running",
      route: "/api/qigenex",
      message: "QI-GeneX-N Vercel bridge route is active.",
      backendConfigured: Boolean(backendUrl),
      backendUrl,
      backendHealth,
      behavior: {
        selectedAnalysisIsForwarded: true,
        figuresAreOnlyGeneratedWhenRequested: true,
        figureCustomizationIsForwarded: true,
      },
      endpoints: {
        submit: "POST /api/qigenex",
        status: "GET /api/qigenex?job_id=JOB_ID",
        download: "GET /api/qigenex?path=/results/JOB_ID/file",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to query QI-GeneX-N backend.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      return NextResponse.json(
        {
          status: "error",
          error: "QIGENEX_BACKEND_URL is not configured.",
          fix: "Add QIGENEX_BACKEND_URL=http://140.245.47.234 in Vercel environment variables, then redeploy.",
        },
        { status: 500 }
      );
    }

    const incoming = await req.formData();
    const backendForm = new FormData();

    const action = normalizeAction(incoming.get("action"));
    const analysisMode = normalizeAnalysisMode(incoming.get("analysisMode"));
    const selectedAnalysis = normalizeAnalysisMode(
      incoming.get("selected_analysis") || incoming.get("analysisMode")
    );

    const requestedMode = cleanText(incoming.get("mode"));
    const backendMode = requestedMode || modeFromAnalysis(analysisMode, action);

    backendForm.append("mode", backendMode);
    backendForm.append("analysisMode", analysisMode);
    backendForm.append("selected_analysis", selectedAnalysis);
    backendForm.append("action", action);

    const flags = backendFlagsFor(selectedAnalysis, action);
    Object.entries(flags).forEach(([key, value]) => backendForm.set(key, value));

    const fastaDirect = incoming.get("fasta");
    const fastaFile = incoming.get("fastaFile");
    const alignedFile = incoming.get("alignedFile");
    const fastaText = cleanText(incoming.get("fastaText"));
    const alignedText = cleanText(incoming.get("alignedText"));

    if (fastaDirect instanceof File && fastaDirect.size > 0) {
      backendForm.append("fasta", fastaDirect, fastaDirect.name || "input.fasta");
    } else if (fastaFile instanceof File && fastaFile.size > 0) {
      backendForm.append("fasta", fastaFile, fastaFile.name || "input.fasta");
    } else if (alignedFile instanceof File && alignedFile.size > 0) {
      backendForm.append("fasta", alignedFile, alignedFile.name || "aligned_input.fasta");
    } else if (fastaText) {
      backendForm.append("fasta", makeTextFile(fastaText, "pasted_input.fasta"));
    } else if (alignedText) {
      backendForm.append("fasta", makeTextFile(alignedText, "pasted_aligned_input.fasta"));
    } else {
      return NextResponse.json(
        {
          status: "error",
          error: "No FASTA input found. Provide fasta, fastaFile, alignedFile, fastaText, or alignedText.",
        },
        { status: 400 }
      );
    }

    const metadataDirect = incoming.get("metadata");
    const geoFile = incoming.get("geoFile");
    const animalFile = incoming.get("animalFile");
    const metadataText = cleanText(incoming.get("metadataText"));
    const geoRowsText = cleanText(incoming.get("geoRowsText"));
    const animalRowsText = cleanText(incoming.get("animalRowsText"));

    if (metadataDirect instanceof File && metadataDirect.size > 0) {
      backendForm.append("metadata", metadataDirect, metadataDirect.name || "metadata.tsv");
    } else if (geoFile instanceof File && geoFile.size > 0) {
      backendForm.append("metadata", geoFile, geoFile.name || "metadata.tsv");
    } else if (metadataText) {
      backendForm.append("metadata", makeTextFile(metadataText, "metadata.tsv", "text/tab-separated-values"));
    } else if (geoRowsText) {
      backendForm.append("metadata", makeTextFile(geoRowsText, "geospatial_metadata.csv", "text/csv"));
    } else if (animalFile instanceof File && animalFile.size > 0) {
      backendForm.append("metadata", animalFile, animalFile.name || "animal_metadata.tsv");
    } else if (animalRowsText) {
      backendForm.append("metadata", makeTextFile(animalRowsText, "animal_metadata.csv", "text/csv"));
    }

    appendIfPresent(backendForm, incoming, "referenceText");
    appendIfPresent(backendForm, incoming, "vaccineStrainText");
    appendIfPresent(backendForm, incoming, "notes");

    const figureFields = [
      "figure_set",
      "figure_styles",
      "figure_formats",
      "figure_dpi",
      "figure_layout",
      "figure_title_mode",
      "figure_title_text",
      "figure_title_font_size",
      "figure_title_font_weight",
      "x_title_font_size",
      "x_title_font_weight",
      "x_label_font_size",
      "x_label_font_weight",
      "y_title_font_size",
      "y_title_font_weight",
      "y_label_font_size",
      "y_label_font_weight",
      "legend_font_size",
      "legend_font_weight",
      "panel_mode",
      "separate_or_panel",
      "transparent_background",
    ];

    figureFields.forEach((key) => appendIfPresent(backendForm, incoming, key));

    backendForm.set("figure_formats", cleanText(incoming.get("figure_formats"), "png,svg,pdf"));
    backendForm.set("figure_dpi", cleanText(incoming.get("figure_dpi"), "900"));
    backendForm.set("figure_styles", cleanText(incoming.get("figure_styles"), "journal_clean"));
    backendForm.set("figure_set", cleanText(incoming.get("figure_set"), action === "analysis" ? "selected" : "full"));
    backendForm.set("figure_layout", cleanText(incoming.get("figure_layout"), "separate"));
    backendForm.set("figure_title_mode", cleanText(incoming.get("figure_title_mode"), "none"));
    backendForm.set("transparent_background", boolText(incoming.get("transparent_background"), false));

    const response = await fetch(`${backendUrl}/jobs/analyze`, {
      method: "POST",
      body: backendForm,
      cache: "no-store",
    });

    const parsed = await readJsonResponse(response);

    if (!parsed.ok) {
      return NextResponse.json(
        {
          ...parsed.data,
          backendUrl,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        ...parsed.data,
        action,
        analysisMode,
        selected_analysis: selectedAnalysis,
        backend_flags: flags,
        figure_options: {
          figure_set: backendForm.get("figure_set"),
          figure_styles: backendForm.get("figure_styles"),
          figure_formats: backendForm.get("figure_formats"),
          figure_dpi: backendForm.get("figure_dpi"),
          figure_layout: backendForm.get("figure_layout"),
          figure_title_mode: backendForm.get("figure_title_mode"),
        },
        bridge: {
          route: "/api/qigenex",
          backendUrl,
          backendStatus: response.status,
          backendSubmitEndpoint: "/jobs/analyze",
        },
      },
      { status: response.status }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: "Failed to connect with QI-GeneX-N Oracle backend.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
