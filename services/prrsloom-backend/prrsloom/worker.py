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


MAX_LOG = 2000  # entries kept in status.json (one per distinct progress message)


def main(job_dir: str) -> int:
    d = Path(job_dir).resolve()
    job = json.loads((d / "job.json").read_text())
    inputs = {p.stem: p.read_text(encoding="utf-8") for p in (d / "inputs").glob("*.txt")}
    state = {"t": 0.0, "p": 0.0, "msg": "", "log": []}

    def log(level: str, message: str) -> None:
        state["log"].append({"t": round(time.time(), 3), "p": round(state["p"] * 100, 1), "l": level, "m": message})
        del state["log"][:-MAX_LOG]

    def progress(fraction: float, message: str) -> None:
        # never move backwards; 100% is reserved for the finished job
        state["p"] = max(state["p"], min(max(fraction, 0.0), 0.99))
        if message != state["msg"]:
            state["msg"] = message
            log("warn" if message.lower().startswith(("k80 undefined", "warning")) else "info", message)
        now = time.time()
        if now - state["t"] > 0.5 or fraction >= 0.99:
            state["t"] = now
            _write_status(d, state="running", progress=round(state["p"], 4), message=message, log=state["log"])

    from .fasta import InputError
    from .analyses.msa import AlignerError
    from . import pipelines

    def failed(error: str) -> int:
        log("error", error)
        _write_status(d, state="failed", progress=round(state["p"], 4), message="Failed", error=error, log=state["log"])
        return 1

    try:
        progress(0.01, f"Starting {job['module'].replace('_', ' ')} analysis")
        if os.environ.get("PRRSLOOM_TEST_SLEEP_S"):  # test hook for the timeout path
            time.sleep(float(os.environ["PRRSLOOM_TEST_SLEEP_S"]))
        result = pipelines.run(job["module"], job.get("params") or {}, inputs, d / "out", progress)
    except (InputError, AlignerError) as exc:
        return failed(str(exc))
    except MemoryError:
        return failed("The analysis ran out of memory. Try a smaller dataset.")
    except Exception as exc:  # unexpected: keep the traceback in the job log only
        traceback.print_exc()
        return failed(f"Analysis failed: {type(exc).__name__}: {exc}")
    for w in result.get("warnings") or []:
        log("warn", w)
    state["p"] = 1.0
    log("info", "Completed")
    _write_status(d, state="succeeded", progress=1.0, message="Completed", log=state["log"])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
