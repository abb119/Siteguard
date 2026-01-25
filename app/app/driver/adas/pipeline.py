from __future__ import annotations

from pathlib import Path
from typing import List

import cv2

from app.app.db.models import JobType
from app.jobs.processors.base import JobProcessor, JobResultPayload, JobArtifactPayload, ProcessorContext
from app.jobs.video_utils import iter_sampled_frames, probe_video
from app.driver.common.tracking import SimpleTracker, Track
from .object_detector import RoadObjectDetector, VEHICLE_CLASSES
from .risk_engine import RiskEngine


class AdasVideoProcessor(JobProcessor):
    job_type = JobType.ADAS_ROAD_VIDEO
    SAMPLE_FPS = 4.0
    SNAPSHOT_LIMIT = 6

    def process(self, context: ProcessorContext) -> JobResultPayload:
        metadata = probe_video(context.input_path)
        fps = metadata.fps if metadata.fps > 0 else 24.0
        sample_stride = max(1, int(fps / self.SAMPLE_FPS))

        detector = RoadObjectDetector()
        tracker = SimpleTracker()
        risk_engine = RiskEngine(metadata.width or 1280, metadata.height or 720)

        events: List[dict] = []
        frames_meta: List[dict] = []
        snapshots = []
        artifacts: List[JobArtifactPayload] = []
        snapshot_budget = self.SNAPSHOT_LIMIT

        for frame_idx, timestamp, frame in iter_sampled_frames(context.input_path, sample_stride):
            detections = detector.detect(frame)
            tracks = tracker.update(frame_idx, detections)
            frame_events = risk_engine.evaluate(tracks, detections, timestamp)

            if frame_events:
                for event in frame_events:
                    events.append(event)
                if snapshot_budget > 0:
                    tracked_ids = {event.get("track_id") for event in frame_events if event.get("track_id")}
                    snapshot_meta = _save_snapshot(frame, context.output_dir, timestamp, frame_events, tracks, tracked_ids)
                    snapshots.append(snapshot_meta)
                    artifacts.append(
                        JobArtifactPayload(
                            kind="snapshot",
                            path=snapshot_meta["file"],
                            timestamp_sec=timestamp,
                            metadata={"events": frame_events},
                        )
                    )
                    snapshot_budget -= 1

            frames_meta.append(
                {
                    "timestamp": round(timestamp, 2),
                    "detections": detections,
                    "tracks": [{"id": t.id, "bbox": t.bbox, "class_name": t.class_name} for t in tracks],
                }
            )

        summary = {
            "total_events": len(events),
            "forward_collision_events": len([e for e in events if e["type"] == "FORWARD_COLLISION_RISK"]),
            "unsafe_overtakes": len([e for e in events if e["type"] == "UNSAFE_OVERTAKE"]),
            "signals_detected": len([e for e in events if e["type"] == "SIGN_DETECTED"]),
        }

        return JobResultPayload(
            summary=summary,
            events=events,
            frames=frames_meta,
            snapshots=snapshots,
            artifacts=artifacts,
        )


def _save_snapshot(frame, output_dir: str, timestamp: float, events: List[dict], tracks: List[Track], highlight_ids):
    highlight_ids = {hid for hid in (highlight_ids or set()) if hid}
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    annotated = frame.copy()
    for track in tracks:
        color = (0, 255, 0)
        if track.id in highlight_ids:
            color = (0, 0, 255)
        x1, y1, x2, y2 = map(int, track.bbox)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{track.class_name} #{track.id}"
        cv2.putText(annotated, label, (x1, max(0, y1 - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

    text_y = 30
    for event in events:
        cv2.putText(
            annotated,
            f"{event['type']} ({event.get('severity', 'INFO')})",
            (20, text_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 0, 255),
            2,
            cv2.LINE_AA,
        )
        text_y += 30

    filename = f"adas_{int(timestamp * 1000)}.jpg"
    path = Path(output_dir) / filename
    cv2.imwrite(str(path), annotated)
    return {
        "file": filename,
        "label": " | ".join(set(event["type"] for event in events)),
        "timestamp": round(timestamp, 2),
    }
