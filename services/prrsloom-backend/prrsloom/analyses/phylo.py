"""Trees: ape-compatible K80 distances, NJ, phangorn midpoint rooting, Newick/NEXUS I/O."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

import numpy as np

# ape's DNAbin bit codes (ape/R/DNA.R): known bases carry bit 8.
DNABIN = {
    "A": 136, "G": 72, "C": 40, "T": 24, "R": 192, "M": 160, "W": 144, "S": 96,
    "K": 80, "Y": 48, "V": 224, "H": 176, "D": 208, "B": 112, "N": 240, "-": 4, "?": 2,
}


def to_dnabin(seq: str) -> np.ndarray:
    return np.array([DNABIN.get(c, 240) for c in seq.upper().replace("U", "T")], dtype=np.uint8)


def dnabin_matrix(seqs: list[str]) -> np.ndarray:
    if len({len(s) for s in seqs}) != 1:
        raise ValueError("Aligned sequences must all have the same length.")
    return np.vstack([to_dnabin(s) for s in seqs])


def dist_k80(seqs: list[str]) -> np.ndarray:
    """ape::dist.dna(x, model = "K80") with the default global deletion."""
    x = dnabin_matrix(seqs)
    keep = np.all((x & 8) != 0, axis=0)
    x = x[:, keep]
    L = x.shape[1]
    n = x.shape[0]
    if L == 0:
        raise ValueError("No alignment column is free of gaps and ambiguous bases; K80 distances cannot be computed.")
    purine = x > 63
    d = np.zeros((n, n))
    for i in range(n - 1):
        diff = x[i + 1 :] != x[i]
        ts = diff & ((purine[i + 1 :] & purine[i]) | (~purine[i + 1 :] & ~purine[i]))
        nd = diff.sum(axis=1)
        ns = ts.sum(axis=1)
        P = ns / L
        Q = (nd - ns) / L
        a1 = 1 - 2 * P - Q
        a2 = 1 - 2 * Q
        with np.errstate(invalid="ignore", divide="ignore"):
            val = -0.5 * np.log(a1 * np.sqrt(a2))
        d[i, i + 1 :] = val
        d[i + 1 :, i] = val
    return d


@dataclass
class Node:
    name: str | None = None
    length: float | None = None
    children: list["Node"] = field(default_factory=list)
    parent: "Node | None" = None

    @property
    def is_tip(self) -> bool:
        return not self.children

    def add(self, child: "Node") -> "Node":
        child.parent = self
        self.children.append(child)
        return child

    def tips(self) -> list["Node"]:
        out, stack = [], [self]
        while stack:
            n = stack.pop()
            if n.is_tip:
                out.append(n)
            else:
                stack.extend(reversed(n.children))
        return out

    def walk(self):
        stack = [self]
        while stack:
            n = stack.pop()
            yield n
            stack.extend(reversed(n.children))


def nj(d: np.ndarray, labels: list[str]) -> Node:
    """Port of ape's C_nj (Saitou & Nei), including its tie-breaking and branch lengths."""
    if not np.all(np.isfinite(d)):
        raise ValueError("Distance matrix contains missing or infinite values (sequences too divergent for K80).")
    N = len(labels)
    if N < 3:
        raise ValueError("cannot build an NJ tree with less than 3 observations")
    D = d.astype(float).copy()
    otus: list[Node] = [Node(name=lab) for lab in labels]
    n = N
    while n > 3:
        S = D.sum(axis=1)
        best, o1, o2 = 1e50, -1, -1
        B = n - 2
        for i in range(n - 1):
            row = B * D[i, i + 1 :] - S[i] - S[i + 1 :]
            j = int(np.argmin(row))
            if row[j] < best:
                best, o1, o2 = row[j], i, i + 1 + j
        A = D[o1, o2]
        Bv = (S[o1] - S[o2]) / B
        new = Node()
        a, b = otus[o1], otus[o2]
        a.length = (A + Bv) / 2
        b.length = (A - Bv) / 2
        new.add(a)
        new.add(b)
        rest = [k for k in range(n) if k not in (o1, o2)]
        new_d = (D[rest, o1] + D[rest, o2] - A) / 2
        D2 = np.zeros((n - 1, n - 1))
        D2[0, 1:] = new_d
        D2[1:, 0] = new_d
        D2[1:, 1:] = D[np.ix_(rest, rest)]
        D = D2
        otus = [new] + [otus[k] for k in rest]
        n -= 1
    root = Node()
    d01, d02, d12 = D[0, 1], D[0, 2], D[1, 2]
    otus[0].length = (d01 + d02 - d12) / 2
    otus[1].length = (d01 + d12 - d02) / 2
    otus[2].length = (d02 + d12 - d01) / 2
    for o in otus:
        root.add(o)
    return root


