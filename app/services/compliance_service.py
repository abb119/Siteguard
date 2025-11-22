from typing import List, Dict, Any
from app.db.models import Incident

class ComplianceService:
    def check_compliance(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Analyzes detections to find non-compliant workers.
        Returns a list of violation dictionaries.
        """
        violations = []
        
        # Separate detections by class
        persons = [d for d in detections if d['class_name'] == 'person']
        helmets = [d for d in detections if d['class_name'] == 'helmet']
        vests = [d for d in detections if d['class_name'] == 'vest']
        
        for person in persons:
            person_box = person['box']
            has_helmet = self._check_overlap(person_box, helmets)
            has_vest = self._check_overlap(person_box, vests)
            
            if not has_helmet:
                violations.append({
                    "violation_type": "NO_HELMET",
                    "severity": "HIGH",
                    "details": {"person_box": person_box}
                })
                
            if not has_vest:
                violations.append({
                    "violation_type": "NO_VEST",
                    "severity": "MEDIUM",
                    "details": {"person_box": person_box}
                })
                
        return violations

    def _check_overlap(self, person_box, object_list):
        """
        Simple overlap check. In a real scenario, we'd use IoU.
        Here we check if the object center is inside the person box (roughly).
        """
        px1, py1, px2, py2 = person_box
        
        for obj in object_list:
            ox1, oy1, ox2, oy2 = obj['box']
            ox_center = (ox1 + ox2) / 2
            oy_center = (oy1 + oy2) / 2
            
            # Check if object center is within person box
            if px1 < ox_center < px2 and py1 < oy_center < py2:
                return True
        return False
