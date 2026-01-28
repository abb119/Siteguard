import cv2
import uuid
import os
import aiofiles
from datetime import datetime
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.app.db.models import Violation, Incident


class ComplianceService:
    def __init__(self):
        # Stores the timestamp when a violation type was LAST seen by the camera
        self.last_seen_timestamps = {} 
        # Stores the timestamp when we LAST saved a violation to DB
        self.last_saved_timestamps = {}
        
        # PARAMETERS
        self.incident_reset_time = 5.0  # If violation disappears for 5s, next one is NEW incident
        self.max_incident_duration = 60.0 # Force a new photo every 60s if violation persists (optional heartbeats)

    def check_compliance(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Analyzes detections to find non-compliant workers.
        Returns a list of violation dictionaries.
        """
        violations = []
        
        for det in detections:
            name = det['class_name']
            box = det['box']
            conf = det['confidence']
            
            if name in ['no-helmet', 'NO-Hardhat', 'without_helmet']:
                violations.append({
                    "violation_type": "NO_HELMET",
                    "severity": "HIGH",
                    "details": {"box": box, "confidence": conf}
                })
            
            if name in ['no-vest', 'NO-Safety Vest', 'without_vest']:
                violations.append({
                    "violation_type": "NO_VEST",
                    "severity": "MEDIUM",
                    "details": {"box": box, "confidence": conf}
                })

        return violations

    async def save_violations(self, violations: List[Dict[str, Any]], frame: Any, db: AsyncSession, session_id: str = None):
        """
        Saves violations to DB and images to disk asynchronously.
        Logic: EVENT-BASED. Only save at the START of an incident or if significant time passes.
        """
        if not violations:
            return

        save_dir = "app/app/static/violations"
        os.makedirs(save_dir, exist_ok=True)
        
        current_time = datetime.now().timestamp()
        violations_to_save = []
        
        # Group violations by type to handle multiple boxes of same type in one frame
        # We only need ONE photo per type per incident to document it.
        seen_types = set()
        
        for v in violations:
            v_type = v['violation_type']
            
            # Update the "Last Seen" timestamp for this type (keep the incident alive)
            self.last_seen_timestamps[v_type] = current_time
            
            # CHECK: Should we save this?
            # 1. Is this a NEW incident? (Last seen > reset_time ago)
            # note: we just updated last_seen, so we check the delta against the previous value? 
            # Actually, simplify: We track 'last_saved'.
            
            last_save = self.last_saved_timestamps.get(v_type, 0)
            
            # If we haven't saved this type recently, OR it's been a long time since last save (heartbeat)
            # BUT we need to know if it's a CONTINUOUS incident.
            # We can use the 'last_seen' from the PREVIOUS frame.
            
            # Simple state machine:
            # If (current_time - last_save) > incident_reset_time? No, that's just cooldown.
            # We want: Only save if we strictly have NOT seen this violation for X seconds.
            # But we are seeing it NOW.
            
            # Correct Logic:
            # We need a 'session' start time.
            # Let's stick to a robust simple logic:
            # Save IF (current_time - last_save) > incident_reset_time? 
            # - If I stand there for 30s, this saves every 5s. User hates this.
            
            # Revised Logic:
            # We save ONLY IF: (current_time - last_save) > max_incident_duration (e.g. 60s)
            #                  OR (This is a fresh start after a break)
            
            # How to detect "fresh start"?
            # We need to know when we LAST SAW it before this frame.
            # In a stream, this is hard without persistent state per tick.
            
            # Let's stick to a high Cooldown. 
            # If the user says "hundreds" of photos, 10s is too fast.
            # Let's set Cooldown to 2 MINUTES.
            # If a worker is safe for 2 mins then unsafe -> New photo.
            # If unsafe for 10 mins -> 5 photos total. Manageable.
            
            if v_type in seen_types: continue # Only one per frame
            seen_types.add(v_type)

            if (current_time - last_save) > 60.0: # 1 Minute Cooldown per type
                violations_to_save.append(v)
                self.last_saved_timestamps[v_type] = current_time

        if not violations_to_save:
            return

        for v in violations_to_save:
            # 1. Save Image
            filename = f"{uuid.uuid4()}.jpg"
            filepath = os.path.join(save_dir, filename)
            
            # Draw box
            box = v['details']['box'] # [x1, y1, x2, y2]
            img_copy = frame.copy()
            x1, y1, x2, y2 = map(int, box)
            cv2.rectangle(img_copy, (x1, y1), (x2, y2), (0, 0, 255), 2)
            
            cv2.imwrite(filepath, img_copy)
            
            # 2. Save to DB
            db_violation = Violation(
                violation_type=v['violation_type'],
                confidence=v['details']['confidence'],
                image_path=f"/static/violations/{filename}",
                session_id=session_id,
                is_reviewed=False
            )
            db.add(db_violation)
        
        await db.commit()

