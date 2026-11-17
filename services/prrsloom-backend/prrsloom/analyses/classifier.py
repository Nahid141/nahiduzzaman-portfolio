"""PRRSV-2 variant classification — port of rf10v.predict.fun.R::make.predict.

Every step follows the upstream R function, including its quirks, so that the
same input yields the same table:

* sequences whose length is not 603 are re-aligned to the ORF5 reference
  (``global-local``, match 1 / mismatch -3, gap 25 + 15k); insertions are
  removed by the coordinates pwalign reports, shorter results are right-padded
  with '-'. The upstream ``if (i == 545) next`` skip is kept: in a batch whose
  545th sequence needs re-alignment, that sequence is dropped, as in R;
* re-aligned sequences move to the end of the batch (R rebuilds the alignment
  as "already 603 nt" + "re-aligned");
* non-acgt characters become NA, NA and alleles unseen in training are replaced
  by the training mode of that position;
* votes come from the same randomForest trees; ``prob = votes / ntree``.
  Class ties are broken at random in R (unseeded); here they use a seeded RNG
  and are reported in ``ties``;
* sequences that are undetermined or have prob.top / prob.2 < 2 are re-scored
  with the sub-lineage model and labelled ``<lineage>-unclassified``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np

from .pwalign import CLASSIFIER_TABLE, pairwise_alignment
from .rmodel import ClassifierModel, forest_votes

REFERENCE_603 = (
    "ATGTTGGAGAAATGCTTGACCGCGGGCTGTTACTCGCAATTGCTTTCTTTGTGGTGTATCGTGCCGTTCTGTTTTGCTGTGCTCGTCAACGCCAGCAACG"
    "ACAGCAGCTCCCATCTACAGCTGATTTACAACTTGACGCTATGTGAGCTGAATGGCACAGATTGGCTAGCTAACAAATTTGATTGGGCAGTGGAGAGTTTTG"
    "TCATCTTTCCCGTTTTGACTCACATTGTCTCCTATGGTGCCCTCACTACTAGCCATTTCCTTGACACAGTCGCTTTAGTCACTGTGTCTACCGCCGGGTTTGT"
    "TCACGGGCGGTATGTCCTAAGTAGCATCTACGCGGTCTGTGCCCTGGCTGCGTTGACTTGCTTCGTCATTAGGTTTGCAAAGAATTGCATGTCCTGGCGCTACG"
    "CGTGTACCAGATATACCAACTTTCTTCTGGACACTAAGGGCAGACTCTATCGTTGGCGGTCGCCTGTCATCATAGAGAAAAGGGGCAAAGTTGAGGTCGAAGGT"
    "CATCTGATCGACCTCAAAAGAGTTGTGCTTGATGGTTCCGTGGCAACCCCTATAACCAGAGTTTCAGCGGAACAATGGGGTCGTCCTTAG"
)
ORF5_LENGTH = 603
_NON_NT = re.compile(r"[^ACGTacgt]")
_ACGT = set("acgt")


@dataclass
class Prediction:
    rows: list[dict]
    ties: list[str] = field(default_factory=list)
    dropped: list[str] = field(default_factory=list)


def realign_to_reference(seq: str) -> str:
    """The per-sequence block inside make.predict for nchar != 603."""
    cleaned = _NON_NT.sub("", seq).upper()
    res = pairwise_alignment(REFERENCE_603, cleaned, CLASSIFIER_TABLE, 25, 15, "global-local")
    aligned = res.aligned_subject()
    if len(aligned) > ORF5_LENGTH:
        deletions = sorted(zip(res.pattern.indel_start, res.pattern.indel_width), key=lambda t: -t[0])
        for start, width in deletions:
            end = start + width - 1
            aligned = aligned[: start - 1] + aligned[end:]
    if len(aligned) < ORF5_LENGTH:
        aligned = aligned + "-" * (ORF5_LENGTH - len(aligned))
    return aligned


def _fasta_roundtrip_name(name: str) -> str:
    """writeXStringSet() + seqinr::read.alignment() keeps the header up to the line end."""
    return name.strip() if name is not None else name


def normalise_batch(names: list[str], seqs: list[str], skip_545: bool, threads: int = 1) -> tuple[list[str], list[str], list[str]]:
    """Returns (names, sequences, dropped) after the 603-nt normalisation block.

    Re-alignments are independent; with ``threads > 1`` they run concurrently (the DP releases
    the GIL) and are collected in input order, so the result does not depend on ``threads``.
    """
    long_idx = [i for i, s in enumerate(seqs) if len(s) != ORF5_LENGTH]
    if not long_idx:
        return list(names), list(seqs), []
    todo = [i for i in long_idx if not (skip_545 and i + 1 == 545)]
    if threads > 1 and len(todo) > 1:
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=threads, thread_name_prefix="realign") as pool:
            aligned = list(pool.map(realign_to_reference, [seqs[i] for i in todo]))
    else:
        aligned = [realign_to_reference(seqs[i]) for i in todo]
    realigned_names = [_fasta_roundtrip_name(names[i]) for i in todo]
    realigned_seqs = [a.lower() for a in aligned]
    keep_names = [n for n, s in zip(names, seqs) if len(s) == ORF5_LENGTH]
    keep_seqs = [s for s in seqs if len(s) == ORF5_LENGTH]
    # R excludes by *name*: any sequence sharing a name with a non-603 one is excluded too.
    excluded = {names[i] for i in long_idx}
    pairs = [(n, s) for n, s in zip(names, seqs) if n not in excluded]
    keep_names = [n for n, _ in pairs]
    keep_seqs = [s for _, s in pairs]
    all_names = keep_names + realigned_names
    all_seqs = keep_seqs + realigned_seqs
    final_names, final_seqs, dropped = [], [], []
    for n, s in zip(all_names, all_seqs):
        if len(s) == ORF5_LENGTH:
            final_names.append(n)
            final_seqs.append(s)
        else:
            dropped.append(n)
    dropped += [names[i] for i in long_idx if skip_545 and i + 1 == 545]
    return final_names, final_seqs, dropped


def feature_matrix(model: ClassifierModel, seqs: list[str]) -> np.ndarray:
    """DNAbin2genind + genind2df + mode imputation + factor relevelling + model.matrix."""
    n = len(seqs)
    position_values: dict[str, list[str]] = {}
    lowered = [s.lower() for s in seqs]
    for col in model.columns:
        pos = int(col[2:]) - 1
        mode = model.modes[col]
        levels = model.levels[col]
        values = []
        for s in lowered:
            ch = s[pos] if pos < len(s) else ""
            if ch not in _ACGT:
                ch = mode            # NA -> training mode
            if ch not in levels:
                ch = mode            # allele unseen in training -> mode
            values.append(ch)
        position_values[col] = values
    x = np.zeros((n, len(model.dummies)), dtype=np.float64)
    for k, (col, level) in enumerate(model.dummies):
        vals = position_values[col]
        x[:, k] = [1.0 if v == level else 0.0 for v in vals]
    return x


def _score(model: ClassifierModel, names: list[str], seqs: list[str], rng: np.random.Generator):
    votes = forest_votes(model.forest, feature_matrix(model, seqs))
    probs = votes / model.forest.ntree
    classes = model.forest.classes
    ties: list[str] = []
    top_class = []
    for r in range(len(names)):
        best = np.flatnonzero(votes[r] == votes[r].max())
        if best.size > 1:
            ties.append(names[r])
            top_class.append(classes[int(rng.choice(best))])
        else:
            top_class.append(classes[int(best[0])])
    rows = []
    for r, name in enumerate(names):
        p = probs[r]
        order = np.argsort(p, kind="stable")       # R sort() on doubles is a stable radix sort
        second, third = order[-2], order[-3]
        prob_top = round(float(p.max()), 3)
        prob_2 = float(p[second])
        prob_3 = float(p[third])
        rows.append({
            "SequenceName": name,
            "assign.final": None,
            "assign.top": top_class[r],
            "prob.top": prob_top,
            "assign.2": None if prob_2 == 0 else classes[second],
            "prob.2": prob_2,
            "assign.3": None if prob_3 == 0 else classes[third],
            "prob.3": prob_3,
        })
    return rows, ties


def _ratio(top: float, second: float) -> float:
    return np.inf if second == 0 else top / second


def make_predict(model: ClassifierModel, lineage_model: ClassifierModel, names: list[str],
                 seqs: list[str], seed: int = 2026, threads: int = 1) -> Prediction:
    rng = np.random.default_rng(seed)
    names_n, seqs_n, dropped = normalise_batch(names, seqs, skip_545=True, threads=threads)
    if not names_n:
        return Prediction(rows=[], dropped=dropped)
    rows, ties = _score(model, names_n, seqs_n, rng)
    for row, s in zip(rows, seqs_n):
        row["assign.final"] = "undetermined" if row["prob.top"] < 0.25 else row["assign.top"]
        row["ratios"] = _ratio(row["prob.top"], row["prob.2"])
        row["num.gaps.amb"] = s.count("-")

    und_names = {r["SequenceName"] for r in rows if r["assign.final"] == "undetermined" or r["ratios"] < 2}
    und_pairs = [(n, s) for n, s in zip(names_n, seqs_n) if n in und_names]
    if und_pairs:
        lin_rows, lin_ties = _score(lineage_model, [n for n, _ in und_pairs], [s for _, s in und_pairs], rng)
        ties += [f"{t} (sub-lineage model)" for t in lin_ties]
        lin_final: dict[str, str] = {}
        for lr in lin_rows:
            ok = lr["prob.top"] >= 0.25 and _ratio(lr["prob.top"], lr["prob.2"]) >= 2
            final = lr["assign.top"] if ok else "undetermined"
            label = "undetermined" if final == "undetermined" else f"{final}-unclassified"
            lin_final.setdefault(lr["SequenceName"], label)   # match() takes the first hit
        for row in rows:
            if row["SequenceName"] in lin_final:
                row["assign.final"] = lin_final[row["SequenceName"]]

    out = [
        {k: row[k] for k in ("SequenceName", "assign.final", "assign.top", "prob.top", "assign.2", "prob.2", "num.gaps.amb")}
        for row in rows
    ]
    return Prediction(rows=out, ties=ties, dropped=dropped)
