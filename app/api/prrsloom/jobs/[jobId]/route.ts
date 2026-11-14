import { NextRequest, NextResponse } from "next/server";
import { JOB_ID, backendHeaders, backendUrl, directUrl, relay, unavailable } from "../../_backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/prrsloom/jobs/:jobId            -> job status
// GET /api/prrsloom/jobs/:jobId?view=result -> { url } of the result JSON, fetched directly by the browser
//                                              (results can exceed Vercel's 4.5 MB response limit)
export async function GET(req: NextRequest, ctx: RouteContext<"/api/prrsloom/jobs/[jobId]">) {
  const { jobId } = await ctx.params;
  if (!JOB_ID.test(jobId)) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (req.nextUrl.searchParams.get("view") === "result") {
    return NextResponse.json(
      { url: directUrl(jobId, "result.json", `/prrsloom/jobs/${jobId}/result`) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const r = await fetch(`${backendUrl()}/prrsloom/jobs/${jobId}`, {
      headers: backendHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    return relay(r);
  } catch (error) {
    return unavailable(error);
  }
}
