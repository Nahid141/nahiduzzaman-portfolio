"""Fast unit checks of the ported algorithms (full R parity runs live in validation/)."""
import math

import numpy as np
import pytest

from prrsloom.analyses import haplotypes, palettes, phylo, pwalign, timer
from prrsloom.analyses.classifier import REFERENCE_603, realign_to_reference

ADDITIVE = np.array([[0, 3, 3, 5], [3, 0, 4, 6], [3, 4, 0, 4], [5, 6, 4, 0]], dtype=float)


def test_quality_scores_match_pwalign_defaults():
    # R reports DP scores in single precision: score(A vs A) and score(AA vs AC)
    m, mm = pwalign.quality_scores()
    assert np.float32(m) == np.float32(1.9817560911178589)
    assert np.float32(np.float32(m) + np.float32(mm)) == np.float32(-3.9175295829772949)


def test_global_alignment_scores_like_r():
    # pwalign score; aligned() drops end gaps (print() would show a trailing "-")
    r = pwalign.pairwise_alignment("ACGTACGTTAGCATCGGATC", "ACGTACGTTAGCATCGGAT", pwalign.TIMER_TABLE, 10, 4)
    assert r.score == pytest.approx(23.65337, abs=1e-4)
    assert r.aligned_subject() == "ACGTACGTTAGCATCGGAT"


def test_global_local_end_gaps_dropped_like_r():
    r = pwalign.pairwise_alignment("ACGTACGTTAGCATCGGATC", "CATCGGATC", pwalign.CLASSIFIER_TABLE, 25, 15, "global-local")
    assert r.score == pytest.approx(-181)
    assert r.aligned_subject() == "CATCGGATC"


def test_realign_pads_and_removes_insertions():
    assert realign_to_reference(REFERENCE_603) == REFERENCE_603
    assert len(realign_to_reference(REFERENCE_603[:300] + "GGG" + REFERENCE_603[300:])) == 603
    assert realign_to_reference(REFERENCE_603[:500]).endswith("-" * 103)


def test_nj_recovers_additive_tree():
    tree = phylo.nj(ADDITIVE, list("abcd"))
    lengths = {t.name: t.length for t in tree.tips()}
    assert lengths["a"] == pytest.approx(1)
    assert lengths["b"] == pytest.approx(2)
    assert lengths["d"] == pytest.approx(3)


def test_midpoint_splits_longest_path():
    t = phylo.midpoint(phylo.nj(ADDITIVE, list("abcd")), list("abcd"))
    dist = phylo._distances_from(t)
    depths = {x.name: dist[id(x)] for x in t.tips()}
    assert depths["b"] == pytest.approx(3)
    assert depths["d"] == pytest.approx(3)


def test_k80_rejects_alignment_without_complete_columns():
    with pytest.raises(ValueError):
        phylo.dist_k80(["A-", "-A", "AA"])


def test_newick_and_nexus_parsing():
    t = phylo.parse_newick("((a:1,'b c':2)90:1,d:3);")
    assert sorted(x.name for x in t.tips()) == ["a", "b c", "d"]
    assert any(n.name == "90" for n in t.walk())
    nex = "#NEXUS\nbegin trees;\n translate 1 alpha, 2 beta, 3 gamma;\n tree t1 = [&R] ((1:1,2:1):1,3:2);\nend;"
    assert sorted(x.name for x in phylo.parse_nexus(nex).tips()) == ["alpha", "beta", "gamma"]
    with pytest.raises(ValueError):
        phylo.parse_newick("((a,b);")


def test_haplotypes_merge_ambiguity_and_link():
    h = haplotypes.haplotype(["ACGTACGT", "ACGTACGT", "ACGTACGA", "NCGTACGT"])
    assert h.members[0] == [0, 1, 3]
    assert haplotypes.haplo_net(h) == [(1, 0, 1)]


def test_poisson_quantiles_match_r():
    # qpois(c(0.025, 0.975), 6.7536) in R
    assert timer.qpois(0.025, 6.7536) == 2
    assert timer.qpois(0.975, 6.7536) == 12
    assert timer.qpois(0.5, 0) == 0


def test_timer_status_rules():
    assert timer.poisson_pair_summary("a", "b", 30, 603, 1.0)["poisson_status"] == "More mutations than expected"
    assert timer.poisson_pair_summary("a", "b", 7, 603, 1.0)["mutation_timing_category"] == "Highly compatible"
    assert timer.poisson_pair_summary("a", "b", 7, 603, float("nan"))["poisson_status"] == "Unable to evaluate"


def test_decimal_year_formats():
    assert timer.parse_decimal_year("2024") == 2024
    assert timer.parse_decimal_year("2024-01-01") == 2024
    assert timer.parse_decimal_year("03/01/2025") == pytest.approx(2025 + 59 / 365)
    assert math.isnan(timer.parse_decimal_year("unknown"))


def test_palettes_match_r():
    assert palettes.color_ramp_palette(palettes.BASE_PALETTES["variant"], 9)[1] == "#419787"
    assert palettes.pie_palette(3) == ["#F8766D", "#00BA38", "#619CFF"]
