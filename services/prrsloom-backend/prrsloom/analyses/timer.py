"""PRRSLoom TIMER — pairwise Poisson molecular-clock audit (port of the TIMER Shiny app).

Locked assumptions are those of the R app: mean / lower / upper substitution
rates 0.0112 / 0.0088 / 0.0127 substitutions per site per year, a central 95%
Poisson interval, divergence factor 1, ambiguous bases ignored, no minimum
number of comparable sites.
"""

from __future__ import annotations

import math
import re
from datetime import date, datetime

import numpy as np
from scipy.stats import poisson

from .pwalign import TIMER_TABLE, pairwise_alignment

MEAN_RATE = 0.0112
LOWER_RATE = 0.0088
UPPER_RATE = 0.0127
CONFIDENCE = 0.95
DIVERGENCE_FACTOR = 1.0
MIN_COMPARABLE_SITES = 0
DEFAULT_ORF5_SITES = 603
DNA_BASES = set("ACGT")
_EPS64 = 64 * np.finfo(float).eps

CATEGORY_LEVELS = [
    "High probability",
    "Medium probability",
    "Low probability",
    "Outside expected distribution",
    "Unable to evaluate",
]
CATEGORY_COLORS = {
    "High probability": "#8c001a",
    "Medium probability": "#e98322",
    "Low probability": "#f0c33c",
    "Outside expected distribution": "#2f3542",
    "Unable to evaluate": "#5b5f97",
}


def qpois(p: float, lam: float) -> float:
    """R's qpois (lower tail): smallest x with ppois(x) >= p, with R's 64-eps left-continuity fuzz."""
    if lam is None or (isinstance(lam, float) and math.isnan(lam)) or lam < 0:
        return float("nan")
    if lam == 0:
        return 0.0
    if p <= 0:
        return 0.0
    if p >= 1:
        return float("inf")
    target = p * (1 - _EPS64)
    x = poisson.ppf(p, lam)
    x = max(0.0, float(x))
    # step to the exact boundary R uses
    while x > 0 and poisson.cdf(x - 1, lam) >= target:
        x -= 1
    while poisson.cdf(x, lam) < target:
        x += 1
    return x


def qpois_many(p: float, lams) -> list[float]:
    """``[qpois(p, lam) for lam in lams]`` with array-valued scipy calls.

    scipy's distribution methods are element-wise, so each element gets exactly the value
    the scalar call computes; batching only removes scipy's per-call overhead (~0.6 ms).
    """
    lam = np.asarray(lams, dtype=float)
    out = np.full(lam.shape, np.nan)
    ok = ~np.isnan(lam) & (lam >= 0)
    out[ok & (lam == 0)] = 0.0
    live = ok & (lam > 0)
    if p <= 0:
        out[live] = 0.0
        return out.tolist()
    if p >= 1:
        out[live] = np.inf
        return out.tolist()
    idx = np.flatnonzero(live)
    if idx.size:
        mu = lam[idx]
        target = p * (1 - _EPS64)
        x = np.maximum(0.0, poisson.ppf(p, mu).astype(float))
        # same two stepping loops as qpois(), run until no element moves
        step = (x > 0) & (poisson.cdf(x - 1, mu) >= target)
        while step.any():
            x = np.where(step, x - 1, x)
            step = step & (x > 0) & (poisson.cdf(x - 1, mu) >= target)
        step = poisson.cdf(x, mu) < target
        while step.any():
            x = np.where(step, x + 1, x)
            step = step & (poisson.cdf(x, mu) < target)
        out[idx] = x
    return out.tolist()


def _nan(v) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v))


_IS_BASE = np.zeros(256, dtype=bool)
_IS_BASE[[ord(c) for c in "ACGT"]] = True
_GAP = ord("-")


