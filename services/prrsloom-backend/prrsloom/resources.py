"""Upstream classifier resources (model, references) with an on-disk cache.

The Shiny apps load these from github.com/kvanderwaal/prrsv2_classification
every time they start, so they always use the latest quarterly model. We do
the same, but cache the files and refresh them at most every
``PRRSLOOM_RESOURCE_TTL_HOURS``; if GitHub is unreachable the last good copy is
used. Every result records the SHA-256 of the files it used.
"""

from __future__ import annotations

import csv
import hashlib
import json
import logging
import os
import pickle
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from .config import settings

log = logging.getLogger(__name__)

BASE = "https://raw.githubusercontent.com/kvanderwaal/prrsv2_classification/main/"
FILES = {
    "model": "model.Rdata",
    "lineage_model": "model.lineage.rf.Rdata",
    "reference_metadata": "attr.ref.csv",
    "reference_fasta": "reference.sequences.fasta",
    "example_fasta": "sequences.example.fasta",
}


def _cache_dir() -> Path:
    d = settings.data_dir / "resources"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _download(name: str, dest: Path) -> None:
    url = BASE + name
    req = urllib.request.Request(url, headers={"User-Agent": "PRRSLooM/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    if len(data) < 32:
        raise IOError(f"Downloaded {name} is unexpectedly small")
    fd, tmp = tempfile.mkstemp(dir=dest.parent)
    with os.fdopen(fd, "wb") as fh:
        fh.write(data)
    os.replace(tmp, dest)


def ensure(key: str, force: bool = False) -> Path:
    name = FILES[key]
    path = _cache_dir() / name
    stale = not path.exists() or (time.time() - path.stat().st_mtime) > settings.resource_ttl_hours * 3600
    if force or stale:
        try:
            _download(name, path)
            log.info("refreshed %s", name)
        except Exception as exc:  # keep the last good copy
            if not path.exists():
                raise RuntimeError(f"Could not download {name} from the PRRSV-2 classification repository: {exc}") from exc
            log.warning("using cached %s (refresh failed: %s)", name, exc)
    return path


def ensure_all(force: bool = False) -> dict[str, dict]:
    out = {}
    for key in FILES:
        p = ensure(key, force=force)
        out[key] = {"file": p.name, "sha256": _sha(p), "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(p.stat().st_mtime))}
    (_cache_dir() / "provenance.json").write_text(json.dumps(out, indent=2))
    return out


def provenance() -> dict:
    p = _cache_dir() / "provenance.json"
    return json.loads(p.read_text()) if p.exists() else {}


def load_model(key: str):
    """Parsed classifier, cached as a pickle keyed by the .Rdata SHA-256."""
    from .analyses.rmodel import load_classifier

    src = ensure(key)
    digest = _sha(src)
    cached = _cache_dir() / f"{key}.{digest[:16]}.pkl"
    if cached.exists():
        with cached.open("rb") as fh:
            return pickle.load(fh)
    model = load_classifier(src)
    fd, tmp = tempfile.mkstemp(dir=cached.parent)
    with os.fdopen(fd, "wb") as fh:
        pickle.dump(model, fh, protocol=pickle.HIGHEST_PROTOCOL)
    os.replace(tmp, cached)
    for old in cached.parent.glob(f"{key}.*.pkl"):
        if old != cached:
            old.unlink(missing_ok=True)
    return model


@dataclass
class References:
    table: list[dict]
    fasta: list[tuple[str, str]]


def load_references() -> References:
    from .fasta import read_fasta_text

    meta = ensure("reference_metadata")
    seqs = ensure("reference_fasta")
    with meta.open(newline="", encoding="utf-8") as fh:
        table = list(csv.DictReader(fh))
    return References(table=table, fasta=read_fasta_text(seqs.read_text(encoding="utf-8")))
