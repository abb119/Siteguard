from __future__ import annotations

import os
from pathlib import Path
from typing import Tuple

DATA_ROOT = Path("data") / "jobs"
BASE_JOBS_DIR = DATA_ROOT


def ensure_job_dir(job_id: int) -> Path:
    job_dir = DATA_ROOT / str(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)
    return job_dir


async def stream_upload_to_path(upload_file, destination: Path, max_bytes: int) -> int:
    """Stream an UploadFile into destination enforcing a max size."""
    size = 0
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as buffer:
        while True:
            chunk = await upload_file.read(1024 * 512)
            if not chunk:
                break
            size += len(chunk)
            if size > max_bytes:
                buffer.flush()
                buffer.close()
                destination.unlink(missing_ok=True)
                raise ValueError("File exceeds maximum allowed size")
            buffer.write(chunk)
    return size


def resolve_artifact_path(job_id: int, filename: str) -> Path:
    safe_name = os.path.basename(filename)
    base = ensure_job_dir(job_id)
    path = (base / safe_name).resolve()
    path.relative_to(base.resolve())
    return path


def input_video_path(job_id: int) -> Path:
    base = ensure_job_dir(job_id)
    for candidate in base.glob("input*"):
        if candidate.is_file():
            return candidate
    return base / "input.mp4"


def artifact_path(job_id: int, filename: str) -> Path:
    return ensure_job_dir(job_id) / filename
