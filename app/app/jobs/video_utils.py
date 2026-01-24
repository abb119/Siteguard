from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2


@dataclass
class VideoMetadata:
    width: int
    height: int
    fps: float
    frame_count: int

    @property
    def duration(self) -> float:
        if self.fps <= 0:
            return 0.0
        return self.frame_count / self.fps


def probe_video(path: str) -> VideoMetadata:
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("Unable to open video file")

    fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    cap.release()
    return VideoMetadata(width=width, height=height, fps=fps, frame_count=frame_count)


def iter_sampled_frames(path: str, sample_stride: int):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("Unable to open video file")

    idx = 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if sample_stride <= 1 or idx % sample_stride == 0:
            timestamp = idx / fps if fps > 0 else idx
            yield idx, timestamp, frame
        idx += 1
    cap.release()
