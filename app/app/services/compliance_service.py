from typing import List, Dict, Any
from app.app.db.models import Incident

class ComplianceService:
    def check_compliance(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Analyzes detections to find non-compliant workers.
        Returns a list of violation dictionaries.
        """
        violations = []
        
        # New Logic: The model directly detects violations (no-helmet, no-vest)
        # Classes: helmet, no-helmet, vest, no-vest
        
        for det in detections:
            name = det['class_name']
            box = det['box']
            conf = det['confidence']
            
            if name == 'no-helmet':
                violations.append({
                    "violation_type": "NO_HELMET",
                    "severity": "HIGH",
                    "details": {"box": box, "confidence": conf}
                })
            
            if name == 'no-vest':
                violations.append({
                    "violation_type": "NO_VEST",
                    "severity": "MEDIUM",
                    "details": {"box": box, "confidence": conf}
                })

        return violations
