from __future__ import annotations

from pathlib import Path
from typing import List

import cv2

from app.app.db.models import JobType
from app.app.jobs.processors.base import JobProcessor, JobResultPayload, JobArtifactPayload, ProcessorContext
from app.app.jobs.video_utils import iter_sampled_frames, probe_video
from .face_landmarks import FaceLandmarkExtractor, FaceMetrics
from .scoring import DmsEventBuilder, FrameObservation
from .phone_detector import PhoneUsageDetector


class DmsVideoProcessor(JobProcessor):
    job_type = JobType.DMS_CABIN_VIDEO
    SAMPLE_FPS = 3.0
    SNAPSHOT_LIMIT = 6

    def process(self, context: ProcessorContext) -> JobResultPayload:
        metadata = probe_video(context.input_path)
        fps = metadata.fps if metadata.fps > 0 else 24.0
        sample_stride = max(1, int(fps / self.SAMPLE_FPS))
        sample_period = sample_stride / fps if fps > 0 else 1.0 / self.SAMPLE_FPS

        extractor = FaceLandmarkExtractor()
        phone_detector = PhoneUsageDetector()

        observations: List[FrameObservation] = []
        snapshots_meta = []
        artifacts: List[JobArtifactPayload] = []

        snapshot_budget = self.SNAPSHOT_LIMIT

        try:
            for _, timestamp, frame in iter_sampled_frames(context.input_path, sample_stride):
                metrics = extractor.process(frame)
                phone_detected = False
                if metrics:
                    phone_detected = phone_detector.detect(frame, metrics.box)
                observations.append(
                    FrameObservation(
                        timestamp=timestamp,
                        ear=metrics.ear if metrics else None,
                        mar=metrics.mar if metrics else None,
                        yaw_deg=metrics.yaw_deg if metrics else None,
                        phone_detected=phone_detected,
                    )
                )

                label = None
                if metrics:
                    if metrics.ear < 0.22:
                        label = "Drowsiness"
                    elif abs(metrics.yaw_deg) > 30:
                        label = "Distracted"
                    elif metrics.mar and metrics.mar > 0.75:
                        label = "Yawning"
                if phone_detected:
                    label = "Phone Usage"

                if label and snapshot_budget > 0:
                    snapshot_meta = _save_snapshot(
                        frame,
                        context.output_dir,
                        timestamp,
                        label,
                    )
                    snapshots_meta.append(snapshot_meta)
                    artifacts.append(
                        JobArtifactPayload(
                            kind="snapshot",
                            path=snapshot_meta["file"],
                            timestamp_sec=timestamp,
                            metadata={"label": label},
                        )
                    )
                    snapshot_budget -= 1
        finally:
            extractor.close()

        builder = DmsEventBuilder(sample_period=sample_period)
        result = builder.summarize(observations)

        payload = JobResultPayload(
            summary=result["summary"],
            events=result["events"],
            frames=[obs.__dict__ for obs in observations],
            snapshots=snapshots_meta,
            artifacts=artifacts,
        )
        return payload


def _save_snapshot(frame, output_dir: str, timestamp: float, label: str):
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    filename = f"snapshot_{int(timestamp * 1000)}.jpg"
    path = Path(output_dir) / filename
    annotated = frame.copy()
    cv2.putText(
        annotated,
        f"{label} @ {timestamp:.1f}s",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (0, 0, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.imwrite(str(path), annotated)
    return {
        "file": filename,
        "label": label,
        "timestamp": round(timestamp, 2),
    }
