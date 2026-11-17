"""The four PRRSLoom workflows, each a port of one Shiny app's server logic.

Each ``run_*`` function takes the job's parameters and input texts, reports
progress through ``progress(fraction, message)``, writes its downloadable
files into ``out_dir`` and returns the JSON-serialisable result payload.
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import math
import re
import zipfile
from datetime import date
from pathlib import Path
from typing import Callable

import numpy as np

from . import resources
from .analyses import classifier as clf
from .analyses import haplotypes as hap
from .analyses import msa, phylo, timer, treebuild, treeplot
from .config import settings
from .fasta import InputError, make_unique, parse_fasta, read_csv_text

Progress = Callable[[float, str], None]
TODAY = lambda: date.today().isoformat()  # noqa: E731
NO_REFERENCE_LABELS = ("undetermined", "unclassified")


# ---------------------------------------------------------------- helpers

def _r_value(v):
    if v is None:
        return "NA"
    if isinstance(v, float):
        if math.isnan(v):
            return "NA"
        if math.isinf(v):
            return "Inf" if v > 0 else "-Inf"
        return f"{v:.15g}"
    return v


def _csv_cell(v) -> str:
    """utils::write.csv style: strings quoted, numbers / NA / logicals bare."""
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return "NA"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return _r_value(v) if isinstance(v, float) else str(v)
    return '"' + str(v).replace('"', '""') + '"'


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as fh:
        fh.write(",".join(_csv_cell(c) for c in columns) + "\n")
        for r in rows:
            fh.write(",".join(_csv_cell(r.get(c)) for c in columns) + "\n")


def json_safe(obj):
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    return obj


def clean_sequence_label(x) -> str | None:
    if x is None:
        return None
    return str(x).replace("'", "").strip()


def _blank(v) -> bool:
    return v is None or str(v).strip() == "" or str(v) == "NA"


def _require_column(header: list[str], col: str | None, what: str, label: str) -> str:
    if not col:
        raise InputError(f"Select the {what} from the {label}.")
    if col not in header:
        raise InputError(f"The selected {what} was not found in the {label}.")
    return col


def _classify(names: list[str], seqs: list[str], progress: Progress, start: float) -> clf.Prediction:
    progress(start, "Loading the PRRSV-2 classifier")
    model = resources.load_model("model")
    lineage = resources.load_model("lineage_model")
    progress(start + 0.1, "Running the variant classifier")
    return clf.make_predict(model, lineage, names, seqs, seed=settings.tie_seed, threads=settings.job_threads)


def _select_references(var_target: set[str]):
    refs = resources.load_references()
    seen, target = set(), []
    for row in refs.table:
        g = (row.get("genbank.full") or "").strip()
        if row.get("var") in var_target and g and g != "NA" and row.get("genbank.full") not in seen:
            seen.add(row.get("genbank.full"))
            target.append(row)
    wanted = {(r["genbank.full"] or "").strip() for r in target}
    seqs = [(n, s) for n, s in refs.fasta if n.strip() in wanted]
    unique = make_unique([n for n, _ in seqs], sep=".")
    return target, [(u, n, s) for u, (n, s) in zip(unique, seqs)]  # (short_name, original_name, seq)


def _zip_bundle(out_dir: Path, name: str) -> str:
    bundle = out_dir / name
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(out_dir.iterdir()):
            if f.is_file() and f.name != name:
                zf.write(f, arcname=f.name)
    return bundle.name


def _provenance() -> dict:
    return {"classifier_resources": resources.provenance(), "tie_seed": settings.tie_seed}


# ---------------------------------------------------------------- NJ Tree Builder

NJ_DEFAULTS = {
    "reference_mode": "auto",          # none | auto | accession | manual
    "reference_count": 0,              # auto: references per detected variant (0 = all, as the R app)
    "reference_selection": "nearest",  # auto with a count: nearest | recent
    "alignment": "clustalw",           # clustalw (R app) | mafft
    "tree_method": "nj",               # nj (R app) | bionj | upgma
    "distance_model": "K80",           # K80 (R app) | JC69 | TN93 | raw | N
    "gap_handling": "global",          # global (R app) | pairwise
    "rooting": "midpoint",             # midpoint (R app) | outgroup | none
    "outgroup": "",
    "bootstrap": 0,                    # replicates, 0 = off
    "gamma": 0,                        # gamma shape alpha for rate variation among sites, 0 = equal rates
    "fresh_alignment": False,          # True: never reuse a stored alignment of identical input
}
MAX_BOOTSTRAP = 1000
MAX_ACCESSIONS = 200
MODEL_LABEL = {"K80": "K80 (Kimura 2-parameter)", "JC69": "JC69 (Jukes-Cantor)", "TN93": "TN93 (Tamura-Nei)",
               "raw": "uncorrected p", "N": "nucleotide-difference (count)", "T92": "T92 (Tamura 1992)"}
METHOD_LABEL = {"nj": "Neighbor-Joining", "bionj": "BIONJ", "upgma": "UPGMA"}
NJ_CHOICES = {"reference_mode": ("none", "auto", "accession", "manual"), "reference_selection": ("nearest", "recent"),
              "alignment": ("clustalw", "mafft"), "tree_method": treebuild.METHODS, "distance_model": treebuild.MODELS,
              "gap_handling": treebuild.DELETION, "rooting": treebuild.ROOTING}


def nj_options(params: dict) -> dict:
    """Validated tree options; anything not given keeps the R app's behaviour."""
    o = {}
    for k, default in NJ_DEFAULTS.items():
        v = params.get(k)
        o[k] = default if v is None or (v == "" and k != "outgroup") else v
    for k, allowed in NJ_CHOICES.items():
        if o[k] not in allowed:
            raise InputError(f"Unknown {k.replace('_', ' ')} '{o[k]}'. Choose one of: {', '.join(allowed)}.")
    for k, hi in (("reference_count", 500), ("bootstrap", MAX_BOOTSTRAP)):
        try:
            o[k] = int(o[k])
        except (TypeError, ValueError):
            raise InputError(f"{k.replace('_', ' ').capitalize()} must be a whole number.") from None
        if not 0 <= o[k] <= hi:
            raise InputError(f"{k.replace('_', ' ').capitalize()} must be between 0 and {hi}.")
    try:
        o["gamma"] = float(o["gamma"] or 0)
    except (TypeError, ValueError):
        raise InputError("Gamma shape (alpha) must be a number; 0 means equal rates among sites.") from None
    if o["gamma"] and not 0.05 <= o["gamma"] <= 100:
        raise InputError("Gamma shape (alpha) must be between 0.05 and 100 (0 = equal rates among sites).")
    if o["gamma"] and o["distance_model"] in ("raw", "N"):
        raise InputError("Gamma rate variation applies to the JC69, K80, T92 and TN93 models, not to p or N distances.")
    o["fresh_alignment"] = o["fresh_alignment"] in (True, 1, "1", "true", "True")
    o["outgroup"] = clean_sequence_label(o["outgroup"]) or ""
    if o["rooting"] == "outgroup" and o["tree_method"] != "upgma" and not o["outgroup"]:
        raise InputError("Enter the sequence name to use as the outgroup, or choose midpoint rooting.")
    return o


ACCESSION_RE = re.compile(r"^[A-Za-z]{1,6}_?\d{5,9}(\.\d+)?$")


