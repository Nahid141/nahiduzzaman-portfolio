"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelJob, csvHeader, fetchExampleFasta, getJob, getResult, submitJob } from "../_lib/client";
import { MODULES, MODULE_BY_ID } from "../_lib/modules";
import type { AnyResult, JobStatus, LogEntry, ModuleId } from "../_lib/types";
import { HaplotypeView } from "./HaplotypeView";
import { TimerView } from "./TimerView";
import { TreeView } from "./TreeView";
import { Checkbox, DataTable, Downloads, Eyebrow, FileField, GhostButton, JobProgress, Notice, NumberField, Panel, PrimaryButton, Select, TextArea } from "./ui";

const MAX_FILE = 4 * 1024 * 1024;
const opts = (cols: string[]) => cols.map((c) => ({ value: c, label: c }));

function useCsvColumns(file: File | null) {
  const [cols, setCols] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!file) {
      Promise.resolve().then(() => { if (alive) { setCols([]); setError(null); } });
      return () => { alive = false; };
    }
    csvHeader(file)
      .then((c) => { if (alive) { setCols(c); setError(c.length ? null : "The CSV file has no header row."); } })
      .catch(() => { if (alive) setError("The CSV file could not be read."); });
    return () => { alive = false; };
  }, [file]);
  return { cols, error };
}

