"""Tree-building options for the NJ Tree Builder beyond the R app's fixed K80 + NJ + midpoint.

* distances: ape ``dist.dna`` models N, raw (p), JC69, K80, TN93 with global or pairwise deletion
* methods: NJ (ape ``nj``), BIONJ (Gascuel 1997, ape ``bionj``), UPGMA (average linkage)
* rooting: midpoint (phangorn), outgroup, or none
* nonparametric bootstrap (Felsenstein 1985): alignment columns resampled with replacement,
  the same distance + method rebuilt, clade support = % of replicate trees containing the split

The default (K80, global deletion, NJ, midpoint) stays on ``phylo.dist_k80`` / ``phylo.nj`` /
``phylo.midpoint`` so the R app's tree is reproduced exactly.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Callable

import numpy as np

from . import phylo
from .phylo import Node

MODELS = ("K80", "JC69", "T92", "TN93", "raw", "N")
METHODS = ("nj", "bionj", "upgma")
DELETION = ("global", "pairwise")
ROOTING = ("midpoint", "outgroup", "none")

# DNAbin codes of the four bases (phylo.DNABIN); purines have codes > 63
_A, _G, _C, _T = 136, 72, 40, 24


def distance(x: np.ndarray, model: str = "K80", deletion: str = "global", weights: np.ndarray | None = None,
             gamma: float | None = None) -> np.ndarray:
    """ape::dist.dna(x, model, pairwise.deletion = deletion == "pairwise", gamma = gamma).

    Site counts come from one-hot matrix products (exact integer counts in float64), so a
    300-sequence matrix takes milliseconds. ``weights`` (column multiplicities) gives the
    distance of a bootstrap resample without copying the alignment. Base frequencies (T92,
    TN93) are taken from every A/C/G/T in the alignment before deletion, as ape's base.freq().
    ``gamma`` is the shape alpha of gamma-distributed rates among sites (JC69, K80, T92, TN93):
    each -log(w) term of the model becomes alpha * (w^(-1/alpha) - 1). Pairs without
    comparable sites, and saturated pairs, give non-finite values, as in ape.
    """
    if model not in MODELS:
        raise ValueError(f"Unknown distance model '{model}'.")
    w = np.ones(x.shape[1]) if weights is None else np.asarray(weights, dtype=float)
    counts = {b: float(((x == b) * w).sum()) for b in (_A, _G, _C, _T)}
    tot = sum(counts.values())
    gA, gG, gC, gT = (counts[b] / tot for b in (_A, _G, _C, _T))
    known = (x & 8) != 0
    if deletion == "global":
        keep = np.all(known, axis=0)
        x, w, known = x[:, keep], w[keep], known[:, keep]
        if x.shape[1] == 0 or w.sum() == 0:
            raise ValueError("No alignment column is free of gaps and ambiguous bases; distances cannot be computed.")
    onehot = {b: (x == b).astype(float) for b in (_A, _G, _C, _T)}
    wk = known * w
    L = wk @ known.T.astype(float)
    same = sum((onehot[b] * w) @ onehot[b].T for b in onehot)
    ag = (onehot[_A] * w) @ onehot[_G].T
    ct = (onehot[_C] * w) @ onehot[_T].T
    ag, ct = ag + ag.T, ct + ct.T          # A<->G and C<->T transitions
    nd = L - same
    ts = ag + ct

    def mlog(v):  # -log(v), or its gamma-rates counterpart
        return alpha_term(v, gamma)

    with np.errstate(invalid="ignore", divide="ignore", over="ignore"):
        if model == "N":
            d = np.where(L > 0, nd, np.nan)
        elif model == "raw":
            d = nd / L
        elif model == "JC69":
            d = 0.75 * mlog(1 - 4 * (nd / L) / 3)
        elif model == "K80":
            P = ts / L
            Q = (nd - ts) / L
            if gamma:
                d = 0.5 * mlog(1 - 2 * P - Q) + 0.25 * mlog(1 - 2 * Q)
            else:  # ape's expression, so K80 matches phylo.dist_k80 bit for bit
                d = -0.5 * np.log((1 - 2 * P - Q) * np.sqrt(1 - 2 * Q))
        elif model == "T92":  # Tamura 1992: GC content from the base frequencies
            P = ts / L
            Q = (nd - ts) / L
            h = 2 * (gG + gC) * (1 - gG - gC)
            d = h * mlog(1 - P / h - Q) + 0.5 * (1 - h) * mlog(1 - 2 * Q)
        else:  # TN93
            gR, gY = gA + gG, gC + gT
            k1 = 2 * gA * gG / gR
            k2 = 2 * gC * gT / gY
            k3 = 2 * (gR * gY - gA * gG * gY / gR - gC * gT * gR / gY)
            P1, P2, Q = ag / L, ct / L, (nd - ts) / L
            d = k1 * mlog(1 - P1 / k1 - Q / (2 * gR)) + k2 * mlog(1 - P2 / k2 - Q / (2 * gY)) + k3 * mlog(1 - Q / (2 * gR * gY))
    np.fill_diagonal(d, 0.0)
    return d


def alpha_term(v: np.ndarray, gamma: float | None) -> np.ndarray:
    """-log(v) (equal rates) or alpha * (v^(-1/alpha) - 1) (gamma rates); non-positive v -> nan."""
    v = np.where(v > 0, v, np.nan)
    if not gamma:
        return -np.log(v)
    return gamma * (np.power(v, -1.0 / gamma) - 1)


def compute(seqs_or_matrix, model: str = "K80", deletion: str = "global", gamma: float | None = None) -> np.ndarray:
    """Distances for aligned sequences; K80 + global deletion is exactly phylo.dist_k80."""
    if model == "K80" and deletion == "global" and not gamma and isinstance(seqs_or_matrix, list):
        return phylo.dist_k80(seqs_or_matrix)
    x = seqs_or_matrix if isinstance(seqs_or_matrix, np.ndarray) else phylo.dnabin_matrix(seqs_or_matrix)
    return distance(x, model, deletion, gamma=gamma)


# ---------------------------------------------------------------- tree methods

def nj_fast(d: np.ndarray, labels: list[str], bionj: bool = False) -> Node:
    """Saitou-Nei NJ or, with ``bionj``, Gascuel's (1997) variance-weighted BIONJ reduction.

    Works in place on the full matrix (merged node stored in the first row of the pair, the
    second row retired), so each step is a few vector operations: several times faster than the
    ape-ordered ``phylo.nj``. Ties may resolve differently from ape, so
    the R-parity default tree is still built by ``phylo.nj``; this one serves BIONJ and the
    bootstrap replicates.
    """
    if not np.all(np.isfinite(d)):
        raise ValueError("Distance matrix contains missing or infinite values.")
    N = len(labels)
    if N < 3:
        raise ValueError("cannot build a tree with less than 3 observations")
    D = d.astype(float).copy()
    V = D.copy() if bionj else None
    otus = [Node(name=lab) for lab in labels]
    active = np.ones(N, dtype=bool)
    pen = np.where(np.triu(np.ones((N, N), dtype=bool), 1), 0.0, np.inf)  # +inf: not a candidate pair
    n = N
    while n > 3:
        if n < 0.6 * len(active):  # compact the matrices so later steps work on n x n
            keep = np.flatnonzero(active)
            D, pen = D[np.ix_(keep, keep)], pen[np.ix_(keep, keep)]
            V = V[np.ix_(keep, keep)] if bionj else None
            otus = [otus[k] for k in keep]
            active = np.ones(len(keep), dtype=bool)
        M = len(active)
        S = D.sum(axis=1)  # retired rows/columns are zero
        Q = (n - 2) * D
        Q -= S[:, None]
        Q -= S[None, :]
        Q += pen
        o1, o2 = divmod(int(np.argmin(Q)), M)
        A = D[o1, o2]
        Bv = (S[o1] - S[o2]) / (n - 2)
        new = Node()
        a, b = otus[o1], otus[o2]
        a.length = (A + Bv) / 2
        b.length = (A - Bv) / 2
        new.add(a)
        new.add(b)
        active[o1] = active[o2] = False
        if bionj:
            v12 = V[o1, o2]
            lam = 0.5 if v12 <= 0 else 0.5 + ((V[o2] * active).sum() - (V[o1] * active).sum()) / (2 * (n - 2) * v12)
            lam = min(1.0, max(0.0, lam))
            new_d = lam * (D[o1] - a.length) + (1 - lam) * (D[o2] - b.length)
            new_v = np.where(active, lam * V[o1] + (1 - lam) * V[o2] - lam * (1 - lam) * v12, 0.0)
            V[o1], V[:, o1] = new_v, new_v
            V[o2], V[:, o2] = 0.0, 0.0
        else:
            new_d = (D[o1] + D[o2] - A) / 2
        new_d = np.where(active, new_d, 0.0)
        D[o1], D[:, o1] = new_d, new_d
        D[o2], D[:, o2] = 0.0, 0.0
        pen[o2, :] = np.inf
        pen[:, o2] = np.inf
        active[o1] = True
        otus[o1] = new
        n -= 1
    i0, i1, i2 = np.flatnonzero(active)
    root = Node()
    d01, d02, d12 = D[i0, i1], D[i0, i2], D[i1, i2]
    otus[i0].length = (d01 + d02 - d12) / 2
    otus[i1].length = (d01 + d12 - d02) / 2
    otus[i2].length = (d02 + d12 - d01) / 2
    for i in (i0, i1, i2):
        root.add(otus[i])
    return root


def upgma(d: np.ndarray, labels: list[str]) -> Node:
    """UPGMA (average linkage, ultrametric, rooted); ties go to the first pair in row-major order."""
    if not np.all(np.isfinite(d)):
        raise ValueError("Distance matrix contains missing or infinite values.")
    D = d.astype(float).copy()
    np.fill_diagonal(D, np.inf)
    nodes = [Node(name=lab) for lab in labels]
    height = [0.0] * len(labels)
    size = [1] * len(labels)
    active = list(range(len(labels)))
    while len(active) > 1:
        sub = D[np.ix_(active, active)]
        k = int(np.argmin(sub))
        i, j = sorted((active[k // len(active)], active[k % len(active)]))
        h = D[i, j] / 2
        new = Node()
        for c in (i, j):
            nodes[c].length = max(0.0, h - height[c])
            new.add(nodes[c])
        merged = (D[i] * size[i] + D[j] * size[j]) / (size[i] + size[j])
        D[i, :] = merged
        D[:, i] = merged
        D[i, i] = np.inf
        D[j, :] = np.inf
        D[:, j] = np.inf
        nodes[i], height[i], size[i] = new, h, size[i] + size[j]
        active.remove(j)
    return nodes[active[0]]


def build(d: np.ndarray, labels: list[str], method: str = "nj") -> Node:
    if method == "nj":
        return phylo.nj(d, labels)
    if method == "bionj":
        return nj_fast(d, labels, bionj=True)
    if method == "upgma":
        return upgma(d, labels)
    raise ValueError(f"Unknown tree method '{method}'.")


def _build_fast(d: np.ndarray, labels: list[str], method: str) -> Node:
    return upgma(d, labels) if method == "upgma" else nj_fast(d, labels, bionj=method == "bionj")


# ---------------------------------------------------------------- rooting

def root_outgroup(tree: Node, outgroup: str) -> Node:
    """Root on the branch leading to the outgroup tip, splitting it in half (ape::root with
    resolve.root = TRUE places the root on that branch)."""
    tip = next((t for t in tree.tips() if t.name == outgroup), None)
    if tip is None:
        raise ValueError(f"Outgroup '{outgroup}' is not a tip of the tree.")
    parent = tip.parent
    w = tip.length or 0.0
    mid = Node(length=w / 2)
    parent.children[parent.children.index(tip)] = mid
    mid.parent = parent
    tip.length = w / 2
    mid.add(tip)
    return phylo._reroot(mid)


def root(tree: Node, names: list[str], how: str = "midpoint", outgroup: str | None = None, method: str = "nj") -> Node:
    if method == "upgma" or how == "none":  # UPGMA trees are rooted by construction
        return tree
    if how == "outgroup":
        return root_outgroup(tree, outgroup or "")
    return phylo.midpoint(tree, names)


# ---------------------------------------------------------------- bootstrap

def _splits(tree: Node, index: dict[str, int], full: int) -> set[int]:
    """Non-trivial bipartitions as tip bitmasks, oriented to exclude tip 0 (unrooted splits)."""
    out: set[int] = set()

    def collect(n: Node) -> int:
        if n.is_tip:
            return 1 << index[n.name]
        m = 0
        for c in n.children:
            m |= collect(c)
        side = m if not (m & 1) else full ^ m
        if 1 < bin(side).count("1") < len(index) - 1:
            out.add(side)
        return m

    collect(tree)
    return out


def bootstrap_support(tree: Node, x: np.ndarray, names: list[str], replicates: int, model: str, deletion: str,
                      method: str, seed: int = 1, threads: int = 1, gamma: float | None = None,
                      progress: Callable[[int, int], None] | None = None) -> dict[int, float]:
    """Percent of bootstrap trees containing each clade of ``tree``; keyed by id(node).

    Replicates whose distances are undefined (resampling can leave no complete column) are
    rebuilt with a fresh resample; ``seed`` makes the result reproducible.
    """
    index = {nm: k for k, nm in enumerate(names)}
    full = (1 << len(names)) - 1
    rng = np.random.default_rng(seed)
    L = x.shape[1]
    draw = lambda: np.bincount(rng.integers(0, L, L), minlength=L)  # noqa: E731  column multiplicities
    columns = [draw() for _ in range(replicates * 2)]  # spares for undefined replicates
    counts: dict[int, int] = {}
    spare = iter(columns[replicates:])
    done = 0

    def one(cols: np.ndarray):
        for _ in range(20):
            try:
                d = distance(x, model, deletion, weights=cols, gamma=gamma)
            except ValueError:  # no complete column in this resample
                d = None
            if d is not None and np.all(np.isfinite(d)):
                return _splits(_build_fast(d, names, method), index, full)
            cols = next(spare, None)
            if cols is None:
                break
        return set()

    def tally(splits: set[int]):
        nonlocal done
        for s in splits:
            counts[s] = counts.get(s, 0) + 1
        done += 1
        if progress:
            progress(done, replicates)

    if threads > 1:
        with ThreadPoolExecutor(max_workers=threads, thread_name_prefix="boot") as pool:
            for splits in pool.map(one, columns[:replicates]):
                tally(splits)
    else:
        for cols in columns[:replicates]:
            tally(one(cols))

    support: dict[int, float] = {}

    def clade(n: Node) -> int:
        if n.is_tip:
            return 1 << index[n.name]
        m = 0
        for c in n.children:
            m |= clade(c)
        side = m if not (m & 1) else full ^ m
        if n.parent is not None and 1 < bin(side).count("1") < len(names) - 1:
            support[id(n)] = 100.0 * counts.get(side, 0) / replicates
        return m

    clade(tree)
    return support


def label_support(tree: Node, support: dict[int, float]) -> None:
    """Write supports as internal node labels (integer percent, as in Newick bootstrap trees)."""
    for n in tree.walk():
        if id(n) in support:
            n.name = str(int(round(support[id(n)])))
