"""Multiple sequence alignment via external aligners.

* NJ Tree Builder: the R app calls ``msa::msa(method = "ClustalW")``, which
  embeds ClustalW 2.1 with its default parameters and returns sequences in
  ClustalW's "aligned" output order. We run the ClustalW 2.1 binary with its
  defaults (OUTORDER=ALIGNED), so both alignments come from the same program.
* Haplotype Network: the R app uses ``DECIPHER::AlignSeqs``, which has no
  Python or command-line equivalent. MAFFT (--auto) is used instead; this is
  a documented difference (see docs/prrsloom/FEATURE_MAPPING.md).

Sequence names are replaced by safe tokens while the external program runs,
so arbitrary FASTA headers can never reach a command line.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import threading
from pathlib import Path
from typing import Callable

from ..config import settings
from ..fasta import read_fasta_text


class AlignerError(RuntimeError):
    pass


def _write_tokens(records: list[tuple[str, str]], path: Path) -> dict[str, int]:
    tokens = {}
    with path.open("w") as fh:
        for i, (_, seq) in enumerate(records):
            tok = f"s{i:06d}"
            tokens[tok] = i
            fh.write(f">{tok}\n{seq}\n")
    return tokens


def _which(binary: str) -> str:
    found = shutil.which(binary)
    if not found:
        raise AlignerError(f"Aligner '{binary}' is not installed on the server.")
    return found


# ClustalW 2.1 defaults. -QUIET is not used: the verbose stdout reports every pairwise alignment
# and progressive group, which gives exact progress; the alignment and guide tree are
# byte-identical with and without -QUIET (checked on ClustalW 2.1).
CLUSTALW_ARGS = ("-ALIGN", "-TYPE=DNA", "-OUTPUT=FASTA")
# MAFFT --auto (as before) picks its strategy from the data size: L-INS-i for small sets,
# FFT-NS-i / FFT-NS-2 (fast progressive) for larger ones. --quiet is not used so the strategy
# MAFFT chose can be reported; the alignment is the same with and without it.
MAFFT_ARGS = ("--auto", "--thread", "1")
# L-INS-i: local pairwise alignment + up to 1000 iterative refinement cycles, MAFFT's most
# accurate mode for up to a few hundred sequences. Runs on the job's threads: on 503 ORF5
# sequences 1 and 4 threads gave byte-identical alignments (326 s vs 123 s).
MAFFT_LINSI_ARGS = ("--localpair", "--maxiterate", "1000")
_STRATEGY = re.compile(r"Strategy:\s*\n\s*(.+)")
# share of ClustalW's run time spent in the (all-pairs) pairwise stage vs. progressive alignment
_PAIRWISE_SHARE = 0.85
_PAIR_LINE = re.compile(r"^Sequences \(\d+:\d+\) Aligned")
_GROUPS_LINE = re.compile(r"^There are (\d+) groups")
_GROUP_LINE = re.compile(r"^Group \d+:")

Progress = Callable[[float, str], None]


def _run(cmd: list[str], name: str, timeout: int | None, **kwargs) -> subprocess.CompletedProcess:
    # default: the job's own wall-clock limit (the dispatcher stops the whole job at that point)
    timeout = timeout or settings.job_timeout_s
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, **kwargs)
    except subprocess.TimeoutExpired:
        raise AlignerError(f"{name} did not finish within {timeout // 60} minutes. Try fewer or shorter sequences.") from None


def clustalw(records: list[tuple[str, str]], timeout: int | None = None,
             progress: Progress | None = None, use_cache: bool = True) -> list[tuple[str, str]]:
    """ClustalW 2.1 with default parameters. ``progress(fraction, message)`` receives exact
    counts from ClustalW's own output (pairwise alignments done / total, then groups)."""
    exe = _which(settings.clustalw_bin)
    seqs = [s for _, s in records]
    report = progress or (lambda f, m: None)
    aligned = cache_get("clustalw", exe, CLUSTALW_ARGS, seqs) if use_cache else None
    if aligned is not None:
        report(1.0, f"ClustalW: this exact input ({len(seqs)} sequences) was aligned before with the same ClustalW "
                    "binary and parameters; reused that stored result (identical output, no re-computation)")
    else:
        with tempfile.TemporaryDirectory(prefix="prrsloom_cw_") as tmp:
            tmp = Path(tmp)
            _write_tokens(records, tmp / "in.fasta")
            cmd = [exe, f"-INFILE={tmp / 'in.fasta'}", *CLUSTALW_ARGS, f"-OUTFILE={tmp / 'out.fasta'}"]
            code, tail = _stream_clustalw(cmd, tmp, len(seqs), timeout or settings.job_timeout_s, report)
            out = tmp / "out.fasta"
            if code != 0 or not out.exists():
                raise AlignerError(f"ClustalW failed: {tail[-400:]}")
            aligned = read_fasta_text(out.read_text())
        cache_put("clustalw", exe, CLUSTALW_ARGS, seqs, aligned)
    tokens = {f"s{i:06d}": i for i in range(len(records))}
    return [(records[tokens[tok]][0], seq.upper()) for tok, seq in aligned]


