"""pegas haplotype()/haploNet() parity on randomized alignments with gaps and ambiguity codes."""
import csv, random, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prrsloom.analyses.haplotypes import haplotype, haplo_net

def run(rscript, ntests=40, seed=5):
    rng = random.Random(seed); out = Path(__file__).with_name("out"); bad = 0
    for t in range(ntests):
        L = rng.choice([30, 60, 200]); n = rng.randint(2, 30)
        bases = [ "".join(rng.choices("ACGT", k=L)) ]
        for _ in range(rng.randint(1, 6)):
            s = list(rng.choice(bases))
            for _ in range(rng.randint(1, 4)): s[rng.randrange(L)] = rng.choice("ACGT")
            bases.append("".join(s))
        seqs = []
        for _ in range(n):
            s = list(rng.choice(bases))
            r = rng.random()
            if r < 0.2: s[rng.randrange(L)] = rng.choice("NRYKM")
            elif r < 0.3: k = rng.randint(1, 5); s[:k] = "-" * k
            elif r < 0.4: p = rng.randrange(L - 3); s[p:p + 3] = "---"
            seqs.append("".join(s))
        fa = out / f"hap{t}.fasta"; fa.write_text("".join(f">q{i}\n{s}\n" for i, s in enumerate(seqs)))
        subprocess.run([rscript, str(Path(__file__).with_name("r_haplo.R")), str(fa), str(out / f"hap{t}")], check=True, capture_output=True)
        Rm = [[int(v) - 1 for v in line.split(",")] for line in (out / f"hap{t}_members.txt").read_text().split("\n") if line]
        Rl = [(int(float(r["r"])) - 1, int(float(r["c"])) - 1, int(float(r["step"]))) for r in csv.DictReader(open(out / f"hap{t}_links.csv")) if r["r"] not in ("", "NA")]
        h = haplotype(seqs); links = haplo_net(h)
        ok = h.members == Rm and links == Rl
        bad += not ok
        if not ok: print("DIFF test", t, "\n R:", Rm, Rl, "\n P:", h.members, links)
    print(f"{ntests - bad}/{ntests} haplotype sets and networks identical")
    return bad

if __name__ == "__main__":
    sys.exit(1 if run(sys.argv[1]) else 0)
