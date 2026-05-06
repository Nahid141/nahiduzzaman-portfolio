import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function normalizeBackendUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export async function GET() {
  const backendUrl = process.env.QIGENEX_BACKEND_URL;

  return NextResponse.json({
    status: "running",
    route: "/api/qigenex",
    message: "QI-GeneX-N Vercel bridge route is active.",
    backendConfigured: Boolean(backendUrl),
    backendUrl: backendUrl ? normalizeBackendUrl(backendUrl) : null,
  });
}

export async function POST(req: NextRequest) {
  try {
    const rawBackendUrl = process.env.QIGENEX_BACKEND_URL;

    if (!rawBackendUrl) {
      return NextResponse.json(
        {
          status: "error",
          error: "QIGENEX_BACKEND_URL is not configured.",
          fix: "Add QIGENEX_BACKEND_URL=http://35.222.71.217:8000 in .env.local and in Vercel environment variables.",
        },
        { status: 500 }
      );
    }

    const backendUrl = normalizeBackendUrl(rawBackendUrl);
    const formData = await req.formData();

    const response = await fetch(`${backendUrl}/qigenex/analyze`, {
      method: "POST",
      body: formData,
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
          "Open http://35.222.71.217:8000/ in browser.",
          "Check .env.local contains QIGENEX_BACKEND_URL=http://35.222.71.217:8000.",
          "Restart npm run dev after editing .env.local.",
        ],
      },
      { status: 500 }
    );
  }
}