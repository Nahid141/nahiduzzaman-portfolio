import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";

// Server-side only. PRRSLOOM_BACKEND_URL / PRRSLOOM_API_KEY are never exposed to the browser.
export function backendUrl() {
  return (process.env.PRRSLOOM_BACKEND_URL || "https://api.fnunahiduzzaman.com").replace(/\/+$/, "");
}

export function backendHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const key = process.env.PRRSLOOM_API_KEY;
  if (key) headers["x-prrsloom-key"] = key;
  return headers;
}

export const JOB_ID = /^[0-9a-f]{32}$/;
export const FILE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/** URL the browser can fetch directly from the backend; signed when an API key is configured. */
export function directUrl(jobId: string, name: string, path: string) {
  const url = new URL(`${backendUrl()}${path}`);
  const key = process.env.PRRSLOOM_API_KEY;
  if (key) {
    const expires = Math.floor(Date.now() / 1000) + 600;
    const sig = createHmac("sha256", key).update(`${jobId}/${name}/${expires}`).digest("hex");
    url.searchParams.set("expires", String(expires));
    url.searchParams.set("sig", sig);
  }
  return url.toString();
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim().slice(0, 64) || "unknown";
}

export async function relay(response: Response) {
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.slice(0, 300) || `Backend returned HTTP ${response.status}.` };
  }
  return NextResponse.json(data, { status: response.status, headers: { "Cache-Control": "no-store" } });
}

export function unavailable(error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return NextResponse.json(
    { error: "The PRRSLooM analysis server is not reachable right now. Please try again later.", detail },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
