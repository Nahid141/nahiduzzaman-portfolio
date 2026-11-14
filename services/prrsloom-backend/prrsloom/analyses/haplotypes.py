"""pegas::haplotype (strict = FALSE) and pegas::haploNet ports."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .phylo import dnabin_matrix


def _known(a: int) -> bool:
    return bool(a & 8)


def _different(a: int, b: int) -> bool:
    return (a & b) < 16


def latag2n(x: np.ndarray) -> np.ndarray:
    """ape::latag2n — leading and trailing gaps become N."""
    x = x.copy()
    for row in x:
        k = 0
        while k < row.size and row[k] == 4:
            row[k] = 240
            k += 1
        k = row.size - 1
        while k >= 0 and row[k] == 4:
            row[k] = 240
            k -= 1
    return x


def seg_sites(x: np.ndarray) -> list[int]:
    """ape's seg_sites_a (strict = FALSE): 0-based segregating columns."""
    n, s = x.shape
    out = []
    for j in range(s):
        col = x[:, j]
        i = 0
        base = int(col[0])
        seg = False
        done = False
        while not _known(base):
            i += 1
            if i > n - 1:
                done = True
                break
            xi = int(col[i])
            if base != xi:
                if base != 2 and xi != 2:
                    if base > 4:
                        if xi == 4 or _different(xi, base):
                            seg = True
                            break
                    else:
                        seg = True
                        break
                base = xi
        if seg:
            out.append(j)
            continue
        if done:
            continue
        i += 1
        while i <= n - 1:
            xi = int(col[i])
            if xi != base and (xi == 4 or _different(xi, base)):
                seg = True
                break
            i += 1
        if seg:
            out.append(j)
    return out


def _haplotype_c(xb: np.ndarray) -> np.ndarray:
    """pegas.c::haplotype_DNAbin with strict = 0. Returns 'haplo' (0 = defines a haplotype)."""
    n = xb.shape[0]
    haplo = np.zeros(n, dtype=np.int64)
    ihap = [0]
    for i in range(1, n):
        new = True
        for j in ihap:
            if np.array_equal(xb[i], xb[j]):
                haplo[i] = j + 1
                new = False
                break
        if new:
            ihap.append(i)
    nh = len(ihap)
    D = np.zeros((nh, nh), dtype=np.int64)
    np.fill_diagonal(D, 1)
    for a in range(nh - 1):
        for b in range(a + 1, nh):
            ra, rb = xb[ihap[a]], xb[ihap[b]]
            S = 1 if np.any((ra & rb) < 16) else 0
            D[a, b] = D[b, a] = S
    if not (D == 0).any():
        return haplo
    nknown = np.array([int(np.sum((xb[ihap[a]] & 8) != 0)) for a in range(nh)])
    # order_int: index[k] = rank, ranks assigned to increasing numbers of known bases
    index = np.zeros(nh, dtype=np.int64)
    m = 1
    while m <= nh:
        k = 0
        while index[k]:
            k += 1
        if m == nh:
            index[k] = m
        else:
            for i in range(nh):
                if index[i] == 0 and nknown[i] < nknown[k]:
                    k = i
            index[k] = m
        m += 1
    while True:
        for i in range(nh):
            ii = 0
            while index[ii] - 1 != i:
                ii += 1
            buf = [j for j in range(nh) if j != ii and not D[ii, j]]
            nzero = len(buf)
            if nzero > 1:
                all_zero = True
                for p in range(nzero - 1):
                    for q in range(p + 1, nzero):
                        if D[buf[p], buf[q]]:
                            all_zero = False
                if all_zero:
                    nzero = 1
            if nzero == 1:
                z = ihap[buf[0]] + 1
                k = ihap[ii]
                haplo[k] = z
                k += 1
                for jj in range(n):
                    if haplo[jj] == k:
                        haplo[jj] = z
            D[ii, :] = 1
            D[:, ii] = 1
            if not (D == 0).any():
                return haplo


def as_roman(k: int) -> str:
    vals = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
            (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    out = []
    for v, s in vals:
        while k >= v:
            out.append(s)
            k -= v
    return "".join(out)


@dataclass
class Haplotypes:
    labels: list[str]          # "I", "II", ...
    members: list[list[int]]   # 0-based sequence indices per haplotype
    matrix: np.ndarray         # DNAbin rows of the representative sequences


def haplotype(seqs: list[str]) -> Haplotypes:
    x = latag2n(dnabin_matrix(seqs))
    n = x.shape[0]
    segs = seg_sites(x)
    if segs:
        h = _haplotype_c(x[:, segs])
        defining = [i for i in range(n) if h[i] == 0]
        h = h.copy()
        for i in defining:
            h[i] = i + 1
    else:
        defining = [0]
        h = np.ones(n, dtype=np.int64)
    members = [[k for k in range(n) if h[k] == i + 1] for i in defining]
    labels = [as_roman(k + 1) for k in range(len(defining))]
    return Haplotypes(labels=labels, members=members, matrix=x[defining, :])


def dist_pegas(x: np.ndarray) -> np.ndarray:
    n = x.shape[0]
    d = np.zeros((n, n))
    for a in range(n - 1):
        for b in range(a + 1, n):
            ra, rb = x[a], x[b]
            ok = (ra > 7) & (rb > 7)
            d[a, b] = d[b, a] = int(np.sum(((ra & rb) < 16) & ok))
    return d


def haplo_net(h: Haplotypes) -> list[tuple[int, int, int]]:
    """pegas::haploNet main links as (row, col, step), 0-based haplotype indices."""
    n = len(h.labels)
    if n < 2:
        return []
    d = dist_pegas(h.matrix)
    gr = list(range(n))
    links: list[tuple[int, int, int]] = []
    step = 1
    while len(set(gr)) > 1:
        # which(d == step, TRUE) over the strict lower triangle, column-major order
        new = [(r, c) for c in range(n) for r in range(c + 1, n) if d[r, c] == step]
        for r, c in new:
            a, b = gr[r], gr[c]
            if a == b:
                continue
            gr = [a if g == b else g for g in gr]
            links.append((r, c, step))
        step += 1
        if step > d.max() + 1 and len(set(gr)) > 1:
            raise ValueError("haplotype network could not connect all haplotypes")
    return links
