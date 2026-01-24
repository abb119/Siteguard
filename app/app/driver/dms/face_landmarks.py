from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Tuple

import cv2
from mediapipe import solutions as mp_solutions


LEFT_EYE_LANDMARKS = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_LANDMARKS = [362, 385, 387, 263, 373, 380]
MOUTH_LANDMARKS = [78, 308, 13, 14, 17, 0]
HEAD_LEFT = 234
HEAD_RIGHT = 454
NOSE_TIP = 1
FOREHEAD = 10
CHIN = 152


@dataclass
class FaceMetrics:
    ear: float
    mar: float
    yaw_deg: float
    pitch_deg: float
    box: Tuple[int, int, int, int]


class FaceLandmarkExtractor:
    def __init__(self) -> None:
        self._mesh = mp_solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def close(self) -> None:
        self._mesh.close()

    def process(self, frame) -> Optional[FaceMetrics]:
        image_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self._mesh.process(image_rgb)
        if not results.multi_face_landmarks:
            return None

        height, width, _ = frame.shape
        landmarks = results.multi_face_landmarks[0].landmark

        coords = [(lm.x * width, lm.y * height, lm.z) for lm in landmarks]

        ear_left = _eye_aspect_ratio(coords, LEFT_EYE_LANDMARKS)
        ear_right = _eye_aspect_ratio(coords, RIGHT_EYE_LANDMARKS)
        ear = (ear_left + ear_right) / 2.0

        mar = _mouth_aspect_ratio(coords, MOUTH_LANDMARKS)

        left = coords[HEAD_LEFT]
        right = coords[HEAD_RIGHT]
        nose = coords[NOSE_TIP]
        center_x = (left[0] + right[0]) / 2.0
        yaw = math.degrees(math.atan2(nose[0] - center_x, right[0] - left[0] + 1e-6))

        forehead = coords[FOREHEAD]
        chin = coords[CHIN]
        pitch = math.degrees(math.atan2(forehead[1] - chin[1], forehead[2] - chin[2] + 1e-6))

        xs = [p[0] for p in coords if 0 <= p[0] <= width]
        ys = [p[1] for p in coords if 0 <= p[1] <= height]
        if not xs or not ys:
            bbox = (0, 0, width, height)
        else:
            bbox = (int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys)))

        return FaceMetrics(ear=ear, mar=mar, yaw_deg=yaw, pitch_deg=pitch, box=bbox)


def _eye_aspect_ratio(coords, idxs) -> float:
    p1, p2, p3, p4, p5, p6 = [coords[i] for i in idxs]
    dist1 = _euclidean(p2, p6)
    dist2 = _euclidean(p3, p5)
    dist3 = _euclidean(p1, p4)
    return (dist1 + dist2) / (2.0 * dist3 + 1e-6)


def _mouth_aspect_ratio(coords, idxs) -> float:
    p1, p2, p3, p4, p5, p6 = [coords[i] for i in idxs]
    vertical = (_euclidean(p3, p4) + _euclidean(p5, p6)) / 2.0
    horizontal = _euclidean(p1, p2)
    return vertical / (horizontal + 1e-6)


def _euclidean(a, b) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
