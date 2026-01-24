import asyncio
import os
from typing import Optional

JOB_QUEUE_MAXSIZE = 1
_job_queue: Optional[asyncio.Queue[int]] = None


def _queue_enabled() -> bool:
    return os.getenv("DISABLE_JOB_WORKER") != "1"


def get_job_queue() -> asyncio.Queue[int]:
    global _job_queue
    if _job_queue is None:
        _job_queue = asyncio.Queue(maxsize=JOB_QUEUE_MAXSIZE)
    return _job_queue


def current_size() -> int:
    queue = get_job_queue()
    return queue.qsize()


def queue_has_capacity() -> bool:
    if not _queue_enabled():
        return True
    queue = get_job_queue()
    return not queue.full()


async def enqueue_job(job_id: int) -> None:
    if not _queue_enabled():
        return
    queue = get_job_queue()
    await queue.put(job_id)


async def get_next_job() -> int:
    queue = get_job_queue()
    return await queue.get()


def mark_job_done() -> None:
    if not _queue_enabled():
        return
    queue = get_job_queue()
    queue.task_done()
