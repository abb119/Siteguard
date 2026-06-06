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
    # Looking down (phone in lap / not watching the road), via solvePnP pitch
    pitch_down_deg: float = 15.0
    lookdown_min_sec: float = 1.2
    # Drinking: an object (cup/bottle) sustained near the face
    drinking_min_sec: float = 0.8
    # Seatbelt: sustained "no seatbelt" before alerting
    seatbelt_min_sec: float = 1.5
    # Hysteresis: how long a condition must clear before the alert drops
    alert_release_sec: float = 1.0
    # Smoothing factor for EMA (0..1, higher = snappier)
    ema_alpha: float = 0.4

    # Robustness
    low_light_brightness: float = 55.0   # mean gray below this → enhance (CLAHE)
    blocked_brightness: float = 16.0     # near-black frame (lens covered / no signal)
    blocked_detail_std: float = 6.0      # near-uniform frame (lens covered)
    blocked_min_sec: float = 1.5

    # Whitelisted, clamped tunables the frontend Settings page may override
    _BOUNDS = {
        "calibration_seconds": (2.0, 10.0),
        "ear_ratio": (0.5, 0.9),
        "perclos_drowsy": (0.05, 0.4),
        "microsleep_sec": (0.3, 2.0),
        "mar_yawn": (0.4, 1.0),
        "yaw_distract_deg": (8.0, 45.0),
        "pitch_down_deg": (5.0, 45.0),
        "distract_min_sec": (0.4, 3.0),
        "lookdown_min_sec": (0.4, 3.0),
    }

    @classmethod
    def from_overrides(cls, overrides: Optional[Dict]) -> "DmsConfig":
        """Build a config from client overrides, clamped to safe ranges."""
        cfg = cls()
        for key, (lo, hi) in cls._BOUNDS.items():
            if overrides and key in overrides:
                try:
                    setattr(cfg, key, max(lo, min(hi, float(overrides[key]))))
                except (TypeError, ValueError):
                    pass
        return cfg


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
    roll_deg: Optional[float] = None
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
        self._roll_ema: Optional[float] = None

        # Hysteresis state machines
        self._sm_drowsy = _SustainedFlag(0.4, self.cfg.alert_release_sec)
        self._sm_microsleep = _SustainedFlag(self.cfg.microsleep_sec, 0.3)
        self._sm_yawn = _SustainedFlag(self.cfg.yawn_min_sec, self.cfg.alert_release_sec)
        self._sm_distract = _SustainedFlag(self.cfg.distract_min_sec, self.cfg.alert_release_sec)
        self._sm_lookdown = _SustainedFlag(self.cfg.lookdown_min_sec, self.cfg.alert_release_sec)
        self._sm_drinking = _SustainedFlag(self.cfg.drinking_min_sec, self.cfg.alert_release_sec)
        self._sm_no_seatbelt = _SustainedFlag(self.cfg.seatbelt_min_sec, self.cfg.alert_release_sec)
        self._sm_noface = _SustainedFlag(2.0, 1.0)
        self._sm_blocked = _SustainedFlag(self.cfg.blocked_min_sec, 0.5)

        # Yawn event counter (rising edge)
        self._was_yawning = False
        self._yawn_count = 0

        self.fatigue_score: float = 0.0

        # Robustness state
        self.eye_reliable: bool = True   # False ≈ sunglasses / occluded eyes
        self.low_light: bool = False

    # ── Public API ─────────────────────────────────────────────────────────
    def process(self, frame_bgr, t: float, objects: Optional[List[Dict]] = None,
                seatbelt: Optional[bool] = None) -> Dict:
        if self.start_ts is None:
            self.start_ts = t

        # Frame quality — detect a covered/black lens before anything else
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        brightness = float(gray.mean())
        detail = float(gray.std())
        blocked_cond = brightness < self.cfg.blocked_brightness or detail < self.cfg.blocked_detail_std
        if self._sm_blocked.update(blocked_cond, t):
            return self._blocked_result()

        # Low-light → enhance a working copy so FaceMesh still finds the face
        self.low_light = brightness < self.cfg.low_light_brightness
        work = self._enhance_low_light(frame_bgr) if self.low_light else frame_bgr

        metrics = self._extract(work)
        face_found = self._sm_noface_inverse(metrics.face_found, t)

        # EMA smoothing on available metrics
        if metrics.ear is not None:
            self._ear_ema = self._ema(self._ear_ema, metrics.ear)
        if metrics.yaw_deg is not None:
            self._yaw_ema = self._ema(self._yaw_ema, metrics.yaw_deg)
        if metrics.pitch_deg is not None:
            self._pitch_ema = self._ema(self._pitch_ema, metrics.pitch_deg)
        if metrics.roll_deg is not None:
            self._roll_ema = self._ema(self._roll_ema, metrics.roll_deg)

        # Calibration phase
        calibrating = self._update_calibration(metrics, t)

        eye_closed = self._eye_closed(metrics)
        self._update_eye_window(eye_closed, t)
        self._update_blink_microsleep(eye_closed, t)

        perclos = self._perclos()

        # Object-based signals (phone anywhere = distraction; cup/bottle near
        # the face = drinking)
        phone_detected = any(o.get("type") == "cell_phone" for o in (objects or []))
        drinking_cond = any(
            o.get("type") in ("cup", "bottle") and self._near_face(o.get("box"), metrics.box)
            for o in (objects or [])
        )

        # Conditions (EAR-based ones suppressed when eye tracking isn't reliable)
        drowsy_cond = self.eye_reliable and self.calibrated and perclos >= self.cfg.perclos_drowsy
        microsleep_cond = (
            self.eye_reliable
            and self._closed_since is not None
            and (t - self._closed_since) >= self.cfg.microsleep_sec
        )
        yawn_cond = metrics.mar is not None and metrics.mar >= self.cfg.mar_yawn
        distract_cond = self._distracted(metrics)
        lookdown_cond = (
            self._pitch_ema is not None and self._pitch_ema > self.cfg.pitch_down_deg
        )
        no_seatbelt_cond = seatbelt is False  # False = belt absent (None = unknown)

        # Hysteresis-filtered alerts
        a_drowsy = self._sm_drowsy.update(drowsy_cond, t)
        a_micro = self._sm_microsleep.update(microsleep_cond, t)
        a_yawn = self._sm_yawn.update(yawn_cond, t)
        a_distract = self._sm_distract.update(distract_cond, t)
        a_lookdown = self._sm_lookdown.update(lookdown_cond, t)
        a_drinking = self._sm_drinking.update(drinking_cond, t)
        a_no_seatbelt = self._sm_no_seatbelt.update(no_seatbelt_cond, t)

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
            a_lookdown=a_lookdown,
            a_drinking=a_drinking,
            a_no_seatbelt=a_no_seatbelt,
            seatbelt=seatbelt,
            phone_detected=phone_detected,
            eye_reliable=self.eye_reliable,
            low_light=self.low_light,
        )

    @staticmethod
    def _near_face(obj_box, face_box) -> bool:
        """True if an object's box center sits within an expanded face box."""
        if not obj_box or not face_box:
            return False
        ox = (obj_box[0] + obj_box[2]) / 2.0
        oy = (obj_box[1] + obj_box[3]) / 2.0
        fx1, fy1, fx2, fy2 = face_box
        fw = fx2 - fx1
        fh = fy2 - fy1
        # Expand the face box (drinking/eating happen just below the mouth)
        return (fx1 - 0.5 * fw) <= ox <= (fx2 + 0.5 * fw) and (fy1 - 0.4 * fh) <= oy <= (fy2 + 0.9 * fh)

    def close(self) -> None:
        try:
            self._mesh.close()
        except Exception:
            pass

    # ── Robustness helpers ─────────────────────────────────────────────────
    @staticmethod
    def _enhance_low_light(frame_bgr):
        """CLAHE on the luma channel so FaceMesh still works in the dark."""
        try:
            yuv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YUV)
            clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
            yuv[:, :, 0] = clahe.apply(yuv[:, :, 0])
            return cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)
        except Exception:
            return frame_bgr

    def _blocked_result(self) -> Dict:
        """Minimal result when the lens is covered/black — analysis paused."""
        return {
            "drowsiness": "—",
            "drowsiness_confidence": 0.0,
            "distractions": [],
            "is_alert": False,
            "risk_level": "medium",
            "detections": [],
            "calibrating": False,
            "face_found": False,
            "eyes_closed": False,
            "perclos": 0.0,
            "microsleep": False,
            "fatigue_score": round(self.fatigue_score, 1),
            "blink_count": self._blink_count,
            "microsleep_count": self._microsleep_count,
            "yawn_count": self._yawn_count,
            "head_pose": {"yaw": None, "pitch": None, "roll": None},
            "ear": None,
            "ear_threshold": round(self.ear_threshold, 4),
            "low_light": False,
            "camera_blocked": True,
            "eye_reliable": self.eye_reliable,
            "seatbelt": "unknown",
            "alerts": [{
                "type": "CAMERA_BLOCKED", "severity": "high",
                "message": "Cámara bloqueada u oscura",
            }],
        }

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

        # Real head pose via solvePnP (pitch/roll). Falls back to a heuristic
        # pitch if the PnP solve fails, so look-down never raises false alarms.
        pitch, _yaw_pnp, roll = _solve_head_pose(coords, w, h)
        if pitch is None:
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
        return FrameMetrics(True, ear, mar, yaw, pitch, roll, box)

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
                # Never saw open eyes during calibration → eyes likely occluded
                # (sunglasses / heavy glare). Don't trust EAR-based alerts.
                self.ear_threshold = self.cfg.ear_absolute_fallback
                self.eye_reliable = False
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
                    self.eye_reliable = True  # a real blink proves the eyes track
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
        a_lookdown = k["a_lookdown"]
        a_drinking = k["a_drinking"]
        a_no_seatbelt = k["a_no_seatbelt"]
        seatbelt = k["seatbelt"]
        phone = k["phone_detected"]
        perclos = k["perclos"]
        calibrating = k["calibrating"]
        face_found = k["face_found"]
        eye_reliable = k["eye_reliable"]
        low_light = k["low_light"]

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
        if a_lookdown:
            alerts.append({"type": "LOOK_DOWN", "severity": "high",
                           "message": "Mirando hacia abajo"})
        if phone:
            alerts.append({"type": "PHONE", "severity": "high", "message": "Uso de móvil"})
        if a_no_seatbelt and face_found:
            alerts.append({"type": "NO_SEATBELT", "severity": "high", "message": "Sin cinturón"})
        if a_drinking:
            alerts.append({"type": "DRINKING", "severity": "medium",
                           "message": "Bebiendo al volante"})
        if a_yawn:
            alerts.append({"type": "YAWN", "severity": "medium", "message": "Bostezo"})
        if face_found and not eye_reliable:
            alerts.append({"type": "EYE_DEGRADED", "severity": "medium",
                           "message": "Detección ocular degradada (¿gafas de sol?)"})
        if not face_found and not calibrating:
            alerts.append({"type": "NO_FACE", "severity": "medium",
                           "message": "Conductor no detectado"})

        # Stable overall risk derived from latched alerts (no per-frame flicker)
        sev_rank = {"critical": 3, "high": 2, "medium": 1}
        top = max((sev_rank.get(a["severity"], 0) for a in alerts), default=0)
        risk_level = {3: "high", 2: "high", 1: "medium", 0: "low"}[top]
        # "Alert" = awake AND attentive (eyes on road, no phone/drink)
        is_alert = not (a_drowsy or a_micro or a_distract or a_lookdown or phone or a_drinking or (a_no_seatbelt and face_found))

        # Legacy-compatible drowsiness string + confidence
        if calibrating:
            drowsiness = "Calibrando"
        elif a_micro or a_drowsy:
            drowsiness = "Drowsy"
        else:
            drowsiness = "Alert"
        drowsiness_confidence = round(min(1.0, perclos / max(self.cfg.perclos_critical, 1e-6)), 3)

        # Distractions list (legacy shape) — phone + drinking
        distractions: List[Dict] = []
        if phone:
            distractions.append({"type": "cell_phone", "confidence": 0.9})
        if a_drinking:
            distractions.append({"type": "drinking", "confidence": 0.8})
        if a_lookdown:
            distractions.append({"type": "looking_down", "confidence": 0.8})

        # Detections (bbox) for the canvas overlay
        detections: List[Dict] = []
        if m.box is not None:
            label = drowsiness
            if a_micro:
                label = "⚠️ MICROSUEÑO"
            elif a_drowsy:
                label = "⚠️ SOMNOLENCIA"
            elif a_lookdown:
                label = "⬇️ MIRANDO ABAJO"
            elif a_distract:
                label = "↪️ DISTRAÍDO"
            elif a_drinking:
                label = "🥤 BEBIENDO"
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
                "roll": round(self._roll_ema, 1) if self._roll_ema is not None else None,
            },
            "ear": round(self._ear_ema, 4) if self._ear_ema is not None else None,
            "ear_threshold": round(self.ear_threshold, 4),
            "low_light": low_light,
            "camera_blocked": False,
            "eye_reliable": eye_reliable,
            "seatbelt": "worn" if seatbelt is True else "absent" if seatbelt is False else "unknown",
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


