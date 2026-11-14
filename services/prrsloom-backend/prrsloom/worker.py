"""Runs one job in its own process: ``python -m prrsloom.worker <job_dir>``."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import traceback
from pathlib import Path


def _write_status(d: Path, **status) -> None:
    status["updated"] = time.time()
    fd, tmp = tempfile.mkstemp(dir=d)
    with os.fdopen(fd, "w") as fh:
        json.dump(status, fh)
    os.replace(tmp, d / "status.json")


def main(job_dir: str) -> int:
    d = Path(job_dir).resolve()
    job = json.loads((d / "job.json").read_text())
    inputs = {p.stem: p.read_text(encoding="utf-8") for p in (d / "inputs").glob("*.txt")}
    last = {"t": 0.0}

    def progress(fraction: float, message: str) -> None:
        now = time.time()
        if now - last["t"] > 0.5 or fraction >= 0.99:
            last["t"] = now
            _write_status(d, state="running", progress=round(min(max(fraction, 0.0), 0.99), 3), message=message)

    from .fasta import InputError
    from .analyses.msa import AlignerError
    from . import pipelines

    try:
        progress(0.01, "Starting analysis")
        if os.environ.get("PRRSLOOM_TEST_SLEEP_S"):  # test hook for the timeout path
            time.sleep(float(os.environ["PRRSLOOM_TEST_SLEEP_S"]))
        pipelines.run(job["module"], job.get("params") or {}, inputs, d / "out", progress)
    except (InputError, AlignerError) as exc:
        _write_status(d, state="failed", error=str(exc))
        return 1
    except MemoryError:
        _write_status(d, state="failed", error="The analysis ran out of memory. Try a smaller dataset.")
        return 1
    except Exception as exc:  # unexpected: keep the traceback in the job log only
        traceback.print_exc()
        _write_status(d, state="failed", error=f"Analysis failed: {type(exc).__name__}: {exc}")
        return 1
    _write_status(d, state="succeeded", progress=1.0, message="Completed")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
