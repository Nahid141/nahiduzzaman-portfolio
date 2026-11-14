"""K80 + NJ + midpoint parity with ape/phangorn on R-generated alignments."""
import csv, random, subprocess, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prrsloom.analyses.phylo import dist_k80, nj, midpoint, parse_newick, _distances_from

def clades(root):
    out = set()
    def rec(n):
        if n.is_tip: return frozenset([n.name])
        s = frozenset().union(*[rec(c) for c in n.children]); out.add(s); return s
    rec(root); return out

def run(rscript, ntests=12, seed=3):
    rng = random.Random(seed); outdir = Path(__file__).with_name("out"); worst = 0.0; bad = 0
    for t in range(ntests):
        n = rng.randint(4, 40); L = rng.choice([120, 603])
        anc = "".join(rng.choices("ACGT", k=L)); seqs = []
        for i in range(n):
            s = list(anc)
            for _ in range(rng.randint(1, L // 6)): s[rng.randrange(L)] = rng.choice("ACGT")
            if rng.random() < 0.3: s[rng.randrange(L)] = rng.choice("N-R")
            seqs.append("".join(s))
        names = [f"s{i}_{rng.randint(0,999)}" for i in range(n)]
        fa = outdir / f"nj{t}.fasta"; fa.write_text("".join(f">{a}\n{b}\n" for a, b in zip(names, seqs)))
        subprocess.run([rscript, str(Path(__file__).with_name("r_njtree.R")), str(fa), str(outdir / f"nj{t}")], check=True, capture_output=True)
        Rd = np.loadtxt(outdir / f"nj{t}_dist.csv", delimiter=",", skiprows=1, usecols=range(1, n + 1))
        D = dist_k80(seqs); worst = max(worst, float(np.abs(D - Rd).max()))
        tree = midpoint(nj(D, names), names)
        Rtree = parse_newick((outdir / f"nj{t}_tree.nwk").read_text())
        same_clades = clades(tree) == clades(Rtree)
        Rdepth = {r["label"]: float(r["depth"]) for r in csv.DictReader(open(outdir / f"nj{t}_depth.csv"))}
        dd = _distances_from(tree); depth = {x.name: dd[id(x)] for x in tree.tips()}
        ddiff = max(abs(depth[k] - Rdepth[k]) for k in names)
        Rc = np.loadtxt(outdir / f"nj{t}_coph.csv", delimiter=",", skiprows=1, usecols=range(1, n + 1))
        Rlab = next(csv.reader(open(outdir / f"nj{t}_coph.csv")))[1:]
        tips = {x.name: x for x in tree.tips()}
        C = np.array([[_distances_from(tips[a])[id(tips[b])] for b in Rlab] for a in Rlab])
        cdiff = float(np.abs(C - Rc).max())
        ok = same_clades and ddiff < 1e-9 and cdiff < 1e-9
        bad += not ok; worst = max(worst, ddiff, cdiff)
        print(f"test {t}: n={n} L={L} rooted clades identical={same_clades} max|root-to-tip diff|={ddiff:.2e} max|cophenetic diff|={cdiff:.2e}")
    print(f"{ntests - bad}/{ntests} trees identical; worst numeric difference {worst:.2e}")
    return bad

if __name__ == "__main__":
    sys.exit(1 if run(sys.argv[1]) else 0)
