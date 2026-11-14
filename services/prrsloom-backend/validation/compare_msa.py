"""ClustalW 2.1 binary vs msa::msa(method = "ClustalW") on several datasets."""
import random, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prrsloom.fasta import read_fasta_text
from prrsloom.analyses import msa

def datasets(ext: Path):
    rng = random.Random(4)
    ex = read_fasta_text((ext / "sequences.example.fasta").read_text())
    refs = read_fasta_text((ext / "reference.sequences.fasta").read_text())
    yield "upstream example (7 seqs)", ex
    yield "example + 25 references", ex + [(f"r{i}", s.replace("-", "")) for i, (_, s) in enumerate(rng.sample(refs, 25))]
    var = []
    for i, (_, s) in enumerate(rng.sample(refs, 20)):
        s = s.replace("-", "")
        if i % 3 == 0: s = s[rng.randint(3, 40):]
        if i % 3 == 1: s = s[: -rng.randint(3, 40)]
        if i % 4 == 0: p = rng.randrange(100, 500); s = s[:p] + "AAG" + s[p:]
        var.append((f"v{i}", s))
    yield "20 references with truncations/insertions", var

def main(rscript, ext):
    out = Path(__file__).with_name("out"); bad = 0
    for k, (label, recs) in enumerate(datasets(Path(ext))):
        fa = out / f"msa{k}.fasta"; fa.write_text("".join(f">{n}\n{s}\n" for n, s in recs))
        subprocess.run([rscript, str(Path(__file__).with_name("r_msa.R")), str(fa), str(out / f"msa{k}_r.fasta")], check=True, capture_output=True)
        R = read_fasta_text((out / f"msa{k}_r.fasta").read_text())
        P = msa.clustalw(recs)
        same = R == P
        same_set = sorted(R) == sorted(P)
        bad += not same
        print(f"{label}: identical alignment and order={same}; identical rows ignoring order={same_set}; columns R={len(R[0][1])} Py={len(P[0][1])}")
    return bad

if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1], sys.argv[2]) else 0)
