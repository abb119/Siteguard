import asyncio
from datetime import datetime, timedelta, timezone
import shutil
from pathlib import Path

from app.jobs.storage import BASE_JOBS_DIR


async def cleanup_loop(interval_seconds: int = 600, max_age_minutes: int = 60) -> None:
    while True:
        await cleanup_job_directories(max_age_minutes)
        await asyncio.sleep(interval_seconds)


async def cleanup_job_directories(max_age_minutes: int) -> None:
    if not BASE_JOBS_DIR.exists():
        return

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
    for job_dir in BASE_JOBS_DIR.iterdir():
        if not job_dir.is_dir():
            continue
        modified = datetime.fromtimestamp(job_dir.stat().st_mtime, tz=timezone.utc)
        if modified < cutoff:
            shutil.rmtree(job_dir, ignore_errors=True)
