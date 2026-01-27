from typing import List, Dict, Any
from app.db.models import Incident

class ComplianceService:
    def check_compliance(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Analyzes detections to find non-compliant workers.
        Returns a list of violation dictionaries.
        """
        violations = []
        
        # New Logic: The model directly detects violations (no-helmet, no-vest)
        # Classes: helmet, no-helmet, vest, no-vest
        
        # Define class name variants for different PPE models
        no_helmet_variants = {'no-helmet', 'without_helmet', 'NO-Hardhat', 'no_helmet'}
        no_vest_variants = {'no-vest', 'without_vest', 'NO-Safety Vest', 'no_vest'}
        
        for det in detections:
            name = det['class_name']
            box = det['box']
            conf = det['confidence']
            
            if name in no_helmet_variants:
                violations.append({
                    "violation_type": "NO_HELMET",
                    "severity": "HIGH",
                    "details": {"box": box, "confidence": conf}
                })
            
            if name in no_vest_variants:
                violations.append({
                    "violation_type": "NO_VEST",
                    "severity": "MEDIUM",
                    "details": {"box": box, "confidence": conf}
                })

        return violations
