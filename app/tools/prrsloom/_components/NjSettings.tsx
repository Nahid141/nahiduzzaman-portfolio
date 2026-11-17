"use client";

import type { NjOptions } from "../_lib/types";
import { FileField, NumberField, Select, TextArea } from "./ui";

export const NJ_DEFAULTS: NjOptions = {
  reference_mode: "auto",
  reference_count: 0,
  reference_selection: "nearest",
  alignment: "clustalw",
  tree_method: "nj",
  distance_model: "K80",
  gap_handling: "global",
  rooting: "midpoint",
  outgroup: "",
  bootstrap: 0,
};

export type NjReferenceInputs = { file: File | null; text: string; accessions: string };

/** Segmented control: one choice from a few, shown side by side. */
function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-bold text-slate-100">{label}</legend>
      <div className="grid gap-1 rounded-2xl border border-white/10 bg-black/30 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)} title={o.hint}
            className={`rounded-xl px-2 py-2 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-cyan-300/60 ${
              value === o.value ? "bg-gradient-to-r from-cyan-400 to-sky-400 text-slate-950 shadow" : "text-slate-300 hover:bg-white/10"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

const BOOT_TIME: Record<number, string> = { 0: "off", 100: "≈ 0.5–1 min for 300 tips", 500: "≈ 3–5 min for 300 tips", 1000: "≈ 6–10 min for 300 tips" };

export function NjSettings({ value, onChange, refs, onRefs }: {
  value: NjOptions; onChange: (v: NjOptions) => void; refs: NjReferenceInputs; onRefs: (r: NjReferenceInputs) => void;
}) {
  const set = <K extends keyof NjOptions>(k: K, v: NjOptions[K]) => onChange({ ...value, [k]: v });
  const withRefs = value.reference_mode !== "none";
  const isDefault = JSON.stringify(value) === JSON.stringify(NJ_DEFAULTS);
  const nAcc = refs.accessions.split(/[\s,;]+/).filter(Boolean).length;
  return (
    <div className="space-y-4 rounded-[1.5rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-400/[0.07] via-white/[0.02] to-purple-500/[0.07] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Tree settings</p>
        <button type="button" disabled={isDefault} onClick={() => onChange(NJ_DEFAULTS)}
          className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-slate-300 transition hover:border-cyan-300/60 hover:text-cyan-200 disabled:opacity-40">
          {isDefault ? "R app defaults" : "Reset to R app defaults"}
        </button>
      </div>

      <Segmented label="Sequences in the tree" value={withRefs ? "with" : "only"}
        options={[{ value: "only", label: "Uploaded only" }, { value: "with", label: "Uploaded + references" }]}
        onChange={(v) => set("reference_mode", v === "only" ? "none" : value.reference_mode === "none" ? "auto" : value.reference_mode)} />

      {withRefs && (
        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
          <Segmented label="Reference sequences" value={value.reference_mode as "auto" | "accession" | "manual"}
            options={[
              { value: "auto", label: "Automatic", hint: "Library references of the variants detected in your sequences" },
              { value: "accession", label: "By accession", hint: "GenBank accessions or reference-library names" },
              { value: "manual", label: "Manual", hint: "Your own reference FASTA" },
            ]}
            onChange={(v) => set("reference_mode", v)} />
          {value.reference_mode === "auto" && (
            <>
              <NumberField label="References per detected variant (0 = all, as the R app)" value={value.reference_count} min={0}
                onChange={(v) => set("reference_count", Math.max(0, Math.min(500, Math.round(v || 0))))} />
              {value.reference_count > 0 && (
                <Select label="Which references" value={value.reference_selection} onChange={(v) => set("reference_selection", v as NjOptions["reference_selection"])}
                  options={[{ value: "nearest", label: "Closest to my sequences (fewest nucleotide differences)" }, { value: "recent", label: "Most recent collection dates" }]} />
              )}
              <p className="text-xs leading-5 text-slate-400">References come from the PRRSV-2 classification library (1,650 ORF5 sequences) for each variant the classifier assigns to your sequences.</p>
            </>
          )}
          {value.reference_mode === "accession" && (
            <>
              <TextArea label={`Accessions${nAcc ? ` (${nAcc})` : ""}`} rows={4} value={refs.accessions} onChange={(v) => onRefs({ ...refs, accessions: v })}
                placeholder={"AF046869\nPV956411, MN073167\nPRRSV2/USA/CO/vivid.79419/2025"} />
              <p className="text-xs leading-5 text-slate-400">GenBank accessions (up to 200) or reference-library names, separated by commas, spaces or new lines. Library matches are used directly; others are downloaded from NCBI GenBank, trimmed to ORF5 and classified.</p>
            </>
          )}
          {value.reference_mode === "manual" && (
            <>
              <FileField label="Reference FASTA" hint="Your reference sequences; full genomes are trimmed to ORF5." accept=".fasta,.fa,.fas,.fna,.txt"
                file={refs.file} onChange={(f) => onRefs({ ...refs, file: f })} />
              {!refs.file && <TextArea label="Or paste reference FASTA" rows={4} value={refs.text} onChange={(v) => onRefs({ ...refs, text: v })} placeholder={">ref_1\nATG..."} />}
            </>
          )}
        </div>
      )}

      <details className="group rounded-2xl border border-white/10 bg-black/20 p-3">
        <summary className="cursor-pointer list-none text-sm font-black text-slate-100">
          <span className="mr-2 inline-block transition group-open:rotate-90">▸</span>Phylogenetic method
          <span className="ml-2 text-xs font-semibold text-slate-400">
            {value.alignment === "mafft" ? "MAFFT" : "ClustalW"} · {value.tree_method.toUpperCase()} · {value.distance_model}{value.bootstrap ? ` · ${value.bootstrap} bootstraps` : ""}
          </span>
        </summary>
        <div className="mt-3 space-y-3">
          <Segmented label="Tree method" value={value.tree_method}
            options={[{ value: "nj", label: "Neighbor-Joining" }, { value: "bionj", label: "BIONJ" }, { value: "upgma", label: "UPGMA" }]}
            onChange={(v) => set("tree_method", v)} />
          <Select label="Nucleotide distance model" value={value.distance_model} onChange={(v) => set("distance_model", v as NjOptions["distance_model"])}
            options={[
              { value: "K80", label: "K80 · Kimura 2-parameter (R app)" },
              { value: "TN93", label: "TN93 · Tamura-Nei" },
              { value: "JC69", label: "JC69 · Jukes-Cantor" },
              { value: "raw", label: "p-distance · uncorrected proportion" },
              { value: "N", label: "N · number of nucleotide differences" },
            ]} />
          <Segmented label="Gaps and ambiguous bases" value={value.gap_handling}
            options={[{ value: "global", label: "Global deletion (R app)" }, { value: "pairwise", label: "Pairwise deletion" }]}
            onChange={(v) => set("gap_handling", v)} />
          <Select label="Bootstrap replicates" value={String(value.bootstrap)} onChange={(v) => set("bootstrap", Number(v))}
            hint={value.bootstrap ? `Clade support (%) on internal nodes; ${BOOT_TIME[value.bootstrap] ?? ""}.` : undefined}
            options={[0, 100, 500, 1000].map((n) => ({ value: String(n), label: n ? `${n} replicates` : "No bootstrap (R app)" }))} />
          {value.tree_method !== "upgma" ? (
            <>
              <Segmented label="Rooting" value={value.rooting}
                options={[{ value: "midpoint", label: "Midpoint (R app)" }, { value: "outgroup", label: "Outgroup" }, { value: "none", label: "Unrooted" }]}
                onChange={(v) => set("rooting", v)} />
              {value.rooting === "outgroup" && (
                <TextArea label="Outgroup sequence name (FASTA header or accession)" rows={1} value={value.outgroup} onChange={(v) => set("outgroup", v.trim())} placeholder="e.g. AF046869" />
              )}
            </>
          ) : <p className="text-xs text-slate-400">UPGMA trees are rooted by construction (molecular-clock assumption).</p>}
          <Segmented label="Multiple alignment" value={value.alignment}
            options={[{ value: "clustalw", label: "ClustalW (R app)" }, { value: "mafft", label: "MAFFT (faster)" }]}
            onChange={(v) => set("alignment", v)} />
        </div>
      </details>
    </div>
  );
}

/** Problems that would make the backend reject the settings. */
export function njSettingsProblem(o: NjOptions, refs: NjReferenceInputs): string | null {
  if (o.reference_mode === "accession" && !refs.accessions.trim()) return "Enter at least one reference accession, or choose another reference option.";
  if (o.reference_mode === "manual" && !refs.file && !refs.text.trim()) return "Upload or paste the reference FASTA, or choose another reference option.";
  if (o.reference_mode === "manual" && !refs.file && !refs.text.trim().startsWith(">")) return "Pasted reference FASTA must start with a header line beginning with '>'.";
  if (o.rooting === "outgroup" && o.tree_method !== "upgma" && !o.outgroup.trim()) return "Enter the outgroup sequence name, or choose midpoint rooting.";
  return null;
}
