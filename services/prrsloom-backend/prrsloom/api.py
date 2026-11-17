"""PRRSLooM FastAPI service (mounted under /prrsloom behind nginx)."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import mimetypes
import re
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from starlette.concurrency import run_in_threadpool

from . import __version__, jobs, resources
from .config import settings
from .fasta import InputError, decode_upload, parse_fasta, read_csv_text

log = logging.getLogger("prrsloom")
MODULES = ("nj_tree", "tree_label", "timer", "haplotype")
INPUT_KEYS = ("fasta", "metadata", "tree", "pairwise")
FILE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")
dispatcher = jobs.Dispatcher()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.jobs_dir.mkdir(parents=True, exist_ok=True)
    dispatcher.start()
    yield
    dispatcher.stop()


app = FastAPI(title="PRRSLooM API", version=__version__, lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origin_regex=settings.cors_origin_regex, allow_methods=["GET"],
                   allow_headers=[], allow_credentials=False, max_age=600)
router = APIRouter(prefix="/prrsloom")


# ---------------------------------------------------------------- auth / limits

def _check_key(key: str | None) -> None:
    if settings.api_key and not hmac.compare_digest(key or "", settings.api_key):
        raise HTTPException(status_code=401, detail="Missing or invalid API key.")


def sign(job_id: str, file_id: str, expires: int) -> str:
    msg = f"{job_id}/{file_id}/{expires}".encode()
    return hmac.new(settings.api_key.encode(), msg, hashlib.sha256).hexdigest()


_recent: dict[str, deque] = defaultdict(deque)


def _rate_limit(client: str, limit: int = 12, window: int = 600) -> None:
    q = _recent[client]
    now = time.time()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="Too many analyses submitted recently. Please wait a few minutes.")
    q.append(now)


# ---------------------------------------------------------------- endpoints

@router.get("/health")
def health():
    return {"status": "ok", "service": "PRRSLooM", "version": __version__, "queue": jobs.counts(),
            "workers": settings.max_workers, "time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}


@router.get("/modules")
def modules(x_prrsloom_key: str | None = Header(default=None)):
    _check_key(x_prrsloom_key)
    return {
        "modules": list(MODULES),
        "limits": {
            "max_upload_bytes": settings.max_upload_bytes, "max_sequences": settings.max_sequences,
            "max_timer_sequences": settings.max_timer_sequences, "max_tree_tips": settings.max_tree_tips,
            "job_timeout_s": settings.job_timeout_s, "result_ttl_hours": settings.result_ttl_hours,
        },
        "classifier_resources": resources.provenance(),
    }


def _quick_validate(module: str, params: dict, inputs: dict[str, str]) -> None:
    """Cheap checks so obvious input problems are reported before queueing."""
    if module in ("nj_tree", "haplotype"):
        parse_fasta(inputs.get("fasta", ""))
    if module == "timer":
        if params.get("mode", "fasta") == "fasta":
            parse_fasta(inputs.get("fasta", ""), min_sequences=2, max_sequences=settings.max_timer_sequences)
            if not inputs.get("metadata"):
                raise InputError("Sequence mode requires metadata with sequence IDs and collection dates.")
        elif not inputs.get("pairwise"):
            raise InputError("Upload the pairwise comparison CSV.")
    if module == "tree_label":
        if not inputs.get("tree"):
            raise InputError("Upload a tree file.")
        if not inputs.get("metadata"):
            raise InputError("Upload the PRRSLoom classification CSV.")
    headers = {}
    for key in ("metadata", "pairwise"):
        if inputs.get(key):
            headers[key] = read_csv_text(inputs[key], "metadata CSV" if key == "metadata" else "pairwise comparison CSV")[0]

    def need(key: str, param: str, what: str, label: str) -> None:
        col = params.get(param)
        if not col:
            raise InputError(f"Select the {what} from the {label}.")
        if col not in headers.get(key, []):
            raise InputError(f"The selected {what} was not found in the {label}.")

    if module == "nj_tree" and "metadata" in headers:
        need("metadata", "metadata_id_col", "sequence ID column", "metadata CSV")
        need("metadata", "metadata_annotation_col", "annotation column", "metadata CSV")
    if module == "timer" and params.get("mode", "fasta") == "fasta":
        need("metadata", "metadata_id_col", "sequence ID column", "collection date CSV")
        need("metadata", "metadata_date_col", "collection date/year column", "collection date CSV")
    if module == "timer" and params.get("mode") == "pairwise":
        for param, what in (("table_seq1_col", "sequence 1 column"), ("table_seq2_col", "sequence 2 column"),
                            ("table_interval_col", "elapsed time column")):
            need("pairwise", param, what, "pairwise comparison CSV")
    if module == "haplotype" and "metadata" in headers and params.get("id_column"):
        need("metadata", "id_column", "ID column", "metadata CSV")
    if module == "tree_label" and "metadata" in headers:
        missing = [c for c in ("SequenceName", "assign.final") if c not in headers["metadata"]]
        if missing:
            raise InputError("The metadata CSV is missing required column(s): " + ", ".join(missing))


@router.post("/jobs", status_code=202)
async def submit(
    request: Request,
    module: str = Form(...),
    params: str = Form("{}"),
    fasta_text: str = Form(""),
    fasta: UploadFile | None = File(None),
    metadata: UploadFile | None = File(None),
    tree: UploadFile | None = File(None),
    pairwise: UploadFile | None = File(None),
    x_prrsloom_key: str | None = Header(default=None),
    x_client_ip: str | None = Header(default=None),
):
    _check_key(x_prrsloom_key)
    client = (x_client_ip or (request.client.host if request.client else "unknown"))[:64]
    if module not in MODULES:
        raise HTTPException(status_code=400, detail=f"Unknown module '{module}'.")
    try:
        p = json.loads(params or "{}")
        if not isinstance(p, dict):
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=400, detail="params must be a JSON object.") from None
    p = {str(k)[:64]: (v if isinstance(v, (int, float, bool)) or v is None else str(v)[:256]) for k, v in p.items()}

    inputs: dict[str, str] = {}
    try:
        for key, upload in (("fasta", fasta), ("metadata", metadata), ("tree", tree), ("pairwise", pairwise)):
            if upload is not None and upload.filename:
                data = await upload.read(settings.max_upload_bytes + 1)
                inputs[key] = decode_upload(data, f"{key} file")
                if key == "tree":
                    p["tree_filename"] = re.sub(r"[^A-Za-z0-9._-]", "_", upload.filename)[-120:]
        if "fasta" not in inputs and fasta_text.strip():
            if len(fasta_text.encode()) > settings.max_upload_bytes:
                raise InputError("The pasted FASTA text is too large.")
            inputs["fasta"] = fasta_text
        # parsing a few MB of FASTA/CSV is CPU work: keep it off the event loop so status polls
        # and downloads from other users are not stalled behind an upload
        await run_in_threadpool(_quick_validate, module, p, inputs)
    except InputError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

    _rate_limit(client)
    try:
        job_id = await run_in_threadpool(jobs.create, module, p, inputs, client)
    except OverflowError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from None
    return {"job_id": job_id, "status": "queued"}


def _public(job: dict, since: int = 0) -> dict:
    out = {k: job.get(k) for k in ("id", "module", "status", "progress", "message", "error", "created", "started", "finished", "queue_position")}
    log = list(job.get("log") or [])
    # outcomes decided by the dispatcher (time limit, killed for memory, cancellation) are not in
    # the worker's own log; add them so the log always ends with what actually happened
    last = log[-1]["m"] if log else ""
    if job.get("status") == "failed" and job.get("error") and job["error"] != last:
        log.append({"t": job.get("finished"), "p": round((job.get("progress") or 0) * 100, 1), "l": "error", "m": job["error"]})
    elif job.get("status") == "cancelled" and "cancel" not in last.lower():
        log.append({"t": job.get("finished"), "p": round((job.get("progress") or 0) * 100, 1), "l": "warn", "m": "Cancelled by user"})
    out["log_total"] = len(log)
    out["log"] = log[max(0, since):]
    return out


@router.get("/jobs/{job_id}")
def status(job_id: str, since: int = 0, x_prrsloom_key: str | None = Header(default=None)):
    """Job status. ``log`` holds entries from index ``since`` on (``log_total`` = all entries)."""
    _check_key(x_prrsloom_key)
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found. Results are kept for a limited time.")
    return _public(job, since)


@router.post("/jobs/{job_id}/cancel")
def cancel(job_id: str, x_prrsloom_key: str | None = Header(default=None)):
    """Cancel a queued or running job (idempotent; finished jobs are returned unchanged)."""
    _check_key(x_prrsloom_key)
    job = jobs.cancel(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found. Results are kept for a limited time.")
    return _public(job)


def _signed_or_key(job_id: str, name: str, expires: int | None, sig: str | None, key: str | None) -> None:
    if not settings.api_key:
        return
    if expires is not None and sig is not None and expires >= time.time() and hmac.compare_digest(sign(job_id, name, expires), sig):
        return
    _check_key(key)


@router.get("/jobs/{job_id}/result")
def result(request: Request, job_id: str, expires: int | None = None, sig: str | None = None,
           x_prrsloom_key: str | None = Header(default=None)):
    _signed_or_key(job_id, "result.json", expires, sig, x_prrsloom_key)
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if job["status"] != "succeeded":
        raise HTTPException(status_code=409, detail=f"Job is {job['status']}.")
    path = jobs.job_dir(job_id) / "out" / "result.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Result not found.")
    gz = path.with_name("result.json.gz")
    if gz.exists() and "gzip" in request.headers.get("accept-encoding", "").lower():
        # pre-compressed by the worker; the browser decompresses transparently
        return FileResponse(gz, media_type="application/json",
                            headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
    return FileResponse(path, media_type="application/json", headers={"Vary": "Accept-Encoding"})


def _result_file(job_id: str, file_id: str):
    if not FILE_ID.match(file_id or "") or file_id in ("result.json", "result.json.gz"):
        raise HTTPException(status_code=400, detail="Invalid file name.")
    try:
        out = (jobs.job_dir(job_id) / "out").resolve()
    except ValueError:
        raise HTTPException(status_code=404, detail="Job not found.") from None
    path = (out / file_id).resolve()
    if path.parent != out or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found. Results are kept for a limited time.")
    return path


@router.get("/jobs/{job_id}/files/{file_id}")
def download(job_id: str, file_id: str, expires: int | None = None, sig: str | None = None,
             x_prrsloom_key: str | None = Header(default=None)):
    _signed_or_key(job_id, file_id, expires, sig, x_prrsloom_key)
    path = _result_file(job_id, file_id)
    media = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media, filename=path.name,
                        headers={"Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff"})


EXAMPLES = {
    "example.fasta": ("example_fasta", "text/plain"),
}


@router.get("/examples/{name}")
def example(name: str):
    if name == "example.fasta":
        return PlainTextResponse(resources.ensure("example_fasta").read_text(), media_type="text/plain")
    raise HTTPException(status_code=404, detail="Unknown example.")


app.include_router(router)


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
