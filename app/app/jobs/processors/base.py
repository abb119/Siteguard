from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class JobArtifactPayload:
    kind: str
    path: str
    timestamp_sec: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class JobResultPayload:
    summary: Dict[str, Any] = field(default_factory=dict)
    events: List[Dict[str, Any]] = field(default_factory=list)
    frames: List[Dict[str, Any]] = field(default_factory=list)
    snapshots: List[Dict[str, Any]] = field(default_factory=list)
    artifacts: List[JobArtifactPayload] = field(default_factory=list)


class JobProcessor:
    job_type: str

    def process(self, job_context: "ProcessorContext") -> JobResultPayload:
        raise NotImplementedError


@dataclass
class ProcessorContext:
    job_id: int
    input_path: str
    sample_rate_fps: float
    output_dir: str
