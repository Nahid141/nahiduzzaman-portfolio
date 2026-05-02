"use client";

import { useState } from "react";

export default function Tools() {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<string[]>([
    "> EGStat-N web engine initialized...",
    "> Waiting for input dataset...",
  ]);
  const [downloadUrl, setDownloadUrl] = useState("");

  async function runAnalysis() {
    if (!file) {
      setLog((old) => [...old, "> ERROR: Please upload a file first."]);
      return;
    }

    setLog((old) => [...old, `> Uploading ${file.name}...`, "> Running backend analysis..."]);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://127.0.0.1:8000/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Backend analysis failed.");
      }

      const data = await response.json();

      setLog((old) => [
        ...old,
        "> Analysis completed successfully.",
        `> Rows: ${data.rows}`,
        `> Columns: ${data.columns}`,
        `> Output file ready: ${data.output_file}`,
      ]);

      setDownloadUrl(`http://127.0.0.1:8000/download/${data.output_file}`);
    } catch (error) {
      setLog((old) => [
        ...old,
        "> ERROR: Could not connect to Python backend.",
        "> Make sure FastAPI backend is running on port 8000.",
      ]);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <section className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.3em] text-cyan-300">
            Research Tools
          </p>
          <h1 className="mb-6 text-5xl font-black">EGStat-N</h1>
          <p className="mx-auto max-w-3xl text-lg leading-8 text-slate-300">
            Epidemiological Graphics and Statistics Tool for Networks — an online
            Python-powered platform for statistical analysis, epidemiology,
            network analysis, and bioinformatics workflows.
          </p>
        </div>

        <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="mb-4 text-3xl font-black text-cyan-300">
                Launch EGStat-N Web Engine
              </h2>

              <p className="mb-6 leading-8 text-slate-300">
                Upload your dataset, run Python backend analysis, preview the
                analysis log, and download processed output files directly from
                the browser.
              </p>

              <button
                onClick={() => setOpen(true)}
                className="rounded-2xl bg-cyan-400 px-7 py-4 font-black text-slate-950 transition hover:-translate-y-1 hover:bg-white"
              >
                Open Tool Window
              </button>
            </div>

            <div className="rounded-3xl border border-cyan-300/20 bg-slate-900/80 p-6">
              <p className="mb-3 text-sm font-bold text-cyan-300">
                Analysis Modules
              </p>

              <div className="grid gap-3 text-sm font-semibold text-slate-300">
                <div className="rounded-xl bg-white/5 p-3">Data Summary</div>
                <div className="rounded-xl bg-white/5 p-3">Statistical Tests</div>
                <div className="rounded-xl bg-white/5 p-3">Risk Factor Analysis</div>
                <div className="rounded-xl bg-white/5 p-3">Network Analysis</div>
                <div className="rounded-xl bg-white/5 p-3">Bioinformatics Input Support</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur">
          <div
            className={`border border-white/10 bg-slate-950 shadow-2xl ${
              fullscreen
                ? "h-full w-full rounded-none"
                : "h-[84vh] w-full max-w-6xl rounded-[2rem]"
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-2xl font-black text-cyan-300">
                  EGStat-N Analysis Window
                </h2>
                <p className="text-sm text-slate-400">
                  Upload data → run Python backend → download output
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setFullscreen(!fullscreen)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-cyan-300 hover:text-cyan-300"
                >
                  {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>

                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid h-[calc(100%-88px)] gap-6 overflow-auto p-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
                <h3 className="mb-4 text-xl font-black">Input Files</h3>

                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/40 bg-cyan-300/5 p-8 text-center transition hover:bg-cyan-300/10">
                  <span className="mb-2 text-lg font-bold text-cyan-300">
                    Upload Dataset
                  </span>
                  <span className="text-sm text-slate-400">
                    CSV, Excel, TXT, FASTA
                  </span>

                  <input
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx,.xls,.txt,.fasta,.fa"
                    onChange={(e) => {
                      const selected = e.target.files?.[0] || null;
                      setFile(selected);
                      setFileName(selected?.name || "");
                      setDownloadUrl("");
                      if (selected) {
                        setLog((old) => [...old, `> File selected: ${selected.name}`]);
                      }
                    }}
                  />
                </label>

                {fileName && (
                  <p className="mt-4 rounded-xl bg-slate-900 p-3 text-sm text-cyan-200">
                    Loaded: {fileName}
                  </p>
                )}

                <button
                  onClick={runAnalysis}
                  className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-white"
                >
                  Run Analysis
                </button>

                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    className="mt-4 block rounded-2xl bg-blue-500 px-5 py-3 text-center font-black text-white transition hover:bg-blue-600"
                  >
                    Download Output
                  </a>
                )}
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
                <h3 className="mb-4 text-xl font-black">Python Analysis Console</h3>

                <div className="h-80 overflow-auto rounded-2xl bg-black p-5 font-mono text-sm text-green-300">
                  {log.map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center font-bold">
                    Upload
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center font-bold">
                    Analyze
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-center font-bold">
                    Export
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}