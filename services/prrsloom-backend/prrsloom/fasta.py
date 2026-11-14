"""Input parsing and validation shared by the modules (FASTA, CSV, trees)."""

from __future__ import annotations

import csv
import io
import re

from .config import settings


class InputError(ValueError):
    """A user-facing validation error."""


_SEQ_OK = re.compile(r"^[A-Za-z\-\.\*\?]*$")


def read_fasta_text(text: str) -> list[tuple[str, str]]:
    """Biostrings::readDNAStringSet semantics: the name is the whole header line after '>'."""
    records: list[tuple[str, str]] = []
    name = None
    chunks: list[str] = []
    for raw in text.splitlines():
        line = raw.rstrip("\r")
        if line.startswith(">"):
            if name is not None:
                records.append((name, "".join(chunks)))
            name = line[1:]
            chunks = []
        elif line.strip() == "" or line.startswith(";"):
            continue
        else:
            if name is None:
                raise InputError("FASTA input must start with a header line beginning with '>'.")
            chunks.append(re.sub(r"\s+", "", line))
    if name is not None:
        records.append((name, "".join(chunks)))
    return records


def parse_fasta(text: str, *, min_sequences: int = 1, max_sequences: int | None = None,
                unique_names: bool = False, label: str = "FASTA input") -> list[tuple[str, str]]:
    text = (text or "").strip()
    if not text:
        raise InputError("Upload a FASTA file or paste FASTA sequences before running the analysis.")
    if not text.startswith(">"):
        raise InputError("Pasted FASTA sequences must start with a header line beginning with '>'.")
    records = read_fasta_text(text)
    limit = max_sequences or settings.max_sequences
    if len(records) > limit:
        raise InputError(f"{label} has {len(records)} sequences; the limit is {limit}.")
    for name, seq in records:
        if not seq:
            raise InputError(f"Sequence '{name}' is empty.")
        if not _SEQ_OK.match(seq):
            bad = sorted(set(re.sub(r"[A-Za-z\-\.\*\?]", "", seq)))
            raise InputError(f"Sequence '{name}' contains characters that are not valid in a nucleotide FASTA: {''.join(bad)!r}.")
        if len(seq) > settings.max_sequence_length:
            raise InputError(f"Sequence '{name}' is {len(seq)} characters long; the limit is {settings.max_sequence_length}.")
    if len(records) < min_sequences:
        need = "two valid sequences are" if min_sequences == 2 else f"{min_sequences} sequences are"
        raise InputError(f"At least {need} required for this analysis.")
    if unique_names:
        seen, dup = set(), []
        for n, _ in records:
            if n in seen and n not in dup:
                dup.append(n)
            seen.add(n)
        if dup:
            raise InputError("Sequence names must be unique. Duplicated names: " + ", ".join(dup))
    return records


def read_csv_text(text: str, label: str = "CSV") -> tuple[list[str], list[dict]]:
    text = (text or "").lstrip("﻿")
    if not text.strip():
        raise InputError(f"The {label} file is empty.")
    try:
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
    except csv.Error as exc:
        raise InputError(f"The {label} file could not be read as CSV: {exc}") from None
    if not rows:
        raise InputError(f"The {label} file is empty.")
    header = [h.strip() for h in rows[0]]
    header = make_unique([h if h else f"extra_column_{i + 1}" for i, h in enumerate(header)])
    records = []
    for r in rows[1:]:
        if not any(c.strip() for c in r):
            continue
        r = r + [""] * (len(header) - len(r))
        records.append({h: r[i] for i, h in enumerate(header)})
    if len(records) > 100_000:
        raise InputError(f"The {label} file has too many rows.")
    return header, records


def make_unique(names: list[str], sep: str = "_") -> list[str]:
    """base::make.unique"""
    seen: dict[str, int] = {}
    out = []
    used = set(names)
    for n in names:
        if n not in seen:
            seen[n] = 0
            out.append(n)
            continue
        k = seen[n]
        while True:
            k += 1
            cand = f"{n}{sep}{k}"
            if cand not in used:
                break
        seen[n] = k
        used.add(cand)
        out.append(cand)
    return out


def decode_upload(data: bytes, label: str) -> str:
    if len(data) > settings.max_upload_bytes:
        raise InputError(f"The {label} is larger than {settings.max_upload_bytes // (1024 * 1024)} MB.")
    if b"\x00" in data[:4096]:
        raise InputError(f"The {label} looks like a binary file; upload plain text.")
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    raise InputError(f"The {label} could not be decoded as text.")
