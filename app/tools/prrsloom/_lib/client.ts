import type { AnyResult, JobStatus, ModuleId } from "./types";

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 300) || `HTTP ${response.status}` };
  }
}

export function errorText(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const d = data as { error?: unknown; detail?: unknown };
    if (typeof d.error === "string") return d.error;
    if (typeof d.detail === "string") return d.detail;
  }
  return fallback;
}

export async function submitJob(module: ModuleId, params: Record<string, unknown>, files: Record<string, File | null>, fastaText?: string) {
  const form = new FormData();
  form.set("module", module);
  form.set("params", JSON.stringify(params));
  if (fastaText && fastaText.trim()) form.set("fasta_text", fastaText);
  for (const [key, file] of Object.entries(files)) if (file) form.set(key, file, file.name);
  const response = await fetch("/api/prrsloom", { method: "POST", body: form });
  const data = await readJson(response);
  if (!response.ok) throw new Error(errorText(data, `Submission failed (HTTP ${response.status}).`));
  return data as { job_id: string };
}

export async function getJob(jobId: string, since = 0): Promise<JobStatus> {
  const response = await fetch(`/api/prrsloom/jobs/${jobId}?since=${since}`, { cache: "no-store" });
  const data = await readJson(response);
  if (!response.ok) throw new Error(errorText(data, `Status check failed (HTTP ${response.status}).`));
  return data as JobStatus;
}

export async function cancelJob(jobId: string): Promise<JobStatus> {
  const response = await fetch(`/api/prrsloom/jobs/${jobId}?action=cancel`, { method: "POST", cache: "no-store" });
  const data = await readJson(response);
  if (!response.ok) throw new Error(errorText(data, `Cancellation failed (HTTP ${response.status}).`));
  return data as JobStatus;
}

export async function getResult(jobId: string): Promise<AnyResult> {
  const pointer = await fetch(`/api/prrsloom/jobs/${jobId}?view=result`, { cache: "no-store" }).then(readJson);
  const response = await fetch(pointer.url, { cache: "no-store" });
  const data = await readJson(response);
  if (!response.ok) throw new Error(errorText(data, "The result could not be loaded."));
  return data as AnyResult;
}

export function fileUrl(jobId: string, fileId: string) {
  return `/api/prrsloom/jobs/${jobId}/files/${encodeURIComponent(fileId)}`;
}

export async function fetchExampleFasta() {
  const response = await fetch("/api/prrsloom?example=example.fasta");
  if (!response.ok) throw new Error("The example sequences could not be loaded.");
  return response.text();
}

/** Column names from the first line of a CSV file (RFC 4180 quoting). */
export async function csvHeader(file: File): Promise<string[]> {
  const head = await file.slice(0, 64 * 1024).text();
  const firstLine = head.replace(/^﻿/, "").split(/\r?\n/)[0] ?? "";
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (quoted) {
      if (ch === '"' && firstLine[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  // same repair as the backend: blank names -> extra_column_i, duplicates made unique with "_"
  const out: string[] = [];
  const used = new Set<string>();
  const counters = new Map<string, number>();
  cells.forEach((name, i) => {
    let n = name || `extra_column_${i + 1}`;
    if (used.has(n)) {
      let k = counters.get(n) ?? 0;
      let candidate: string;
      do {
        k++;
        candidate = `${n}_${k}`;
      } while (used.has(candidate) || cells.includes(candidate));
      counters.set(n, k);
      n = candidate;
    }
    used.add(n);
    out.push(n);
  });
  return out;
}

export function downloadText(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rasterise an inline SVG element to PNG/JPEG and download it. */
export async function exportSvg(svg: SVGSVGElement, name: string, width: number, height: number, type: "image/png" | "image/jpeg" = "image/png") {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const data = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(data)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.95));
  if (!blob) throw new Error("The image could not be created.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return "NA";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NA";
    return `"${String(v).replace(/"/g, '""')}"`;
  };
  return [columns.map((c) => `"${c}"`).join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n");
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
