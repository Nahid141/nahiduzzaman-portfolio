"""TIMER parity: FASTA+dates workflow and pairwise-CSV workflow vs the R app functions."""
import csv, math, random, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prrsloom.analyses import timer

def close(a, b):
    if a in ("NA", "", None) or (isinstance(b, float) and math.isnan(b)) or b is None:
        return a in ("NA", "", None) and (b is None or (isinstance(b, float) and math.isnan(b)))
    try:
        fa, fb = float(a), float(b)
        return abs(fa - fb) <= 1e-9 * max(1.0, abs(fa))
    except (TypeError, ValueError):
        return str(a) == str(b)

def run(rscript, app_r):
    rng = random.Random(9); out = Path(__file__).with_name("out")
    anc = "".join(rng.choices("ACGT", k=603)); names, seqs = [], []
    for i in range(14):
        s = list(anc)
        for _ in range(rng.randint(0, 40)): s[rng.randrange(603)] = rng.choice("ACGT")
        if i % 5 == 0: s[rng.randrange(603)] = "N"
        if i % 6 == 0: del s[rng.randrange(600):][:3]
        if i == 3: s = s[10:]
        names.append(f"seq_{i}"); seqs.append("".join(s))
    (out / "timer.fasta").write_text("".join(f">{n}\n{s}\n" for n, s in zip(names, seqs)))
    dates = ["2024-01-15", "2024.5", "03/01/2025", "2025-06-30", "2023", "2026-02-11", "unknown", "2025-12-01", "15/08/2024", "2024-07-04", "2022-10-10", "2025-01-01", "2026-03-01", "bad"]
    with open(out / "timer_dates.csv", "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["SequenceName", "CollectionDate"]); w.writerows(zip(names, dates))
    with open(out / "timer_pairs.csv", "w", newline="") as fh:
        w = csv.writer(fh); w.writerow(["seq1", "seq2", "identity", "years"])
        for k in range(30): w.writerow([f"a{k}", f"b{k}", round(rng.uniform(85, 100), 2), round(rng.uniform(0, 4), 2) if k % 7 else ""])
    subprocess.run([rscript, str(Path(__file__).with_name("r_timer.R")), app_r, str(out / "timer.fasta"), str(out / "timer_dates.csv"), str(out / "timer_pairs.csv"), str(out / "timer")], check=True, capture_output=True)
    lookup = {n: timer.parse_decimal_year(d) for n, d in zip(names, dates)}
    py_seq = timer.results_from_sequences(names, seqs, lookup)
    py_tab = timer.results_from_pairwise_table(list(csv.DictReader(open(out / "timer_pairs.csv"))), "seq1", "seq2", "identity", None, None, 603, "years")
    bad = 0
    for label, py, rfile in (("FASTA+dates", py_seq, "timer_seq.csv"), ("pairwise CSV", py_tab, "timer_tab.csv")):
        R = list(csv.DictReader(open(out / rfile)))
        nb = 0
        for r, p in zip(R, py):
            d = [k for k in r if k in p and not close(r[k], p[k])]
            if d: nb += 1; print("DIFF", label, r["pair_id"], {k: (r[k], p[k]) for k in d[:4]})
        print(f"{label}: {len(R) - nb}/{len(R)} rows identical ({len(R[0])} columns)")
        bad += nb + (len(R) != len(py))
    Rc = {r["pair_id"]: r["cat"] for r in csv.DictReader(open(out / "timer_cat.csv"))}
    pc = {r["pair_id"]: timer.mutation_count_category(r["differences_observed"], r["expected_mutations_mean"], r["mutation_timing_category"] == "Unable to evaluate") for r in py_seq}
    cb = sum(Rc[k] != pc[k] for k in Rc); print(f"heatmap categories: {len(Rc) - cb}/{len(Rc)} identical"); bad += cb
    return bad

if __name__ == "__main__":
    sys.exit(1 if run(sys.argv[1], sys.argv[2]) else 0)