# ── Head pose (solvePnP) ────────────────────────────────────────────────────
# Generic 3D face model points (mm) matching the 2D landmarks below.
_PNP_LANDMARKS = [NOSE_TIP, CHIN, 33, 263, 61, 291]
_PNP_MODEL = np.array([
    (0.0, 0.0, 0.0),        # nose tip
    (0.0, -63.6, -12.5),    # chin
    (-43.3, 32.7, -26.0),   # left eye outer corner
    (43.3, 32.7, -26.0),    # right eye outer corner
    (-28.9, -28.9, -24.1),  # left mouth corner
    (28.9, -28.9, -24.1),   # right mouth corner
], dtype=np.float64)


def _solve_head_pose(coords, w: int, h: int):
    """
    Estimate (pitch, yaw, roll) in degrees from facial landmarks via solvePnP.
    Convention: pitch > 0 ≈ looking down. Returns (None, None, None) on failure.
    """
    try:
        image_points = np.array(
            [(coords[i][0], coords[i][1]) for i in _PNP_LANDMARKS], dtype=np.float64
        )
        focal = float(w)
        cam_matrix = np.array(
            [[focal, 0, w / 2.0], [0, focal, h / 2.0], [0, 0, 1]], dtype=np.float64
        )
        dist_coeffs = np.zeros((4, 1))
        ok, rvec, _tvec = cv2.solvePnP(
            _PNP_MODEL, image_points, cam_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
        )
        if not ok:
            return None, None, None
        rmat, _ = cv2.Rodrigues(rvec)
        angles = cv2.RQDecomp3x3(rmat)[0]
        pitch, yaw, roll = float(angles[0]), float(angles[1]), float(angles[2])
        # Normalize pitch so straight-ahead ≈ 0 and down is positive.
        if pitch > 90:
            pitch -= 180
        elif pitch < -90:
            pitch += 180
        return -pitch, yaw, roll
    except Exception:
        return None, None, None
