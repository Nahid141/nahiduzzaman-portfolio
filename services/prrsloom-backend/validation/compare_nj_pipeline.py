"""End-to-end NJ Tree Builder parity: prrsloom pipeline vs the R app's run_tree() output."""
import csv, json, shutil, sys, tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

def main(ext, rprefix, extra_meta=None):
    import os
    data = Path(tempfile.mkdtemp(prefix="prrsloom_val_"))
    os.environ["PRRSLOOM_DATA_DIR"] = str(data)
    (data / "resources").mkdir(parents=True)
    for f in ("model.Rdata", "model.lineage.rf.Rdata", "attr.ref.csv", "reference.sequences.fasta", "sequences.example.fasta"):
        shutil.copy(Path(ext) / f, data / "resources" / f)
    from prrsloom import pipelines
    from prrsloom.analyses.phylo import parse_newick, _distances_from
    fasta = (Path(ext) / "sequences.example.fasta").read_text()
    params, inputs = {}, {"fasta": fasta}
    if extra_meta:
        inputs["metadata"] = Path(extra_meta).read_text(); params = {"metadata_id_col": "SequenceName", "metadata_annotation_col": "Site"}
    out = data / "out"
    res = pipelines.run("nj_tree", params, inputs, out, lambda f, m: None)
    R = list(csv.DictReader(open(f"{rprefix}_class.csv")))
    P = res["classification"]
    norm = lambda v: "NA" if v in (None, "NA") else (f"{float(v):.6f}" if str(v).replace('.', '', 1).isdigit() else str(v))
    cls_same = len(R) == len(P) and all(norm(r[k]) == norm(p[k]) for r, p in zip(R, P) for k in r)
    print(f"classification rows identical (incl. order): {cls_same} ({len(P)} rows)")
    print("reference status:", res["reference_status"], "| R:", Path(f"{rprefix}_status.txt").read_text().strip())
    rt = parse_newick(Path(f"{rprefix}_tree.nwk").read_text())
    pt = parse_newick((out / "nj_tree.nwk").read_text())
    def clades(root):
        s = set()
        def rec(n):
            if n.is_tip: return frozenset([n.name])
            c = frozenset().union(*[rec(x) for x in n.children]); s.add(c); return c
        rec(root); return s
    Rd = {r["label"]: float(r["depth"]) for r in csv.DictReader(open(f"{rprefix}_depth.csv"))}
    dd = _distances_from(pt); Pd = {t.name: dd[id(t)] for t in pt.tips()}
    print(f"tips R={len(Rd)} Py={len(Pd)}; rooted clades identical: {clades(rt) == clades(pt)}; "
          f"max |root-to-tip| diff: {max(abs(Rd[k] - Pd[k]) for k in Rd):.2e}")
    print("files:", [f['id'] for f in res['files']])
    return res

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
