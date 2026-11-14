"""Runtime settings, all overridable with PRRSLOOM_* environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("PRRSLOOM_DATA_DIR", "/srv/prrsloom")))
    max_workers: int = field(default_factory=lambda: _int("PRRSLOOM_MAX_WORKERS", 1))
    max_queue: int = field(default_factory=lambda: _int("PRRSLOOM_MAX_QUEUE", 20))
    job_timeout_s: int = field(default_factory=lambda: _int("PRRSLOOM_JOB_TIMEOUT_S", 1800))
    memory_limit_mb: int = field(default_factory=lambda: _int("PRRSLOOM_MEMORY_LIMIT_MB", 3072))
    result_ttl_hours: int = field(default_factory=lambda: _int("PRRSLOOM_RESULT_TTL_HOURS", 72))
    resource_ttl_hours: int = field(default_factory=lambda: _int("PRRSLOOM_RESOURCE_TTL_HOURS", 24))
    max_upload_bytes: int = field(default_factory=lambda: _int("PRRSLOOM_MAX_UPLOAD_BYTES", 4 * 1024 * 1024))
    max_sequences: int = field(default_factory=lambda: _int("PRRSLOOM_MAX_SEQUENCES", 1000))
    max_timer_sequences: int = field(default_factory=lambda: _int("PRRSLOOM_MAX_TIMER_SEQUENCES", 150))
    max_tree_tips: int = field(default_factory=lambda: _int("PRRSLOOM_MAX_TREE_TIPS", 3000))
    max_sequence_length: int = field(default_factory=lambda: _int("PRRSLOOM_MAX_SEQUENCE_LENGTH", 20000))
    clustalw_bin: str = field(default_factory=lambda: os.environ.get("PRRSLOOM_CLUSTALW", "clustalw"))
    mafft_bin: str = field(default_factory=lambda: os.environ.get("PRRSLOOM_MAFFT", "mafft"))
    api_key: str = field(default_factory=lambda: os.environ.get("PRRSLOOM_API_KEY", ""))
    cors_origin_regex: str = field(default_factory=lambda: os.environ.get(
        "PRRSLOOM_CORS_ORIGIN_REGEX",
        r"https://([a-z0-9-]+\.)*fnunahiduzzaman\.com|https://nahiduzzaman-portfolio[a-z0-9-]*\.vercel\.app|http://localhost:3000"))
    tie_seed: int = field(default_factory=lambda: _int("PRRSLOOM_TIE_SEED", 2026))

    @property
    def jobs_dir(self) -> Path:
        return self.data_dir / "jobs"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "jobs.sqlite3"


settings = Settings()