def count_pairwise_differences(a: str, b: str) -> dict:
    res = pairwise_alignment(a, b, TIMER_TABLE, 10, 4, "global")
    xs = res.aligned_pattern().upper()
    ys = res.aligned_subject().upper()
    if len(xs) == len(ys) and xs.isascii() and ys.isascii():
        # Same counts as the list-based code below, on byte arrays.
        x = np.frombuffer(xs.encode("ascii"), dtype=np.uint8)
        y = np.frombuffer(ys.encode("ascii"), dtype=np.uint8)
        non_gap = (x != _GAP) & (y != _GAP)
        both_bases = _IS_BASE[x] & _IS_BASE[y]
        base_ok = non_gap & both_bases
        comparable = int(np.count_nonzero(base_ok))
        return {
            "comparable_sites": comparable,
            "differences_observed": int(np.count_nonzero(base_ok & (x != y))) if comparable > 0 else float("nan"),
            "gaps_ignored": int(x.size - np.count_nonzero(non_gap)),
            "ambiguous_sites_ignored": int(np.count_nonzero(non_gap & ~both_bases)),
            "alignment_length": len(xs),
        }
    x = list(xs)
    y = list(ys)
    n = max(len(x), len(y))
    if len(x) != len(y):  # R recycles the shorter vector; out-of-range indexing gives NA
        rx = [x[i % len(x)] for i in range(n)] if x else [None] * n
        ry = [y[i % len(y)] for i in range(n)] if y else [None] * n
    else:
        rx, ry = x, y
    non_gap = [p != "-" and q != "-" for p, q in zip(rx, ry)]
    base_ok = [ng and p in DNA_BASES and q in DNA_BASES for ng, p, q in zip(non_gap, rx, ry)]
    comparable = sum(base_ok)
    if comparable > 0:
        if len(x) != len(y):
            diffs = float("nan")
        else:
            diffs = sum(1 for ok, p, q in zip(base_ok, x, y) if ok and p != q)
    else:
        diffs = float("nan")
    return {
        "comparable_sites": comparable,
        "differences_observed": diffs,
        "gaps_ignored": sum(1 for ng in non_gap if not ng),
        "ambiguous_sites_ignored": sum(1 for ng, p, q in zip(non_gap, rx, ry) if ng and not (p in DNA_BASES and q in DNA_BASES)),
        "alignment_length": len(x),
    }


def pair_key(a: str, b: str) -> str:
    return "||".join(sorted([str(a), str(b)]))


def _expected(sites, years) -> tuple[float, float, float]:
    if _nan(sites) or _nan(years):
        return float("nan"), float("nan"), float("nan")
    return (MEAN_RATE * sites * years * DIVERGENCE_FACTOR,
            LOWER_RATE * sites * years * DIVERGENCE_FACTOR,
            UPPER_RATE * sites * years * DIVERGENCE_FACTOR)


def _is_missing(observed, sites, years, lam) -> bool:
    return _nan(observed) or _nan(sites) or sites < MIN_COMPARABLE_SITES or _nan(years) or _nan(lam)


def poisson_pair_summary(seq1: str, seq2: str, observed, sites, years) -> dict:
    alpha = 1 - CONFIDENCE
    lam, low, high = _expected(sites, years)
    missing = _is_missing(observed, sites, years, lam)
    p_lo = qpois(alpha / 2, lam) if not _nan(lam) else float("nan")
    p_hi = qpois(1 - alpha / 2, lam) if not _nan(lam) else float("nan")
    probs = None
    if not (missing or _nan(observed)):
        mode = max(0.0, math.floor(lam))
        probs = (float(poisson.pmf(observed, lam)), float(poisson.cdf(observed, lam)), float(poisson.sf(observed - 1, lam)),
                 float(poisson.pmf(mode, lam)), float(poisson.pmf(mode + 1, lam)))
    return _summary_row(seq1, seq2, observed, sites, years, lam, low, high, p_lo, p_hi, missing, probs)


