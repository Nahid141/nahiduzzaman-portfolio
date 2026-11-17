"""The large-dataset code paths must give exactly the results of the straightforward ones."""

import math
import random

import numpy as np
import pytest
from conftest import aligner_available


def _same(a, b):
    if isinstance(a, float) and isinstance(b, float):
        return (math.isnan(a) and math.isnan(b)) or a == b
    if isinstance(a, dict):
        return list(a) == list(b) and all(_same(a[k], b[k]) for k in a)
    if isinstance(a, (list, tuple)):
        return len(a) == len(b) and all(_same(x, y) for x, y in zip(a, b))
    return type(a) is type(b) and a == b


def test_batched_qpois_equals_scalar():
    from prrsloom.analyses import timer

    rng = random.Random(1)
    lams = [0.0, 1e-9, 0.3, 1.0, 6.7536, 40.0, 250.5, float("nan"), -1.0] + [rng.uniform(0, 120) for _ in range(300)]
    for p in (0.0, 0.025, 0.1, 0.25, 0.5, 0.75, 0.9, 0.975, 0.999, 1.0):
        assert _same(timer.qpois_many(p, lams), [timer.qpois(p, lam) for lam in lams]), p


def test_batched_pair_summaries_equal_scalar():
    from prrsloom.analyses import timer

    rng = random.Random(2)
    pairs = []
    for k in range(400):
        obs = rng.choice([float("nan"), 0, 1, 3, 7, 12, 30, 60, float(rng.randint(0, 40))])
        sites = rng.choice([603, 600.0, 1, 0, float("nan"), rng.randint(1, 603)])
        years = rng.choice([float("nan"), 0.0, 0.5, 1.0, rng.uniform(0, 12)])
        pairs.append((f"s{k}", f"t{k}", obs, sites, years))
    assert _same(timer.poisson_pair_summaries(pairs), [timer.poisson_pair_summary(*p) for p in pairs])
    items = [(p[2], timer.poisson_pair_summary(*p)["expected_mutations_mean"], k % 9 == 0) for k, p in enumerate(pairs)]
    assert timer.mutation_count_categories(items) == [timer.mutation_count_category(*it) for it in items]


def test_timer_results_independent_of_thread_count():
    from prrsloom.analyses import timer

    rng = random.Random(3)
    base = "".join(rng.choice("ACGT") for _ in range(240))
    seqs = []
    for k in range(9):
        s = list(base)
        for _ in range(k * 2):
            s[rng.randrange(len(s))] = rng.choice("ACGTN")
        if k % 3 == 0:
            del s[100:103]
        seqs.append("".join(s))
    names = [f"S{k}" for k in range(9)]
    dates = {n: 2015 + k * 0.7 for k, n in enumerate(names)}
    dates.pop("S4")  # one sequence without a date
    one = timer.results_from_sequences(names, seqs, dates)
    for threads in (2, 4):
        assert _same(timer.results_from_sequences(names, seqs, dates, threads=threads), one)
    # the vectorised difference count equals the list-based one
    res = timer.pairwise_alignment(seqs[0], seqs[3], timer.TIMER_TABLE, 10, 4, "global")
    x, y = res.aligned_pattern().upper(), res.aligned_subject().upper()
    ok = [p != "-" and q != "-" and p in "ACGT" and q in "ACGT" for p, q in zip(x, y)]
    counts = timer.count_pairwise_differences(seqs[0], seqs[3])
    assert counts["comparable_sites"] == sum(ok)
    assert counts["differences_observed"] == sum(1 for o, p, q in zip(ok, x, y) if o and p != q)


def test_banded_png_is_pixel_identical(tmp_path, monkeypatch):
    from PIL import Image

    from prrsloom.analyses import phylo, pngband, treeplot

    rng = random.Random(4)
    names = [f"T{k:03d}" for k in range(70)]

    def build(ns):
        if len(ns) == 1:
            return f"{ns[0]}:{rng.uniform(0.001, 0.05):.5f}"
        cut = rng.randint(1, len(ns) - 1)
        return f"({build(ns[:cut])},{build(ns[cut:])}):{rng.uniform(0.001, 0.05):.5f}"

    tree = phylo.parse_newick(build(names)[:-8] + ";")
    meta = [{"label": n, "assign.final": rng.choice(["1C.5", "1A.2", "1H.18"]), "extra": rng.choice("ABC")} for n in names]
    for m in meta:
        m["sub_lineage"] = m["assign.final"][:2]
    lay = treeplot.layout(tree, {m["label"]: m for m in meta}, "farm", palette_rows=meta)
    plain, banded = tmp_path / "plain.png", tmp_path / "banded.png"
    treeplot.render_png(lay, str(plain))
    monkeypatch.setattr(treeplot, "BANDED_PNG_MIN_PIXELS", 0)
    monkeypatch.setattr(pngband, "BAND_ROWS", 333)  # many band edges, odd size
    treeplot.render_png(lay, str(banded))
    a, b = Image.open(plain), Image.open(banded)
    assert a.size == b.size and a.mode == b.mode == "RGBA"
    assert a.info.get("dpi") == b.info.get("dpi") and a.info.get("Software") == b.info.get("Software")
    assert np.array_equal(np.asarray(a), np.asarray(b))