def _stream_clustalw(cmd: list[str], cwd: Path, n: int, timeout: int, report: Progress) -> tuple[int, str]:
    """Run ClustalW, turning its per-alignment output lines into progress reports."""
    pairs_total = max(1, n * (n - 1) // 2)
    groups_total = max(1, n - 1)
    pairs = groups = 0
    last_pct = -1
    tail: list[str] = []
    report(0.0, f"ClustalW: pairwise alignment of {n} sequences ({pairs_total:,} pairs), then progressive alignment")
    proc = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, errors="replace")
    timed_out = threading.Event()

    def watchdog():
        timed_out.set()
        proc.kill()

    timer = threading.Timer(timeout, watchdog)
    timer.start()
    try:
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            tail = (tail + [line])[-20:]
            if _PAIR_LINE.match(line):
                pairs += 1
            elif m := _GROUPS_LINE.match(line):
                groups_total = max(1, int(m.group(1)))
                report(_PAIRWISE_SHARE, f"ClustalW: pairwise stage done ({pairs:,} alignments); guide tree built; "
                                        f"progressive alignment of {groups_total} groups")
            elif _GROUP_LINE.match(line):
                groups += 1
            else:
                continue
            frac = (_PAIRWISE_SHARE * pairs / pairs_total) if groups == 0 else \
                _PAIRWISE_SHARE + (1 - _PAIRWISE_SHARE) * groups / groups_total
            pct = int(frac * 100)
            if pct != last_pct:
                last_pct = pct
                stage = (f"pairwise alignment {pairs:,} / {pairs_total:,}" if groups == 0
                         else f"progressive alignment, group {groups} / {groups_total}")
                report(min(frac, 0.999), f"ClustalW: {stage}")
        code = proc.wait()
    finally:
        timer.cancel()
    if timed_out.is_set():
        raise AlignerError(f"ClustalW did not finish within {timeout // 60} minutes. Try fewer or shorter sequences.")
    if code == 0:
        report(1.0, f"ClustalW: alignment complete ({n} sequences)")
    return code, "\n".join(tail)


