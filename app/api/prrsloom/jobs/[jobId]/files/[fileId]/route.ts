import { NextResponse } from "next/server";
import { FILE_ID, JOB_ID, directUrl } from "../../../../_backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Redirects to the file on the Oracle backend (signed when an API key is configured), so large
// figures are not streamed through a Vercel function.
export async function GET(_req: Request, ctx: RouteContext<"/api/prrsloom/jobs/[jobId]/files/[fileId]">) {
  const { jobId, fileId } = await ctx.params;
  if (!JOB_ID.test(jobId) || !FILE_ID.test(fileId) || fileId === "result.json") {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }
  const target = directUrl(jobId, fileId, `/prrsloom/jobs/${jobId}/files/${encodeURIComponent(fileId)}`);
  return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "no-store" } });
}