export default function PrrsloomApp() {
  const [moduleId, setModuleId] = useState<ModuleId>("nj_tree");
  const info = MODULE_BY_ID[moduleId];

  // shared inputs
  const [fastaFile, setFastaFile] = useState<File | null>(null);
  const [fastaText, setFastaText] = useState("");
  const [metaFile, setMetaFile] = useState<File | null>(null);
  const [treeFile, setTreeFile] = useState<File | null>(null);
  const [pairFile, setPairFile] = useState<File | null>(null);
  const meta = useCsvColumns(metaFile);
  const pairs = useCsvColumns(pairFile);

  // module-specific choices
  const [idCol, setIdCol] = useState("");
  const [annCol, setAnnCol] = useState("");
  const [dateCol, setDateCol] = useState("");
  const [extraCol, setExtraCol] = useState("");
  const [usePairwise, setUsePairwise] = useState(false);
  const [pairCols, setPairCols] = useState({ s1: "", s2: "", identity: "None", difference: "None", comparable: "None", interval: "" });
  const [defaultSites, setDefaultSites] = useState(603);

  // job state
  const [job, setJob] = useState<JobStatus | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<AnyResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [logLines, setLogLines] = useState<LogEntry[]>([]);
  const pollToken = useRef(0);

  // R-app defaults for column pickers whenever the CSV changes
  useEffect(() => {
    const cols = meta.cols;
    Promise.resolve().then(() => {
      if (!cols.length) { setIdCol(""); setAnnCol(""); setDateCol(""); setExtraCol(""); return; }
      if (moduleId === "nj_tree") {
        const guess = ["SequenceName", "sequence_id", "SequenceID", "ID", "id"].find((c) => cols.includes(c)) ?? cols[0];
        setIdCol(guess);
        const ann = cols.filter((c) => c !== guess);
        setAnnCol((ann.length ? ann : cols)[0]);
      } else if (moduleId === "haplotype") {
        setIdCol(cols.includes("ids") ? "ids" : cols[0]);
      } else if (moduleId === "timer") {
        setIdCol(cols[0]);
        setDateCol(cols[Math.min(1, cols.length - 1)]);
      } else {
        setExtraCol("");
      }
    });
  }, [meta.cols, moduleId]);

  useEffect(() => {
    const c = pairs.cols;
    Promise.resolve().then(() => setPairCols({
      s1: c[0] ?? "", s2: c[Math.min(1, c.length - 1)] ?? "", identity: c.length >= 3 ? c[2] : "None",
      difference: "None", comparable: "None", interval: c[Math.min(3, c.length - 1)] ?? "",
    }));
  }, [pairs.cols]);

  const stopPolling = () => { pollToken.current += 1; };

  // Poll every 2 s until the job finishes; a newer poll or a reset cancels this loop.
  // Only new log entries are requested each time (?since=<entries already shown>).
  const poll = useCallback(async (jobId: string) => {
    const token = ++pollToken.current;
    let seen = 0;
    setLogLines([]);
    while (token === pollToken.current) {
      try {
        const status = await getJob(jobId, seen);
        if (token !== pollToken.current) return;
        const fresh = status.log ?? [];
        if (fresh.length) setLogLines((old) => [...old, ...fresh]);
        seen = status.log_total ?? seen + fresh.length;
        setJob(status);
        setJobError(null);
        if (status.status === "succeeded") {
          const res = await getResult(jobId);
          if (token === pollToken.current) setResult(res);
          return;
        }
        if (status.status === "failed" || status.status === "expired" || status.status === "cancelled") return;
      } catch (e) {
        if (token !== pollToken.current) return;
        setJobError(e instanceof Error ? e.message : String(e));
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }, []);

  // resume a job from ?job=<id>&module=<id> (shareable result link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    const mod = params.get("module") as ModuleId | null;
    if (jobId && /^[0-9a-f]{32}$/.test(jobId)) {
      Promise.resolve().then(() => {
        if (mod && MODULE_BY_ID[mod]) setModuleId(mod);
        poll(jobId);
      });
    }
    return stopPolling;
  }, [poll]);

  const resetResults = () => { stopPolling(); setJob(null); setResult(null); setJobError(null); setFormError(null); setLogLines([]); };

  // Stops the analysis on the server (frees the worker for other users); polling then sees "cancelled".
  const cancel = async () => {
    if (!job) return;
    try {
      setJob(await cancelJob(job.id));
    } catch (e) {
      setJobError(e instanceof Error ? e.message : String(e));
    }
  };

  const chooseModule = (id: ModuleId) => {
    if (id === moduleId) return;
    resetResults();
    setModuleId(id);
    setMetaFile(null); setTreeFile(null); setPairFile(null);
    window.history.replaceState(null, "", "/tools/prrsloom");
  };

  const validate = (): string | null => {
    for (const f of [fastaFile, metaFile, treeFile, pairFile]) if (f && f.size > MAX_FILE) return `${f.name} is larger than 4 MB.`;
    const needsFasta = moduleId === "nj_tree" || moduleId === "haplotype" || (moduleId === "timer" && !usePairwise);
    if (needsFasta && !fastaFile && !fastaText.trim()) return "Upload a FASTA file or paste FASTA sequences before running the analysis.";
    if (needsFasta && !fastaFile && !fastaText.trim().startsWith(">")) return "Pasted FASTA sequences must start with a header line beginning with '>'.";
    if (meta.error && metaFile) return meta.error;
    if (moduleId === "tree_label" && !treeFile) return "Upload a tree file (.tre, .tree, .nwk, .nex or .nexus).";
    if (moduleId === "tree_label" && !metaFile) return "Upload the PRRSLoom classification CSV.";
    if (moduleId === "tree_label" && metaFile && meta.cols.length && !(meta.cols.includes("SequenceName") && meta.cols.includes("assign.final")))
      return "The classification CSV must contain the columns SequenceName and assign.final.";
    if (moduleId === "timer" && !usePairwise && !metaFile) return "Sequence mode requires a collection date CSV with sequence IDs and dates.";
    if (moduleId === "timer" && usePairwise && !pairFile) return "Upload the pairwise comparison CSV.";
    if (moduleId === "timer" && usePairwise && !(defaultSites >= 1)) return "Comparable sites must be at least 1.";
    return null;
  };

  const run = async () => {
    const problem = validate();
    if (problem) { setFormError(problem); return; }
    resetResults();
    setSubmitting(true);
    const params: Record<string, unknown> = {};
    const files: Record<string, File | null> = {};
    let text: string | undefined;
    if (moduleId === "nj_tree" || moduleId === "haplotype" || (moduleId === "timer" && !usePairwise)) {
      files.fasta = fastaFile;
      text = fastaFile ? undefined : fastaText;
    }
    if (moduleId === "nj_tree" && metaFile) { files.metadata = metaFile; params.metadata_id_col = idCol; params.metadata_annotation_col = annCol; }
    if (moduleId === "haplotype" && metaFile) { files.metadata = metaFile; params.id_column = idCol; }
    if (moduleId === "tree_label") { files.tree = treeFile; files.metadata = metaFile; params.extra_annotation_col = extraCol; }
    if (moduleId === "timer") {
      params.mode = usePairwise ? "pairwise" : "fasta";
      if (usePairwise) {
        files.pairwise = pairFile;
        Object.assign(params, {
          table_seq1_col: pairCols.s1, table_seq2_col: pairCols.s2, table_identity_col: pairCols.identity,
          table_difference_col: pairCols.difference, table_comparable_col: pairCols.comparable,
          table_interval_col: pairCols.interval, default_comparable_sites: defaultSites,
        });
      } else {
        files.metadata = metaFile;
        params.metadata_id_col = idCol;
        params.metadata_date_col = dateCol;
      }
    }
    try {
      const { job_id } = await submitJob(moduleId, params, files, text);
      window.history.replaceState(null, "", `/tools/prrsloom?module=${moduleId}&job=${job_id}`);
      setJob({ id: job_id, module: moduleId, status: "queued", progress: 0, message: "Queued", error: null });
      poll(job_id);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const loadExample = async () => {
    try {
      setFastaFile(null);
      setFastaText(await fetchExampleFasta());
      setFormError(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  };

  const running = submitting || job?.status === "queued" || job?.status === "running";
  const showFasta = moduleId === "nj_tree" || moduleId === "haplotype" || (moduleId === "timer" && !usePairwise);

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 px-4 py-12 text-white md:px-6 md:py-16">
      <div className="relative mx-auto max-w-7xl space-y-8">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-24 top-40 h-80 w-80 rounded-full bg-purple-500/20 blur-3xl" aria-hidden />

        <Panel className="relative">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Link href="/tools" className="text-sm font-bold text-slate-400 transition hover:text-cyan-300">← Back to Tools</Link>
              <p className="mt-4 text-sm font-black uppercase tracking-[0.35em] text-cyan-300">PRRSV-2 genomic epidemiology</p>
              <h1 className="mt-2 text-5xl font-black tracking-tight md:text-6xl">PRRSLooM</h1>
              <p className="mt-4 text-base leading-7 text-slate-300">
                Variant-aware phylogenetic trees, tree labeling, pairwise molecular-clock audits and haplotype networks for PRRSV-2 ORF5
                sequences. A Python implementation of the PRRSLoom Shiny tools from the V-EPI Lab, University of Minnesota, using the
                same PRRSV-2 variant classifier and reference set.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:max-w-sm">
              {["4 analysis modules", "Live classifier model", "R-validated results", "Results kept 72 h"].map((x) => (
                <div key={x} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-bold text-slate-200">{x}</div>
              ))}
            </div>
          </div>
        </Panel>

        <nav aria-label="PRRSLooM modules" className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {MODULES.map((m) => {
            const active = m.id === moduleId;
            return (
              <button key={m.id} type="button" onClick={() => chooseModule(m.id)} aria-pressed={active}
                className={`rounded-[1.5rem] border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-cyan-300/60 ${
                  active ? "border-cyan-300/70 bg-gradient-to-br from-cyan-400/20 via-white/[0.06] to-slate-950 shadow-lg shadow-cyan-500/10"
                    : "border-white/10 bg-white/[0.04] hover:-translate-y-1 hover:border-purple-300/50"}`}>
                <p className={`text-xs font-black uppercase tracking-[0.2em] ${active ? "text-cyan-200" : "text-purple-200"}`}>{m.requirement}</p>
                <h2 className="mt-2 text-xl font-black">{m.name}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{m.tagline}</p>
              </button>
            );
          })}
        </nav>

        <div className="relative grid gap-6 lg:grid-cols-[minmax(300px,400px)_1fr]">
          <Panel className="h-fit space-y-5">
            <div>
              <Eyebrow>{info.requirement}</Eyebrow>
              <h2 className="mt-2 text-2xl font-black">{info.name}</h2>
              <p className="mt-2 text-xs leading-5 text-slate-400">{info.method}</p>
            </div>

            {moduleId === "timer" && <Checkbox label="I only have a pairwise comparison CSV" checked={usePairwise} onChange={(v) => { setUsePairwise(v); setFormError(null); }} />}
            {moduleId === "timer" && usePairwise && (
              <Notice tone="warn"><strong>Use this only if you do not have FASTA sequences.</strong> Upload a CSV that already contains pairwise comparisons: sequence 1, sequence 2, percent identity or observed differences, and elapsed time in years.</Notice>
            )}

            {showFasta && (
              <>
                <FileField label="Upload FASTA file" hint="Accepted: .fasta, .fa, .fas, .fna (max 4 MB)" accept=".fasta,.fa,.fas,.fna,.txt" file={fastaFile} onChange={setFastaFile} />
                <TextArea label="Or paste FASTA sequences" value={fastaText} onChange={setFastaText} placeholder={">seq_1\nATG...\n>seq_2\nATG..."} />
                {(moduleId === "nj_tree" || moduleId === "haplotype") && (
                  <GhostButton onClick={loadExample}>Load example ORF5 sequences (7, from the classifier repository)</GhostButton>
                )}
              </>
            )}

            {moduleId === "tree_label" && (
              <FileField label="Upload tree file" hint="Accepted: .tre, .tree, .nwk, .nex, .nexus. Rooted trees are recommended." accept=".nwk,.tree,.tre,.nex,.nexus" file={treeFile} onChange={setTreeFile} />
            )}

            {!(moduleId === "timer" && usePairwise) && (
              <FileField
                label={moduleId === "tree_label" ? "Upload metadata CSV" : moduleId === "timer" ? "Upload collection date metadata CSV" : "Optional metadata CSV"}
                hint={moduleId === "tree_label" ? "Required columns: SequenceName and assign.final. Other columns can be used as an extra labeling bar."
                  : moduleId === "timer" ? "Sequence ID and collection date/year columns are required."
                  : moduleId === "nj_tree" ? "Adds one extra annotation layer to the tree." : "Optional, but recommended for farm, region, date or other grouping fields."}
                accept=".csv" file={metaFile} onChange={setMetaFile} />
            )}
            {meta.error && metaFile && <Notice tone="error">{meta.error}</Notice>}

            {moduleId === "nj_tree" && meta.cols.length > 0 && (
              <>
                <Select label="Sequence ID column" value={idCol} onChange={setIdCol} options={opts(meta.cols)} />
                <Select label="Column to add to the tree" value={annCol} onChange={setAnnCol}
                  options={opts(meta.cols.filter((c) => c !== idCol).length ? meta.cols.filter((c) => c !== idCol) : meta.cols)} />
              </>
            )}
            {moduleId === "haplotype" && (meta.cols.length > 0
              ? <Select label="Choose the ID column" value={idCol} onChange={setIdCol} options={opts(meta.cols)} />
              : <p className="text-xs font-semibold text-slate-400">Metadata CSV is optional. Without it, the classifier output and SequenceName are used.</p>)}
            {moduleId === "tree_label" && meta.cols.length > 0 && (() => {
              const extras = meta.cols.filter((c) => c !== "SequenceName" && c !== "assign.final");
              return extras.length ? (
                <Select label="Optional extra labeling bar" value={extraCol} onChange={setExtraCol}
                  options={[{ value: "", label: "No extra labeling bar" }, ...opts(extras)]} />
              ) : <p className="text-xs text-slate-400">No optional metadata columns were detected. The tree will be labeled by variant and sub-lineage only.</p>;
            })()}
            {moduleId === "timer" && !usePairwise && meta.cols.length > 0 && (
              <>
                <Select label="Sequence ID column" value={idCol} onChange={setIdCol} options={opts(meta.cols)} />
                <Select label="Collection date/year column" value={dateCol} onChange={setDateCol} options={opts(meta.cols)} />
              </>
            )}
            {moduleId === "timer" && usePairwise && (
              <>
                <FileField label="Upload pairwise comparison CSV" hint="Not a FASTA file: precomputed pairwise identity/differences and elapsed time." accept=".csv" file={pairFile} onChange={setPairFile} />
                {pairs.error && pairFile && <Notice tone="error">{pairs.error}</Notice>}
                {pairs.cols.length > 0 && (
                  <div className="grid gap-3">
                    <Select label="Sequence 1 column" value={pairCols.s1} onChange={(v) => setPairCols({ ...pairCols, s1: v })} options={opts(pairs.cols)} />
                    <Select label="Sequence 2 column" value={pairCols.s2} onChange={(v) => setPairCols({ ...pairCols, s2: v })} options={opts(pairs.cols)} />
                    <Select label="Percent identity column" value={pairCols.identity} onChange={(v) => setPairCols({ ...pairCols, identity: v })} options={opts(["None", ...pairs.cols])} />
                    <Select label="Observed differences column" value={pairCols.difference} onChange={(v) => setPairCols({ ...pairCols, difference: v })} options={opts(["None", ...pairs.cols])} />
                    <Select label="Comparable sites column" value={pairCols.comparable} onChange={(v) => setPairCols({ ...pairCols, comparable: v })} options={opts(["None", ...pairs.cols])} />
                    <Select label="Elapsed time in years column" value={pairCols.interval} onChange={(v) => setPairCols({ ...pairCols, interval: v })} options={opts(pairs.cols)} />
                  </div>
                )}
                <NumberField label="Comparable sites if no column is provided" value={defaultSites} min={1} onChange={setDefaultSites} />
              </>
            )}
            {moduleId === "timer" && (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-xs">
                <p className="mb-2 font-black uppercase tracking-[0.18em] text-slate-300">Fixed assumptions</p>
                <table className="w-full text-slate-300"><tbody>
                  {[["Mean substitution rate", "0.0112"], ["Lower substitution rate", "0.0088"], ["Upper substitution rate", "0.0127"], ["Central Poisson interval", "95%"], ["Outside interval heatmap value", "0"]].map(([k, v]) => (
                    <tr key={k}><td className="py-0.5">{k}</td><td className="py-0.5 text-right font-mono text-cyan-200">{v}</td></tr>
                  ))}
                </tbody></table>
              </div>
            )}

            {formError && <Notice tone="error">{formError}</Notice>}
            <div className="flex flex-wrap items-center gap-3">
              <PrimaryButton onClick={run} disabled={running}>{running ? "Running…" : info.runLabel}</PrimaryButton>
              {job && (job.status === "queued" || job.status === "running") && (
                <GhostButton onClick={cancel}>Cancel analysis</GhostButton>
              )}
            </div>
            <JobProgress job={job} error={jobError} log={logLines} />
          </Panel>

          <div className="space-y-6">
            {result && job && result.module === moduleId ? (
              <Panel className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-2xl font-black text-cyan-100">Results</h2>
                  <Downloads jobId={job.id} files={result.files} />
                </div>
                {"warnings" in result && result.warnings.map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
                <Results result={result} />
              </Panel>
            ) : (
              <Guide moduleId={moduleId} />
            )}
            <About />
          </div>
        </div>
      </div>
    </main>
  );
}

function Results({ result }: { result: AnyResult }) {
  const [tab, setTab] = useState<"tree" | "table">("tree");
  if (result.module === "timer") return <TimerView result={result} />;
  if (result.module === "haplotype") return <HaplotypeView result={result} />;
  if (result.module === "tree_label") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-300">{result.n_matched} of {result.n_tips} tips matched a SequenceName in the classification CSV.</p>
        <TreeView tree={result.tree} minHeight={900} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Notice tone="info">{result.reference_status} {result.n_user_sequences} uploaded and {result.n_reference_sequences} reference sequences in the tree.</Notice>
      <div role="tablist" aria-label="NJ results" className="flex gap-2">
        {(["tree", "table"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-black ${tab === t ? "bg-cyan-400 text-slate-950" : "border border-white/10 text-slate-300"}`}>
            {t === "tree" ? "Annotated tree" : "Classification table"}
          </button>
        ))}
      </div>
      {tab === "tree" ? <TreeView tree={result.tree} minHeight={700} /> : (
        <DataTable caption="Classification table" rows={result.classification} pageSize={10}
          columns={["SequenceName", "assign.final", "assign.top", "prob.top", "assign.2", "prob.2", "num.gaps.amb"]} />
      )}
    </div>
  );
}

function Guide({ moduleId }: { moduleId: ModuleId }) {
  const m = MODULE_BY_ID[moduleId];
  return (
    <Panel className="space-y-5">
      <div>
        <Eyebrow tone="purple">Input guide</Eyebrow>
        <h2 className="mt-2 text-2xl font-black">{m.name}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{m.tagline}</p>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {m.steps.map(([title, text], i) => (
          <li key={title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-purple-400 text-sm font-black text-slate-950">{i + 1}</span>
            <h3 className="mt-3 font-black text-white">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-300">{text}</p>
          </li>
        ))}
      </ol>
      {m.template && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black text-cyan-200">{m.template.label}</h3>
            <a href={`/prrsloom/${m.template.file}`} download className="rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-slate-100 hover:border-cyan-300/60 hover:text-cyan-200">
              ↓ Download CSV example
            </a>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="min-w-full text-left text-xs">
              <caption className="sr-only">{m.template.label}</caption>
              <thead className="bg-white/[0.06]"><tr>{m.template.columns.map((c) => <th key={c} scope="col" className="px-3 py-2 font-black">{c}</th>)}</tr></thead>
              <tbody>{m.template.rows.map((r, i) => <tr key={i} className="border-t border-white/5 text-slate-300">{r.map((c, j) => <td key={j} className="px-3 py-1.5">{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs leading-5 text-slate-400">{m.note}</p>
        </div>
      )}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-slate-300">
        <p className="font-black text-white">Best practices for sequence IDs</p>
        <p>Avoid spaces and special characters; separate elements with underscores, e.g. <code className="text-cyan-200">seq3_farm1_2025</code>. Use the same IDs in every file.</p>
      </div>
    </Panel>
  );
}

function About() {
  return (
    <details className="group rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 md:p-7">
      <summary className="cursor-pointer list-none text-lg font-black text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50">
        About PRRSLooM, methods and citation <span className="text-cyan-300 group-open:hidden">+</span><span className="hidden text-cyan-300 group-open:inline">−</span>
      </summary>
      <div className="mt-4 space-y-3 text-sm leading-7 text-slate-300">
        <p>
          PRRSLooM re-implements the PRRSLoom Shiny tools (NJ Tree Builder, Tree Labeling, TIMER and Haplotype Network) as a Python
          service. Variant assignments use the PRRSV-2 random-forest classifier and reference sequences from the
          {" "}<a className="text-cyan-300 underline" href="https://github.com/kvanderwaal/prrsv2_classification" target="_blank" rel="noopener noreferrer">prrsv2_classification</a>{" "}
          repository, loaded from the same files the R apps use and evaluated tree by tree, so the probabilities match the R classifier.
          Every step was compared against the original R code; the full validation record is in the project repository.
        </p>
        <p>
          Known differences: the Haplotype Network aligns with MAFFT instead of DECIPHER (haplotype membership agreed in all test sets;
          one in ten networks differed by one mutational step around an indel). Random-forest vote ties are broken with a fixed seed
          rather than at random, and network layouts are drawn with a deterministic spring layout.
        </p>
        <p>
          NJ trees are intended for fast exploratory analysis, not high-resolution phylogenetic inference. Classifications were developed
          from U.S. sequences (2015–present) and should be applied with caution to international or pre-2015 data.
        </p>
        <p className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <span className="font-black text-white">Citation. </span>
          VanderWaal K, Pamornchainavakul N, Kikuti M, Zhang J, Zeller M, Trevisan G, Rossow S, Schwartz M, Linhares DCL, Holtkamp DJ,
          da Silva JPH, Corzo CA, Baker JP, Anderson TK, Makau DN, Paploski IAD. 2025. PRRSV-2 variant classification: a dynamic
          nomenclature for enhanced monitoring and surveillance. mSphere 10:e00709-24.{" "}
          <a className="text-cyan-300 underline" href="https://doi.org/10.1128/msphere.00709-24" target="_blank" rel="noopener noreferrer">doi:10.1128/msphere.00709-24</a>
        </p>
        <p className="text-xs text-slate-500">Uploaded files and results are stored only on the analysis server and are deleted automatically after 72 hours.</p>
      </div>
    </details>
  );
}
