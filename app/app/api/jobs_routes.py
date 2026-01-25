from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.app.core.rate_limiter import enforce_rate_limit
from app.app.db.database import get_db
from app.app.db.models import Job, JobStatus, JobType, JobArtifact
from app.app.jobs.queue import JOB_QUEUE_MAXSIZE, enqueue_job, queue_has_capacity
from app.app.jobs.storage import ensure_job_dir, resolve_artifact_path, stream_upload_to_path
from app.app.jobs.video_utils import probe_video

MAX_VIDEO_MB = int(os.getenv("MAX_VIDEO_MB", "20"))
MAX_VIDEO_SECONDS = int(os.getenv("MAX_VIDEO_SECONDS", "10"))
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".m4v"}

router = APIRouter(prefix="/api/v1", tags=["jobs"])


def _serialize_job(job: Job) -> Dict[str, Any]:
    return {
        "job_id": job.id,
        "type": job.type.value if isinstance(job.type, JobType) else job.type,
        "status": job.status.value if isinstance(job.status, JobStatus) else job.status,
        "progress": job.progress,
        "error": job.error,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
    }


@router.post("/jobs", status_code=201)
async def create_job(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    client_ip = request.client.host if request.client else "anonymous"
    await enforce_rate_limit(client_ip)

    if not queue_has_capacity():
        raise HTTPException(status_code=429, detail="Job queue is full. Try again later.")

    if not file.content_type or not file.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be a video")

    extension = Path(file.filename or "upload.mp4").suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        extension = ".mp4"

    job = Job(
        type=JobType.PPE_VIDEO,
        status=JobStatus.QUEUED,
        input_filename=file.filename or f"upload{extension}",
        input_path="",
    )
    db.add(job)
    await db.flush()

    job_dir = ensure_job_dir(job.id)
    dest_path = job_dir / f"input{extension}"
    max_bytes = MAX_VIDEO_MB * 1024 * 1024

    try:
        size_bytes = await stream_upload_to_path(file, dest_path, max_bytes)
        metadata = probe_video(str(dest_path))
    except ValueError:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Video exceeds {MAX_VIDEO_MB}MB limit")
    except Exception as exc:  # pragma: no cover
        dest_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid video: {exc}")

    if metadata.duration <= 0 or metadata.duration > MAX_VIDEO_SECONDS:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail=f"Video duration must be <= {MAX_VIDEO_SECONDS} seconds",
        )

    job.input_path = str(dest_path)
    job.input_size_bytes = size_bytes
    job.input_duration_sec = metadata.duration
    job.progress = 0.0
    await db.commit()

    await enqueue_job(job.id)

    return {
        "job_id": job.id,
        "status": job.status.value,
        "limits": {
            "max_duration_seconds": MAX_VIDEO_SECONDS,
            "max_file_size_bytes": max_bytes,
            "queue_size": JOB_QUEUE_MAXSIZE,
        },
    }


@router.get("/jobs/{job_id}")
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _serialize_job(job)


@router.get("/jobs/{job_id}/result")
async def get_job_result(job_id: int, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    job = await db.get(Job, job_id, options=(selectinload(Job.artifacts),))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status != JobStatus.DONE or not job.result:
        raise HTTPException(status_code=404, detail="Job not complete")
    artifacts = _serialize_artifacts(job.id, job.artifacts or [])
    return {"job_id": job.id, "result": job.result, "artifacts": artifacts}


@router.get("/jobs/{job_id}/artifacts/{artifact_name}")
async def get_artifact(job_id: int, artifact_name: str):
    try:
        path = resolve_artifact_path(job_id, artifact_name)
    except ValueError:
        raise HTTPException(status_code=404, detail="Artifact not found")

    if not path.exists():
        raise HTTPException(status_code=404, detail="Artifact not found")

    return FileResponse(path)


def _serialize_artifacts(job_id: int, artifacts: List[JobArtifact]) -> List[Dict[str, Any]]:
    payload = []
    for artifact in artifacts:
        payload.append(
            {
                "id": artifact.id,
                "kind": artifact.kind,
                "path": artifact.path,
                "url": f"/api/v1/jobs/{job_id}/artifacts/{artifact.path}",
                "timestamp_sec": artifact.timestamp_sec,
                "metadata": artifact.metadata_json,
            }
        )
    return payload


@router.post("/driver/jobs", status_code=201)
async def create_driver_job(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else "anonymous"
    await enforce_rate_limit(client_ip)
    job = await _create_job(JobType.DMS_CABIN_VIDEO, file, db)
    return _serialize_job(job)


@router.post("/road/jobs", status_code=201)
async def create_road_job(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    client_ip = request.client.host if request.client else "anonymous"
    await enforce_rate_limit(client_ip)
    job = await _create_job(JobType.ADAS_ROAD_VIDEO, file, db)
    return _serialize_job(job)
