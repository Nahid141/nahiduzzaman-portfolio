"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Workspace from "../_components/Workspace";
import { api, errorMessage, type ConnectUser } from "../_lib/api";
import { fileUrl, type SharedFile } from "../_lib/files";
import { getSocket, newClientId } from "../_lib/realtime";
import { syncClock, useMediaSync, useSharedState } from "../_lib/sync";

type Presentation = {
  active: boolean;
  fileId: string | null;
  kind: "pdf" | "video" | "image" | "audio" | "whiteboard" | null;
  title: string;
  page: number;
  status: "playing" | "paused";
  anchorMs: number | null;
  positionMs: number;
  presenterId: string | null;
};
type Stroke = { id: string; color: string; width: number; points: [number, number][]; userId?: string };

const btn = "rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-slate-200 transition hover:border-cyan-300/50 disabled:opacity-40";

/** Renders one PDF page with pdf.js. The document is downloaded once per viewer, then pages render locally. */
function PdfPage({ fileId, page, onPages }: { fileId: string; page: number; onPages: (n: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const data = await (await fetch(await fileUrl(fileId, true))).arrayBuffer();
      // No XFA forms: uploaded PDFs are rendered as static pages (pdf.js never runs PDF JavaScript).
      const d = await pdfjs.getDocument({ data, enableXfa: false }).promise;
      if (!cancelled) {
        setDoc(d);
        onPages(d.numPages);
      }
    })().catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [fileId, onPages]);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let task: { cancel: () => void } | null = null;
    void doc.getPage(Math.min(page, doc.numPages)).then((p) => {
      const viewport = p.getViewport({ scale: 1.6 });
      const c = canvas.current!;
      c.width = viewport.width;
      c.height = viewport.height;
      const t = p.render({ canvas: c, viewport });
      task = t;
      return t.promise;
    }).catch(() => undefined);
    return () => task?.cancel();
  }, [doc, page]);
  if (error) return <p className="text-rose-200">{error}</p>;
  return <canvas ref={canvas} className="mx-auto max-h-[70vh] w-auto max-w-full rounded-xl bg-white" />;
}

function Whiteboard({ canClear }: { canClear: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState("#22d3ee");
  const drawing = useRef<Stroke | null>(null);

  const paint = useCallback((list: Stroke[]) => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of list) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.beginPath();
      s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x * c.width, y * c.height) : ctx.moveTo(x * c.width, y * c.height)));
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    api<{ state: { strokes: Stroke[] } }>("/whiteboard").then((v) => setStrokes(v.state.strokes)).catch(() => undefined);
    const s = getSocket();
    const add = (st: Stroke) => setStrokes((l) => (l.some((x) => x.id === st.id) ? l : [...l, st]));
    const clear = () => setStrokes([]);
    s.on("whiteboard:stroke", add);
    s.on("whiteboard:clear", clear);
    return () => {
      s.off("whiteboard:stroke", add);
      s.off("whiteboard:clear", clear);
    };
  }, []);
  useEffect(() => paint(strokes), [paint, strokes]);

  const at = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {["#22d3ee", "#f472b6", "#facc15", "#ffffff", "#4ade80"].map((c) => (
          <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} />
        ))}
        {canClear && <button type="button" className={btn} onClick={() => api("/whiteboard/clear", { body: {} })}>Clear board</button>}
      </div>
      <canvas
        ref={canvas}
        width={1200}
        height={700}
        aria-label="Shared whiteboard"
        className="w-full touch-none rounded-2xl border border-white/10 bg-slate-900"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = { id: newClientId().slice(0, 36), color, width: 3, points: [at(e)] };
        }}
        onPointerMove={(e) => {
          const d = drawing.current;
          if (!d || d.points.length >= 400) return;
          d.points.push(at(e));
          paint([...strokes, d]);
        }}
        onPointerUp={() => {
          const d = drawing.current;
          drawing.current = null;
          if (!d) return;
          setStrokes((l) => [...l, d]);
          void api("/whiteboard/strokes", { body: d }).catch(() => undefined);
        }}
      />
    </div>
  );
}

