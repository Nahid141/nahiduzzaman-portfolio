import json
import os
import shutil
import time

import pytest
from fastapi.testclient import TestClient

from conftest import aligner_available

KEY = {"x-prrsloom-key": "test-key"}
PAIRS = "seq1,seq2,identity,years\na,b,98.5,1.0\na,c,90,0.5\nb,c,99,\n"


@pytest.fixture()
def client(data_dir):
    from prrsloom.api import app

    with TestClient(app) as c:
        yield c


def wait(client, job_id, timeout=240):
    end = time.time() + timeout
    while time.time() < end:
        r = client.get(f"/prrsloom/jobs/{job_id}", headers=KEY)
        assert r.status_code == 200
        if r.json()["status"] in ("succeeded", "failed"):
            return r.json()
        time.sleep(0.5)
    raise AssertionError("job did not finish")


def submit_timer_pairs(client, csv_text=PAIRS, params=None):
    p = {"mode": "pairwise", "table_seq1_col": "seq1", "table_seq2_col": "seq2", "table_identity_col": "identity",
         "table_interval_col": "years", "default_comparable_sites": 603}
    p.update(params or {})
    return client.post("/prrsloom/jobs", headers=KEY, data={"module": "timer", "params": json.dumps(p)},
                       files={"pairwise": ("pairs.csv", csv_text, "text/csv")})


