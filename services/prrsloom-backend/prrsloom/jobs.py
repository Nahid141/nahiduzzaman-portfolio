"""Persistent job queue with bounded subprocess execution.

* Jobs are rows in SQLite; inputs and outputs live in ``<data>/jobs/<id>/``.
* A dispatcher thread starts at most ``max_workers`` worker processes
  (``python -m prrsloom.worker <dir>``), each with an address-space limit and
  a wall-clock timeout; a timed-out job's process group is killed.
* On start-up, jobs left ``running`` by a crash or restart are re-queued once
  (then failed); ``queued`` jobs simply continue.
* Finished jobs are deleted after ``result_ttl_hours``.
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from .config import settings

log = logging.getLogger(__name__)
JOB_ID = re.compile(r"^[0-9a-f]{32}$")
TERMINAL = {"succeeded", "failed", "expired", "cancelled"}
MAX_ATTEMPTS = 2
CANCEL_FLAG = "CANCEL_REQUESTED"
# Native thread pools that would otherwise each start one thread per core inside every job.
THREAD_ENV = ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS", "NUMBA_NUM_THREADS")


def _connect() -> sqlite3.Connection:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(settings.db_path, timeout=30, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con


def init_db() -> None:
    with _connect() as con:
        con.execute(
            """CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, module TEXT NOT NULL, status TEXT NOT NULL,
                created REAL NOT NULL, started REAL, finished REAL,
                progress REAL DEFAULT 0, message TEXT, error TEXT,
                attempts INTEGER DEFAULT 0, client TEXT)"""
        )
        con.execute("CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created)")


def job_dir(job_id: str) -> Path:
    if not JOB_ID.match(job_id or ""):
        raise ValueError("invalid job id")
    d = (settings.jobs_dir / job_id).resolve()
    if d.parent != settings.jobs_dir.resolve():
        raise ValueError("invalid job id")
    return d


def counts() -> dict:
    with _connect() as con:
        rows = con.execute("SELECT status, COUNT(*) n FROM jobs WHERE status IN ('queued','running') GROUP BY status").fetchall()
    out = {"queued": 0, "running": 0}
    out.update({r["status"]: r["n"] for r in rows})
    return out


def create(module: str, params: dict, inputs: dict[str, str], client: str = "") -> str:
    c = counts()
    if c["queued"] + c["running"] >= settings.max_queue:
        raise OverflowError("The analysis queue is full. Please try again in a few minutes.")
    job_id = uuid.uuid4().hex
    d = job_dir(job_id)
    (d / "inputs").mkdir(parents=True)
    (d / "out").mkdir()
    for key, text in inputs.items():
        (d / "inputs" / f"{key}.txt").write_text(text, encoding="utf-8")
    (d / "job.json").write_text(json.dumps({"id": job_id, "module": module, "params": params}))
    with _connect() as con:
        con.execute("INSERT INTO jobs (id, module, status, created, message, client) VALUES (?,?,?,?,?,?)",
                    (job_id, module, "queued", time.time(), "Queued", client[:64]))
    return job_id


def get(job_id: str) -> dict | None:
    if not JOB_ID.match(job_id or ""):
        return None
    with _connect() as con:
        row = con.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        return None
    job = dict(row)
    status = _read_status(job_dir(job_id)) if job["status"] in ("running", "succeeded", "failed", "cancelled") else None
    if job["status"] == "running" and status:
        job["progress"] = status.get("progress", job["progress"])
        job["message"] = status.get("message", job["message"])
    job["log"] = (status or {}).get("log") or []
    if job["status"] == "queued":
        with _connect() as con:
            ahead = con.execute("SELECT COUNT(*) FROM jobs WHERE status='queued' AND created < ?", (job["created"],)).fetchone()[0]
        job["queue_position"] = ahead + 1
    return job


def cancel(job_id: str) -> dict | None:
    """Cancel a job. Queued: cancelled at once. Running: flagged; the dispatcher kills the worker's
    process group within ~1 s and marks it cancelled. Finished jobs are returned unchanged."""
    job = get(job_id)
    if job is None or job["status"] in TERMINAL:
        return job
    with _connect() as con:
        # conditional update: never overwrite a job the dispatcher has just started or finished
        changed = con.execute("UPDATE jobs SET status='cancelled', finished=?, message='Cancelled by user' "
                              "WHERE id=? AND status='queued'", (time.time(), job_id)).rowcount
    if not changed:
        try:
            (job_dir(job_id) / CANCEL_FLAG).write_text(str(time.time()))
        except OSError:
            pass
        _update(job_id, message="Cancelling…")
    return get(job_id)


def _read_status(d: Path) -> dict | None:
    try:
        return json.loads((d / "status.json").read_text())
    except (OSError, ValueError):
        return None


def _update(job_id: str, **fields) -> None:
    cols = ", ".join(f"{k} = ?" for k in fields)
    with _connect() as con:
        con.execute(f"UPDATE jobs SET {cols} WHERE id = ?", (*fields.values(), job_id))


def _limits():  # pragma: no cover - Linux only
    import resource

    mem = settings.memory_limit_mb * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    os.nice(5)
    # If the service's cgroup reaches MemoryMax, the kernel should kill an analysis, not the API
    # process that holds the queue (raising one's own score needs no privileges).
    try:
        with open("/proc/self/oom_score_adj", "w") as fh:
            fh.write("500")
    except OSError:
        pass


class Dispatcher:
    def __init__(self):
        self._procs: dict[str, tuple[subprocess.Popen, float]] = {}
        self._stop = threading.Event()
        self._threads: list[threading.Thread] = []

    def recover(self) -> None:
        with _connect() as con:
            rows = con.execute("SELECT id, attempts FROM jobs WHERE status = 'running'").fetchall()
        for r in rows:
            d = job_dir(r["id"])
            _remove_tmp(d)  # temp files of the interrupted run
            if (d / CANCEL_FLAG).exists():
                _update(r["id"], status="cancelled", finished=time.time(), message="Cancelled by user")
            elif r["attempts"] < MAX_ATTEMPTS:
                _update(r["id"], status="queued", message="Re-queued after a service restart", progress=0)
            else:
                _update(r["id"], status="failed", finished=time.time(),
                        error="The analysis was interrupted by a service restart.", message="Interrupted")

    def start(self) -> None:
        self._stop = threading.Event()  # allow a restart after stop()
        self._threads = []
        init_db()
        self.recover()
        for target in (self._loop, self._cleanup_loop):
            t = threading.Thread(target=target, daemon=True)
            t.start()
            self._threads.append(t)

    def stop(self) -> None:
        self._stop.set()
        for job_id, (proc, _) in list(self._procs.items()):
            _kill(proc)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self._reap()
                self._launch()
            except Exception:  # keep the dispatcher alive
                log.exception("dispatcher iteration failed")
            self._stop.wait(1.0)

    def _launch(self) -> None:
        while len(self._procs) < settings.max_workers:
            with _connect() as con:
                row = con.execute("SELECT id, attempts FROM jobs WHERE status = 'queued' ORDER BY created LIMIT 1").fetchone()
            if row is None:
                return
            # claim atomically: a job cancelled after the SELECT must not be started
            with _connect() as con:
                claimed = con.execute("UPDATE jobs SET status='running', started=?, attempts=?, message='Starting analysis', "
                                      "progress=0.01 WHERE id=? AND status='queued'",
                                      (time.time(), row["attempts"] + 1, row["id"])).rowcount
            if not claimed:
                continue
            d = job_dir(row["id"])
            (d / "status.json").unlink(missing_ok=True)
            env = dict(os.environ)
            env.setdefault("NUMBA_CACHE_DIR", str(settings.data_dir / "numba_cache"))
            env["MPLCONFIGDIR"] = str(settings.data_dir / "mplconfig")
            # the worker must see the dispatcher's effective settings, not just the process environment
            env.update({
                "PRRSLOOM_DATA_DIR": str(settings.data_dir),
                "PRRSLOOM_CLUSTALW": settings.clustalw_bin,
                "PRRSLOOM_MAFFT": settings.mafft_bin,
                "PRRSLOOM_TIE_SEED": str(settings.tie_seed),
                "PRRSLOOM_RESOURCE_TTL_HOURS": str(settings.resource_ttl_hours),
                "PRRSLOOM_MAX_TIMER_SEQUENCES": str(settings.max_timer_sequences),
                "PRRSLOOM_MAX_SEQUENCES": str(settings.max_sequences),
                "PRRSLOOM_MAX_TREE_TIPS": str(settings.max_tree_tips),
                "PRRSLOOM_JOB_TIMEOUT_S": str(settings.job_timeout_s),
                "PRRSLOOM_ALIGNMENT_CACHE_MB": str(settings.alignment_cache_mb),
            })
            pkg_root = str(Path(__file__).resolve().parents[1])  # worker runs with cwd = job dir
            env["PYTHONPATH"] = pkg_root + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
            # CPU share: PRRSLOOM_CPU_THREADS split across concurrent jobs. Capping the native pools
            # keeps a job's threads from oversubscribing the cores shared with the other workers.
            threads = str(settings.job_threads)
            env["PRRSLOOM_JOB_THREADS"] = threads
            for name in THREAD_ENV:
                env[name] = threads
            # glibc reserves up to 64 MB of address space per thread arena; under RLIMIT_AS that
            # reservation (not real memory) would count against the job's memory limit.
            env.setdefault("MALLOC_ARENA_MAX", "2")
            # aligner temp files live in the job dir, so a killed or timed-out job leaves nothing behind
            tmp = d / "tmp"
            tmp.mkdir(exist_ok=True)
            env["TMPDIR"] = env["TMP"] = env["TEMP"] = str(tmp)
            log_fh = open(d / "worker.log", "ab")
            kwargs = dict(stdout=log_fh, stderr=subprocess.STDOUT, env=env, cwd=str(d))
            if os.name == "posix":
                kwargs.update(start_new_session=True, preexec_fn=_limits)
            try:
                proc = subprocess.Popen([sys.executable, "-m", "prrsloom.worker", str(d)], **kwargs)
            except OSError as exc:
                log.exception("could not start worker for %s", row["id"])
                _update(row["id"], status="failed", finished=time.time(), message="Failed",
                        error=f"The analysis process could not be started: {exc}")
                continue
            finally:
                log_fh.close()
            self._procs[row["id"]] = (proc, time.time())

    def _reap(self) -> None:
        for job_id, (proc, started) in list(self._procs.items()):
            d = job_dir(job_id)
            code = proc.poll()
            if code is None:
                if (d / CANCEL_FLAG).exists():
                    _kill(proc)
                    del self._procs[job_id]
                    _remove_tmp(d)
                    _update(job_id, status="cancelled", finished=time.time(), message="Cancelled by user")
                elif time.time() - started > settings.job_timeout_s:
                    _kill(proc)
                    del self._procs[job_id]
                    _remove_tmp(d)
                    _update(job_id, status="failed", finished=time.time(), message="Timed out",
                            error=f"The analysis exceeded the {settings.job_timeout_s // 60}-minute time limit and was stopped.")
                continue
            del self._procs[job_id]
            _remove_tmp(d)
            status = _read_status(d) or {}
            if code == 0 and status.get("state") == "succeeded":
                _update(job_id, status="succeeded", finished=time.time(), progress=1.0, message="Completed")
            else:
                error = status.get("error")
                if not error:
                    error = ("The analysis ran out of memory." if code in (-9, 137) or code == -signal.SIGKILL
                             else f"The analysis process stopped unexpectedly (exit code {code}).")
                _update(job_id, status="failed", finished=time.time(), message="Failed", error=error)

    def _cleanup_loop(self) -> None:
        while not self._stop.is_set():
            try:
                cleanup()
            except Exception:
                log.exception("cleanup failed")
            self._stop.wait(1800)


def _remove_tmp(d: Path) -> None:
    shutil.rmtree(d / "tmp", ignore_errors=True)


def _kill(proc: subprocess.Popen) -> None:
    try:
        if os.name == "posix":
            os.killpg(proc.pid, signal.SIGKILL)
        else:
            proc.kill()
    except (ProcessLookupError, PermissionError):
        pass
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        pass


def cleanup(now: float | None = None) -> int:
    now = now or time.time()
    cutoff = now - settings.result_ttl_hours * 3600
    with _connect() as con:
        rows = con.execute("SELECT id FROM jobs WHERE status IN ('succeeded','failed','cancelled') AND finished < ?", (cutoff,)).fetchall()
    for r in rows:
        shutil.rmtree(job_dir(r["id"]), ignore_errors=True)
        _update(r["id"], status="expired", message="Results expired and were deleted")
    with _connect() as con:  # forget very old rows entirely
        con.execute("DELETE FROM jobs WHERE status = 'expired' AND finished < ?", (now - 30 * 86400,))
    return len(rows)
