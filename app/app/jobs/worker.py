import asyncio
from datetime import datetime, timezone
import traceback
from typing import Callable

from app.db.database import AsyncSessionLocal
from app.db.models import Job, JobStatus, JobArtifact
from .queue import get_next_job, mark_job_done
from .processors import get_processor
from .processors.base import ProcessorContext


async def job_worker_loop() -> None:
    while True:
        job_id = await get_next_job()
        try:
            await _process_job(job_id)
        except Exception:  # pragma: no cover - logging side effect
            traceback.print_exc()
        finally:
            mark_job_done()


async def _process_job(job_id: int) -> None:
    async with AsyncSessionLocal() as session:
        job = await session.get(Job, job_id)
        if not job:
            return

        processor = get_processor(job.type)
        if processor is None:
            job.status = JobStatus.FAILED
            job.error = f"No processor registered for job type {job.type}"
            job.finished_at = datetime.now(timezone.utc)
            await session.commit()
            return

        job.status = JobStatus.RUNNING
        job.started_at = datetime.now(timezone.utc)
        job.progress = 5.0
        await session.commit()

        context = ProcessorContext(
            job_id=job.id,
            input_path=job.input_path,
            sample_rate_fps=3.0,
            output_dir=_job_output_dir(job.id),
        )

        try:
            result = await asyncio.to_thread(processor.process, context)
            job.status = JobStatus.DONE
            job.finished_at = datetime.now(timezone.utc)
            job.progress = 100.0
            job.result = {
                "summary": result.summary,
                "events": result.events,
                "snapshots": result.snapshots,
                "frames": result.frames,
            }

            for artifact in result.artifacts:
                session.add(
                    JobArtifact(
                        job_id=job.id,
                        kind=artifact.kind,
                        path=artifact.path,
                        timestamp_sec=artifact.timestamp_sec,
                        metadata_json=artifact.metadata,
                    )
                )
            await session.commit()
        except Exception as exc:
            job.status = JobStatus.FAILED
            job.error = str(exc)
            job.finished_at = datetime.now(timezone.utc)
            await session.commit()


def _job_output_dir(job_id: int) -> str:
    from pathlib import Path

    base = Path("data") / "jobs" / str(job_id)
    base.mkdir(parents=True, exist_ok=True)
    return str(base)
