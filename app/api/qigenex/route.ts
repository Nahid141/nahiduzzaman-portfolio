import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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

function makeTextFile(text: string, filename: string, type = "text/plain") {
  return new File([text], filename, { type });
}

function appendIfPresent(target: FormData, source: FormData, sourceKey: string, targetKey = sourceKey) {
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
  return { ok: true, data: await response.json() };
}

async function proxyDownload(backendUrl: string, rawPath: string) {
  const cleanPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

  if (!cleanPath.startsWith("/results/") && !cleanPath.startsWith("/jobs/")) {
    return NextResponse.json(
      { status: "error", error: "Only /results/... or /jobs/... downloads are allowed.", path: cleanPath },
      { status: 400 }
    );
  }

  let backendFileUrl = `${backendUrl}${cleanPath}`;
  let backendResponse = await fetch(backendFileUrl, { method: "GET", cache: "no-store" });

  if (!backendResponse.ok && cleanPath.startsWith("/results/")) {
    const parts = cleanPath.split("/").filter(Boolean);
    if (parts.length >= 3) {
      const [, jobId, ...fileParts] = parts;
      const filename = fileParts.join("/");
      backendFileUrl = `${backendUrl}/jobs/${encodeURIComponent(jobId)}/download/${encodeURIComponent(filename)}`;
      backendResponse = await fetch(backendFileUrl, { method: "GET", cache: "no-store" });
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
  const headers = new Headers();
  headers.set("Content-Type", backendResponse.headers.get("content-type") || "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${safeFilename(cleanPath)}"`);
  headers.set("Cache-Control", "no-store");
  return new NextResponse(arrayBuffer, { status: 200, headers });
}

export async function GET(req: NextRequest) {
  try {
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      return NextResponse.json(
        {
          status: "error",
          error: "QIGENEX_BACKEND_URL is not configured.",
          fix: "Set QIGENEX_BACKEND_URL=http://140.245.47.234 in Vercel and redeploy.",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const resultPath = searchParams.get("path");

    if (resultPath) return proxyDownload(backendUrl, resultPath);

    if (jobId) {
      const response = await fetch(`${backendUrl}/jobs/${encodeURIComponent(jobId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const parsed = await readJsonResponse(response);
      if (!parsed.ok) return NextResponse.json(parsed.data, { status: 502 });
      return NextResponse.json(
        { ...parsed.data, bridge: { route: "/api/qigenex", backendUrl, backendStatus: response.status, jobId } },
        { status: response.status }
      );
    }

    const healthResponse = await fetch(`${backendUrl}/health`, { method: "GET", cache: "no-store" }).catch(() => null);
    const backendHealth = healthResponse?.ok ? await healthResponse.json().catch(() => null) : null;

    return NextResponse.json({
      status: "running",
      route: "/api/qigenex",
      backendConfigured: true,
      backendUrl,
      backendHealth,
      endpoints: {
        submit: "POST /api/qigenex",
        status: "GET /api/qigenex?job_id=JOB_ID",
        download: "GET /api/qigenex?path=/results/JOB_ID/file",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: "Failed to query QI-GeneX-N backend.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const backendUrl = getBackendUrl();
    if (!backendUrl) {
      return NextResponse.json(
        { status: "error", error: "QIGENEX_BACKEND_URL is not configured.", fix: "Set QIGENEX_BACKEND_URL=http://140.245.47.234 in Vercel and redeploy." },
        { status: 500 }
      );
    }

    const incoming = await req.formData();
    const backendForm = new FormData();

    const action = cleanText(incoming.get("action"), "analysis").toLowerCase();
    const analysisMode = cleanText(incoming.get("analysisMode"), "complete").toLowerCase();
    const selectedAnalysis = cleanText(incoming.get("selected_analysis"), analysisMode).toLowerCase();
    const mode = cleanText(incoming.get("mode"), "fast");

    backendForm.append("action", action);
    backendForm.append("analysisMode", analysisMode);
    backendForm.append("selected_analysis", selectedAnalysis);
    backendForm.append("mode", mode);

    [
      "run_visualization",
      "run_composite_figures",
      "run_packaging",
      "run_ml",
      "run_qml",
      "run_fitness",
      "run_geospatial",
      "run_report",
      "run_phylogeny",
      "figure_set",
      "figure_plot_style",
      "figure_styles",
      "figure_formats",
      "figure_dpi",
      "figure_layout",
      "panel_mode",
      "separate_or_panel",
      "figure_title_mode",
      "figure_title_text",
      "figure_title_font_size",
      "figure_title_font_weight",
      "x_title_font_size",
      "y_title_font_size",
      "x_label_font_size",
      "y_label_font_size",
      "x_title_font_weight",
      "y_title_font_weight",
      "transparent_background",
    ].forEach((key) => appendIfPresent(backendForm, incoming, key));

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
      return NextResponse.json({ status: "error", error: "No FASTA input found." }, { status: 400 });
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

    const response = await fetch(`${backendUrl}/jobs/analyze`, { method: "POST", body: backendForm, cache: "no-store" });
    const parsed = await readJsonResponse(response);
    if (!parsed.ok) return NextResponse.json({ ...parsed.data, backendUrl }, { status: 502 });

    return NextResponse.json(
      {
        ...parsed.data,
        action,
        selected_analysis: selectedAnalysis,
        bridge: { route: "/api/qigenex", backendUrl, backendStatus: response.status, backendSubmitEndpoint: "/jobs/analyze" },
      },
      { status: response.status }
    );
  } catch (error) {
    return NextResponse.json(
      { status: "error", error: "Failed to connect with QI-GeneX-N Oracle backend.", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