def poisson_pair_summaries(pairs: list[tuple[str, str, object, object, object]]) -> list[dict]:
    """``[poisson_pair_summary(*p) for p in pairs]`` with the scipy calls batched (identical values)."""
    alpha = 1 - CONFIDENCE
    exp = [_expected(sites, years) for _, _, _, sites, years in pairs]
    lams = [e[0] for e in exp]
    p_lo = qpois_many(alpha / 2, lams)
    p_hi = qpois_many(1 - alpha / 2, lams)
    missing = [_is_missing(obs, sites, years, lam) for (_, _, obs, sites, years), lam in zip(pairs, lams)]
    todo = [k for k, (p, miss) in enumerate(zip(pairs, missing)) if not (miss or _nan(p[2]))]
    probs: dict[int, tuple] = {}
    if todo:
        obs = np.array([pairs[k][2] for k in todo], dtype=float)
        mu = np.array([lams[k] for k in todo], dtype=float)
        mode = np.array([max(0.0, math.floor(lams[k])) for k in todo], dtype=float)
        cols = [poisson.pmf(obs, mu), poisson.cdf(obs, mu), poisson.sf(obs - 1, mu),
                poisson.pmf(mode, mu), poisson.pmf(mode + 1, mu)]
        cols = [np.asarray(c, dtype=float).tolist() for c in cols]
        for i, k in enumerate(todo):
            probs[k] = tuple(c[i] for c in cols)
    return [_summary_row(s1, s2, obs, sites, years, e[0], e[1], e[2], p_lo[k], p_hi[k], missing[k], probs.get(k))
            for k, ((s1, s2, obs, sites, years), e) in enumerate(zip(pairs, exp))]


def _summary_row(seq1, seq2, observed, sites, years, lam, low, high, p_lo, p_hi, missing, probs) -> dict:
    if probs is None:
        prob_obs = lower_tail = upper_tail = two_sided = rel = float("nan")
    else:
        prob_obs, lower_tail, upper_tail, pmf_mode, pmf_mode1 = probs
        two_sided = min(1.0, 2 * min(lower_tail, upper_tail))
        max_prob = max(pmf_mode, pmf_mode1)
        rel = prob_obs / max_prob if max_prob > 0 else float("nan")
    outside = (not missing) and (observed < p_lo or observed > p_hi)
    tail_pos = min(lower_tail, upper_tail) if not missing else float("nan")
    if missing:
        score = float("nan")
    elif outside:
        score = 0.0
    else:
        score = min(1.0, rel) if not _nan(rel) else float("nan")

    if missing:
        timing = "Unable to evaluate"
    elif outside:
        timing = "Outside expected range"
    elif tail_pos < 0.10:
        timing = "Compatible near limit"
    elif tail_pos < 0.25:
        timing = "Compatible"
    else:
        timing = "Highly compatible"

    if missing:
        status = "Unable to evaluate"
    elif score == 0 and observed > lam:
        status = "More mutations than expected"
    elif score == 0 and observed < lam:
        status = "Fewer mutations than expected"
    elif score == 0:
        status = "Outside expected Poisson distribution"
    else:
        status = "Compatible with elapsed time"

    interpretation = {
        "More mutations than expected": "Observed mutations exceed the expected Poisson interval for the elapsed time. A new introduction, unsampled ancestry, recombination, or rate/timing mismatch should be considered.",
        "Fewer mutations than expected": "Observed mutations are below the expected Poisson interval for the elapsed time. The elapsed time or assumed substitution rate may be overestimated.",
        "Compatible with elapsed time": "Observed mutations are plausible given the elapsed time and PRRSV-2 substitution-rate assumptions.",
    }.get(status, "This pair could not be fully evaluated because one or more required values are missing.")

    pct = 100 * (sites - observed) / sites if (not _nan(sites) and sites > 0 and not _nan(observed)) else float("nan")
    return {
        "pair_id": pair_key(seq1, seq2),
        "pair_label": f"{seq1} vs {seq2}",
        "sequence_1": seq1,
        "sequence_2": seq2,
        "differences_observed": observed,
        "comparable_sites": sites,
        "pct_identity_comparable_sites": pct,
        "time_interval_years": years,
        "expected_mutations_mean": lam,
        "expected_mutations_low_rate": low,
        "expected_mutations_high_rate": high,
        "poisson_lower_expected": p_lo,
        "poisson_upper_expected": p_hi,
        "probability_observed": prob_obs,
        "relative_poisson_probability": rel,
        "two_sided_tail_score": two_sided,
        "lower_tail_probability": lower_tail,
        "upper_tail_probability": upper_tail,
        "poisson_compatibility_score": score,
        "mutation_timing_category": timing,
        "poisson_status": status,
        "final_interpretation": interpretation,
        "mean_substitution_rate": MEAN_RATE,
        "lower_substitution_rate": LOWER_RATE,
        "upper_substitution_rate": UPPER_RATE,
    }


