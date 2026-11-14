"""Haplotype membership and network links: MAFFT alignment (Python) vs DECIPHER::AlignSeqs (R)."""
import csv, random, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prrsloom.fasta import read_fasta_text
from prrsloom.analyses import msa
from prrsloom.analyses.haplotypes import haplotype, haplo_net

def datasets(ext: Path):
    rng = random.Random(8)
    refs = [s.replace("-", "") for _, s in read_fasta_text((ext / "reference.sequences.fasta").read_text())]
    for k in range(10):
        base = rng.choice(refs)
        recs = []
        for i in range(rng.randint(6, 25)):
            s = list(base)
            for _ in range(rng.randint(0, 6)): s[rng.randrange(len(s))] = rng.choice("ACGT")
            s = "".join(s)
            r = rng.random()
            if r < 0.15: s = s[rng.randint(1, 30):]
            elif r < 0.3: s = s[: -rng.randint(1, 30)]
            elif r < 0.4: p = rng.randrange(100, 500); s = s[:p] + s[p + 3:]
            elif r < 0.45: s = s[:300] + "N" * 10 + s[310:]
            recs.append((f"h{k}_{i}", s))
        yield recs

def main(rscript, ext):
    out = Path(__file__).with_name("out"); same_members = same_net = total = 0
    for k, recs in enumerate(datasets(Path(ext))):
        fa = out / f"md{k}.fasta"; fa.write_text("".join(f">{n}\n{s}\n" for n, s in recs))
        subprocess.run([rscript, str(Path(__file__).with_name("r_decipher_haplo.R")), str(fa), str(out / f"md{k}")], check=True, capture_output=True)
        Rm = [line.split(",") for line in (out / f"md{k}_members.txt").read_text().split("\n") if line]
        Rl = [(int(float(r["r"])), int(float(r["c"])), int(float(r["step"]))) for r in csv.DictReader(open(out / f"md{k}_links.csv")) if r["r"] not in ("", "NA")]
        aln = msa.mafft(recs)
        h = haplotype([s for _, s in aln])
        Pm = [[aln[i][0] for i in m] for m in h.members]
        Pl = [(a + 1, b + 1, s) for a, b, s in haplo_net(h)]
        sm = sorted(map(sorted, Rm)) == sorted(map(sorted, Pm)); sn = sm and sorted(Rl) == sorted(Pl)
        same_members += sm; same_net += sn; total += 1
        print(f"set {k}: n={len(recs)} haplotypes R={len(Rm)} Py={len(Pm)} same membership={sm} same links/steps={sn}")
    print(f"identical haplotype membership in {same_members}/{total} sets; identical networks in {same_net}/{total}")

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