def mafft(records: list[tuple[str, str]], timeout: int | None = None, use_cache: bool = True,
          progress: Progress | None = None, accurate: bool = False) -> list[tuple[str, str]]:
    """MAFFT --auto, or with ``accurate`` L-INS-i (slower, iterative refinement)."""
    exe = _which(settings.mafft_bin)
    seqs = [s for _, s in records]
    report = progress or (lambda f, m: None)
    args = (*MAFFT_LINSI_ARGS, "--thread", str(max(1, settings.job_threads))) if accurate else MAFFT_ARGS
    aligned = cache_get("mafft", exe, args, seqs) if use_cache else None
    if aligned is not None:
        report(1.0, f"MAFFT: this exact input ({len(seqs)} sequences) was aligned before; reused that stored result")
    else:
        report(0.0, f"MAFFT: aligning {len(seqs)} sequences ({'L-INS-i' if accurate else 'automatic strategy'})")
    if aligned is None:
        with tempfile.TemporaryDirectory(prefix="prrsloom_mf_") as tmp:
            tmp = Path(tmp)
            _write_tokens(records, tmp / "in.fasta")
            started = time.monotonic()
            proc = _run([exe, *args, str(tmp / "in.fasta")], "MAFFT", timeout)
            if proc.returncode != 0 or not proc.stdout.strip():
                raise AlignerError(f"MAFFT failed: {proc.stderr[-400:]}")
            aligned = read_fasta_text(proc.stdout)
            took = time.monotonic() - started
        cache_put("mafft", exe, args, seqs, aligned)
        m = _STRATEGY.search(proc.stderr or "")
        strategy = m.group(1).strip() if m else ("L-INS-i" if accurate else "automatic")
        report(1.0, f"MAFFT: alignment complete ({len(seqs)} sequences, {len(aligned[0][1]):,} columns, "
                    f"strategy {strategy}, {took:.1f} s)")
    by_token = {tok: seq.upper() for tok, seq in aligned}
    # DECIPHER::AlignSeqs keeps the input order
    return [(records[i][0], by_token[f"s{i:06d}"]) for i in range(len(records))]


# ---------------------------------------------------------------- alignment cache
#
# ClustalW and MAFFT are deterministic: the same binary, arguments and sequences (in the same
# order) always give the same alignment. Sequence names never reach the aligner (positional
# tokens are used), so the key is the binary identity + arguments + the exact sequences.
# Entries are gzip JSON files under <data>/cache/alignments, evicted oldest-first when the
# directory exceeds PRRSLOOM_ALIGNMENT_CACHE_MB (0 disables the cache).

def _cache_dir() -> Path:
    return settings.data_dir / "cache" / "alignments"


def _cache_key(kind: str, exe: str, args: tuple[str, ...], seqs: list[str]) -> str:
    st = os.stat(exe)
    h = hashlib.sha256()
    h.update(json.dumps([kind, os.path.realpath(exe), st.st_size, st.st_mtime_ns, list(args)]).encode())
    for s in seqs:
        h.update(b"\n>")
        h.update(s.encode("utf-8", "surrogatepass"))
    return h.hexdigest()


def cache_get(kind: str, exe: str, args: tuple[str, ...], seqs: list[str]) -> list[tuple[str, str]] | None:
    if settings.alignment_cache_mb <= 0:
        return None
    path = _cache_dir() / f"{_cache_key(kind, exe, args, seqs)}.json.gz"
    try:
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            data = json.load(fh)
        os.utime(path)  # LRU: mark as recently used
    except (OSError, ValueError):
        return None
    if len(data) != len(seqs):
        return None
    return [(tok, seq) for tok, seq in data]


def cache_put(kind: str, exe: str, args: tuple[str, ...], seqs: list[str], aligned: list[tuple[str, str]]) -> None:
    if settings.alignment_cache_mb <= 0:
        return
    d = _cache_dir()
    try:
        d.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
        with os.fdopen(fd, "wb") as raw, gzip.open(raw, "wt", encoding="utf-8") as fh:
            json.dump([[tok, seq] for tok, seq in aligned], fh)
        os.replace(tmp, d / f"{_cache_key(kind, exe, args, seqs)}.json.gz")
        _evict(d, settings.alignment_cache_mb * 1024 * 1024)
    except OSError:
        pass  # caching is best effort


def _evict(d: Path, limit: int) -> None:
    entries = []
    for p in d.glob("*.json.gz"):
        try:
            st = p.stat()
            entries.append((st.st_mtime, st.st_size, p))
        except OSError:
            continue
    total = sum(e[1] for e in entries)
    for _, size, p in sorted(entries):
        if total <= limit:
            break
        p.unlink(missing_ok=True)
        total -= size
