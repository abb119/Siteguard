from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional


@dataclass
class FrameObservation:
    timestamp: float
    ear: Optional[float]
    mar: Optional[float]
    yaw_deg: Optional[float]
    phone_detected: bool


class DmsEventBuilder:
    EAR_THRESHOLD = 0.23
    DROWSY_MIN_SEC = 0.8
    YAWN_THRESHOLD = 0.75
    YAWN_MIN_SEC = 0.5
    DISTRACTED_YAW = 25.0
    DISTRACTED_MIN_SEC = 0.7
    PHONE_MIN_SEC = 0.6

    def __init__(self, sample_period: float) -> None:
        self.sample_period = sample_period

    def summarize(self, frames: List[FrameObservation]) -> dict:
        events: List[dict] = []

        events.extend(self._build_event(frames, "DROWSY", self._is_drowsy, self.DROWSY_MIN_SEC))
        events.extend(self._build_event(frames, "YAWN", self._is_yawn, self.YAWN_MIN_SEC))
        events.extend(
            self._build_event(frames, "DISTRACTION", self._is_distracted, self.DISTRACTED_MIN_SEC)
        )
        events.extend(self._build_event(frames, "PHONE_USAGE", self._is_phone_usage, self.PHONE_MIN_SEC))

        total_duration = len(frames) * self.sample_period
        drowsy_time = _total_duration(events, "DROWSY")
        distraction_time = _total_duration(events, "DISTRACTION")

        summary = {
            "total_analyzed_seconds": round(total_duration, 2),
            "drowsiness_score": round(min(1.0, drowsy_time / max(total_duration, 1e-6)) * 100, 2),
            "distraction_score": round(min(1.0, distraction_time / max(total_duration, 1e-6)) * 100, 2),
            "events_detected": len(events),
        }

        return {"events": events, "summary": summary}

    def _build_event(self, frames, label, predicate, min_duration_sec):
        events = []
        streak = 0
        start_ts = None
        for obs in frames:
            if predicate(obs):
                streak += 1
                if start_ts is None:
                    start_ts = obs.timestamp
            else:
                if streak * self.sample_period >= min_duration_sec and start_ts is not None:
                    end_ts = obs.timestamp
                    events.append(
                        {
                            "type": label,
                            "start": round(start_ts, 2),
                            "end": round(end_ts, 2),
                            "duration": round(end_ts - start_ts, 2),
                            "severity": self._severity_for(label),
                        }
                    )
                streak = 0
                start_ts = None

        if streak * self.sample_period >= min_duration_sec and start_ts is not None:
            end_ts = start_ts + streak * self.sample_period
            events.append(
                {
                    "type": label,
                    "start": round(start_ts, 2),
                    "end": round(end_ts, 2),
                    "duration": round(end_ts - start_ts, 2),
                    "severity": self._severity_for(label),
                }
            )
        return events

    def _severity_for(self, label: str) -> str:
        if label in {"DROWSY", "PHONE_USAGE"}:
            return "HIGH"
        if label == "DISTRACTION":
            return "MEDIUM"
        return "LOW"

    def _is_drowsy(self, obs: FrameObservation) -> bool:
        return obs.ear is not None and obs.ear < self.EAR_THRESHOLD

    def _is_yawn(self, obs: FrameObservation) -> bool:
        return obs.mar is not None and obs.mar > self.YAWN_THRESHOLD

    def _is_distracted(self, obs: FrameObservation) -> bool:
        return obs.yaw_deg is not None and abs(obs.yaw_deg) > self.DISTRACTED_YAW

    def _is_phone_usage(self, obs: FrameObservation) -> bool:
        return obs.phone_detected


def _total_duration(events: List[dict], label: str) -> float:
    return sum(event["duration"] for event in events if event["type"] == label)