def _distances_from(start: Node) -> dict[int, float]:
    """Path length from ``start`` to every node, treating the tree as undirected."""
    dist = {id(start): 0.0}
    stack = [start]
    while stack:
        cur = stack.pop()
        nbrs = [(c, c.length or 0.0) for c in cur.children]
        if cur.parent is not None:
            nbrs.append((cur.parent, cur.length or 0.0))
        for nb, w in nbrs:
            if id(nb) not in dist:
                dist[id(nb)] = dist[id(cur)] + w
                stack.append(nb)
    return dist


def _path(a: Node, b: Node) -> list[Node]:
    anc_a = []
    n = a
    while n is not None:
        anc_a.append(n)
        n = n.parent
    ids = {id(x): k for k, x in enumerate(anc_a)}
    up_b = []
    n = b
    while id(n) not in ids:
        up_b.append(n)
        n = n.parent
    lca = n
    return anc_a[: ids[id(lca)] + 1] + list(reversed(up_b))


def _reroot(new_root: Node) -> Node:
    """Re-hang the tree so that ``new_root`` is the root (edge lengths follow their edge)."""
    path = []
    n = new_root
    while n is not None:
        path.append(n)
        n = n.parent
    lengths = [p.length for p in path]  # length of the edge above each path node
    for child, parent in zip(path[:-1], path[1:]):
        parent.children.remove(child)
    for k, (child, parent) in enumerate(zip(path[:-1], path[1:])):
        child.children.append(parent)
        parent.parent = child
        parent.length = lengths[k]
    new_root.parent = None
    new_root.length = None
    # collapse a degree-1 former root that now hangs as an internal node
    for node in list(new_root.walk()):
        if not node.is_tip and len(node.children) == 1 and node is not new_root:
            only = node.children[0]
            only.length = (only.length or 0.0) + (node.length or 0.0)
            p = node.parent
            idx = p.children.index(node)
            p.children[idx] = only
            only.parent = p
    return new_root


def midpoint(tree: Node, tip_order: list[str]) -> Node:
    """phangorn::midpoint for an NJ tree whose root is the final trichotomy."""
    tips = {t.name: t for t in tree.tips()}
    ordered = [tips[name] for name in tip_order]
    if len(ordered) < 3:
        return tree
    d_root = _distances_from(tree)
    ind = max(range(len(ordered)), key=lambda k: (d_root[id(ordered[k])], -k))
    ind_node = ordered[ind]
    tmproot = ind_node.parent
    d_tmp = _distances_from(tmproot)
    d_tmp[id(ind_node)] = 0.0
    ind2 = max(range(len(ordered)), key=lambda k: (d_tmp[id(ordered[k])], -k))
    ind2_node = ordered[ind2]
    el_ind = ind_node.length or 0.0
    maxdm = el_ind + d_tmp[id(ind2_node)]
    half = maxdm / 2

    if el_ind >= half:
        upper, lower, dist_from_upper = tmproot, ind_node, el_ind - half
    else:
        # walk from ind2 towards tmproot; first edge whose cumulative length exceeds half
        path = _path(ind2_node, tmproot)  # ind2 ... tmproot
        cum = 0.0
        upper = lower = None
        dist_from_upper = 0.0
        for child, parent in zip(path[:-1], path[1:]):
            # edge (parent, child) in the tree rooted at tmproot
            w = child.length if child.parent is parent else parent.length
            cum += w or 0.0
            if cum > half:
                upper, lower = parent, child
                dist_from_upper = cum - half
                break
        if upper is None:
            raise ValueError("midpoint rooting failed: path shorter than half the diameter")
    # Make `lower` a child of `upper` in the current orientation, then split that edge.
    if lower.parent is not upper:
        upper, lower = lower, upper
        w = lower.length or 0.0
        dist_from_upper = w - dist_from_upper
    w = lower.length or 0.0
    mid = Node(length=dist_from_upper)
    idx = upper.children.index(lower)
    upper.children[idx] = mid
    mid.parent = upper
    lower.length = w - dist_from_upper
    mid.add(lower)
    return _reroot(mid)