def parse_accessions(text: str) -> list[str]:
    out: list[str] = []
    for tok in re.split(r"[\s,;]+", text or ""):
        tok = tok.strip().strip("\"'")
        if tok and tok not in out:
            out.append(tok)
    if len(out) > MAX_ACCESSIONS:
        raise InputError(f"At most {MAX_ACCESSIONS} reference accessions can be requested ({len(out)} given).")
    return out


def fetch_genbank(accessions: list[str], timeout: int = 60) -> dict[str, tuple[str, str]]:
    """NCBI nuccore FASTA for GenBank accessions -> {ACCESSION (no version): (header, sequence)}."""
    import urllib.parse
    import urllib.request

    from .fasta import read_fasta_text

    out: dict[str, tuple[str, str]] = {}
    for k in range(0, len(accessions), 100):
        body = urllib.parse.urlencode({"db": "nuccore", "id": ",".join(accessions[k:k + 100]), "rettype": "fasta",
                                       "retmode": "text", "tool": "PRRSLooM"}).encode()
        req = urllib.request.Request("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi", data=body,
                                     headers={"User-Agent": "PRRSLooM/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", "replace")
        for header, seq in read_fasta_text(text):
            out[header.split()[0].split(".")[0].upper()] = (header, seq)
    return out


def _library_rows() -> list[tuple[dict, str]]:
    """Reference library rows with a sequence (the R app's selection: genbank.full present,
    first row per name), in table order."""
    refs = resources.load_references()
    by_name: dict[str, str] = {}
    for n, sq in refs.fasta:
        by_name.setdefault(n.strip(), sq)
    seen, rows = set(), []
    for row in refs.table:
        g = (row.get("genbank.full") or "").strip()
        if g and g != "NA" and g in by_name and g not in seen:
            seen.add(g)
            rows.append((row, by_name[g]))
    return rows


def _nearest_first(cands: list[tuple[dict, str]], user_seqs: list[str]) -> list[tuple[dict, str]]:
    """Library references ordered by p-distance (603-nt ORF5 frame) to their closest user sequence."""
    if not cands or not user_seqs:
        return cands
    frame = lambda s: phylo.to_dnabin(s[:603].ljust(603, "-"))  # noqa: E731
    users = np.vstack([frame(clf.realign_to_reference(s)) for s in user_seqs])
    refs = np.vstack([frame(sq) for _, sq in cands])
    kr = (refs & 8) != 0
    best = np.full(len(cands), np.inf)
    for u in users:
        both = kr & ((u & 8) != 0)
        d = ((refs != u) & both).sum(axis=1) / np.maximum(both.sum(axis=1), 1)
        best = np.minimum(best, d)
    return [cands[i] for i in sorted(range(len(cands)), key=lambda i: (best[i], i))]


def _date_key(row: dict) -> float:
    try:
        return -float(row.get("date") or row.get("year") or 0)
    except ValueError:
        return 0.0


def _reference_set(o: dict, var_target: set[str], user_by_var: dict[str, list[str]], inputs: dict,
                   progress: Progress) -> tuple[list[tuple[str, str]], dict[str, dict], list[str], str]:
    """Reference sequences for the tree: (name, sequence) records, metadata by cleaned name,
    warnings and a status line."""
    warnings: list[str] = []
    mode = o["reference_mode"]
    if mode == "none":
        return [], {}, warnings, "Tree built with the uploaded sequences only (no reference sequences requested)."

    if mode == "auto":
        # the R app's selection and order (reference FASTA order); with a count, keep the
        # closest / most recent N of each variant, still in that order
        target, ref_seqs = _select_references(var_target)
        row_by_name = {(r.get("genbank.full") or "").strip(): r for r in target}
        if o["reference_count"]:
            keep: set[int] = set()
            for var in sorted(var_target, key=str):
                cands = [(k, row_by_name.get(orig.strip(), {})) for k, (_, orig, _) in enumerate(ref_seqs)
                         if row_by_name.get(orig.strip(), {}).get("var") == var]
                if len(cands) > o["reference_count"]:
                    if o["reference_selection"] == "recent":
                        cands = sorted(cands, key=lambda c: _date_key(c[1]))
                    else:
                        order = _nearest_first([(c, ref_seqs[c[0]][2]) for c in cands], user_by_var.get(var, []))
                        cands = [c for c, _ in order]
                keep.update(k for k, _ in cands[: o["reference_count"]])
            ref_seqs = [r for k, r in enumerate(ref_seqs) if k in keep]
        if not ref_seqs:
            return [], {}, warnings, "No reference sequences were found. The tree was built using only user sequences."
        meta = {clean_sequence_label(short): {"assign.final": row_by_name.get(orig.strip(), {}).get("var")}
                for short, orig, _ in ref_seqs}
        how = ("all library references of each detected variant" if not o["reference_count"] else
               f"up to {o['reference_count']} {'closest' if o['reference_selection'] == 'nearest' else 'most recent'} "
               "library references per detected variant")
        progress(1.0, f"{len(ref_seqs)} library references selected ({how})")
        status = ("References found and included in the tree." if not o["reference_count"]
                  else f"References included in the tree: {how}.")
        return [(short, sq) for short, _, sq in ref_seqs], meta, warnings, status

    if mode == "accession":
        wanted = parse_accessions(inputs.get("reference_accessions", ""))
        if not wanted:
            raise InputError("Enter at least one reference accession (GenBank accession or reference library name).")
        by_key: dict[str, tuple[dict, str]] = {}
        for r, sq in _library_rows():
            for key in (r.get("accession"), r.get("genbank.full")):
                if not _blank(key):
                    by_key.setdefault(str(key).strip().upper(), (r, sq))
        records, meta, missing = [], {}, []
        for acc in wanted:
            hit = by_key.get(acc.upper()) or by_key.get(acc.split(".")[0].upper())
            if hit:
                records.append((acc, hit[1]))
                meta[clean_sequence_label(acc)] = {"assign.final": hit[0].get("var")}
            else:
                missing.append(acc)
        progress(0.3, f"{len(records)} accession(s) found in the PRRSV-2 reference library")
        if missing:
            bad = [a for a in missing if not ACCESSION_RE.match(a)]
            if bad:
                raise InputError("Not found in the reference library and not valid GenBank accessions: " + ", ".join(bad[:20]))
            progress(0.4, f"Downloading {len(missing)} reference sequence(s) from NCBI GenBank")
            try:
                fetched = fetch_genbank(missing)
            except Exception as exc:  # network or NCBI outage
                raise InputError(f"NCBI GenBank could not be reached to download {', '.join(missing[:10])}: {exc}") from None
            for acc in missing:
                hit = fetched.get(acc.split(".")[0].upper())
                if hit:
                    records.append((acc, hit[1]))
                    meta[clean_sequence_label(acc)] = {"assign.final": None}
                else:
                    warnings.append(f"Accession {acc} was not found in GenBank and was skipped.")
            progress(1.0, f"Downloaded {sum(1 for a in missing if a.split('.')[0].upper() in fetched)} of {len(missing)} from GenBank")
        return records, meta, warnings, f"{len(records)} of {len(wanted)} requested reference accessions included in the tree."

    text = inputs.get("references", "")  # manual
    if not text.strip():
        raise InputError("Upload or paste the reference sequences (FASTA) for manual reference selection.")
    records = parse_fasta(text)
    progress(1.0, f"{len(records)} user-supplied reference sequences")
    return (records, {clean_sequence_label(n): {"assign.final": None} for n, _ in records}, warnings,
            f"{len(records)} user-supplied reference sequence(s) included in the tree.")


def _read_nj_metadata(params: dict, inputs: dict):
    """(annotation column values by label or None, all metadata columns by label, columns, title)."""
    if not inputs.get("metadata"):
        return None, {}, [], None
    header, rows = read_csv_text(inputs["metadata"], "metadata CSV")
    id_col = _require_column(header, params.get("metadata_id_col"), "sequence ID column", "metadata CSV")
    ann_col = params.get("metadata_annotation_col") or None
    if ann_col:
        _require_column(header, ann_col, "annotation column", "metadata CSV")
    columns = [c for c in header if c != id_col][:30]
    single: dict[str, str] = {}
    full: dict[str, dict] = {}
    for r in rows:
        label = clean_sequence_label(r.get(id_col))
        if _blank(label) or label in full:
            continue
        full[label] = {c: ("not_provided" if _blank(r.get(c)) else str(r.get(c)).strip()) for c in columns}
        if ann_col:
            value = (r.get(ann_col) or "").strip()
            single[label] = value if value and value != "NA" else "not_provided"
    return (single if ann_col else None), full, columns, ann_col


def run_nj_tree(params: dict, inputs: dict, out_dir: Path, progress: Progress) -> dict:
    o = nj_options(params)
    records = parse_fasta(inputs.get("fasta", ""))
    user_meta, user_meta_all, meta_columns, annotation_title = _read_nj_metadata(params, inputs)

    progress(0.01, f"Read {len(records)} sequences "
                   f"({min(len(s) for _, s in records):,}-{max(len(s) for _, s in records):,} nt)")
    rooted = "UPGMA (rooted)" if o["tree_method"] == "upgma" else o["rooting"] + (f" ({o['outgroup']})" if o["rooting"] == "outgroup" else "")
    progress(0.01, "Options: " + "; ".join([
        f"references {o['reference_mode']}" + (f" ({o['reference_count']} per variant, {o['reference_selection']})"
                                                if o["reference_mode"] == "auto" and o["reference_count"] else ""),
        f"alignment {o['alignment']}" + (" (fresh, no stored result)" if o["fresh_alignment"] else ""),
        METHOD_LABEL[o["tree_method"]], f"distance {o['distance_model']}" + (f"+G(alpha={o['gamma']:g})" if o["gamma"] else ""),
        f"{o['gap_handling']} deletion", f"rooting {rooted}", f"bootstrap {o['bootstrap'] or 'off'}"]))
    n_uploaded = len(records)
    records, screening = screen_orf5(records, _stage(progress, 0.01, 0.06))
    warnings: list[str] = []
    if screening["applied"]:
        warnings.append(screening["summary"])
    reused: list[str] = []
    use_cache = not o["fresh_alignment"]
    if o["alignment"] == "clustalw":
        aligner, run_aligner = "ClustalW", msa.clustalw
    else:
        aligner, run_aligner = "MAFFT", msa.mafft

    def align(recs, progress):
        def watch(frac, msg):
            if "reused" in msg:
                reused.append(msg)
            progress(frac, msg)
        return run_aligner(recs, progress=watch, use_cache=use_cache)

    progress(0.06, f"Aligning {len(records)} user sequences ({aligner})")
    aligned_user = align(records, progress=_stage(progress, 0.06, 0.24))
    pred = _classify([n for n, _ in aligned_user], [s for _, s in aligned_user], progress, 0.24)
    out_rows = pred.rows

    progress(0.35, "Selecting reference sequences")
    var_target = {r["assign.final"] for r in out_rows if r["assign.final"] not in (None, "undetermined")}
    user_by_var: dict[str, list[str]] = {}
    seq_of = dict(records)
    for r in out_rows:
        if r["SequenceName"] in seq_of:
            user_by_var.setdefault(r["assign.final"], []).append(seq_of[r["SequenceName"]])
    ref_records, ref_meta, ref_warn, reference_status = _reference_set(
        o, var_target, user_by_var, inputs, _stage(progress, 0.35, 0.38))
    warnings += ref_warn
    ref_rows: list[dict] = []
    if ref_records and o["reference_mode"] in ("accession", "manual"):
        ref_records, ref_screen = screen_orf5(ref_records, _stage(progress, 0.38, 0.39))
        if ref_screen["applied"] and (ref_screen["trimmed"] or ref_screen["excluded"]):
            warnings.append("References: " + ref_screen["summary"].replace(" Details: input_screening.csv.", "")
                            .replace(" uploaded sequences", " reference sequences").replace("used as uploaded", "used as given"))
        unlabeled = [n for n, _ in ref_records if not ref_meta.get(clean_sequence_label(n), {}).get("assign.final")]
        if unlabeled:
            progress(0.39, f"Classifying {len(unlabeled)} reference sequence(s) without a library label")
            by = dict(ref_records)
            rp = _classify(unlabeled, [by[n] for n in unlabeled], lambda f, m: None, 0.0)
            for r in rp.rows:
                ref_meta.setdefault(clean_sequence_label(r["SequenceName"]), {})["assign.final"] = r["assign.final"]
                ref_rows.append(r)
    user_set = {n for n, _ in records}
    renamed = []
    for k, (n, sq) in enumerate(ref_records):
        if n in user_set:  # a reference with the same name as an uploaded sequence
            ref_meta[clean_sequence_label(f"{n}_ref")] = ref_meta.get(clean_sequence_label(n), {})
            ref_records[k] = (f"{n}_ref", sq)
            renamed.append(n)
    if renamed:
        warnings.append("References sharing a name with an uploaded sequence were renamed with '_ref': " + ", ".join(renamed[:20]))
    all_records = records + ref_records
    if o["reference_mode"] != "none" and not ref_records:
        reference_status = "No reference sequences were found. The tree was built using only user sequences."

    progress(0.40, f"{len(ref_records)} reference sequences for {len(var_target)} variant(s); "
                   f"aligning {len(all_records)} sequences ({aligner})")
    aligned_all = align(all_records, progress=_stage(progress, 0.40, 0.82))
    names = [n for n, _ in aligned_all]
    if len(names) < 3:
        raise InputError("cannot build a tree with less than 3 observations (user and reference sequences combined). "
                         "Upload more sequences or include reference sequences.")
    progress(0.82, f"Computing {MODEL_LABEL[o['distance_model']]}{' + gamma' if o['gamma'] else ''} distances ({o['gap_handling']} deletion) "
                   f"for {len(names)} sequences")
    dist, names, removed, sites, kept_seqs = _distances_defined(names, [s for _, s in aligned_all], o, progress)
    if removed:
        warnings.append(f"{len(removed)} sequence(s) were left out of the tree because their {o['distance_model']} "
                        "distance to other sequences is undefined (too little shared, gap-free alignment or "
                        "saturated divergence): " + ", ".join(removed[:25]) + (" …" if len(removed) > 25 else ""))
    progress(0.84, f"Building the {METHOD_LABEL[o['tree_method']]} tree ({len(names)} tips, {sites:,} sites), rooting: {rooted}")
    tree = treebuild.build(dist, names, o["tree_method"])
    outgroup = None
    if o["rooting"] == "outgroup" and o["tree_method"] != "upgma":
        outgroup = next((n for n in names if clean_sequence_label(n) == o["outgroup"]), None)
        if outgroup is None:
            raise InputError(f"The outgroup '{o['outgroup']}' is not one of the sequences in the tree.")
    tree = treebuild.root(tree, names, o["rooting"], outgroup, o["tree_method"])
    if o["bootstrap"]:
        progress(0.85, f"Bootstrap: {o['bootstrap']:,} replicates of {o['distance_model']} + {METHOD_LABEL[o['tree_method']]}")
        step = max(1, o["bootstrap"] // 20)

        def boot_progress(done: int, total: int):
            if done % step == 0 or done == total:
                progress(0.85 + 0.09 * done / total, f"Bootstrap replicate {done:,} / {total:,}")

        support = treebuild.bootstrap_support(tree, phylo.dnabin_matrix(kept_seqs), names, o["bootstrap"],
                                              o["distance_model"], o["gap_handling"], o["tree_method"],
                                              seed=settings.tie_seed, threads=settings.job_threads,
                                              gamma=o["gamma"] or None, progress=boot_progress)
        treebuild.label_support(tree, support)
        vals = list(support.values())
        if vals:
            progress(0.94, f"Bootstrap done: median clade support {float(np.median(vals)):.0f}%, "
                           f"{sum(v >= 70 for v in vals)} of {len(vals)} clades with at least 70%")
    for t in tree.tips():
        t.name = clean_sequence_label(t.name)

    # prepare_meta_data()
    user_labels = {clean_sequence_label(n) for n in user_set}
    meta: dict[str, dict] = {}
    for r in out_rows:
        label = clean_sequence_label(r["SequenceName"])
        if label not in meta:
            af = r["assign.final"]
            meta[label] = {"assign.final": af, "sub_lineage": af[:2] if af else None}
    for label, m in ref_meta.items():
        if label not in meta:
            v = None if _blank(m.get("assign.final")) else m.get("assign.final")
            meta[label] = {"assign.final": v, "sub_lineage": v[:2] if v else None}
    tip_data = {}
    for t in tree.tips():
        m = dict(meta.get(t.name, {}))
        m["assign.final"] = m.get("assign.final") or "not_annotated"
        m["sub_lineage"] = m.get("sub_lineage") or "not_annotated"
        if user_meta is not None:
            m["extra"] = user_meta.get(t.name, "not_provided")
        source = "Uploaded" if t.name in user_labels else "Reference"
        row = user_meta_all.get(t.name)
        m["meta"] = {"Source": source, **{c: (row[c] if row else "reference" if source == "Reference" else "not_provided")
                                          for c in meta_columns}}
        tip_data[t.name] = m

    progress(0.95, f"Drawing the annotated tree ({len(names)} tips)")
    lay = treeplot.layout(tree, tip_data, annotation_title, meta_columns=["Source", *meta_columns])
    lay["internal_support"] = bool(o["bootstrap"])
    png = f"PRRSLoom_NJ_Tree_Builder_{TODAY()}.png"
    treeplot.render_png(lay, str(out_dir / png))
    cls_csv = "classification_table.csv"
    cls_cols = ["SequenceName", "assign.final", "assign.top", "prob.top", "assign.2", "prob.2", "num.gaps.amb"]
    write_csv(out_dir / cls_csv, out_rows, cls_cols)
    slug = {"nj": "NJ", "bionj": "BIONJ", "upgma": "UPGMA"}[o["tree_method"]]
    nwk = f"{slug.lower()}_tree.nwk"
    (out_dir / nwk).write_text(phylo.to_newick(tree))
    root_word = ("Rooted" if o["tree_method"] == "upgma" else {"midpoint": "Midpoint-rooted", "outgroup": "Outgroup-rooted",
                                                               "none": "Unrooted"}[o["rooting"]])
    files = [
        {"id": png, "label": "Annotated tree (PNG, 300 dpi)", "kind": "figure"},
        {"id": cls_csv, "label": "Classification table (CSV)", "kind": "table"},
        {"id": nwk, "label": f"{root_word} {slug} tree{' with bootstrap support' if o['bootstrap'] else ''} (Newick)", "kind": "tree"},
    ]
    if ref_rows:
        write_csv(out_dir / "reference_classification.csv", ref_rows, cls_cols)
        files.append({"id": "reference_classification.csv", "label": "Reference classification (CSV)", "kind": "table"})
    labels = [clean_sequence_label(n) for n in names]
    (out_dir / "alignment.fasta").write_text("".join(f">{lab}\n{sq}\n" for lab, sq in zip(labels, kept_seqs)))
    files.append({"id": "alignment.fasta", "label": f"Multiple alignment ({aligner}, FASTA)", "kind": "alignment"})
    _write_matrix(out_dir / "distance_matrix.csv", labels, dist)
    files.append({"id": "distance_matrix.csv", "label": f"Distance matrix ({MODEL_LABEL[o['distance_model']]}, CSV)", "kind": "table"})
    if o["distance_model"] != "N":
        _write_matrix(out_dir / "nt_differences.csv", labels,
                      treebuild.distance(phylo.dnabin_matrix(kept_seqs), "N", "pairwise"))
        files.append({"id": "nt_differences.csv", "label": "Pairwise nucleotide differences (CSV)", "kind": "table"})
    if screening["applied"]:
        write_csv(out_dir / "input_screening.csv", screening["rows"], SCREENING_COLUMNS)
        files.append({"id": "input_screening.csv", "label": "ORF5 input screening (CSV)", "kind": "table"})
    progress(0.99, "Packaging results")
    bundle = _zip_bundle(out_dir, "prrsloom_nj_tree_results.zip")
    files.append({"id": bundle, "label": "All results (ZIP)", "kind": "bundle"})
    return {
        "module": "nj_tree",
        "reference_status": reference_status,
        "n_uploaded_sequences": n_uploaded,
        "n_user_sequences": len(records),
        "n_reference_sequences": len(ref_records),
        "classification": out_rows,
        "tree": lay,
        "warnings": warnings + _classifier_warnings(pred),
        "input_screening": {k: screening[k] for k in ("applied", "kept", "trimmed", "excluded")},
        "options": {**o, "alignment_sites": sites, "method_label": METHOD_LABEL[o["tree_method"]],
                    "model_label": MODEL_LABEL[o["distance_model"]] + (f" + Γ (α = {o['gamma']:g})" if o["gamma"] else ""),
                    "alignment_reused": bool(reused)},
        "files": files,
        "provenance": _provenance(),
    }


def _write_matrix(path: Path, labels: list[str], d: np.ndarray) -> None:
    buf = io.StringIO()
    buf.write(",".join(_csv_cell(x) for x in ["", *labels]) + "\n")
    for lab, row in zip(labels, d):
        buf.write(_csv_cell(lab) + "," + ",".join(f"{v:.6g}" if np.isfinite(v) else "NA" for v in row) + "\n")
    path.write_text(buf.getvalue())


# ---------------------------------------------------------------- NJ input screening

ORF5_LIKE_LENGTH = (590, 620)   # raw ORF5 lengths (603 nt PRRSV-2, 606 nt PRRSV-1, small indels)
ORF5_MIN_COVERAGE = 300         # reference positions (of 603) the sequence must cover
ORF5_MIN_IDENTITY = 0.50        # to the PRRSV-2 ORF5 reference; non-ORF5 regions score 0.26-0.41
SCREENING_COLUMNS = ["SequenceName", "input_length", "orf5_coverage", "orf5_identity", "action", "used_length", "reason"]


def screen_orf5(records: list[tuple[str, str]], progress: Progress) -> tuple[list[tuple[str, str]], dict]:
    """Keep the R app's input unchanged when every sequence is an ORF5 sequence; otherwise trim
    longer sequences (genomes, flanked ORF5) to their ORF5 region and exclude sequences that do
    not contain ORF5, so ClustalW and K80 compare homologous ORF5 sites only.

    The ORF5 region and checks come from the classifier's own alignment to the 603-nt
    reference (global-local, match 1 / mismatch -3, gap 25 + 15k).
    """
    progress(0.0, f"Screening {len(records)} sequences for the ORF5 region")
    from concurrent.futures import ThreadPoolExecutor

    seqs = [s for _, s in records]
    if settings.job_threads > 1 and len(seqs) > 1:
        with ThreadPoolExecutor(max_workers=settings.job_threads, thread_name_prefix="orf5") as pool:
            regions = list(pool.map(clf.orf5_region, seqs))
    else:
        regions = [clf.orf5_region(s) for s in seqs]
    rows, kept = [], []
    all_orf5 = all(ORF5_LIKE_LENGTH[0] <= len(s) <= ORF5_LIKE_LENGTH[1] for s in seqs)
    for (name, seq), reg in zip(records, regions):
        ok = reg.coverage >= ORF5_MIN_COVERAGE and reg.identity >= ORF5_MIN_IDENTITY
        row = {"SequenceName": name, "input_length": len(seq), "orf5_coverage": reg.coverage,
               "orf5_identity": round(reg.identity, 3)}
        if not ok:
            reason = (f"covers only {reg.coverage} of 603 ORF5 positions" if reg.coverage < ORF5_MIN_COVERAGE
                      else f"identity {reg.identity:.2f} to the ORF5 reference (chance level); no ORF5 region found")
            rows.append({**row, "action": "excluded", "used_length": 0, "reason": reason})
        elif ORF5_LIKE_LENGTH[0] <= len(seq) <= ORF5_LIKE_LENGTH[1]:
            rows.append({**row, "action": "kept", "used_length": len(seq), "reason": "ORF5-length sequence"})
            kept.append((name, seq))
        else:
            region = seq[reg.start:reg.end]
            rows.append({**row, "action": "trimmed", "used_length": len(region),
                         "reason": f"ORF5 region extracted (positions {reg.start + 1}-{reg.end})"})
            kept.append((name, region))
    counts = {a: sum(r["action"] == a for r in rows) for a in ("kept", "trimmed", "excluded")}
    applied = not (all_orf5 and counts["excluded"] == 0)
    if not applied:  # pure ORF5 input: exactly the R app's pipeline
        progress(1.0, f"All {len(records)} sequences are ORF5 sequences; no screening changes")
        return records, {"applied": False, "rows": rows, **counts, "summary": ""}
    excluded = [r["SequenceName"] for r in rows if r["action"] == "excluded"]
    summary = (f"The NJ Tree Builder compares ORF5 sequences. Of {len(records)} uploaded sequences, "
               f"{counts['kept']} were used as uploaded, {counts['trimmed']} longer sequences (e.g. full genomes) "
               f"were trimmed to their ORF5 region, and {counts['excluded']} without an ORF5 region were left out"
               + (": " + ", ".join(excluded[:25]) + (" …" if len(excluded) > 25 else "") if excluded else "")
               + ". Details: input_screening.csv.")
    progress(1.0, f"ORF5 screening: {counts['kept']} kept, {counts['trimmed']} trimmed to ORF5, {counts['excluded']} excluded")
    if len(kept) < 1:
        raise InputError("None of the uploaded sequences contains the PRRSV ORF5 region, which the NJ Tree Builder requires.")
    return kept, {"applied": True, "rows": rows, **counts, "summary": summary}


def _stage(progress: Progress, lo: float, hi: float) -> Progress:
    """Map a sub-step's own 0-1 progress onto [lo, hi] of the job."""
    return lambda frac, msg: progress(lo + (hi - lo) * max(0.0, min(1.0, frac)), msg)


def _distances_defined(names: list[str], seqs: list[str], o: dict, progress: Progress):
    """Distances under the chosen model and gap handling (the R app: K80, global deletion). If
    some are undefined, remove the sequence involved in most undefined distances and recompute,
    until all are defined. Returns (dist, names, removed, comparable sites, sequences)."""
    names, seqs, removed = list(names), list(seqs), []
    model, deletion, gamma = o.get("distance_model", "K80"), o.get("gap_handling", "global"), o.get("gamma") or None
    while True:
        if len(names) < 3:
            raise InputError(f"Fewer than 3 sequences remain with defined {model} distances; a tree cannot be built. "
                             "Removed: " + ", ".join(removed))
        try:
            dist = treebuild.compute(seqs, model, deletion, gamma)
        except ValueError:  # no alignment column is free of gaps/ambiguity in every sequence
            x = phylo.dnabin_matrix(seqs)
            k = int(((x & 8) == 0).sum(axis=1).argmax())
        else:
            bad = ~np.isfinite(dist)
            if not bad.any():
                known = (phylo.dnabin_matrix(seqs) & 8) != 0
                sites = known.all(axis=0).sum() if deletion == "global" else known.any(axis=0).sum()
                return dist, names, removed, int(sites), seqs
            k = int(bad.sum(axis=1).argmax())
        progress(0.82, f"{model} distance undefined for {names[k]}; leaving it out of the tree")
        removed.append(names.pop(k))
        seqs.pop(k)


def _classifier_warnings(pred: clf.Prediction) -> list[str]:
    w = []
    if pred.ties:
        w.append("Random-forest vote ties were broken with a fixed seed (R breaks them at random): " + ", ".join(pred.ties))
    if pred.dropped:
        w.append("Sequences excluded by the classifier because they could not be normalised to 603 nt: " + ", ".join(pred.dropped))
    return w


# ---------------------------------------------------------------- Tree Labeling

def run_tree_label(params: dict, inputs: dict, out_dir: Path, progress: Progress) -> dict:
    tree_text = inputs.get("tree", "")
    tree_name = (params.get("tree_filename") or "").lower()
    ext = tree_name.rsplit(".", 1)[-1] if "." in tree_name else ""
    if not tree_text.strip():
        raise InputError("Upload a tree file.")
    if not inputs.get("metadata"):
        raise InputError("Upload the PRRSLoom classification CSV.")
    progress(0.1, "Reading the tree")
    if ext in ("nwk", "tree", "tre"):
        tree = phylo.parse_newick(tree_text)
    elif ext in ("nex", "nexus"):
        tree = phylo.parse_nexus(tree_text)
    else:
        raise InputError("Format not supported! Use .tre, .tree, .nwk, .nex or .nexus.")
    tips = tree.tips()
    if len(tips) > settings.max_tree_tips:
        raise InputError(f"The tree has {len(tips)} tips; the limit is {settings.max_tree_tips}.")
    for t in tips:
        t.name = (t.name or "").replace("'", "")

    header, rows = read_csv_text(inputs["metadata"], "metadata CSV")
    missing = [c for c in ("SequenceName", "assign.final") if c not in header]
    if missing:
        raise InputError("The metadata CSV is missing required column(s): " + ", ".join(missing))
    extra = params.get("extra_annotation_col") or None
    if extra and extra not in header:
        extra = None

    def clean(v):
        return "Not provided" if v is None or str(v).strip() == "" or str(v) == "NA" else str(v)

    meta_rows, seen = [], set()
    for r in rows:
        label = clean(r.get("SequenceName"))
        if label in seen:
            continue
        seen.add(label)
        af = clean(r.get("assign.final"))
        m = {"label": label, "assign.final": af, "sub_lineage": af[:2]}
        if extra:
            m["extra"] = clean(r.get(extra))
        meta_rows.append(m)
    by_label = {m["label"]: m for m in meta_rows}
    tip_data = {t.name: by_label[t.name] for t in tips if t.name in by_label}
    matched = len(tip_data)
    progress(0.6, "Drawing the labeled tree")
    lay = treeplot.layout(tree, tip_data, extra, palette_rows=meta_rows)
    png = f"PRRSLoom_Tree_Labeling_{TODAY()}.png"
    treeplot.render_png(lay, str(out_dir / png))
    bundle = _zip_bundle(out_dir, "prrsloom_tree_labeling_results.zip")
    warnings = []
    if matched < len(tips):
        unmatched = [t.name for t in tips if t.name not in by_label]
        warnings.append(f"{len(unmatched)} of {len(tips)} tip labels have no matching SequenceName in the CSV and are drawn in grey: "
                        + ", ".join(unmatched[:20]) + (" …" if len(unmatched) > 20 else ""))
    return {
        "module": "tree_label",
        "n_tips": len(tips),
        "n_matched": matched,
        "tree": lay,
        "warnings": warnings,
        "files": [
            {"id": png, "label": "Labeled tree (PNG, 300 dpi)", "kind": "figure"},
            {"id": bundle, "label": "All results (ZIP)", "kind": "bundle"},
        ],
    }


# ---------------------------------------------------------------- TIMER

AUDIT_COLUMNS = [
    "pair_id", "pair_label", "sequence_1", "sequence_2", "differences_observed", "comparable_sites",
    "pct_identity_comparable_sites", "time_interval_years", "expected_mutations_mean",
    "expected_mutations_low_rate", "expected_mutations_high_rate", "poisson_lower_expected",
    "poisson_upper_expected", "probability_observed", "relative_poisson_probability", "two_sided_tail_score",
    "lower_tail_probability", "upper_tail_probability", "poisson_compatibility_score",
    "mutation_timing_category", "poisson_status", "final_interpretation", "mean_substitution_rate",
    "lower_substitution_rate", "upper_substitution_rate",
]


def run_timer(params: dict, inputs: dict, out_dir: Path, progress: Progress) -> dict:
    mode = params.get("mode", "fasta")
    if mode == "fasta":
        records = parse_fasta(inputs.get("fasta", ""), min_sequences=2, max_sequences=settings.max_timer_sequences)
        names = []
        for k, (n, _) in enumerate(records):
            n = n.strip()
            names.append(n if n else f"Sequence_{k + 1}")
        dup = sorted({n for n in names if names.count(n) > 1})
        if dup:
            raise InputError("Sequence names must be unique. Duplicated names: " + ", ".join(dup))
        if not inputs.get("metadata"):
            raise InputError("Sequence mode requires metadata with sequence IDs and collection dates.")
        header, rows = read_csv_text(inputs["metadata"], "collection date CSV")
        id_col = _require_column(header, params.get("metadata_id_col"), "sequence ID column", "collection date CSV")
        date_col = _require_column(header, params.get("metadata_date_col"), "collection date/year column", "collection date CSV")
        blanks = [r.get(id_col, "") for r in rows if _blank(r.get(date_col))]
        if blanks:
            raise InputError("The collection date column has empty values (rows: " + ", ".join(b or "?" for b in blanks[:10])
                             + "). The TIMER app cannot evaluate files with missing dates; fill or remove those rows.")
        lookup: dict[str, float] = {}
        for r in rows:
            sid = r.get(id_col)
            if _blank(sid) or sid in lookup:
                continue
            lookup[sid] = timer.parse_decimal_year(r.get(date_col))
        progress(0.1, "Aligning sequence pairs")
        results = timer.results_from_sequences(
            names, [s for _, s in records], lookup,
            progress=lambda d, t: progress(0.1 + 0.8 * d / t, f"Aligned {d} of {t} pairs"),
            threads=settings.job_threads)
        columns = AUDIT_COLUMNS + ["gaps_ignored", "ambiguous_sites_ignored", "alignment_length"]
    elif mode == "pairwise":
        header, rows = read_csv_text(inputs.get("pairwise", ""), "pairwise comparison CSV")
        s1 = _require_column(header, params.get("table_seq1_col"), "sequence 1 column", "pairwise comparison CSV")
        s2 = _require_column(header, params.get("table_seq2_col"), "sequence 2 column", "pairwise comparison CSV")
        interval = _require_column(header, params.get("table_interval_col"), "elapsed time column", "pairwise comparison CSV")
        opt = {}
        for key in ("table_identity_col", "table_difference_col", "table_comparable_col"):
            v = params.get(key)
            opt[key] = v if v and v != "None" and v in header else None
        try:
            sites = float(params.get("default_comparable_sites", timer.DEFAULT_ORF5_SITES))
        except (TypeError, ValueError):
            raise InputError("Comparable sites must be a number.") from None
        if not sites >= 1:
            raise InputError("Comparable sites must be at least 1.")
        if len(rows) > 20000:
            raise InputError("The pairwise comparison CSV has more than 20,000 rows.")
        progress(0.3, "Evaluating pairwise comparisons")
        results = timer.results_from_pairwise_table(rows, s1, s2, opt["table_identity_col"], opt["table_difference_col"],
                                                    opt["table_comparable_col"], sites, interval)
        columns = AUDIT_COLUMNS
    else:
        raise InputError("Unknown TIMER mode.")
    if not results:
        raise InputError("No pairwise comparisons were produced.")

    names_all, cells = timer.heatmap_cells(results)
    counts = {
        "pairs": len(results),
        "highly_compatible": sum(r["mutation_timing_category"] == "Highly compatible" for r in results),
        "near_limit": sum(r["mutation_timing_category"] == "Compatible near limit" for r in results),
        "outside": sum(r["mutation_timing_category"] == "Outside expected range" for r in results),
        "unable": sum(r["poisson_status"] == "Unable to evaluate" for r in results),
    }
    progress(0.92, "Drawing the heatmap")
    png = f"pairwise_poisson_heatmap_{TODAY()}.png"
    _render_heatmap(names_all, cells, out_dir / png)
    audit = f"pairwise_poisson_heatmap_audit_{TODAY()}.csv"
    write_csv(out_dir / audit, results, columns)
    bundle = _zip_bundle(out_dir, "prrsloom_timer_results.zip")
    return {
        "module": "timer",
        "mode": mode,
        "summary": counts,
        "results": results,
        "heatmap": {"names": names_all, "cells": cells},
        "assumptions": {
            "mean_rate": timer.MEAN_RATE, "lower_rate": timer.LOWER_RATE, "upper_rate": timer.UPPER_RATE,
            "interval": "central 95% Poisson interval", "outside_value": 0,
        },
        "files": [
            {"id": png, "label": "Pairwise heatmap (PNG, 300 dpi)", "kind": "figure"},
            {"id": audit, "label": "Pairwise audit (CSV)", "kind": "table"},
            {"id": bundle, "label": "All results (ZIP)", "kind": "bundle"},
        ],
    }


def _render_heatmap(names: list[str], cells: list[dict], path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle

    n = len(names)
    fig, ax = plt.subplots(figsize=(14, 11), dpi=300)
    idx = {nm: k for k, nm in enumerate(names)}
    font = max(4.0, min(9.5, 160 / max(n, 1)))
    for c in cells:
        x = idx[c["x"]]
        y = n - 1 - idx[c["y"]]
        ax.add_patch(Rectangle((x - 0.5, y - 0.5), 1, 1, facecolor=c["fill"], edgecolor="white", linewidth=0.65))
        ax.text(x, y, "\n".join(c["label"]), ha="center", va="center", fontsize=font, fontweight="bold",
                color="white" if c["light_text"] else "#252525", linespacing=0.95)
    ax.set_xlim(-0.5, n - 0.5)
    ax.set_ylim(-0.5, n - 0.5)
    ax.set_aspect("equal")
    ax.set_xticks(range(n))
    ax.set_xticklabels(names, rotation=45, ha="right", color="#2d2d2d")
    ax.set_yticks(range(n))
    ax.set_yticklabels(list(reversed(names)), color="#2d2d2d")
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(length=0)
    fig.tight_layout()
    fig.savefig(path, dpi=300, facecolor="white")
    plt.close(fig)


# ---------------------------------------------------------------- Haplotype Network

def normalize_variant_label(x) -> str:
    s = "" if x is None else str(x).strip()
    low = s.lower()
    if s == "" or s == "NA":
        return "undetermined"
    if low == "undetermined":
        return "undetermined"
    if low == "unclassified":
        return "unclassified"
    return s


def _extract_year(x) -> str | None:
    m = re.search(r"(?:19|20)\d{2}", "" if x is None else str(x))
    return m.group(0) if m else None


def run_haplotype(params: dict, inputs: dict, out_dir: Path, progress: Progress) -> dict:
    records = parse_fasta(inputs.get("fasta", ""), min_sequences=1)
    names = [n for n, _ in records]
    warnings: list[str] = []

    meta_header = meta_rows = None
    if inputs.get("metadata"):
        meta_header, meta_rows = read_csv_text(inputs["metadata"], "metadata CSV")
        id_col = params.get("id_column") or ("ids" if "ids" in meta_header else meta_header[0])
        if id_col not in meta_header:
            raise InputError("The selected ID column was not found in the metadata CSV.")

    progress(0.05, "Reading input files")
    pred = _classify(names, [s.upper() for _, s in records], progress, 0.1)
    warnings += _classifier_warnings(pred)
    out = []
    for r in pred.rows:
        r = dict(r)
        r["assign.final"] = normalize_variant_label(r["assign.final"])
        out.append(r)
    # The R app pairs classifier rows with names(seqs) by position; the classifier moves re-aligned
    # sequences to the end, so we pair by SequenceName instead (documented correction).
    variant_by_name = {r["SequenceName"]: r["assign.final"] for r in out}
    if [r["SequenceName"] for r in out] != names:
        warnings.append("Some sequences needed re-alignment to the 603-nt ORF5 reference; variants were matched to sequences by name.")

    if meta_rows is None:
        raw_metadata_columns = ["SequenceName", "assign.final", "assign.top", "prob.top", "assign.2", "prob.2", "num.gaps.amb"]
        meta_input = [{**{k: _r_value(v) for k, v in r.items()}, "ids": r["SequenceName"]} for r in out]
        selected_id = "SequenceName"
        from_classifier_only = True
    else:
        raw_metadata_columns = meta_header
        meta_input = [{**r, "ids": r[id_col]} for r in meta_rows]
        selected_id = id_col
        from_classifier_only = False
    if not any(not _blank(r["ids"]) for r in meta_input):
        raise InputError("The selected ID column does not contain usable values.")

    class_target = {r["assign.final"] for r in out if r["assign.final"] not in NO_REFERENCE_LABELS}
    if any(r["assign.final"] in NO_REFERENCE_LABELS for r in out):
        warnings.append("Sequences classified as unclassified or undetermined do not have reference sequences available, so those networks are built without references.")
    ref_target, ref_seqs = [], []
    if class_target:
        progress(0.35, "Loading reference sequences")
        ref_target, ref_seqs = _select_references(class_target)
        if not ref_target:
            raise InputError("No reference sequences were found for the classified variants.")
        if not ref_seqs:
            raise InputError("Reference sequences could not be loaded from the GitHub FASTA file.")

    var_by_ref = {(r.get("genbank.full") or "").strip(): r for r in ref_target}
    variant_lookup = [{"SequenceName": n, "network_variant": normalize_variant_label(variant_by_name.get(n)), "variant_source": "user"}
                      for n in names]
    variant_lookup += [{"SequenceName": short, "network_variant": normalize_variant_label(var_by_ref.get(orig.strip(), {}).get("var")),
                        "variant_source": "reference"} for short, orig, _ in ref_seqs]

    all_records = records + [(short, s) for short, _, s in ref_seqs]
    progress(0.45, f"Aligning {len(all_records)} sequences (MAFFT)")
    aln = msa.mafft([(n, s.upper()) for n, s in all_records])
    aln_names = [n for n, _ in aln]
    aln_seq = dict(aln)

    # build_reference_metadata()
    ref_meta = []
    for short, orig, _ in ref_seqs:
        row = var_by_ref.get(orig.strip(), {})
        state = row.get("state") if "state" in row else row.get("State")
        year = row.get("year")
        if _blank(year):
            year = _extract_year(row.get("date"))
        if _blank(year):
            year = _extract_year(orig)
        ref_meta.append({"ids": short, "state": "NA(ref)" if _blank(state) else state,
                         "year": "NA(ref)" if _blank(year) else str(year), "original_name": orig})
    # bind_metadata_with_reference()
    all_cols = list(dict.fromkeys(list(meta_input[0].keys()) + (list(ref_meta[0].keys()) if ref_meta else [])))
    meta = [{c: (r.get(c, "NA(ref)")) for c in all_cols} for r in meta_input] + [{c: r.get(c, "NA(ref)") for c in all_cols} for r in ref_meta]
    for r in meta:
        r["ids"] = (r["ids"] or "").strip()

    user_counts: dict[str, int] = {}
    for v in variant_lookup:
        if v["variant_source"] == "user":
            user_counts[v["network_variant"]] = user_counts.get(v["network_variant"], 0) + 1
    invalid = [v for v in sorted(user_counts) if v in NO_REFERENCE_LABELS and user_counts[v] < 2]
    if invalid:
        warnings.append(f"A haplotype network cannot be built for {' and '.join(invalid)} because only one sequence was uploaded for that group. "
                        "These variants are treated as poorly resolved groups, and no reference sequences are available for unclassified or undetermined sequences.")
    panels = [v for v in sorted(user_counts) if v not in invalid]
    split = len(panels) > 1

    progress(0.7, "Building haplotype networks")
    networks = []
    for panel in panels:
        if split:
            wanted = {v["SequenceName"] for v in variant_lookup if v["network_variant"] == panel}
        else:
            wanted = set(aln_names)
        panel_names = [n for n in aln_names if n in wanted]
        if not panel_names:
            raise InputError(f"No sequences were available to build the {panel} network.")
        h = hap.haplotype([aln_seq[n] for n in panel_names])
        if len(h.labels) < 2:
            extra = (" In addition, no reference sequences are available for unclassified or undetermined groups because they are poorly resolved."
                     if panel in NO_REFERENCE_LABELS else "")
            warnings.append(f"No network was generated for {panel} because the uploaded sequences produced only one haplotype node.{extra}")
            continue
        links = hap.haplo_net(h)
        hap_ids = [f"{panel} | {lab}" for lab in h.labels]
        rows = []
        for k, members in enumerate(h.members):
            for m in members:
                rows.append({"SequenceName": panel_names[m], "HaplotypeId": hap_ids[k], "Haplotype": hap_ids[k],
                             "HaplotypeIndex": h.labels[k], "Network": panel})
        networks.append({"panel": panel, "hap_ids": hap_ids, "labels": h.labels,
                         "freq": [len(m) for m in h.members], "links": links, "rows": rows})
    if not networks:
        raise InputError(" ".join(["No haplotype network could be built."] + warnings))

    # hap_summary: left_join(meta, by SequenceName = ids) then left_join(variant_lookup)
    meta_by_id: dict[str, list[dict]] = {}
    for r in meta:
        meta_by_id.setdefault(r["ids"], []).append(r)
    vl_by_name: dict[str, list[dict]] = {}
    for v in variant_lookup:
        vl_by_name.setdefault(v["SequenceName"], []).append(v)
    meta_cols = [c for c in all_cols if c != "ids"]
    summary = []
    for net in networks:
        for row in net["rows"]:
            for m in meta_by_id.get(row["SequenceName"], [None]):
                for v in vl_by_name.get(row["SequenceName"], [None]):
                    rec = dict(row)
                    for c in meta_cols:
                        rec[c] = m.get(c) if m else None
                    rec["network_variant"] = v["network_variant"] if v else None
                    rec["variant_source"] = v["variant_source"] if v else None
                    rec["Variant"] = row["Network"]
                    y = rec.get("year")
                    rec["Year"] = "NA" if _blank(y) else str(y)
                    if from_classifier_only:
                        rec["assign.final"] = "Reference" if rec["variant_source"] == "reference" else rec["network_variant"]
                    summary.append(rec)
    first_seq: dict[str, str] = {}
    for rec in summary:
        first_seq.setdefault(rec["HaplotypeId"], rec["SequenceName"])
    for rec in summary:
        rec["Haplotype"] = f"{first_seq[rec['HaplotypeId']]} | {rec['HaplotypeIndex']}"

    user_cols = [c for c in raw_metadata_columns if c != selected_id]
    default_color = ("pop" if "pop" in user_cols else "assign.final" if "assign.final" in user_cols
                     else user_cols[0] if user_cols else None)

    # haplotype_summary.csv: SequenceName, Variant, Year, HaplotypeIndex, Haplotype, everything else
    lead = ["SequenceName", "Variant", "Year", "HaplotypeIndex", "Haplotype"]
    rest = [c for c in (list(summary[0].keys()) if summary else []) if c not in lead + ["HaplotypeId", "Network", "year"]]
    write_csv(out_dir / "haplotype_summary.csv", summary, lead + rest)
    write_csv(out_dir / "classification_table.csv", out, ["SequenceName", "assign.final", "assign.top", "prob.top", "assign.2", "prob.2", "num.gaps.amb"])
    (out_dir / "alignment.fasta").write_text("".join(f">{n}\n{s}\n" for n, s in aln))
    bundle = _zip_bundle(out_dir, "prrsloom_haplotype_results.zip")

    progress(0.95, "Computing network layouts")
    for net in networks:
        net["layout"] = _network_layout(len(net["hap_ids"]), net["links"])
    return {
        "module": "haplotype",
        "split_by_variant": split,
        "status_message": ("Analysis completed. Multiple variants were detected, so independent haplotype networks are now shown."
                           if len(networks) > 1 else
                           "Analysis completed. You can now adjust the network without rerunning the full pipeline."),
        "networks": [{k: net[k] for k in ("panel", "hap_ids", "labels", "freq", "links", "layout")} for net in networks],
        "hap_summary": summary,
        "summary_columns": lead + rest,
        "classification": out,
        "user_metadata_columns": user_cols,
        "default_color_column": default_color,
        "metadata_from_classifier_only": from_classifier_only,
        "warnings": list(dict.fromkeys(warnings)),
        "files": [
            {"id": "haplotype_summary.csv", "label": "Haplotype summary (CSV)", "kind": "table"},
            {"id": "classification_table.csv", "label": "Classification table (CSV)", "kind": "table"},
            {"id": "alignment.fasta", "label": "Alignment used for the networks (FASTA)", "kind": "alignment"},
            {"id": bundle, "label": "All results (ZIP)", "kind": "bundle"},
        ],
        "provenance": _provenance(),
    }


def _network_layout(n: int, links: list[tuple[int, int, int]]) -> list[list[float]]:
    """Deterministic Kamada-Kawai layout; drawn link length grows with sqrt(mutational steps).

    pegas' plot.haploNet layout is a drawing aid, not part of the analysis. Step counts are shown
    as link labels; square-root lengths keep one very long link from shrinking the rest of the network.
    """
    import networkx as nx

    g = nx.Graph()
    g.add_nodes_from(range(n))
    for a, b, step in links:
        g.add_edge(a, b, weight=math.sqrt(float(step)))
    if n == 1:
        return [[0.0, 0.0]]
    pos = nx.kamada_kawai_layout(g, weight="weight")
    pts = [pos[k] for k in range(n)]
    # scale so that a 1-step link is ~1 unit long
    lengths = [math.dist(pts[a], pts[b]) / math.sqrt(s) for a, b, s in links if s > 0]
    unit = sorted(lengths)[len(lengths) // 2] if lengths else 1.0
    return [[float(p[0] / unit), float(-p[1] / unit)] for p in pts]


RUNNERS = {
    "nj_tree": run_nj_tree,
    "tree_label": run_tree_label,
    "timer": run_timer,
    "haplotype": run_haplotype,
}


def run(module: str, params: dict, inputs: dict, out_dir: Path, progress: Progress) -> dict:
    if module not in RUNNERS:
        raise InputError(f"Unknown module {module!r}.")
    out_dir.mkdir(parents=True, exist_ok=True)
    result = RUNNERS[module](params, inputs, out_dir, progress)
    payload = json_safe(result)
    text = json.dumps(payload)
    (out_dir / "result.json").write_text(text)
    # Compressed once here so the API can send it with Content-Encoding: gzip (a 150-sequence
    # TIMER result is ~16 MB of JSON) without compressing on every request.
    with gzip.open(out_dir / "result.json.gz", "wb", compresslevel=6) as fh:
        fh.write(text.encode("utf-8"))
    _ = io
    return payload
