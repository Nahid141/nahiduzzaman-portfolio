"""Tree-building options of the NJ Tree Builder (distances, BIONJ/UPGMA, rooting, bootstrap)."""

import random

import numpy as np
import pytest

from prrsloom.analyses import phylo, treebuild
from prrsloom.fasta import InputError


def _alignment(seed=3, depth=5, length=400, rate=0.04):
    rng = random.Random(seed)

    def grow(seq, d):
        if d == 0:
            return [seq]
        out = []
        for _ in range(2):
            s = list(seq)
            for k in range(length):
                if rng.random() < rate:
                    s[k] = rng.choice("ACGT")
            out += grow("".join(s), d - 1)
        return out

    seqs = grow("".join(rng.choice("ACGT") for _ in range(length)), depth)
    return seqs, [f"t{k}" for k in range(len(seqs))]


def test_k80_global_matches_ape_port_exactly():
    seqs, _ = _alignment()
    seqs[0] = "-" * 5 + seqs[0][5:]
    seqs[1] = seqs[1][:10] + "R" + seqs[1][11:]
    assert np.array_equal(treebuild.distance(phylo.dnabin_matrix(seqs), "K80", "global"), phylo.dist_k80(seqs))


def test_distance_models_on_a_known_pair():
    # 10 sites: 1 transition (A->G), 1 transversion (C->A), 8 identical
    x = phylo.dnabin_matrix(["ACGTACGTAC", "GAGTACGTAC"])
    assert treebuild.distance(x, "N")[0, 1] == 2
    assert treebuild.distance(x, "raw")[0, 1] == pytest.approx(0.2)
    assert treebuild.distance(x, "JC69")[0, 1] == pytest.approx(-0.75 * np.log(1 - 4 / 3 * 0.2))
    assert treebuild.distance(x, "K80")[0, 1] == pytest.approx(-0.5 * np.log((1 - 0.2 - 0.1) * np.sqrt(1 - 0.2)))
    assert np.isfinite(treebuild.distance(x, "TN93")[0, 1])


def test_pairwise_deletion_uses_sites_shared_by_each_pair():
    x = phylo.dnabin_matrix(["AAAA--", "AAAT--", "AAAAAA"])
    assert treebuild.distance(x, "N", "pairwise")[0, 1] == 1
    assert treebuild.distance(x, "raw", "pairwise")[1, 2] == pytest.approx(1 / 4)
    with pytest.raises(ValueError):
        treebuild.distance(phylo.dnabin_matrix(["A-", "-A", "AA"]), "raw", "global")


def test_fast_nj_gives_the_ape_tree():
    seqs, names = _alignment()
    d = phylo.dist_k80(seqs)
    full = (1 << len(names)) - 1
    idx = {n: k for k, n in enumerate(names)}
    a, b = treebuild.nj_fast(d, names), phylo.nj(d, names)
    assert treebuild._splits(a, idx, full) == treebuild._splits(b, idx, full)
    assert sorted(round(n.length, 9) for n in a.walk() if n.length is not None) == \
        sorted(round(n.length, 9) for n in b.walk() if n.length is not None)


@pytest.mark.parametrize("method", ["bionj", "upgma"])
def test_other_methods_recover_the_simulated_clades(method):
    seqs, names = _alignment(rate=0.08)
    d = phylo.dist_k80(seqs)
    idx = {n: k for k, n in enumerate(names)}
    full = (1 << len(names)) - 1
    truth = treebuild._splits(phylo.nj(d, names), idx, full)
    got = treebuild._splits(treebuild.build(d, names, method), idx, full)
    assert len(got & truth) >= 0.8 * len(truth)
    if method == "upgma":  # ultrametric: every tip at the same depth
        tree = treebuild.build(d, names, method)
        depth = phylo._distances_from(tree)
        assert np.ptp([depth[id(t)] for t in tree.tips()]) < 1e-9


def test_outgroup_rooting_puts_the_outgroup_alone_at_the_root():
    seqs, names = _alignment()
    tree = treebuild.root(phylo.nj(phylo.dist_k80(seqs), names), names, "outgroup", "t7")
    assert sorted(len(c.tips()) for c in tree.children) == [1, len(names) - 1]
    assert any(c.is_tip and c.name == "t7" for c in tree.children)


def test_bootstrap_is_high_on_clear_clades_and_reproducible():
    seqs, names = _alignment(rate=0.06)
    x = phylo.dnabin_matrix(seqs)
    tree = phylo.midpoint(phylo.nj(phylo.dist_k80(seqs), names), names)
    s1 = treebuild.bootstrap_support(tree, x, names, 50, "K80", "global", "nj", seed=7)
    s2 = treebuild.bootstrap_support(tree, x, names, 50, "K80", "global", "nj", seed=7, threads=2)
    assert s1 == s2 and len(s1) > 0
    assert np.median(list(s1.values())) >= 80
    treebuild.label_support(tree, s1)
    assert all(n.name.isdigit() for n in tree.walk() if not n.is_tip and id(n) in s1)


def test_nj_options_validation():
    from prrsloom.pipelines import NJ_DEFAULTS, nj_options, parse_accessions

    assert nj_options({}) == {**NJ_DEFAULTS, "outgroup": ""}
    assert nj_options({"bootstrap": "100", "reference_count": 5})["bootstrap"] == 100
    for bad in ({"tree_method": "ml"}, {"bootstrap": 5000}, {"rooting": "outgroup"}, {"reference_count": "x"}):
        with pytest.raises(InputError):
            nj_options(bad)
    assert parse_accessions("AF046869, MN073167\nAF046869 x") == ["AF046869", "MN073167", "x"]


def test_gamma_and_t92_reduce_to_known_cases():
    seqs, _ = _alignment(rate=0.06)
    x = phylo.dnabin_matrix(seqs)
    # a very large gamma shape means (almost) equal rates
    for model in ("JC69", "K80", "TN93"):
        a, b = treebuild.distance(x, model), treebuild.distance(x, model, gamma=1e6)
        assert np.allclose(a, b, rtol=1e-4)
    # gamma rates always give larger corrected distances than equal rates
    assert (treebuild.distance(x, "K80", gamma=0.5) >= treebuild.distance(x, "K80") - 1e-12).all()
    # T92 with 50 % GC is K80
    x50 = phylo.dnabin_matrix(["ACGTACGTAC" * 20, "GCGTACATAC" * 20, "ATGTACGTGC" * 20])
    assert np.allclose(treebuild.distance(x50, "T92"), treebuild.distance(x50, "K80"))


def test_gamma_option_validation():
    from prrsloom.pipelines import nj_options

    assert nj_options({"gamma": "0.5"})["gamma"] == 0.5
    assert nj_options({"fresh_alignment": True})["fresh_alignment"] is True
    for bad in ({"gamma": 500}, {"gamma": "x"}, {"gamma": 0.5, "distance_model": "raw"}):
        with pytest.raises(InputError):
            nj_options(bad)
