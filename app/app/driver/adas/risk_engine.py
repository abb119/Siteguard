from __future__ import annotations

from typing import List, Tuple

from app.driver.common.tracking import Track
from app.driver.adas.object_detector import SIGN_CLASSES, VEHICLE_CLASSES


class RiskEngine:
    def __init__(self, frame_width: int, frame_height: int) -> None:
        self.frame_width = frame_width
        self.frame_height = frame_height

    def evaluate(self, tracks: List[Track], raw_detections: List[dict], timestamp: float) -> List[dict]:
        events = []
        for track in tracks:
            if track.class_name in VEHICLE_CLASSES:
                event = self._forward_collision(track, timestamp)
                if event:
                    events.append(event)
                lateral = self._unsafe_overtake(track, timestamp)
                if lateral:
                    events.append(lateral)

        for det in raw_detections:
            if det["class_name"] in SIGN_CLASSES:
                events.append(
                    {
                        "type": "SIGN_DETECTED",
                        "label": det["class_name"],
                        "timestamp": round(timestamp, 2),
                        "confidence": round(det["confidence"], 2),
                        "severity": "INFO",
                    }
                )
        return events

    def _forward_collision(self, track: Track, timestamp: float):
        area_history = track.history[-4:]
        if len(area_history) < 3:
            return None
        if area_history[-1] < 1:
            return None
        growth = area_history[-1] / max(area_history[0], 1.0)
        x1, _, x2, _ = track.bbox
        center = (x1 + x2) / 2.0
        in_lane = self.frame_width * 0.3 < center < self.frame_width * 0.7
        if growth >= 1.8 and in_lane:
            return {
                "type": "FORWARD_COLLISION_RISK",
                "timestamp": round(timestamp, 2),
                "track_id": track.id,
                "severity": "HIGH",
                "details": {"growth": round(growth, 2)},
            }
        return None

    def _unsafe_overtake(self, track: Track, timestamp: float):
        x1, _, x2, _ = track.bbox
        width = self.frame_width
        near_left = x1 < width * 0.1
        near_right = x2 > width * 0.9
        if near_left or near_right:
            return {
                "type": "UNSAFE_OVERTAKE",
                "timestamp": round(timestamp, 2),
                "track_id": track.id,
                "severity": "MEDIUM",
                "details": {"side": "left" if near_left else "right"},
            }
        return None
