import os
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
# Upstream classifier files: on the server they live in the resource cache; locally set PRRSLOOM_TEST_RESOURCES.
RESOURCE_SRC = Path(os.environ.get("PRRSLOOM_TEST_RESOURCES", "/srv/prrsloom/resources"))
RESOURCE_FILES = ("model.Rdata", "model.lineage.rf.Rdata", "attr.ref.csv", "reference.sequences.fasta", "sequences.example.fasta")


@pytest.fixture()
def data_dir(tmp_path, monkeypatch):
    from prrsloom.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "api_key", "test-key")
    (tmp_path / "jobs").mkdir()
    return tmp_path


@pytest.fixture()
def resources_dir(data_dir):
    if not all((RESOURCE_SRC / f).exists() for f in RESOURCE_FILES):
        pytest.skip("upstream classifier files not available (set PRRSLOOM_TEST_RESOURCES)")
    dest = data_dir / "resources"
    dest.mkdir()
    for f in RESOURCE_FILES:
        shutil.copy(RESOURCE_SRC / f, dest / f)
    return dest


def aligner_available(env: str, default: str) -> bool:
    return shutil.which(os.environ.get(env, default)) is not None
