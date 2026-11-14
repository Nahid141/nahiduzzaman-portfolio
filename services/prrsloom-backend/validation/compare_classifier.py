"""Compare prrsloom classifier output with R's make.predict output."""
import csv, math, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from Bio import SeqIO
from prrsloom.analyses.rmodel import load_classifier
from prrsloom.analyses.classifier import make_predict
ext, fasta, rcsv = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
m = load_classifier(ext / "model.Rdata"); l = load_classifier(ext / "model.lineage.rf.Rdata")
recs = list(SeqIO.parse(fasta, "fasta"))
pred = make_predict(m, l, [r.description for r in recs], [str(r.seq).upper() for r in recs])
R = list(csv.DictReader(open(rcsv)))
P = pred.rows
print("rows R/P:", len(R), len(P), "ties:", pred.ties, "dropped:", pred.dropped)
def norm(v):
    if v in (None, "NA"): return "NA"
    try: return f"{float(v):.6f}"
    except ValueError: return v
bad = 0
for r, p in zip(R, P):
    d = [k for k in r if norm(r[k]) != norm(p[k])]
    if d:
        bad += 1; print("DIFF", r["SequenceName"], p["SequenceName"], d, {k: (r[k], p[k]) for k in d})
print(f"{len(R) - bad}/{len(R)} rows identical")