def test_banded_png_with_tick_labels_and_fixed_aspect(tmp_path):
    """Point-offset artists (tick labels) and equal-aspect axes must not move between bands."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import Rectangle
    from PIL import Image

    from prrsloom.analyses import pngband

    def build():
        fig, ax = plt.subplots(figsize=(5, 4), dpi=150)
        placed = []
        for y in range(12):
            for x in range(12):
                placed.append((ax.add_patch(Rectangle((x - 0.5, y - 0.5), 1, 1, facecolor=f"C{(x + y) % 9}")), y - 0.5, y + 0.5))
                placed.append((ax.text(x, y, f"{x}\n{y}", ha="center", va="center", fontsize=4), y - 1, y + 1))
        ax.set_xlim(-0.5, 11.5)
        ax.set_ylim(-0.5, 11.5)
        ax.set_aspect("equal")
        ax.set_yticks(range(12))
        ax.set_yticklabels([f"row {k}" for k in range(12)])
        ax.set_xticks(range(12))
        ax.set_xticklabels([f"col {k}" for k in range(12)], rotation=45, ha="right")
        fig.tight_layout()
        return fig, ax, placed

    fig, _, _ = build()
    fig.savefig(tmp_path / "plain.png", dpi=150, facecolor="white")
    plt.close(fig)
    fig, ax, placed = build()
    pngband.save_png(fig, ax, placed, str(tmp_path / "banded.png"), 150, margin=0.5, band_rows=97)
    plt.close(fig)
    a, b = Image.open(tmp_path / "plain.png"), Image.open(tmp_path / "banded.png")
    assert a.size == b.size
    assert np.array_equal(np.asarray(a), np.asarray(b))


def test_alignment_cache_keys_and_eviction(data_dir, tmp_path, monkeypatch):
    from prrsloom.analyses import msa
    from prrsloom.config import settings

    exe = tmp_path / "aligner"
    exe.write_text("fake")
    args = ("--auto",)
    aln = [("s000000", "AC-GT"), ("s000001", "ACCGT")]
    assert msa.cache_get("mafft", str(exe), args, ["ACGT", "ACCGT"]) is None
    msa.cache_put("mafft", str(exe), args, ["ACGT", "ACCGT"], aln)
    assert msa.cache_get("mafft", str(exe), args, ["ACGT", "ACCGT"]) == aln
    # any change of sequences, their order, the arguments or the binary is a miss
    assert msa.cache_get("mafft", str(exe), args, ["ACCGT", "ACGT"]) is None
    assert msa.cache_get("mafft", str(exe), ("--auto", "--x"), ["ACGT", "ACCGT"]) is None
    assert msa.cache_get("clustalw", str(exe), args, ["ACGT", "ACCGT"]) is None
    exe.write_text("rebuilt binary")
    assert msa.cache_get("mafft", str(exe), args, ["ACGT", "ACCGT"]) is None
    # size bound: with a tiny limit, only the newest entries survive
    monkeypatch.setattr(settings, "alignment_cache_mb", 1)
    big = "ACGT" * 20000
    rng = random.Random(5)
    for k in range(40):
        s = "".join(rng.choice("ACGT") for _ in range(60000))
        msa.cache_put("mafft", str(exe), args, [s, big], [("s000000", s), ("s000001", big)])
    total = sum(p.stat().st_size for p in msa._cache_dir().glob("*.json.gz"))
    assert 0 < total <= 1024 * 1024
    monkeypatch.setattr(settings, "alignment_cache_mb", 0)  # disabled
    assert msa.cache_get("mafft", str(exe), args, [s, big]) is None


@pytest.mark.parametrize("threads", [1, 3])
def test_classifier_realignment_independent_of_threads(threads):
    from prrsloom.analyses import classifier

    rng = random.Random(6)
    ref = classifier.REFERENCE_603
    seqs, names = [], []
    for k in range(12):
        s = list(ref)
        for _ in range(5):
            s[rng.randrange(len(s))] = rng.choice("ACGT")
        if k % 2:
            s = s[rng.randint(3, 20):]  # truncated -> re-aligned
        if k % 5 == 0:
            s[50:50] = list("TTT")      # insertion -> re-aligned
        seqs.append("".join(s))
        names.append(f"q{k}")
    expected = classifier.normalise_batch(names, seqs, skip_545=True)
    assert classifier.normalise_batch(names, seqs, skip_545=True, threads=threads) == expected


def _orf5_variant(rng, k=6):
    from prrsloom.analyses import classifier

    s = list(classifier.REFERENCE_603)
    for _ in range(k):
        s[rng.randrange(len(s))] = rng.choice("ACGT")
    return "".join(s)


def test_orf5_screening_keeps_pure_orf5_input_unchanged():
    from prrsloom.pipelines import screen_orf5

    rng = random.Random(7)
    recs = [(f"s{k}", _orf5_variant(rng)) for k in range(5)]
    out, info = screen_orf5(recs, lambda f, m: None)
    assert out == recs and info["applied"] is False and info["excluded"] == 0


def test_orf5_screening_trims_genomes_and_excludes_non_orf5():
    from prrsloom.pipelines import screen_orf5

    rng = random.Random(8)
    orf5 = _orf5_variant(rng)
    flank5 = "".join(rng.choice("ACGT") for _ in range(2500))
    flank3 = "".join(rng.choice("ACGT") for _ in range(900))
    genome = flank5 + orf5 + flank3
    other_gene = "".join(rng.choice("ACGT") for _ in range(380))
    recs = [("a", _orf5_variant(rng)), ("b", _orf5_variant(rng)), ("genome", genome), ("N_gene", other_gene)]
    progress = []
    out, info = screen_orf5(recs, lambda f, m: progress.append((f, m)))
    assert info["applied"] and (info["kept"], info["trimmed"], info["excluded"]) == (2, 1, 1)
    assert dict(out)["genome"] == orf5               # exactly the embedded ORF5
    assert "N_gene" not in dict(out) and "N_gene" in info["summary"]
    assert [r["action"] for r in info["rows"]] == ["kept", "kept", "trimmed", "excluded"]
    assert progress[-1][0] == 1.0


def test_k80_safety_net_removes_only_undefined_sequences():
    import numpy as np

    from prrsloom.pipelines import _distances_defined

    rng = random.Random(9)
    base = "".join(rng.choice("ACGT") for _ in range(300))
    seqs = []
    for k in range(5):
        s = list(base)
        for _ in range(4 + k):
            s[rng.randrange(300)] = rng.choice("ACGT")
        seqs.append("".join(s))
    # a sequence unrelated to the others: K80 saturates (undefined) against all of them
    seqs.append("".join(rng.choice("ACGT") for _ in range(300)))
    names = [f"q{k}" for k in range(6)]
    dist, kept, removed, sites, _ = _distances_defined(names, seqs, {}, lambda f, m: None)
    assert np.isfinite(dist).all() and sites == 300
    assert removed == ["q5"] and kept == names[:5]


def test_clustalw_progress_is_exact_and_alignment_unchanged(data_dir):
    import os
    import shutil

    from prrsloom.analyses import msa
    from prrsloom.config import settings

    exe = os.environ.get("PRRSLOOM_CLUSTALW", "clustalw")
    if not shutil.which(exe):
        pytest.skip("ClustalW not installed")
    settings.clustalw_bin = exe
    rng = random.Random(10)
    recs = [(f"seq {k}", _orf5_variant(rng, 12)) for k in range(6)]
    seen = []
    first = msa.clustalw(recs, progress=lambda f, m: seen.append((f, m)))
    fracs = [f for f, _ in seen]
    assert fracs == sorted(fracs) and fracs[-1] == 1.0
    assert any("pairwise alignment 15 / 15" in m for _, m in seen)    # 6 sequences -> 15 pairs
    again = []
    assert msa.clustalw(recs, progress=lambda f, m: again.append(m)) == first  # cached, identical
    assert "reused" in again[-1]


@pytest.mark.skipif(not aligner_available("PRRSLOOM_MAFFT", "mafft"), reason="MAFFT not installed")
def test_mafft_reports_strategy_and_linsi_runs(data_dir):
    from prrsloom.analyses import msa

    rng = random.Random(4)
    base = "".join(rng.choice("ACGT") for _ in range(300))
    recs = [(f"m{k}", base[: 100 + k] + base[105 + k:]) for k in range(6)]
    for accurate in (False, True):
        seen = []
        out = msa.mafft(recs, use_cache=False, progress=lambda f, m: seen.append(m), accurate=accurate)
        assert len({len(s) for _, s in out}) == 1 and [n for n, _ in out] == [n for n, _ in recs]
        assert "strategy" in seen[-1] and "columns" in seen[-1]
        if accurate:
            assert "L-INS-i" in seen[-1]
