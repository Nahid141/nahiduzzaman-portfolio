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
import shutil
import subprocess
import tempfile
from pathlib import Path

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


CLUSTALW_ARGS = ("-ALIGN", "-TYPE=DNA", "-OUTPUT=FASTA", "-QUIET")
MAFFT_ARGS = ("--auto", "--quiet", "--thread", "1")


def _run(cmd: list[str], name: str, timeout: int | None, **kwargs) -> subprocess.CompletedProcess:
    # default: the job's own wall-clock limit (the dispatcher stops the whole job at that point)
    timeout = timeout or settings.job_timeout_s
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, **kwargs)
    except subprocess.TimeoutExpired:
        raise AlignerError(f"{name} did not finish within {timeout // 60} minutes. Try fewer or shorter sequences.") from None


def clustalw(records: list[tuple[str, str]], timeout: int | None = None) -> list[tuple[str, str]]:
    exe = _which(settings.clustalw_bin)
    seqs = [s for _, s in records]
    aligned = cache_get("clustalw", exe, CLUSTALW_ARGS, seqs)
    if aligned is None:
        with tempfile.TemporaryDirectory(prefix="prrsloom_cw_") as tmp:
            tmp = Path(tmp)
            _write_tokens(records, tmp / "in.fasta")
            cmd = [exe, f"-INFILE={tmp / 'in.fasta'}", *CLUSTALW_ARGS[:3], f"-OUTFILE={tmp / 'out.fasta'}", *CLUSTALW_ARGS[3:]]
            proc = _run(cmd, "ClustalW", timeout, cwd=tmp)
            out = tmp / "out.fasta"
            if proc.returncode != 0 or not out.exists():
                raise AlignerError(f"ClustalW failed: {(proc.stderr or proc.stdout)[-400:]}")
            aligned = read_fasta_text(out.read_text())
        cache_put("clustalw", exe, CLUSTALW_ARGS, seqs, aligned)
    tokens = {f"s{i:06d}": i for i in range(len(records))}
    return [(records[tokens[tok]][0], seq.upper()) for tok, seq in aligned]


def mafft(records: list[tuple[str, str]], timeout: int | None = None) -> list[tuple[str, str]]:
    exe = _which(settings.mafft_bin)
    seqs = [s for _, s in records]
    aligned = cache_get("mafft", exe, MAFFT_ARGS, seqs)
    if aligned is None:
        with tempfile.TemporaryDirectory(prefix="prrsloom_mf_") as tmp:
            tmp = Path(tmp)
            _write_tokens(records, tmp / "in.fasta")
            proc = _run([exe, *MAFFT_ARGS, str(tmp / "in.fasta")], "MAFFT", timeout)
            if proc.returncode != 0 or not proc.stdout.strip():
                raise AlignerError(f"MAFFT failed: {proc.stderr[-400:]}")
            aligned = read_fasta_text(proc.stdout)
        cache_put("mafft", exe, MAFFT_ARGS, seqs, aligned)
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
