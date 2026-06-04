"""
Driver event recorder — persists DMS incidents (microsleep, drowsy,
distraction, look-down, phone, drinking…) with a snapshot.

One instance per WebSocket connection. It saves an event only on the RISING
edge of each alert type, with a per-type cooldown, so a single sustained
incident produces one record instead of hundreds.
"""
from __future__ import annotations

import os
import uuid
from typing import Dict, List, Optional, Set

import cv2
from sqlalchemy.ext.asyncio import AsyncSession

from app.app.db.models import DriverEvent

SAVE_DIR = "app/app/static/driver_events"

# Severities worth persisting (everything the engine emits today)
_PERSIST = {"critical", "high", "medium"}
# Seconds before the same alert type can be recorded again
_COOLDOWN_SEC = 20.0


class DriverEventRecorder:
    def __init__(self, session_id: Optional[str] = None) -> None:
        self.session_id = session_id
        self._prev_active: Set[str] = set()
        self._last_saved: Dict[str, float] = {}

    async def record(self, result: Dict, frame, t: float, db: AsyncSession) -> List[DriverEvent]:
        """Persist newly-activated alerts. `t` is a monotonic seconds clock."""
        alerts = result.get("alerts", []) or []
        current = {a["type"] for a in alerts}
        new_types = current - self._prev_active
        self._prev_active = current

        if not new_types:
            return []

        saved: List[DriverEvent] = []
        for alert in alerts:
            atype = alert.get("type")
            if atype not in new_types or alert.get("severity") not in _PERSIST:
                continue
            if (t - self._last_saved.get(atype, -1e9)) < _COOLDOWN_SEC:
                continue
            self._last_saved[atype] = t

            image_path = self._save_snapshot(frame, result, alert)
            event = DriverEvent(
                session_id=self.session_id,
                event_type=atype,
                severity=alert.get("severity"),
                message=alert.get("message"),
                perclos=result.get("perclos"),
                fatigue_score=result.get("fatigue_score"),
                image_path=image_path,
            )
            db.add(event)
            saved.append(event)

        if saved:
            await db.commit()
            for ev in saved:
                await db.refresh(ev)
        return saved

    def _save_snapshot(self, frame, result: Dict, alert: Dict) -> Optional[str]:
        """Draw the face box + alert label and write a JPEG under /static."""
        try:
            os.makedirs(SAVE_DIR, exist_ok=True)
            img = frame.copy()
            for det in result.get("detections", []) or []:
                box = det.get("box")
                if box and len(box) == 4:
                    x1, y1, x2, y2 = map(int, box)
                    cv2.rectangle(img, (x1, y1), (x2, y2), (48, 59, 255), 2)
            cv2.putText(
                img, str(alert.get("message", "")), (12, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (48, 59, 255), 2, cv2.LINE_AA,
            )
            filename = f"{uuid.uuid4()}.jpg"
            cv2.imwrite(os.path.join(SAVE_DIR, filename), img)
            return f"/static/driver_events/{filename}"
        except Exception:
            return None
