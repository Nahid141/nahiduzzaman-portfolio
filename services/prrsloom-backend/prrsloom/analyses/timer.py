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


def _nan(v) -> bool:
    return v is None or (isinstance(v, float) and math.isnan(v))


def count_pairwise_differences(a: str, b: str) -> dict:
    res = pairwise_alignment(a, b, TIMER_TABLE, 10, 4, "global")
    x = list(res.aligned_pattern().upper())
    y = list(res.aligned_subject().upper())
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


def poisson_pair_summary(seq1: str, seq2: str, observed, sites, years) -> dict:
    alpha = 1 - CONFIDENCE
    missing = _nan(observed) or _nan(sites) or sites < MIN_COMPARABLE_SITES or _nan(years)
    if _nan(sites) or _nan(years):
        lam = low = high = float("nan")
    else:
        lam = MEAN_RATE * sites * years * DIVERGENCE_FACTOR
        low = LOWER_RATE * sites * years * DIVERGENCE_FACTOR
        high = UPPER_RATE * sites * years * DIVERGENCE_FACTOR
    if _nan(lam):
        missing = True
    p_lo = qpois(alpha / 2, lam) if not _nan(lam) else float("nan")
    p_hi = qpois(1 - alpha / 2, lam) if not _nan(lam) else float("nan")
    if missing or _nan(observed):
        prob_obs = lower_tail = upper_tail = two_sided = rel = float("nan")
    else:
        prob_obs = float(poisson.pmf(observed, lam))
        lower_tail = float(poisson.cdf(observed, lam))
        upper_tail = float(poisson.sf(observed - 1, lam))
        two_sided = min(1.0, 2 * min(lower_tail, upper_tail))
        mode = max(0.0, math.floor(lam))
        max_prob = max(float(poisson.pmf(mode, lam)), float(poisson.pmf(mode + 1, lam)))
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


def mutation_count_category(mutations, lam, unable: bool = False) -> str:
    if unable or _nan(mutations) or _nan(lam) or lam < 0:
        return "Unable to evaluate"
    alpha = 1 - CONFIDENCE
    cat = "Low probability"
    if mutations < qpois(alpha / 2, lam) or mutations > qpois(1 - alpha / 2, lam):
        cat = "Outside expected distribution"
    if qpois(0.10, lam) <= mutations <= qpois(0.90, lam):
        cat = "Medium probability"
    if qpois(0.25, lam) <= mutations <= qpois(0.75, lam):
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

def results_from_sequences(names: list[str], seqs: list[str], date_lookup: dict[str, float], progress=None) -> list[dict]:
    rows = []
    total = len(names) * (len(names) - 1) // 2
    done = 0
    for i in range(len(names) - 1):
        for j in range(i + 1, len(names)):
            counts = count_pairwise_differences(seqs[i], seqs[j])
            ya, yb = date_lookup.get(names[i], float("nan")), date_lookup.get(names[j], float("nan"))
            years = abs(ya - yb) if not (_nan(ya) or _nan(yb)) else float("nan")
            row = poisson_pair_summary(names[i], names[j], counts["differences_observed"], counts["comparable_sites"], years)
            row.update({k: counts[k] for k in ("gaps_ignored", "ambiguous_sites_ignored", "alignment_length")})
            rows.append(row)
            done += 1
            if progress and (done % 25 == 0 or done == total):
                progress(done, total)
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
    out = []
    for r in rows:
        sites = _num(r.get(comparable_col)) if comparable_col else float(fixed_sites)
        diff = _num(r.get(difference_col)) if difference_col else float("nan")
        ident = _num(r.get(identity_col)) if identity_col else float("nan")
        if _nan(diff):
            diff = float(np.round((100 - ident) / 100 * sites)) if not (_nan(ident) or _nan(sites)) else float("nan")
        out.append(poisson_pair_summary(str(r.get(seq1_col)), str(r.get(seq2_col)), diff, sites, _num(r.get(interval_col))))
    return out


def heatmap_cells(results: list[dict]) -> tuple[list[str], list[dict]]:
    names: list[str] = []
    for r in results:
        for k in ("sequence_1", "sequence_2"):
            if r[k] not in names:
                names.append(r[k])
    seen, cells = set(), []
    for r in results:
        if r["pair_id"] in seen:
            continue
        seen.add(r["pair_id"])
        xi, yi = names.index(r["sequence_1"]), names.index(r["sequence_2"])
        x, y = (r["sequence_1"], r["sequence_2"]) if xi < yi else (r["sequence_2"], r["sequence_1"])
        cat = mutation_count_category(r["differences_observed"], r["expected_mutations_mean"],
                                      r["mutation_timing_category"] == "Unable to evaluate")
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
