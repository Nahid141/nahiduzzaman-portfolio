"""Port of pwalign::pairwiseAlignment (non-local types) with the same tie-breaking.

The R apps call pairwiseAlignment in two places:

* rf10v.predict.fun.R re-aligns every sequence that is not 603 nt long to the
  ORF5 reference with ``type = "global-local"``, match 1, mismatch -3,
  gapOpening 25, gapExtension 15, then reads ``aligned(subject)`` and
  ``indel(alignment)@deletion``.
* TIMER aligns each pair with ``type = "global"`` and pwalign's defaults
  (Phred-22 quality scoring, gapOpening 10, gapExtension 4).

This module mirrors pwalign's C code (src/align_pairwiseAlignment.c): the DP
runs over the reversed strings in single precision, uses the same ``>=`` / ``>``
comparison order when choosing traceback states, and builds the result ranges
and indels with the same coordinate conventions. A gap of length k costs
``gapOpening + k * gapExtension``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

try:  # numba keeps the DP fast; the pure-Python fallback is identical but slow.
    from numba import njit
except Exception:  # pragma: no cover
    def njit(*args, **kwargs):
        if args and callable(args[0]):
            return args[0]
        return lambda f: f

SUB, DEL, INS, TERM = 0, 1, 2, 3
NEG_INF = np.float32(-np.inf)


@dataclass
class Aligned:
    start: int            # 1-based start of the aligned range in the unaligned string
    width: int            # width of that range (ungapped characters)
    indel_start: list[int]
    indel_width: list[int]


@dataclass
class PairwiseResult:
    score: float
    pattern: Aligned
    subject: Aligned
    pattern_string: str
    subject_string: str

    def aligned_pattern(self) -> str:
        return _aligned(self.pattern_string, self.pattern)

    def aligned_subject(self) -> str:
        return _aligned(self.subject_string, self.subject)


def _aligned(s: str, a: Aligned) -> str:
    """pwalign:::AlignedXStringSet_align_aligned — insert '-' at indel positions."""
    if a.width <= 0:
        return ""
    region = s[a.start - 1 : a.start - 1 + a.width]
    if not a.indel_start:
        return region
    out, prev = [], 0
    for st, w in zip(a.indel_start, a.indel_width):
        cur = st - 1
        if cur - prev > 0:
            out.append(region[prev:cur])
        out.append("-" * w)
        prev = cur
    out.append(region[prev:])
    return "".join(out)


@njit(cache=True, nogil=True)  # nogil: TIMER aligns independent pairs on several threads
def _dp(s1, s2, table, gap_open, gap_ext, end_gap1, end_gap2):
    n1 = s1.shape[0]
    n2 = s2.shape[0]
    go = np.float32(gap_open)
    ge = np.float32(gap_ext)
    goe = np.float32(go + ge)
    neg = np.float32(-np.inf)
    zero = np.float32(0.0)
    curr = np.empty((n1 + 1, 3), dtype=np.float32)
    prev = np.empty((n1 + 1, 3), dtype=np.float32)
    s_tr = np.empty((n1, n2), dtype=np.int8)
    d_tr = np.empty((n1, n2), dtype=np.int8)
    i_tr = np.empty((n1, n2), dtype=np.int8)

    curr[0, 0] = zero
    curr[0, 1] = -go if end_gap2 else zero
    for i in range(1, n1 + 1):
        curr[i, 0] = neg
        curr[i, 1] = neg
    for i in range(0, n1 + 1):
        if end_gap1:
            curr[i, 2] = np.float32(-go - np.float32(i) * ge)
        else:
            curr[i, 2] = zero
    end_gap_addend = -ge if end_gap2 else zero
    no_end_gap1 = not end_gap1
    no_end_gap2 = not end_gap2

    for j in range(1, n2 + 1):
        tmp = prev
        prev = curr
        curr = tmp
        jm1 = j - 1
        j_elt = n2 - j
        curr[0, 0] = neg
        curr[0, 1] = np.float32(prev[0, 1] + end_gap_addend)
        curr[0, 2] = neg
        c2 = s2[j_elt]
        for i in range(1, n1 + 1):
            im1 = i - 1
            i_elt = n1 - i
            sub = table[s1[i_elt], c2]
            # substitution state
            if prev[im1, 0] >= max(prev[im1, 1], prev[im1, 2]):
                s_tr[im1, jm1] = SUB
                curr[i, 0] = np.float32(prev[im1, 0] + sub)
            elif prev[im1, 1] >= prev[im1, 2]:
                s_tr[im1, jm1] = DEL
                curr[i, 0] = np.float32(prev[im1, 1] + sub)
            else:
                s_tr[im1, jm1] = INS
                curr[i, 0] = np.float32(prev[im1, 2] + sub)
            # deletion state (consume string 2)
            if prev[i, 1] > np.float32(max(prev[i, 0], prev[i, 2]) - go):
                d_tr[im1, jm1] = DEL
                curr[i, 1] = np.float32(prev[i, 1] - ge)
            elif prev[i, 0] >= prev[i, 2]:
                d_tr[im1, jm1] = SUB
                curr[i, 1] = np.float32(prev[i, 0] - goe)
            else:
                d_tr[im1, jm1] = INS
                curr[i, 1] = np.float32(prev[i, 2] - goe)
            # insertion state (consume string 1)
            if curr[im1, 2] > np.float32(max(curr[im1, 0], curr[im1, 1]) - go):
                i_tr[im1, jm1] = INS
                curr[i, 2] = np.float32(curr[im1, 2] - ge)
            elif curr[im1, 0] >= curr[im1, 1]:
                i_tr[im1, jm1] = SUB
                curr[i, 2] = np.float32(curr[im1, 0] - goe)
            else:
                i_tr[im1, jm1] = DEL
                curr[i, 2] = np.float32(curr[im1, 1] - goe)
        if no_end_gap2:
            if prev[n1, 1] >= max(prev[n1, 0], prev[n1, 2]):
                d_tr[n1 - 1, jm1] = DEL
                curr[n1, 1] = prev[n1, 1]
            elif prev[n1, 0] >= prev[n1, 2]:
                d_tr[n1 - 1, jm1] = SUB
                curr[n1, 1] = prev[n1, 0]
            else:
                d_tr[n1 - 1, jm1] = INS
                curr[n1, 1] = prev[n1, 2]
        if no_end_gap1 and j == n2:
            for i in range(1, n1 + 1):
                im1 = i - 1
                if curr[im1, 2] >= max(curr[im1, 0], curr[im1, 1]):
                    i_tr[im1, jm1] = INS
                    curr[i, 2] = curr[im1, 2]
                elif curr[im1, 0] >= curr[im1, 1]:
                    i_tr[im1, jm1] = SUB
                    curr[i, 2] = curr[im1, 0]
                else:
                    i_tr[im1, jm1] = DEL
                    curr[i, 2] = curr[im1, 1]

    if curr[n1, 0] >= max(curr[n1, 1], curr[n1, 2]):
        state = SUB
        score = curr[n1, 0]
    elif curr[n1, 1] >= curr[n1, 2]:
        state = DEL
        score = curr[n1, 1]
    else:
        state = INS
        score = curr[n1, 2]
    return score, state, s_tr, d_tr, i_tr


def _traceback(state, s_tr, d_tr, i_tr, n1, n2):
    start1 = start2 = 1
    width1 = width2 = 0
    ind1_s: list[int] = []
    ind1_w: list[int] = []
    ind2_s: list[int] = []
    ind2_w: list[int] = []
    prev_state = -1
    i = n1 - start1
    j = n2 - start2
    cur = state
    while cur != TERM and i >= 0 and j >= 0:
        if cur == INS:
            nxt = i_tr[i, j]
            if nxt != TERM:
                if j == n2 - 1:
                    start1 += 1
                else:
                    width1 += 1
                    if prev_state != INS:
                        ind2_s.append(n2 - j)
                        ind2_w.append(0)
                    ind2_w[-1] += 1
            prev_state = cur
            cur = nxt
            i -= 1
        elif cur == DEL:
            nxt = d_tr[i, j]
            if nxt != TERM:
                if i == n1 - 1:
                    start2 += 1
                else:
                    width2 += 1
                    if prev_state != DEL:
                        ind1_s.append(n1 - i)
                        ind1_w.append(0)
                    ind1_w[-1] += 1
            prev_state = cur
            cur = nxt
            j -= 1
        else:
            prev_state = cur
            cur = s_tr[i, j]
            if cur != TERM:
                width1 += 1
                width2 += 1
            i -= 1
            j -= 1
    off1 = start1 - 1
    if off1 > 0:
        ind1_s = [s - off1 for s in ind1_s]
    off2 = start2 - 1
    if off2 > 0:
        ind2_s = [s - off2 for s in ind2_s]
    return Aligned(start1, width1, ind1_s, ind1_w), Aligned(start2, width2, ind2_s, ind2_w)


def _encode(s: str) -> np.ndarray:
    return np.frombuffer(s.encode("ascii", "replace"), dtype=np.uint8).copy()


def pairwise_alignment(pattern: str, subject: str, table: np.ndarray, gap_opening: float,
                       gap_extension: float, kind: str = "global") -> PairwiseResult:
    if kind == "global":
        end1, end2 = True, True
    elif kind == "global-local":
        end1, end2 = True, False
    elif kind == "local-global":
        end1, end2 = False, True
    elif kind == "overlap":
        end1, end2 = False, False
    else:
        raise ValueError(f"unsupported alignment type {kind!r}")
    n1, n2 = len(pattern), len(subject)
    if n1 < 1 or n2 < 1:
        if n1 >= 1 and end1:
            score = -gap_opening - n1 * gap_extension
        elif n2 >= 1 and end2:
            score = -gap_opening - n2 * gap_extension
        else:
            score = 0.0
        empty = Aligned(1, 0, [], [])
        return PairwiseResult(score, empty, Aligned(1, 0, [], []), pattern, subject)
    score, state, s_tr, d_tr, i_tr = _dp(_encode(pattern), _encode(subject), table,
                                         float(gap_opening), float(gap_extension), end1, end2)
    a1, a2 = _traceback(int(state), s_tr, d_tr, i_tr, n1, n2)
    return PairwiseResult(float(score), a1, a2, pattern, subject)


def substitution_table(match: float, mismatch: float, letters: str | None = None) -> np.ndarray:
    """256x256 float32 table. With ``letters`` (e.g. "ACGT") only those letters score
    match/mismatch; others score 0 like a baseOnly nucleotideSubstitutionMatrix lookup
    never reached in practice. Without ``letters`` identical bytes match."""
    t = np.full((256, 256), np.float32(mismatch), dtype=np.float32)
    if letters is None:
        np.fill_diagonal(t, np.float32(match))
    else:
        t[:] = 0
        codes = [ord(c) for c in letters]
        for a in codes:
            for b in codes:
                t[a, b] = np.float32(match if a == b else mismatch)
    return t


def quality_scores(phred: int = 22, alphabet_length: int = 4) -> tuple[float, float]:
    """pwalign::qualitySubstitutionMatrices for two reads of equal Phred quality (bitScale 1)."""
    e = 10.0 ** (-phred / 10.0)
    n = alphabet_length
    eps = e + e - (n / (n - 1)) * e * e
    match = math.log2((1 - eps) * n)
    mismatch = math.log2(eps * n / (n - 1))
    return match, mismatch


# Tables used by the PRRSLoom apps
CLASSIFIER_TABLE = substitution_table(1.0, -3.0, "ACGT")
_q_match, _q_mismatch = quality_scores()
TIMER_TABLE = substitution_table(_q_match, _q_mismatch)