function Present({ me }: { me: ConnectUser }) {
  const { value, command } = useSharedState<Presentation>("presentation");
  const [canControl, setCanControl] = useState(false);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [pages, setPages] = useState(0);
  const [following, setFollowing] = useState(true);
  const [localPage, setLocalPage] = useState(1);
  const [media, setMedia] = useState<HTMLMediaElement | null>(null);
  const [mediaUrl, setMediaUrl] = useState<{ id: string; url: string } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [error, setError] = useState("");
  const lastPointer = useRef(0);
  const s = value?.state;
  const presenting = Boolean(s?.active && (s.presenterId === me.id || canControl));
  const page = following ? (s?.page ?? 1) : localPage;

  useEffect(() => {
    api<{ canControl: boolean }>("/state").then((r) => setCanControl(r.canControl)).catch(() => undefined);
    api<SharedFile[]>("/files?targetKind=channel&limit=100").then((f) => setFiles(f.filter((x) => x.mime === "application/pdf" || ["video", "image", "audio"].includes(x.kind)))).catch(() => undefined);
    void syncClock().catch(() => undefined);
    const sock = getSocket();
    const onPointer = (p: { x: number; y: number; visible: boolean }) => setPointer(p);
    sock.on("presentation:pointer", onPointer);
    return () => {
      sock.off("presentation:pointer", onPointer);
    };
  }, []);

  useEffect(() => {
    if (!s?.fileId || !s.kind || s.kind === "pdf" || mediaUrl?.id === s.fileId) return;
    const id = s.fileId;
    fileUrl(id, true).then((url) => setMediaUrl({ id, url })).catch((e) => setError(errorMessage(e)));
  }, [s?.fileId, s?.kind, mediaUrl?.id]);

  const drift = useMediaSync(media, s && (s.kind === "video" || s.kind === "audio") && following ? s : null, true);
  const onPages = useCallback((n: number) => setPages(n), []);

  const run = async (body: Record<string, unknown>) => {
    setError("");
    try {
      await command("/presentation/control", body);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">Presentation</h1>
          <p className="mt-2 text-sm text-slate-400">{s?.active ? `Showing ${s.title}` : "Nothing is being presented."}</p>
        </div>
        {s?.active && !presenting && (
          <button type="button" className={btn} aria-pressed={!following} onClick={() => { setFollowing((f) => !f); setLocalPage(s.page); }}>
            {following ? "Browse on my own" : "Follow the presenter again"}
          </button>
        )}
      </div>

      {canControl && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 p-3">
          <select aria-label="What to present" defaultValue="" onChange={(e) => e.target.value && void run({ action: "start", fileId: e.target.value === "whiteboard" ? null : e.target.value })} className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white">
            <option value="">Present…</option>
            <option value="whiteboard">Whiteboard</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          {s?.active && <button type="button" className={btn} onClick={() => run({ action: "stop" })}>Stop presenting</button>}
          {s?.active && s.kind === "pdf" && (
            <>
              <button type="button" className={btn} disabled={s.page <= 1} onClick={() => run({ action: "page", page: s.page - 1 })}>Previous page</button>
              <span className="text-sm text-slate-300">Page {s.page}{pages ? ` of ${pages}` : ""}</span>
              <button type="button" className={btn} disabled={pages > 0 && s.page >= pages} onClick={() => run({ action: "page", page: s.page + 1 })}>Next page</button>
            </>
          )}
          {s?.active && (s.kind === "video" || s.kind === "audio") && (
            <button type="button" className={btn} onClick={() => run({ action: s.status === "playing" ? "pause" : "play" })}>{s.status === "playing" ? "Pause for everyone" : "Play for everyone"}</button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-rose-200">{error}</p>}

      {s?.active && (
        <div
          className="relative rounded-3xl border border-white/10 bg-slate-950 p-3"
          onPointerMove={(e) => {
            if (!presenting || Date.now() - lastPointer.current < 100) return;
            lastPointer.current = Date.now();
            const r = e.currentTarget.getBoundingClientRect();
            void api("/presentation/pointer", { body: { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, visible: true } }).catch(() => undefined);
          }}
        >
          {s.kind === "pdf" && s.fileId && <PdfPage fileId={s.fileId} page={page} onPages={onPages} />}
          {s.kind === "image" && mediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl.url} alt={s.title} className="mx-auto max-h-[70vh] rounded-xl" />
          )}
          {s.kind === "video" && mediaUrl && <video ref={setMedia} src={mediaUrl.url} playsInline controls={!following} className="mx-auto max-h-[70vh] w-full rounded-xl bg-black" />}
          {s.kind === "audio" && mediaUrl && <audio ref={setMedia} src={mediaUrl.url} controls={!following} className="w-full" />}
          {s.kind === "whiteboard" && <Whiteboard canClear={canControl} />}
          {pointer?.visible && following && !presenting && (
            <span aria-hidden className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,.9)]" style={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }} />
          )}
          {!following && s.kind === "pdf" && (
            <div className="mt-3 flex justify-center gap-2">
              <button type="button" className={btn} disabled={localPage <= 1} onClick={() => setLocalPage((p) => p - 1)}>Previous</button>
              <button type="button" className={btn} disabled={pages > 0 && localPage >= pages} onClick={() => setLocalPage((p) => p + 1)}>Next</button>
            </div>
          )}
          {drift !== null && <p className="mt-2 text-xs text-slate-500">In sync within {Math.abs(drift)} ms</p>}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Workspace>{(me) => <Present me={me} />}</Workspace>;
}