def mutation_count_categories(items: list[tuple[object, object, bool]]) -> list[str]:
    """``[mutation_count_category(m, lam, unable) for m, lam, unable in items]`` with batched qpois."""
    alpha = 1 - CONFIDENCE
    probs = (alpha / 2, 1 - alpha / 2, 0.10, 0.90, 0.25, 0.75)
    live = [k for k, (m, lam, unable) in enumerate(items) if not (unable or _nan(m) or _nan(lam) or lam < 0)]
    q = {p: qpois_many(p, [items[k][1] for k in live]) for p in probs}
    out = ["Unable to evaluate"] * len(items)
    for i, k in enumerate(live):
        out[k] = _category(items[k][0], *(q[p][i] for p in probs))
    return out


def mutation_count_category(mutations, lam, unable: bool = False) -> str:
    if unable or _nan(mutations) or _nan(lam) or lam < 0:
        return "Unable to evaluate"
    alpha = 1 - CONFIDENCE
    return _category(mutations, *(qpois(p, lam) for p in (alpha / 2, 1 - alpha / 2, 0.10, 0.90, 0.25, 0.75)))


def _category(mutations, q_lo, q_hi, q10, q90, q25, q75) -> str:
    cat = "Low probability"
    if mutations < q_lo or mutations > q_hi:
        cat = "Outside expected distribution"
    if q10 <= mutations <= q90:
        cat = "Medium probability"
    if q25 <= mutations <= q75:
        cat = "High probability"
    return cat


# ---------------------------------------------------------------- dates

_NUMERIC_YEAR = re.compile(r"^(?:19|20)\d{2}(?:\.\d+)?$")
_DATE_FORMATS = ["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%m-%d-%Y", "%d-%m-%Y"]


def _r_as_date(text: str, fmt: str) -> date | None:
    """as.Date(x, format=) accepts trailing characters after a full match of the format."""
    for end in range(len(text), 0, -1):
        try:
            return datetime.strptime(text[:end], fmt).date()
        except ValueError:
            continue
    return None


def decimal_year(d: date) -> float:
    leap = d.year % 4 == 0 and (d.year % 100 != 0 or d.year % 400 == 0)
    return d.year + (d.timetuple().tm_yday - 1) / (366 if leap else 365)


def parse_decimal_year(value) -> float:
    if value is None:
        return float("nan")
    text = str(value).strip()
    if text == "" or text.upper() == "NA":
        return float("nan")
    if _NUMERIC_YEAR.match(text):
        return float(text)
    for fmt in _DATE_FORMATS:
        d = _r_as_date(text, fmt)
        if d is not None:
            return decimal_year(d)
    return float("nan")


# ---------------------------------------------------------------- workflows

def _count_row(args: tuple[list[str], int]) -> list[dict]:
    seqs, i = args
    return [count_pairwise_differences(seqs[i], seqs[j]) for j in range(i + 1, len(seqs))]


def results_from_sequences(names: list[str], seqs: list[str], date_lookup: dict[str, float], progress=None,
                           threads: int = 1) -> list[dict]:
    """All pairs (i < j) in row-major order. Alignments run on ``threads`` threads (the DP releases
    the GIL); results, order and progress messages are the same for any thread count."""
    total = len(names) * (len(names) - 1) // 2
    done = 0
    pair_counts: list[dict] = []
    row_ids = [(seqs, i) for i in range(len(names) - 1)]

    def collect(row_counts: list[dict]) -> None:
        nonlocal done
        for c in row_counts:
            pair_counts.append(c)
            done += 1
            if progress and (done % 25 == 0 or done == total):
                progress(done, total)

    if threads > 1 and len(row_ids) > 1:
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=threads, thread_name_prefix="timer-align") as pool:
            for row_counts in pool.map(_count_row, row_ids):  # map() yields in submission order
                collect(row_counts)
    else:
        for args in row_ids:
            collect(_count_row(args))

    pairs, extras, k = [], [], 0
    for i in range(len(names) - 1):
        for j in range(i + 1, len(names)):
            counts = pair_counts[k]
            k += 1
            ya, yb = date_lookup.get(names[i], float("nan")), date_lookup.get(names[j], float("nan"))
            years = abs(ya - yb) if not (_nan(ya) or _nan(yb)) else float("nan")
            pairs.append((names[i], names[j], counts["differences_observed"], counts["comparable_sites"], years))
            extras.append({key: counts[key] for key in ("gaps_ignored", "ambiguous_sites_ignored", "alignment_length")})
    rows = poisson_pair_summaries(pairs)
    for row, extra in zip(rows, extras):
        row.update(extra)
    return rows


