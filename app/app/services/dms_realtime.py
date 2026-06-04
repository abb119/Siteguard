"""
Real-time Driver Monitoring System (DMS) — Phase 1 foundations.

Self-contained, stateful, MediaPipe-based driver analyzer for the live
webcam stream. Unlike the legacy per-frame black-box classifier, this engine:

  * Extracts explainable facial metrics (EAR / MAR / head pose) via MediaPipe.
  * Maintains per-session temporal state (sliding window) to compute
    PERCLOS, microsleep, blink rate and sustained head-off-road.
  * Uses a hysteresis state machine so alerts do NOT flicker frame-to-frame.
  * Calibrates a per-driver eye baseline during the first seconds.
  * Produces a session fatigue score (0..100).

It is intentionally decoupled from the (currently broken/disabled)
`app.app.driver` package so it can run in real time without registering
the offline job processors.

The output dict is a strict SUPERSET of the legacy DriverModel output, so the
existing frontend keeps working and can progressively adopt the new fields.
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional, Tuple

import cv2
import numpy as np
from mediapipe import solutions as mp_solutions


# ── MediaPipe FaceMesh landmark indices (same as the offline DMS) ──────────
LEFT_EYE_LANDMARKS = [33, 160, 158, 133, 153, 144]
RIGHT_EYE_LANDMARKS = [362, 385, 387, 263, 373, 380]
MOUTH_LANDMARKS = [78, 308, 13, 14, 17, 0]
HEAD_LEFT = 234
HEAD_RIGHT = 454
NOSE_TIP = 1
FOREHEAD = 10
CHIN = 152


@dataclass
class DmsConfig:
    """Tunable thresholds. Phase 3 can load these from a YAML policy."""
    # Calibration
    calibration_seconds: float = 4.0
    # Eye closure: threshold = baseline_ear * ratio (fallback to absolute)
    ear_ratio: float = 0.72
    ear_absolute_fallback: float = 0.21
    # PERCLOS (fraction of time eyes closed over the window)
    perclos_window_sec: float = 60.0
    perclos_drowsy: float = 0.15      # >15% closed → drowsy
    perclos_critical: float = 0.30    # >30% closed → severe
    # Microsleep: continuous eye closure
    microsleep_sec: float = 0.8
    # Yawn
    mar_yawn: float = 0.6
    yawn_min_sec: float = 0.5
    # Distraction (head turned away from road)
    yaw_distract_deg: float = 18.0
    pitch_distract_deg: float = 22.0
    distract_min_sec: float = 1.3
    # Hysteresis: how long a condition must clear before the alert drops
    alert_release_sec: float = 1.0
    # Smoothing factor for EMA (0..1, higher = snappier)
    ema_alpha: float = 0.4


# ── Hysteresis helper ──────────────────────────────────────────────────────
class _SustainedFlag:
    """
    Latches ON only after `on_sec` of continuous truth, and latches OFF only
    after `off_sec` of continuous falsehood. Kills per-frame flicker.
    """

    def __init__(self, on_sec: float, off_sec: float) -> None:
        self.on_sec = on_sec
        self.off_sec = off_sec
        self.active = False
        self._true_since: Optional[float] = None
        self._false_since: Optional[float] = None

    def update(self, condition: bool, t: float) -> bool:
        if condition:
            self._false_since = None
            if self._true_since is None:
                self._true_since = t
            if not self.active and (t - self._true_since) >= self.on_sec:
                self.active = True
        else:
            self._true_since = None
            if self._false_since is None:
                self._false_since = t
            if self.active and (t - self._false_since) >= self.off_sec:
                self.active = False
        return self.active


@dataclass
class FrameMetrics:
    face_found: bool
    ear: Optional[float] = None
    mar: Optional[float] = None
    yaw_deg: Optional[float] = None
    pitch_deg: Optional[float] = None
    box: Optional[Tuple[int, int, int, int]] = None


class DmsSession:
    """
    Holds ALL temporal state for a single driver connection.
    One instance per WebSocket; call `.process(frame_bgr, t, phone_detected)`.
    """

    def __init__(self, config: Optional[DmsConfig] = None) -> None:
        self.cfg = config or DmsConfig()
        self._mesh = mp_solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        # Calibration
        self.start_ts: Optional[float] = None
        self.calibrated = False
        self._calib_ear_samples: List[float] = []
        self.baseline_ear: Optional[float] = None
        self.ear_threshold: float = self.cfg.ear_absolute_fallback

        # Sliding window of (timestamp, eye_closed) for PERCLOS
        self._eye_window: Deque[Tuple[float, bool]] = deque()

        # Eye-closure streak (for microsleep + blink counting)
        self._closed_since: Optional[float] = None
        self._was_closed = False
        self._blink_count = 0
        self._microsleep_count = 0

        # Smoothed metrics (EMA)
        self._ear_ema: Optional[float] = None
        self._yaw_ema: Optional[float] = None
        self._pitch_ema: Optional[float] = None

        # Hysteresis state machines
        self._sm_drowsy = _SustainedFlag(0.4, self.cfg.alert_release_sec)
        self._sm_microsleep = _SustainedFlag(self.cfg.microsleep_sec, 0.3)
        self._sm_yawn = _SustainedFlag(self.cfg.yawn_min_sec, self.cfg.alert_release_sec)
        self._sm_distract = _SustainedFlag(self.cfg.distract_min_sec, self.cfg.alert_release_sec)
        self._sm_noface = _SustainedFlag(2.0, 1.0)

        # Yawn event counter (rising edge)
        self._was_yawning = False
        self._yawn_count = 0

        self.fatigue_score: float = 0.0

    # ── Public API ─────────────────────────────────────────────────────────
    def process(self, frame_bgr, t: float, phone_detected: bool = False) -> Dict:
        if self.start_ts is None:
            self.start_ts = t

        metrics = self._extract(frame_bgr)
        face_found = self._sm_noface_inverse(metrics.face_found, t)

        # EMA smoothing on available metrics
        if metrics.ear is not None:
            self._ear_ema = self._ema(self._ear_ema, metrics.ear)
        if metrics.yaw_deg is not None:
            self._yaw_ema = self._ema(self._yaw_ema, metrics.yaw_deg)
        if metrics.pitch_deg is not None:
            self._pitch_ema = self._ema(self._pitch_ema, metrics.pitch_deg)

        # Calibration phase
        calibrating = self._update_calibration(metrics, t)

        eye_closed = self._eye_closed(metrics)
        self._update_eye_window(eye_closed, t)
        self._update_blink_microsleep(eye_closed, t)

        perclos = self._perclos()

        # Conditions
        drowsy_cond = self.calibrated and perclos >= self.cfg.perclos_drowsy
        microsleep_cond = self._closed_since is not None and (t - self._closed_since) >= self.cfg.microsleep_sec
        yawn_cond = metrics.mar is not None and metrics.mar >= self.cfg.mar_yawn
        distract_cond = self._distracted(metrics)

        # Hysteresis-filtered alerts
        a_drowsy = self._sm_drowsy.update(drowsy_cond, t)
        a_micro = self._sm_microsleep.update(microsleep_cond, t)
        a_yawn = self._sm_yawn.update(yawn_cond, t)
        a_distract = self._sm_distract.update(distract_cond, t)

        # Yawn rising-edge count
        if a_yawn and not self._was_yawning:
            self._yawn_count += 1
        self._was_yawning = a_yawn

        self._update_fatigue(perclos, a_micro, t)

        return self._build_result(
            metrics=metrics,
            t=t,
            calibrating=calibrating,
            face_found=face_found,
            eye_closed=eye_closed,
            perclos=perclos,
            a_drowsy=a_drowsy,
            a_micro=a_micro,
            a_yawn=a_yawn,
            a_distract=a_distract,
            phone_detected=phone_detected,
        )

    def close(self) -> None:
        try:
            self._mesh.close()
        except Exception:
            pass

    # ── Internals ──────────────────────────────────────────────────────────
    def _ema(self, prev: Optional[float], value: float) -> float:
        if prev is None:
            return value
        a = self.cfg.ema_alpha
        return a * value + (1 - a) * prev

    def _extract(self, frame_bgr) -> FrameMetrics:
        image_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = self._mesh.process(image_rgb)
        if not results.multi_face_landmarks:
            return FrameMetrics(face_found=False)

        h, w, _ = frame_bgr.shape
        lm = results.multi_face_landmarks[0].landmark
        coords = [(p.x * w, p.y * h, p.z) for p in lm]

        ear = (
            _eye_aspect_ratio(coords, LEFT_EYE_LANDMARKS)
            + _eye_aspect_ratio(coords, RIGHT_EYE_LANDMARKS)
        ) / 2.0
        mar = _mouth_aspect_ratio(coords, MOUTH_LANDMARKS)

        left = coords[HEAD_LEFT]
        right = coords[HEAD_RIGHT]
        nose = coords[NOSE_TIP]
        center_x = (left[0] + right[0]) / 2.0
        yaw = math.degrees(math.atan2(nose[0] - center_x, (right[0] - left[0]) + 1e-6))

        forehead = coords[FOREHEAD]
        chin = coords[CHIN]
        pitch = math.degrees(math.atan2(forehead[1] - chin[1], (forehead[2] - chin[2]) + 1e-6))

        xs = [p[0] for p in coords if 0 <= p[0] <= w]
        ys = [p[1] for p in coords if 0 <= p[1] <= h]
        box = (
            (int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys)))
            if xs and ys
            else (0, 0, w, h)
        )
        return FrameMetrics(True, ear, mar, yaw, pitch, box)

    def _sm_noface_inverse(self, face_found: bool, t: float) -> bool:
        # _sm_noface latches when NO face is sustained; we return the positive
        no_face = self._sm_noface.update(not face_found, t)
        return not no_face

    def _update_calibration(self, m: FrameMetrics, t: float) -> bool:
        if self.calibrated:
            return False
        base = self.start_ts if self.start_ts is not None else t
        elapsed = t - base
        # Collect "eyes open" samples only (use a generous absolute gate)
        if m.ear is not None and m.ear > self.cfg.ear_absolute_fallback:
            self._calib_ear_samples.append(m.ear)
        if elapsed >= self.cfg.calibration_seconds:
            if len(self._calib_ear_samples) >= 5:
                self.baseline_ear = float(np.median(self._calib_ear_samples))
                self.ear_threshold = max(
                    self.cfg.ear_absolute_fallback,
                    self.baseline_ear * self.cfg.ear_ratio,
                )
            else:
                self.ear_threshold = self.cfg.ear_absolute_fallback
            self.calibrated = True
            return False
        return True

    def _eye_closed(self, m: FrameMetrics) -> bool:
        ear = self._ear_ema if self._ear_ema is not None else m.ear
        if ear is None:
            return False
        return ear < self.ear_threshold

    def _update_eye_window(self, eye_closed: bool, t: float) -> None:
        self._eye_window.append((t, eye_closed))
        cutoff = t - self.cfg.perclos_window_sec
        while self._eye_window and self._eye_window[0][0] < cutoff:
            self._eye_window.popleft()

    def _update_blink_microsleep(self, eye_closed: bool, t: float) -> None:
        if eye_closed:
            if self._closed_since is None:
                self._closed_since = t
        else:
            if self._was_closed and self._closed_since is not None:
                dur = t - self._closed_since
                if dur >= self.cfg.microsleep_sec:
                    self._microsleep_count += 1
                elif dur >= 0.05:
                    self._blink_count += 1
            self._closed_since = None
        self._was_closed = eye_closed

    def _perclos(self) -> float:
        if not self._eye_window:
            return 0.0
        closed = sum(1 for _, c in self._eye_window if c)
        return closed / len(self._eye_window)

    def _distracted(self, m: FrameMetrics) -> bool:
        yaw = self._yaw_ema if self._yaw_ema is not None else m.yaw_deg
        if yaw is None:
            return False
        return abs(yaw) > self.cfg.yaw_distract_deg

    def _update_fatigue(self, perclos: float, microsleep_active: bool, t: float) -> None:
        # Target fatigue blends PERCLOS, microsleep events and yawns.
        target = min(
            100.0,
            perclos * 220.0
            + self._microsleep_count * 12.0
            + self._yawn_count * 4.0
            + (25.0 if microsleep_active else 0.0),
        )
        # Slow EMA so the gauge is stable and trends over the trip.
        self.fatigue_score = 0.92 * self.fatigue_score + 0.08 * target

    def _build_result(self, **k) -> Dict:
        m: FrameMetrics = k["metrics"]
        a_drowsy = k["a_drowsy"]
        a_micro = k["a_micro"]
        a_yawn = k["a_yawn"]
        a_distract = k["a_distract"]
        phone = k["phone_detected"]
        perclos = k["perclos"]
        calibrating = k["calibrating"]
        face_found = k["face_found"]

        alerts: List[Dict] = []
        if a_micro:
            alerts.append({"type": "MICROSLEEP", "severity": "critical",
                           "message": "¡MICROSUEÑO! Ojos cerrados"})
        if a_drowsy:
            sev = "critical" if perclos >= self.cfg.perclos_critical else "high"
            alerts.append({"type": "DROWSY", "severity": sev,
                           "message": f"Somnolencia (PERCLOS {perclos*100:.0f}%)"})
        if a_distract:
            alerts.append({"type": "DISTRACTION", "severity": "high",
                           "message": "Mirada fuera de la carretera"})
        if a_yawn:
            alerts.append({"type": "YAWN", "severity": "medium", "message": "Bostezo"})
        if phone:
            alerts.append({"type": "PHONE", "severity": "high", "message": "Uso de móvil"})
        if not face_found and not calibrating:
            alerts.append({"type": "NO_FACE", "severity": "medium",
                           "message": "Conductor no detectado"})

        # Stable overall risk derived from latched alerts (no per-frame flicker)
        sev_rank = {"critical": 3, "high": 2, "medium": 1}
        top = max((sev_rank.get(a["severity"], 0) for a in alerts), default=0)
        risk_level = {3: "high", 2: "high", 1: "medium", 0: "low"}[top]
        is_alert = not (a_drowsy or a_micro)  # "alert" = awake/attentive

        # Legacy-compatible drowsiness string + confidence
        if calibrating:
            drowsiness = "Calibrando"
        elif a_micro or a_drowsy:
            drowsiness = "Drowsy"
        else:
            drowsiness = "Alert"
        drowsiness_confidence = round(min(1.0, perclos / max(self.cfg.perclos_critical, 1e-6)), 3)

        # Distractions list (legacy shape) — phone goes here
        distractions: List[Dict] = []
        if phone:
            distractions.append({"type": "cell_phone", "confidence": 0.9})

        # Detections (bbox) for the canvas overlay
        detections: List[Dict] = []
        if m.box is not None:
            label = drowsiness
            if a_micro:
                label = "⚠️ MICROSUEÑO"
            elif a_drowsy:
                label = "⚠️ SOMNOLENCIA"
            elif a_distract:
                label = "↪️ DISTRAÍDO"
            detections.append({
                "box": list(m.box),
                "confidence": 1.0,
                "class_id": 0,
                "class_name": label,
            })

        return {
            # ── legacy-compatible keys ──
            "drowsiness": drowsiness,
            "drowsiness_confidence": drowsiness_confidence,
            "distractions": distractions,
            "is_alert": is_alert,
            "risk_level": risk_level,
            "detections": detections,
            # ── new Phase-1 keys ──
            "calibrating": calibrating,
            "face_found": face_found,
            "eyes_closed": k["eye_closed"],
            "perclos": round(perclos, 4),
            "microsleep": a_micro,
            "fatigue_score": round(self.fatigue_score, 1),
            "blink_count": self._blink_count,
            "microsleep_count": self._microsleep_count,
            "yawn_count": self._yawn_count,
            "head_pose": {
                "yaw": round(self._yaw_ema, 1) if self._yaw_ema is not None else None,
                "pitch": round(self._pitch_ema, 1) if self._pitch_ema is not None else None,
            },
            "ear": round(self._ear_ema, 4) if self._ear_ema is not None else None,
            "ear_threshold": round(self.ear_threshold, 4),
            "alerts": alerts,
        }


# ── Stateless landmark math (ported from the offline DMS, proven) ───────────
def _eye_aspect_ratio(coords, idxs) -> float:
    p1, p2, p3, p4, p5, p6 = [coords[i] for i in idxs]
    return (_dist(p2, p6) + _dist(p3, p5)) / (2.0 * _dist(p1, p4) + 1e-6)


def _mouth_aspect_ratio(coords, idxs) -> float:
    p1, p2, p3, p4, p5, p6 = [coords[i] for i in idxs]
    vertical = (_dist(p3, p4) + _dist(p5, p6)) / 2.0
    return vertical / (_dist(p1, p2) + 1e-6)


def _dist(a, b) -> float:
    return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
