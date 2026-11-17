import { NextRequest, NextResponse } from "next/server";
import { backendHeaders, backendUrl, clientIp, relay, unavailable } from "./_backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel functions accept request bodies up to ~4.5 MB; PRRSLooM inputs are FASTA/CSV/tree text.
const MAX_BODY = 4 * 1024 * 1024;
const MODULES = new Set(["nj_tree", "tree_label", "timer", "haplotype"]);
const UPLOAD_FIELDS = ["fasta", "metadata", "tree", "pairwise", "references"] as const;
const TEXT_FIELDS = ["fasta_text", "reference_text", "reference_accessions"] as const;

export async function GET(req: NextRequest) {
  const example = req.nextUrl.searchParams.get("example");
  try {
    if (example) {
      if (example !== "example.fasta") return NextResponse.json({ error: "Unknown example." }, { status: 404 });
      const r = await fetch(`${backendUrl()}/prrsloom/examples/example.fasta`, { cache: "no-store" });
      if (!r.ok) return relay(r);
      return new NextResponse(await r.text(), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
    }
    const r = await fetch(`${backendUrl()}/prrsloom/health`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return relay(r);
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(req: NextRequest) {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_BODY) {
    return NextResponse.json({ error: "The uploaded files are larger than 4 MB in total." }, { status: 413 });
  }
  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json({ error: "The request must be multipart form data." }, { status: 400 });
  }
  const moduleName = String(incoming.get("module") || "");
  if (!MODULES.has(moduleName)) return NextResponse.json({ error: "Unknown analysis module." }, { status: 400 });

  const outgoing = new FormData();
  outgoing.set("module", moduleName);
  outgoing.set("params", String(incoming.get("params") || "{}"));
  let total = 0;
  for (const field of TEXT_FIELDS) {
    const value = incoming.get(field);
    if (typeof value === "string" && value.trim()) {
      total += value.length;
      outgoing.set(field, value);
    }
  }
  for (const field of UPLOAD_FIELDS) {
    const value = incoming.get(field);
    if (value instanceof File && value.size > 0) {
      total += value.size;
      outgoing.set(field, value, value.name.slice(-120));
    }
  }
  if (total > MAX_BODY) return NextResponse.json({ error: "The uploaded files are larger than 4 MB in total." }, { status: 413 });

  try {
    const r = await fetch(`${backendUrl()}/prrsloom/jobs`, {
      method: "POST",
      body: outgoing,
      headers: backendHeaders({ "x-client-ip": clientIp(req) }),
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    return relay(r);
  } catch (error) {
    return unavailable(error);
  }
}
