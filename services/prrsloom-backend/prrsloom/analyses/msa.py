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


def clustalw(records: list[tuple[str, str]], timeout: int = 1200) -> list[tuple[str, str]]:
    exe = _which(settings.clustalw_bin)
    with tempfile.TemporaryDirectory(prefix="prrsloom_cw_") as tmp:
        tmp = Path(tmp)
        tokens = _write_tokens(records, tmp / "in.fasta")
        cmd = [exe, f"-INFILE={tmp / 'in.fasta'}", "-ALIGN", "-TYPE=DNA", "-OUTPUT=FASTA",
               f"-OUTFILE={tmp / 'out.fasta'}", "-QUIET"]
        proc = subprocess.run(cmd, cwd=tmp, capture_output=True, text=True, timeout=timeout)
        out = tmp / "out.fasta"
        if proc.returncode != 0 or not out.exists():
            raise AlignerError(f"ClustalW failed: {(proc.stderr or proc.stdout)[-400:]}")
        aligned = read_fasta_text(out.read_text())
    return [(records[tokens[tok]][0], seq.upper()) for tok, seq in aligned]


def mafft(records: list[tuple[str, str]], timeout: int = 1200) -> list[tuple[str, str]]:
    exe = _which(settings.mafft_bin)
    with tempfile.TemporaryDirectory(prefix="prrsloom_mf_") as tmp:
        tmp = Path(tmp)
        tokens = _write_tokens(records, tmp / "in.fasta")
        proc = subprocess.run([exe, "--auto", "--quiet", "--thread", "1", str(tmp / "in.fasta")],
                              capture_output=True, text=True, timeout=timeout)
        if proc.returncode != 0 or not proc.stdout.strip():
            raise AlignerError(f"MAFFT failed: {proc.stderr[-400:]}")
        aligned = read_fasta_text(proc.stdout)
    by_token = {tok: seq.upper() for tok, seq in aligned}
    # DECIPHER::AlignSeqs keeps the input order
    return [(records[i][0], by_token[tok]) for tok, i in tokens.items()]
