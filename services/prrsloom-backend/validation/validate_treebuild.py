"""Independent validation of the NJ Tree Builder's tree options (prrsloom.analyses.treebuild).

Run:  python validation/validate_treebuild.py      (needs numpy, scipy, biopython)

1. Distance models: sequences are simulated under the model with a KNOWN distance
   (expected substitutions per site), with equal rates and with gamma rates (alpha 0.5);
   each estimator must recover the true distance (200,000 sites, so sampling error ~1%).
2. UPGMA: tree heights must equal scipy.cluster.hierarchy average linkage (an
   independent implementation of the same algorithm).
3. NJ: topology and patristic distances must equal Biopython's DistanceTreeConstructor('nj'),
   and the in-place fast NJ must equal the ape port (phylo.nj).
4. BIONJ: on tree-additive distances it must return the generating tree exactly.
5. Rooting: midpoint root halfway along the longest tip-to-tip path; outgroup alone at the root.
6. Bootstrap: support values must equal a plain re-implementation (explicit column resampling,
   ape-port NJ, counting splits) using the same random column draws.
Exit code 0 only if every check passes.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prrsloom.analyses import phylo, treebuild  # noqa: E402

BASES = "AGCT"   # order used for the rate matrices below (purines first)
RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append((name, bool(ok), detail))
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail else ""))


# ---------------------------------------------------------------- 1. distance models by simulation

def tn93_q(pi: np.ndarray, k1: float, k2: float) -> np.ndarray:
    """TN93 rate matrix (A,G,C,T), k1 = A<->G and k2 = C<->T rate ratios, scaled to mean rate 1."""
    q = np.zeros((4, 4))
    for i in range(4):
        for j in range(4):
            if i != j:
                rate = k1 if {i, j} == {0, 1} else k2 if {i, j} == {2, 3} else 1.0
                q[i, j] = rate * pi[j]
    np.fill_diagonal(q, -q.sum(axis=1))
    return q / -(pi * np.diag(q)).sum()


def simulate_pair(q: np.ndarray, pi: np.ndarray, t: float, n: int, alpha: float | None, rng) -> list[str]:
    lam, V = np.linalg.eig(q)
    lam, V = lam.real, V.real
    Vi = np.linalg.inv(V)
    A = np.einsum("ik,kj->kij", V, Vi)            # P(t) = sum_k exp(lam_k t) A[k]
    root = rng.choice(4, size=n, p=pi)
    r = rng.gamma(alpha, 1 / alpha, size=n) if alpha else np.ones(n)
    E = np.exp(np.outer(r * t, lam))              # (n, 4)
    P = np.einsum("sk,ksj->sj", E, A[:, root, :])
    P = np.clip(P, 0, None)
    P /= P.sum(axis=1, keepdims=True)
    child = (P.cumsum(axis=1) > rng.random(n)[:, None]).argmax(axis=1)
    return ["".join(BASES[k] for k in root), "".join(BASES[k] for k in child)]


def validate_distances(rng) -> None:
    n = 200_000
    setups = {
        "JC69": (np.full(4, 0.25), 1.0, 1.0),
        "K80": (np.full(4, 0.25), 4.0, 4.0),
        "T92": (np.array([0.2, 0.3, 0.3, 0.2]), 5.0, 5.0),      # GC 0.6, gA = gT, gG = gC
        "TN93": (np.array([0.32, 0.23, 0.17, 0.28]), 6.0, 12.0),
    }
    for model, (pi, k1, k2) in setups.items():
        q = tn93_q(pi, k1, k2)
        for alpha in (None, 0.5):
            for t in (0.05, 0.2, 0.5):
                seqs = simulate_pair(q, pi, t, n, alpha, rng)
                d = treebuild.distance(phylo.dnabin_matrix(seqs), model, "global", gamma=alpha)[0, 1]
                rel = abs(d - t) / t
                check(f"{model}{' +G(0.5)' if alpha else ''} recovers d={t}", rel < 0.03, f"estimate {d:.4f}, error {rel:.1%}")
    # a model must NOT recover the distance when its assumptions are badly violated (sanity of the test)
    q = tn93_q(np.full(4, 0.25), 4.0, 4.0)
    seqs = simulate_pair(q, np.full(4, 0.25), 0.5, n, 0.5, rng)
    d_nog = treebuild.distance(phylo.dnabin_matrix(seqs), "K80", "global")[0, 1]
    check("K80 without gamma underestimates gamma-simulated d=0.5 (test is sensitive)", d_nog < 0.45, f"estimate {d_nog:.4f}")


# ---------------------------------------------------------------- trees

def random_tree_distances(rng, n=40, noise=0.0):
    """Patristic distances of a random tree with random branch lengths (+ optional noise)."""
    nodes = [phylo.Node(name=f"t{k}", length=rng.uniform(0.01, 0.2)) for k in range(n)]
    while len(nodes) > 2:
        i, j = sorted(rng.choice(len(nodes), 2, replace=False))
        b = nodes.pop(j)
        a = nodes.pop(i)
        p = phylo.Node(length=rng.uniform(0.01, 0.2))
        p.add(a)
        p.add(b)
        nodes.append(p)
    root = phylo.Node()
    for c in nodes:
        root.add(c)
    names = [f"t{k}" for k in range(n)]
    D = patristic(root, names)
    if noise:
        E = rng.normal(0, noise, D.shape)
        D = np.abs(D + (E + E.T) / 2)
        np.fill_diagonal(D, 0)
    return root, names, D


def patristic(tree: phylo.Node, names: list[str]) -> np.ndarray:
    tips = {t.name: t for t in tree.tips()}
    D = np.zeros((len(names), len(names)))
    for i, a in enumerate(names):
        dist = phylo._distances_from(tips[a])
        for j, b in enumerate(names):
            D[i, j] = dist[id(tips[b])]
    return D


def splits(tree, names):
    return treebuild._splits(tree, {n: k for k, n in enumerate(names)}, (1 << len(names)) - 1)


def validate_trees(rng) -> None:
    from scipy.cluster.hierarchy import cophenet, linkage
    from scipy.spatial.distance import squareform

    # UPGMA vs scipy average linkage
    for trial in range(5):
        _, names, D = random_tree_distances(rng, 30, noise=0.02)
        up = treebuild.upgma(D, names)
        coph = squareform(cophenet(linkage(squareform(D, checks=False), "average")))
        err = np.abs(patristic(up, names) - coph).max()
        check(f"UPGMA equals scipy average linkage (trial {trial + 1})", err < 1e-10, f"max diff {err:.1e}")

    # NJ vs Biopython; fast NJ vs ape port
    from Bio.Phylo.TreeConstruction import DistanceMatrix, DistanceTreeConstructor

    for trial in range(5):
        _, names, D = random_tree_distances(rng, 30, noise=0.02)
        dm = DistanceMatrix(names, [list(D[i, : i + 1]) for i in range(len(names))])
        bio = DistanceTreeConstructor().nj(dm)
        # Biopython tree -> our Node structure
        def conv(c):
            n = phylo.Node(name=c.name if c.is_terminal() else None, length=c.branch_length)
            for k in c.clades:
                n.add(conv(k))
            return n
        b = conv(bio.root)
        ours = phylo.nj(D, names)
        fast = treebuild.nj_fast(D, names)
        check(f"NJ topology equals Biopython (trial {trial + 1})", splits(ours, names) == splits(b, names))
        err = np.abs(patristic(ours, names) - patristic(b, names)).max()
        check(f"NJ branch lengths equal Biopython (trial {trial + 1})", err < 1e-9, f"max patristic diff {err:.1e}")
        check(f"fast NJ equals ape-port NJ (trial {trial + 1})", splits(fast, names) == splits(ours, names)
              and np.abs(patristic(fast, names) - patristic(ours, names)).max() < 1e-9)

    # BIONJ and NJ recover additive trees exactly
    for trial in range(3):
        truth, names, D = random_tree_distances(rng, 40)
        for method in ("nj", "bionj"):
            t = treebuild.build(D, names, method)
            err = np.abs(patristic(t, names) - D).max()
            check(f"{method.upper()} recovers an additive tree exactly (trial {trial + 1})",
                  splits(t, names) == splits(truth, names) and err < 1e-9, f"max diff {err:.1e}")

    # rooting
    _, names, D = random_tree_distances(rng, 30, noise=0.01)
    t = treebuild.root(phylo.nj(D, names), names, "midpoint")
    P = patristic(t, names)
    i, j = np.unravel_index(P.argmax(), P.shape)
    depth = phylo._distances_from(t)
    tips = {x.name: x for x in t.tips()}
    di, dj = depth[id(tips[names[i]])], depth[id(tips[names[j]])]
    check("midpoint root is halfway along the longest path", abs(di - dj) < 1e-9 and abs(di + dj - P.max()) < 1e-9,
          f"{di:.6f} vs {dj:.6f}, diameter {P.max():.6f}")
    t = treebuild.root(phylo.nj(D, names), names, "outgroup", "t5")
    check("outgroup rooting: outgroup is a child of the root",
          any(c.is_tip and c.name == "t5" for c in t.children) and len(t.children) == 2)
    check("outgroup rooting keeps patristic distances", np.abs(patristic(t, names) - patristic(phylo.nj(D, names), names)).max() < 1e-9)


# ---------------------------------------------------------------- bootstrap

def validate_bootstrap(rng) -> None:
    seqs = simulate_alignment(rng, 24, 500)
    names = [f"s{k}" for k in range(len(seqs))]
    x = phylo.dnabin_matrix(seqs)
    tree = treebuild.root(phylo.nj(phylo.dist_k80(seqs), names), names, "midpoint")
    reps, seed = 40, 11
    got = treebuild.bootstrap_support(tree, x, names, reps, "K80", "global", "nj", seed=seed)
    # plain re-implementation with the same column draws
    r = np.random.default_rng(seed)
    L = x.shape[1]
    draws = [np.bincount(r.integers(0, L, L), minlength=L) for _ in range(reps * 2)]
    counts: dict[int, int] = {}
    for w in draws[:reps]:
        cols = np.repeat(np.arange(L), w)            # explicit resampled alignment
        boot = ["".join(s[c] for c in cols) for s in seqs]
        for sp in splits(phylo.nj(phylo.dist_k80(boot), names), names):
            counts[sp] = counts.get(sp, 0) + 1
    idx = {n: k for k, n in enumerate(names)}
    full = (1 << len(names)) - 1
    ok = True
    for node in tree.walk():
        if id(node) in got:
            m = 0
            for tip in node.tips():
                m |= 1 << idx[tip.name]
            side = m if not (m & 1) else full ^ m
            ok &= abs(got[id(node)] - 100 * counts.get(side, 0) / reps) < 1e-9
    check("bootstrap supports equal a plain re-implementation", ok and len(got) > 0, f"{len(got)} clades, {reps} replicates")


def simulate_alignment(rng, n, L, rate=0.05):
    seqs = ["".join(rng.choice(list("ACGT"), L))]
    while len(seqs) < n:
        parent = seqs[rng.integers(len(seqs))]
        s = np.array(list(parent))
        m = rng.random(L) < rate
        s[m] = rng.choice(list("ACGT"), m.sum())
        seqs.append("".join(s))
    return seqs


if __name__ == "__main__":
    rng = np.random.default_rng(20261117)
    validate_distances(rng)
    validate_trees(rng)
    validate_bootstrap(rng)
    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)} of {len(RESULTS)} checks passed")
    sys.exit(1 if failed else 0)
