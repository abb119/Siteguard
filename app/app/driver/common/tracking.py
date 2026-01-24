from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple


@dataclass
class Track:
    id: int
    bbox: Tuple[float, float, float, float]
    class_name: str
    last_seen: int
    history: List[float]


class SimpleTracker:
    def __init__(self, max_lost: int = 5, distance_threshold: float = 100.0) -> None:
        self.max_lost = max_lost
        self.distance_threshold = distance_threshold
        self.next_id = 1
        self.tracks: Dict[int, Track] = {}

    def update(self, frame_idx: int, detections: List[dict]) -> List[Track]:
        updated_tracks: Dict[int, Track] = {}

        for det in detections:
            assigned_id = None
            best_score = None

            for track_id, track in self.tracks.items():
                dist = _centroid_distance(det["box"], track.bbox)
                if dist < self.distance_threshold and track.class_name == det["class_name"]:
                    if best_score is None or dist < best_score:
                        best_score = dist
                        assigned_id = track_id

            if assigned_id is None:
                assigned_id = self.next_id
                self.next_id += 1

            bbox = tuple(det["box"])
            area = _box_area(bbox)
            if assigned_id in self.tracks:
                track = self.tracks[assigned_id]
                track.bbox = bbox
                track.class_name = det["class_name"]
                track.last_seen = frame_idx
                track.history.append(area)
                track.history = track.history[-6:]
            else:
                track = Track(
                    id=assigned_id,
                    bbox=bbox,
                    class_name=det["class_name"],
                    last_seen=frame_idx,
                    history=[area],
                )
            updated_tracks[assigned_id] = track

        # carry over tracks not updated if not too old
        for track_id, track in self.tracks.items():
            if track_id not in updated_tracks and frame_idx - track.last_seen <= self.max_lost:
                updated_tracks[track_id] = track

        self.tracks = updated_tracks
        return list(updated_tracks.values())


def _centroid(box):
    x1, y1, x2, y2 = box
    return (x1 + x2) / 2.0, (y1 + y2) / 2.0


def _centroid_distance(box_a, box_b) -> float:
    ax, ay = _centroid(box_a)
    bx, by = _centroid(box_b)
    return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5


def _box_area(box) -> float:
    x1, y1, x2, y2 = box
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)