def _num(v) -> float:
    try:
        if v is None or str(v).strip() == "" or str(v).strip().upper() == "NA":
            return float("nan")
        return float(v)
    except (TypeError, ValueError):
        return float("nan")


def results_from_pairwise_table(rows: list[dict], seq1_col: str, seq2_col: str, identity_col: str | None,
                                difference_col: str | None, comparable_col: str | None, fixed_sites: float,
                                interval_col: str) -> list[dict]:
    pairs = []
    for r in rows:
        sites = _num(r.get(comparable_col)) if comparable_col else float(fixed_sites)
        diff = _num(r.get(difference_col)) if difference_col else float("nan")
        ident = _num(r.get(identity_col)) if identity_col else float("nan")
        if _nan(diff):
            diff = float(np.round((100 - ident) / 100 * sites)) if not (_nan(ident) or _nan(sites)) else float("nan")
        pairs.append((str(r.get(seq1_col)), str(r.get(seq2_col)), diff, sites, _num(r.get(interval_col))))
    return poisson_pair_summaries(pairs)


def heatmap_cells(results: list[dict]) -> tuple[list[str], list[dict]]:
    position: dict[str, int] = {}  # first-appearance order, O(1) lookups
    for r in results:
        for k in ("sequence_1", "sequence_2"):
            position.setdefault(r[k], len(position))
    names = list(position)
    seen, unique = set(), []
    for r in results:
        if r["pair_id"] not in seen:
            seen.add(r["pair_id"])
            unique.append(r)
    cats = mutation_count_categories([(r["differences_observed"], r["expected_mutations_mean"],
                                       r["mutation_timing_category"] == "Unable to evaluate") for r in unique])
    cells = []
    for r, cat in zip(unique, cats):
        xi, yi = position[r["sequence_1"]], position[r["sequence_2"]]
        x, y = (r["sequence_1"], r["sequence_2"]) if xi < yi else (r["sequence_2"], r["sequence_1"])
        short = {"High probability": "High", "Medium probability": "Med", "Low probability": "Low",
                 "Outside expected distribution": "Out"}.get(cat, "NA")
        pct = r["pct_identity_comparable_sites"]
        diff = r["differences_observed"]
        cells.append({
            "x": x, "y": y, "pair_id": r["pair_id"], "category": cat, "fill": CATEGORY_COLORS[cat],
            "label": [short, "ID: NA" if _nan(pct) else f"ID: {pct:.2f}%",
                      "Diff: NA" if _nan(diff) else ("1 diff" if diff == 1 else f"{int(diff)} diffs")],
            "light_text": cat in ("High probability", "Medium probability", "Outside expected distribution", "Unable to evaluate"),
        })
    return names, cells


def distribution(row: dict) -> dict:
    observed = row["differences_observed"]
    lam = row["expected_mutations_mean"]
    lo, hi = row["poisson_lower_expected"], row["poisson_upper_expected"]
    upper = max(20, hi + 10, observed + 10, qpois(0.999, lam) + 5)
    upper = int(min(upper, 300))
    xs = list(range(0, upper + 1))
    probs = [float(poisson.pmf(k, lam)) for k in xs]
    return {
        "mutations": xs,
        "probability": probs,
        "zone": [mutation_count_category(k, lam) for k in xs],
        "observed": observed, "lambda": lam, "ci_lower": lo, "ci_upper": hi,
    }
