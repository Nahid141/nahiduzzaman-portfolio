"""Differential test: prrsloom.analyses.pwalign vs R pwalign on randomized cases."""
import csv, random, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prrsloom.analyses.pwalign import pairwise_alignment, CLASSIFIER_TABLE, TIMER_TABLE

def mutate(rng, s, alphabet="ACGT", indels=True, extra="ACGT"):
    s = list(s)
    for _ in range(rng.randint(0, max(1, len(s) // 25))):
        s[rng.randrange(len(s))] = rng.choice(extra)
    if indels:
        for _ in range(rng.randint(0, 3)):
            pos = rng.randrange(len(s))
            if rng.random() < 0.5:
                s[pos:pos] = rng.choices(alphabet, k=rng.randint(1, 9))
            else:
                del s[pos:pos + rng.randint(1, 9)]
    return "".join(s)

def make_cases(n, seed=11):
    rng = random.Random(seed)
    cases = []
    for k in range(n):
        L = rng.choice([30, 80, 200, 603])
        ref = "".join(rng.choices("ACGT", k=L))
        if k % 2 == 0:  # classifier scheme, global-local
            subj = mutate(rng, ref)
            r = rng.random()
            if r < 0.2: subj = subj[rng.randint(1, L // 3):]                       # 5' truncation
            elif r < 0.4: subj = subj[: len(subj) - rng.randint(1, L // 3)]        # 3' truncation
            elif r < 0.6: subj = "".join(rng.choices("ACGT", k=rng.randint(1, 30))) + subj + "".join(rng.choices("ACGT", k=rng.randint(1, 30)))
            cases.append(dict(id=str(k), pattern=ref, subject=subj, type="global-local", scheme="classifier"))
        else:  # TIMER scheme, global, with ambiguity codes
            a = mutate(rng, ref, extra="ACGTNRY")
            b = mutate(rng, ref, extra="ACGTNRY")
            cases.append(dict(id=str(k), pattern=a, subject=b, type="global", scheme="timer"))
    return cases

def main(rscript, n=400):
    out = Path(__file__).with_name("out"); out.mkdir(exist_ok=True)
    cases = make_cases(n)
    with open(out / "pw_cases.csv", "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(cases[0])); w.writeheader(); w.writerows(cases)
    subprocess.run([rscript, str(Path(__file__).with_name("r_pwalign.R")), str(out / "pw_cases.csv"), str(out / "pw_r.csv")], check=True)
    ref = {r["id"]: r for r in csv.DictReader(open(out / "pw_r.csv"))}
    bad = 0
    for c in cases:
        table = CLASSIFIER_TABLE if c["scheme"] == "classifier" else TIMER_TABLE
        go, ge = (25, 15) if c["scheme"] == "classifier" else (10, 4)
        res = pairwise_alignment(c["pattern"], c["subject"], table, go, ge, c["type"])
        r = ref[c["id"]]
        got = dict(aligned_pattern=res.aligned_pattern(), aligned_subject=res.aligned_subject(),
                   deletion=";".join(f"{s}:{w}" for s, w in zip(res.pattern.indel_start, res.pattern.indel_width)),
                   insertion=";".join(f"{s}:{w}" for s, w in zip(res.subject.indel_start, res.subject.indel_width)))
        diffs = [k for k in got if got[k] != r[k]]
        if abs(float(r["score"]) - res.score) > 1e-3: diffs.append("score")
        if diffs:
            bad += 1
            if bad <= 5: print("MISMATCH", c["id"], c["scheme"], diffs, r["score"], res.score, "\n R:", r["aligned_subject"][:120], "\n P:", got["aligned_subject"][:120])
    print(f"{len(cases) - bad}/{len(cases)} cases identical")
    return bad

if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 400) else 0)
