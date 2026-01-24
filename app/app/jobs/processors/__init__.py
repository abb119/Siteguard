from typing import Dict

from app.db.models import JobType
from .base import JobProcessor

PROCESSOR_REGISTRY: Dict[JobType, JobProcessor] = {}


def register_processor(job_type: JobType, processor: JobProcessor) -> None:
    PROCESSOR_REGISTRY[job_type] = processor


def get_processor(job_type: JobType) -> JobProcessor | None:
    return PROCESSOR_REGISTRY.get(job_type)


from .ppe_video import PpeVideoProcessor  # noqa: E402

register_processor(JobType.PPE_VIDEO, PpeVideoProcessor())