def ladderize(node: Node, right: bool = False) -> Node:
    """ape::ladderize(right = FALSE): smaller clades first."""
    sizes: dict[int, int] = {}

    def size(n: Node) -> int:
        if id(n) not in sizes:
            sizes[id(n)] = 1 if n.is_tip else sum(size(c) for c in n.children)
        return sizes[id(n)]

    for n in list(node.walk()):
        if n.children:
            n.children.sort(key=size, reverse=right)
    return node


# ---------------------------------------------------------------- Newick / NEXUS

_TOKEN = re.compile(r"\s*('(?:[^']|'')*'|\[[^\]]*\]|[(),:;]|[^\s(),:;\[\]']+)")


def parse_newick(text: str) -> Node:
    text = text.strip()
    tokens = [t for t in _TOKEN.findall(text) if not t.startswith("[")]
    if not tokens:
        raise ValueError("Empty tree string.")
    pos = 0

    def label(tok: str) -> str:
        if tok.startswith("'") and tok.endswith("'"):
            return tok[1:-1].replace("''", "'")
        return tok

    def parse_subtree() -> Node:
        nonlocal pos
        node = Node()
        if tokens[pos] == "(":
            pos += 1
            while True:
                node.add(parse_subtree())
                if pos >= len(tokens):
                    raise ValueError("Unbalanced parentheses in tree.")
                if tokens[pos] == ",":
                    pos += 1
                    continue
                if tokens[pos] == ")":
                    pos += 1
                    break
                raise ValueError(f"Unexpected token {tokens[pos]!r} in tree.")
        if pos < len(tokens) and tokens[pos] not in "(),:;":
            node.name = label(tokens[pos])
            pos += 1
        if pos < len(tokens) and tokens[pos] == ":":
            pos += 1
            try:
                node.length = float(tokens[pos])
            except (IndexError, ValueError):
                raise ValueError("Invalid branch length in tree.") from None
            pos += 1
        return node

    root = parse_subtree()
    if pos < len(tokens) and tokens[pos] == ";":
        pos += 1
    if root.is_tip:
        raise ValueError("The tree has a single tip.")
    root.length = None
    return root


def parse_nexus(text: str) -> Node:
    m = re.search(r"begin\s+trees\s*;(.*?)end\s*;", text, re.I | re.S)
    if not m:
        raise ValueError("NEXUS file has no TREES block.")
    block = m.group(1)
    translate: dict[str, str] = {}
    tm = re.search(r"translate\s+(.*?);", block, re.I | re.S)
    if tm:
        for entry in tm.group(1).split(","):
            parts = entry.strip().split(None, 1)
            if len(parts) == 2:
                translate[parts[0]] = parts[1].strip().strip("'\"")
    trm = re.search(r"tree\s+[^=]+=\s*(?:\[[^\]]*\]\s*)*(.*?;)", block, re.I | re.S)
    if not trm:
        raise ValueError("NEXUS TREES block has no tree statement.")
    tree = parse_newick(trm.group(1))
    if translate:
        for t in tree.tips():
            if t.name in translate:
                t.name = translate[t.name]
    return tree


def to_newick(node: Node) -> str:
    def fmt(n: Node) -> str:
        s = ""
        if n.children:
            s = "(" + ",".join(fmt(c) for c in n.children) + ")"
        if n.name:
            nm = n.name
            if re.search(r"[\s(),:;'\[\]]", nm):
                nm = "'" + nm.replace("'", "''") + "'"
            s += nm
        if n.length is not None:
            s += f":{n.length:.10g}"
        return s

    return fmt(node) + ";"
