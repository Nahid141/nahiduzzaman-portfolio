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

function modeFromAnalysisMode(analysisMode: FormDataEntryValue | null) {
  const mode = String(analysisMode || "complete");

  if (
    [
      "alignment",
      "evolution",
      "antigenic_drift",
      "antigenic_shift",
      "vaccine_escape",
      "geo_spatiotemporal",
      "animal_host",
    ].includes(mode)
  ) {
    return "standard";
  }

  return "fast";
}

function appendIfPresent(
  target: FormData,
  source: FormData,
  sourceKey: string,
  targetKey = sourceKey
) {
  const value = source.get(sourceKey);

  if (value !== null && value !== undefined && String(value).trim() !== "") {
    target.append(targetKey, value);
  }
}

function makeTextFile(text: string, filename: string, type = "text/plain") {
  return new File([text], filename, { type });
}

function safeFilename(path: string) {
  const filename = path.split("/").pop() || "qigenex_result";
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isAllowedResultPath(path: string) {
  return path.startsWith("/results/");
}

export async function GET(req: NextRequest) {
  try {
    const backendUrl = getBackendUrl();

    if (!backendUrl) {
      return NextResponse.json(
        {
          status: "error",
          error: "QIGENEX_BACKEND_URL is not configured.",
          fix: "Add QIGENEX_BACKEND_URL=http://34.67.1.205:8000 in Vercel environment variables, then redeploy.",
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const resultPath = searchParams.get("path");

    // Proxy file downloads through Next.js/Vercel.
    // Example:
    // /api/qigenex?path=/results/JOB_ID/qigenex_complete_results.zip
    if (resultPath) {
      const cleanPath = resultPath.startsWith("/") ? resultPath : `/${resultPath}`;

      if (!isAllowedResultPath(cleanPath)) {
        return NextResponse.json(
          {
            status: "error",
            error: "Invalid result path. Only /results/... paths are allowed.",
            path: cleanPath,
          },
          { status: 400 }
        );
      }

      const url = `${backendUrl}${cleanPath}`;

      const backendResponse = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      if (!backendResponse.ok) {
        return NextResponse.json(
          {
            status: "error",
            error: "Failed to download backend result file.",
            backendStatus: backendResponse.status,
            path: cleanPath,
            url,
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

      return new NextResponse(arrayBuffer, {
        status: 200,
        headers,
      });
    }

    // Poll job status.
    // Example:
    // /api/qigenex?job_id=JOB_ID
    if (jobId) {
      const response = await fetch(`${backendUrl}/jobs/${jobId}`, {
        method: "GET",
        cache: "no-store",
      });

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        const text = await response.text();

        return NextResponse.json(
          {
            status: "error",
            error: "Backend job-status endpoint did not return JSON.",
            backendStatus: response.status,
            details: text.slice(0, 1500),
          },
          { status: 502 }
        );
      }

      const data = await response.json();

      return NextResponse.json(
        {
          ...data,
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

    // Health check.
    return NextResponse.json({
      status: "running",
      route: "/api/qigenex",
      message: "QI-GeneX-N Vercel bridge route is active.",
      backendConfigured: Boolean(backendUrl),
      backendUrl,
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
          fix: "Add QIGENEX_BACKEND_URL=http://34.67.1.205:8000 in Vercel environment variables, then redeploy.",
        },
        { status: 500 }
      );
    }

    const incoming = await req.formData();
    const backendForm = new FormData();

    const requestedMode = incoming.get("mode");
    const analysisMode = incoming.get("analysisMode");

    backendForm.append(
      "mode",
      requestedMode ? String(requestedMode) : modeFromAnalysisMode(analysisMode)
    );

    // FASTA input mapping.
    // FastAPI expects: fasta
    const fastaDirect = incoming.get("fasta");
    const fastaFile = incoming.get("fastaFile");
    const alignedFile = incoming.get("alignedFile");
    const fastaText = String(incoming.get("fastaText") || "").trim();
    const alignedText = String(incoming.get("alignedText") || "").trim();

    if (fastaDirect instanceof File && fastaDirect.size > 0) {
      backendForm.append("fasta", fastaDirect, fastaDirect.name || "input.fasta");
    } else if (fastaFile instanceof File && fastaFile.size > 0) {
      backendForm.append("fasta", fastaFile, fastaFile.name || "input.fasta");
    } else if (alignedFile instanceof File && alignedFile.size > 0) {
      backendForm.append("fasta", alignedFile, alignedFile.name || "aligned_input.fasta");
    } else if (fastaText) {
      backendForm.append(
        "fasta",
        makeTextFile(fastaText, "pasted_input.fasta", "text/plain")
      );
    } else if (alignedText) {
      backendForm.append(
        "fasta",
        makeTextFile(alignedText, "pasted_aligned_input.fasta", "text/plain")
      );
    } else {
      return NextResponse.json(
        {
          status: "error",
          error:
            "No FASTA input found. Provide fasta, fastaFile, alignedFile, fastaText, or alignedText.",
        },
        { status: 400 }
      );
    }

    // Metadata mapping.
    // FastAPI expects: metadata
    const metadataDirect = incoming.get("metadata");
    const geoFile = incoming.get("geoFile");
    const animalFile = incoming.get("animalFile");
    const metadataText = String(incoming.get("metadataText") || "").trim();
    const geoRowsText = String(incoming.get("geoRowsText") || "").trim();
    const animalRowsText = String(incoming.get("animalRowsText") || "").trim();

    if (metadataDirect instanceof File && metadataDirect.size > 0) {
      backendForm.append("metadata", metadataDirect, metadataDirect.name || "metadata.tsv");
    } else if (geoFile instanceof File && geoFile.size > 0) {
      backendForm.append("metadata", geoFile, geoFile.name || "metadata.tsv");
    } else if (metadataText) {
      backendForm.append(
        "metadata",
        makeTextFile(metadataText, "metadata.tsv", "text/tab-separated-values")
      );
    } else if (geoRowsText) {
      backendForm.append(
        "metadata",
        makeTextFile(geoRowsText, "geospatial_metadata.csv", "text/csv")
      );
    } else if (animalFile instanceof File && animalFile.size > 0) {
      backendForm.append("metadata", animalFile, animalFile.name || "animal_metadata.tsv");
    } else if (animalRowsText) {
      backendForm.append(
        "metadata",
        makeTextFile(animalRowsText, "animal_metadata.csv", "text/csv")
      );
    }

    // Backend analysis options.
    [
      "run_phylogeny",
      "run_ml",
      "run_qml",
      "run_fitness",
      "run_geospatial",
      "run_report",
      "run_visualization",
      "run_composite_figures",
      "run_packaging",
      "figure_set",
      "figure_styles",
      "figure_formats",
      "figure_dpi",
    ].forEach((key) => appendIfPresent(backendForm, incoming, key));

    const response = await fetch(`${backendUrl}/jobs/analyze`, {
      method: "POST",
      body: backendForm,
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      const text = await response.text();

      return NextResponse.json(
        {
          status: "error",
          error: "Google Cloud QI-GeneX-N backend did not return JSON.",
          backendStatus: response.status,
          backendUrl,
          details: text.slice(0, 1500),
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    return NextResponse.json(
      {
        ...data,
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
        error: "Failed to connect with QI-GeneX-N Google Cloud backend.",
        details: error instanceof Error ? error.message : String(error),
        fix: [
          "Confirm Google Cloud backend is running.",
          "Open http://34.67.1.205:8000/ in browser.",
          "Check Vercel has QIGENEX_BACKEND_URL=http://34.67.1.205:8000.",
          "Redeploy after editing Vercel environment variables.",
        ],
      },
      { status: 500 }
    );
  }
}