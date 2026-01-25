from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple

import cv2

from app.app.db.models import JobType
from app.app.jobs.processors.base import JobArtifactPayload, JobProcessor, JobResultPayload, ProcessorContext
from app.app.jobs.video_utils import probe_video
from app.app.services.compliance_service import ComplianceService
from app.app.services.model_registry import get_yolo_model

TARGET_SAMPLE_FPS = 3.0
MAX_INFERENCE_WIDTH = 960
SNAPSHOT_LIMIT = 8


class PpeVideoProcessor(JobProcessor):
    job_type = JobType.PPE_VIDEO

    def __init__(self) -> None:
        self._compliance_service = ComplianceService()

    def process(self, context: ProcessorContext) -> JobResultPayload:
        metadata = probe_video(context.input_path)
        fps = metadata.fps if metadata.fps > 0 else 24.0
        analysis_stride = max(1, int(fps / TARGET_SAMPLE_FPS))

        cap = cv2.VideoCapture(context.input_path)
        if not cap.isOpened():
            raise RuntimeError("No se pudo abrir el video de entrada para PPE_VIDEO")

        output_dir = Path(context.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        video_writer = None
        video_filename: str | None = None
        video_path: Path | None = None

        model = get_yolo_model()
        frames_sampled = 0
        frames_with_violations = 0
        events: List[Dict] = []
        frame_summaries: List[Dict] = []
        snapshots: List[Dict] = []
        artifacts: List[JobArtifactPayload] = []

        frame_idx = 0
        cached_detections: List[Dict[str, Any]] = []
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                if video_writer is None:
                    height, width = frame.shape[:2]
                    video_writer, video_filename = _create_video_writer(output_dir, fps, width, height)
                    video_path = output_dir / video_filename

                timestamp = frame_idx / fps if fps > 0 else 0.0
                should_infer = (frame_idx % analysis_stride == 0) or not cached_detections

                if should_infer:
                    detections = _run_inference(model, frame)
                    cached_detections = detections
                else:
                    detections = cached_detections

                annotated_frame = frame.copy()
                _draw_detections(annotated_frame, detections)
                video_writer.write(annotated_frame)

                if should_infer:
                    violations = self._compliance_service.check_compliance(detections)
                    frame_summaries.append(
                        {
                            "frame_index": frame_idx,
                            "timestamp_sec": round(timestamp, 2),
                            "detections": detections,
                        }
                    )
                    frames_sampled += 1

                    if violations:
                        frames_with_violations += 1
                        for violation in violations:
                            events.append(
                                {
                                    "timestamp_sec": round(timestamp, 2),
                                    "type": violation["violation_type"],
                                    "severity": violation["severity"],
                                    "details": violation["details"],
                                }
                            )
                        if len(snapshots) < SNAPSHOT_LIMIT:
                            snapshot_meta = _save_snapshot(
                                frame.copy(), detections, context.output_dir, timestamp, len(snapshots)
                            )
                            snapshots.append(snapshot_meta)
                            artifacts.append(
                                JobArtifactPayload(
                                    kind="snapshot",
                                    path=snapshot_meta["file"],
                                    timestamp_sec=timestamp,
                                    metadata={"violations": violations},
                                )
                            )

                frame_idx += 1
        finally:
            cap.release()
            if video_writer is not None:
                video_writer.release()

        if video_path and video_path.exists() and video_filename:
            artifacts.append(
                JobArtifactPayload(
                    kind="video",
                    path=video_filename,
                    metadata={
                        "label": "Video PPE anotado",
                        "fps": fps,
                        "frames": frame_idx,
                    },
                )
            )

        compliance_rate = 1.0
        if frames_sampled > 0:
            compliance_rate = max(0.0, (frames_sampled - frames_with_violations) / frames_sampled)

        summary = {
            "frames_sampled": frames_sampled,
            "violations": len(events),
            "compliance_rate": round(compliance_rate, 3),
            "duration_sec": metadata.duration,
        }

        return JobResultPayload(
            summary=summary,
            events=events,
            frames=frame_summaries,
            snapshots=snapshots,
            artifacts=artifacts,
        )


def _save_snapshot(frame, detections: List[Dict[str, Any]], output_dir: str, timestamp: float, index: int) -> Dict[str, Any]:
    _draw_detections(frame, detections)

    filename = f"snap_{index}.jpg"
    path = Path(output_dir) / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(path), frame)
    return {
        "file": filename,
        "timestamp": round(timestamp, 2),
        "label": "Violacion PPE",
    }


def _draw_detections(frame, detections: List[Dict[str, Any]]) -> None:
    for det in detections:
        x1, y1, x2, y2 = [int(v) for v in det["box"]]
        label = det["class_name"]
        color = (0, 255, 0)
        lower = label.lower()
        if lower.startswith("no-") or lower.startswith("no_"):
            color = (0, 0, 255)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.putText(frame, label, (x1, max(15, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)


def _run_inference(model, frame) -> List[Dict[str, Any]]:
    resized, scale_x, scale_y = _prepare_inference_frame(frame)
    success, buffer = cv2.imencode(".jpg", resized)
    if not success:
        return []
    detections = model.predict(buffer.tobytes())
    if scale_x != 1.0 or scale_y != 1.0:
        for det in detections:
            x1, y1, x2, y2 = det["box"]
            det["box"] = [
                x1 * scale_x,
                y1 * scale_y,
                x2 * scale_x,
                y2 * scale_y,
            ]
    return detections


def _prepare_inference_frame(frame) -> Tuple[Any, float, float]:
    height, width = frame.shape[:2]
    if width <= MAX_INFERENCE_WIDTH:
        return frame, 1.0, 1.0
    new_width = MAX_INFERENCE_WIDTH
    scale = new_width / width
    new_height = max(1, int(height * scale))
    resized = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)
    scale_x = width / new_width
    scale_y = height / new_height
    return resized, scale_x, scale_y


def _create_video_writer(output_dir: Path, fps: float, width: int, height: int) -> Tuple[cv2.VideoWriter, str]:
    fps_value = max(1.0, float(fps))
    candidates = [
        ("annotated.mp4", "mp4v"),
        ("annotated.mp4", "avc1"),
        ("annotated.avi", "MJPG"),
    ]
    for filename, fourcc_key in candidates:
        path = output_dir / filename
        fourcc = cv2.VideoWriter_fourcc(*fourcc_key)
        writer = cv2.VideoWriter(str(path), fourcc, fps_value, (width, height))
        if writer.isOpened():
            return writer, filename
        writer.release()
    raise RuntimeError("No se pudo inicializar el escritor de video para PPE_VIDEO")