def test_health_is_public(client):
    r = client.get("/prrsloom/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_key_required(client):
    assert client.get("/prrsloom/modules").status_code == 401
    assert client.post("/prrsloom/jobs", data={"module": "timer"}).status_code == 401


def test_input_errors_are_reported_before_queueing(client):
    r = client.post("/prrsloom/jobs", headers=KEY, data={"module": "bogus"})
    assert r.status_code == 400 and "Unknown module" in r.json()["error"]
    r = client.post("/prrsloom/jobs", headers=KEY, data={"module": "nj_tree", "fasta_text": "ACGT"})
    assert r.status_code == 400 and "header line" in r.json()["error"]
    r = client.post("/prrsloom/jobs", headers=KEY, data={"module": "timer", "params": "[1]"})
    assert r.status_code == 400
    r = client.post("/prrsloom/jobs", headers=KEY, data={"module": "timer", "params": "{}", "fasta_text": ">a\nACGT\n>b\nACGA\n"})
    assert r.status_code == 400 and "requires metadata" in r.json()["error"]


def test_timer_pairwise_job_end_to_end(client):
    r = submit_timer_pairs(client)
    assert r.status_code == 202
    job_id = r.json()["job_id"]
    job = wait(client, job_id)
    assert job["status"] == "succeeded", job
    res = client.get(f"/prrsloom/jobs/{job_id}/result", headers=KEY).json()
    assert res["summary"]["pairs"] == 3
    assert res["results"][2]["poisson_status"] == "Unable to evaluate"
    for f in res["files"]:
        d = client.get(f"/prrsloom/jobs/{job_id}/files/{f['id']}", headers=KEY)
        assert d.status_code == 200 and len(d.content) > 0
    audit = next(f["id"] for f in res["files"] if f["id"].endswith(".csv"))
    assert client.get(f"/prrsloom/jobs/{job_id}/files/{audit}").status_code == 401


def test_signed_download_links(client):
    from prrsloom.api import sign

    job_id = submit_timer_pairs(client).json()["job_id"]
    assert wait(client, job_id)["status"] == "succeeded"
    res = client.get(f"/prrsloom/jobs/{job_id}/result", headers=KEY).json()
    fid = res["files"][0]["id"]
    exp = int(time.time()) + 60
    ok = client.get(f"/prrsloom/jobs/{job_id}/files/{fid}", params={"expires": exp, "sig": sign(job_id, fid, exp)})
    assert ok.status_code == 200
    bad = client.get(f"/prrsloom/jobs/{job_id}/files/{fid}", params={"expires": exp, "sig": "0" * 64})
    assert bad.status_code == 401
    old = int(time.time()) - 1
    expired = client.get(f"/prrsloom/jobs/{job_id}/files/{fid}", params={"expires": old, "sig": sign(job_id, fid, old)})
    assert expired.status_code == 401


def test_unsafe_paths_and_missing_jobs(client):
    job_id = submit_timer_pairs(client).json()["job_id"]
    wait(client, job_id)
    for bad in ("..%2F..%2Fjobs.sqlite3", ".hidden", "result.json", "a%00b"):
        r = client.get(f"/prrsloom/jobs/{job_id}/files/{bad}", headers=KEY)
        assert r.status_code in (400, 404), bad
    # a literal "/.." is normalised by the client to the status URL; the encoded form reaches the file handler
    assert client.get(f"/prrsloom/jobs/{job_id}/files/%2E%2E", headers=KEY).status_code in (400, 404)
    assert client.get("/prrsloom/jobs/" + "0" * 32, headers=KEY).status_code == 404
    assert client.get("/prrsloom/jobs/not-a-job", headers=KEY).status_code == 404
    assert client.get("/prrsloom/jobs/..%2F..%2Fetc/files/passwd", headers=KEY).status_code == 404


def test_failed_analysis_reports_message(client):
    r = client.post("/prrsloom/jobs", headers=KEY, data={"module": "tree_label", "params": "{}"},
                    files={"tree": ("tree.txt", "((a,b),c);", "text/plain"),
                           "metadata": ("m.csv", "SequenceName,assign.final\na,1A.1\n", "text/csv")})
    job = wait(client, r.json()["job_id"])
    assert job["status"] == "failed" and "Format not supported" in job["error"]


def test_tree_label_job(client):
    r = client.post("/prrsloom/jobs", headers=KEY, data={"module": "tree_label", "params": json.dumps({"extra_annotation_col": "Site"})},
                    files={"tree": ("t.nwk", "((seq_1:0.1,seq_2:0.2):0.05,seq_3:0.3);", "text/plain"),
                           "metadata": ("m.csv", "SequenceName,assign.final,Site\nseq_1,1H.18,Farm_A\nseq_2,1H.18,Farm_B\n", "text/csv")})
    job_id = r.json()["job_id"]
    assert wait(client, job_id)["status"] == "succeeded"
    res = client.get(f"/prrsloom/jobs/{job_id}/result", headers=KEY).json()
    assert res["n_tips"] == 3 and res["n_matched"] == 2 and res["warnings"]
    assert res["tree"]["palettes"]["sub_lineage"] == {"1H": "#1f77b4"}


def test_timeout_kills_job(client, monkeypatch):
    from prrsloom.config import settings

    monkeypatch.setattr(settings, "job_timeout_s", 1)
    monkeypatch.setenv("PRRSLOOM_TEST_SLEEP_S", "20")
    job = wait(client, submit_timer_pairs(client).json()["job_id"], timeout=60)
    assert job["status"] == "failed" and "time limit" in job["error"]


def test_queue_limit(client, monkeypatch):
    from prrsloom.config import settings

    monkeypatch.setattr(settings, "max_queue", 0)
    r = submit_timer_pairs(client)
    assert r.status_code == 429


def test_restart_recovery_and_cleanup(data_dir):
    from prrsloom import jobs

    jobs.init_db()
    a = jobs.create("timer", {}, {"pairwise": PAIRS})
    b = jobs.create("timer", {}, {"pairwise": PAIRS})
    jobs._update(a, status="running", attempts=1)
    jobs._update(b, status="running", attempts=jobs.MAX_ATTEMPTS)
    jobs.Dispatcher().recover()
    assert jobs.get(a)["status"] == "queued"
    assert jobs.get(b)["status"] == "failed" and "restart" in jobs.get(b)["error"]
    jobs._update(b, finished=time.time() - 10 * 86400)
    assert jobs.cleanup() == 1
    assert jobs.get(b)["status"] == "expired" and not jobs.job_dir(b).exists()


@pytest.mark.skipif(not (aligner_available("PRRSLOOM_CLUSTALW", "clustalw") and aligner_available("PRRSLOOM_MAFFT", "mafft")),
                    reason="ClustalW/MAFFT not installed")
@pytest.mark.parametrize("module", ["nj_tree", "haplotype"])
def test_sequence_modules_on_upstream_example(client, resources_dir, module, monkeypatch):
    from prrsloom.config import settings

    monkeypatch.setattr(settings, "clustalw_bin", os.environ.get("PRRSLOOM_CLUSTALW", "clustalw"))
    monkeypatch.setattr(settings, "mafft_bin", os.environ.get("PRRSLOOM_MAFFT", "mafft"))
    fasta = (resources_dir / "sequences.example.fasta").read_text()
    r = client.post("/prrsloom/jobs", headers=KEY, data={"module": module, "params": "{}", "fasta_text": fasta})
    job = wait(client, r.json()["job_id"], timeout=600)
    assert job["status"] == "succeeded", job
    res = client.get(f"/prrsloom/jobs/{job['id']}/result", headers=KEY).json()
    assert len(res["classification"]) == 7
    _ = shutil
