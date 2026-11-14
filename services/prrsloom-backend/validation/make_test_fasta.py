"""Builds the classifier validation FASTA from upstream example + reference sequences."""
import random, sys
from pathlib import Path
from Bio import SeqIO
ext = Path(sys.argv[1]); out = Path(sys.argv[2]); rng = random.Random(7)
recs = [(r.id, str(r.seq)) for r in SeqIO.parse(ext / "sequences.example.fasta", "fasta")]
refs = [(r.description, str(r.seq)) for r in SeqIO.parse(ext / "reference.sequences.fasta", "fasta")]
recs += [(f"ref{i}", s) for i, (_, s) in enumerate(rng.sample(refs, 80))]
for i, (_, s) in enumerate(rng.sample(refs, 60)):
    s = s.replace("-", "")
    k = i % 6
    if k == 0: s = s[rng.randint(5, 60):]
    elif k == 1: s = s[: len(s) - rng.randint(5, 60)]
    elif k == 2: p = rng.randrange(50, 550); s = s[:p] + "".join(rng.choices("ACGT", k=3)) + s[p:]
    elif k == 3: p = rng.randrange(50, 550); s = s[:p] + s[p + rng.randint(1, 6):]
    elif k == 4: p = rng.randrange(0, 560); s = s[:p] + "N" * 25 + s[p + 25:]
    else: s = "GGCAT" + s + "TTAG"
    recs.append((f"mut{i}_{k}", s))
with open(out, "w") as fh:
    for n, s in recs: fh.write(f">{n}\n{s}\n")
print(len(recs), "sequences")
