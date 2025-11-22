import pytest
from app.services.compliance_service import ComplianceService


@pytest.fixture
def compliance_service():
    """Fixture to create a ComplianceService instance."""
    return ComplianceService()


class TestComplianceService:
    """Test suite for ComplianceService."""
    
    def test_no_violations_with_compliant_detections(self, compliance_service):
        """Test that compliant detections (helmet, vest) produce no violations."""
        detections = [
            {
                "class_name": "helmet",
                "box": [100, 100, 200, 200],
                "confidence": 0.95
            },
            {
                "class_name": "vest",
                "box": [100, 200, 200, 300],
                "confidence": 0.90
            }
        ]
        
        violations = compliance_service.check_compliance(detections)
        
        assert len(violations) == 0, "Should have no violations with compliant detections"
    
    def test_violation_detected_for_no_helmet(self, compliance_service):
        """Test that no-helmet detection creates a HIGH severity violation."""
        detections = [
            {
                "class_name": "no-helmet",
                "box": [100, 100, 200, 200],
                "confidence": 0.95
            }
        ]
        
        violations = compliance_service.check_compliance(detections)
        
        assert len(violations) == 1, "Should have exactly one violation"
        assert violations[0]["violation_type"] == "NO_HELMET"
        assert violations[0]["severity"] == "HIGH"
        assert violations[0]["details"]["confidence"] == 0.95
    
    def test_violation_detected_for_no_vest(self, compliance_service):
        """Test that no-vest detection creates a MEDIUM severity violation."""
        detections = [
            {
                "class_name": "no-vest",
                "box": [100, 200, 200, 300],
                "confidence": 0.90
            }
        ]
        
        violations = compliance_service.check_compliance(detections)
        
        assert len(violations) == 1, "Should have exactly one violation"
        assert violations[0]["violation_type"] == "NO_VEST"
        assert violations[0]["severity"] == "MEDIUM"
    
    def test_multiple_violations(self, compliance_service):
        """Test detection of multiple violations simultaneously."""
        detections = [
            {
                "class_name": "no-helmet",
                "box": [100, 100, 200, 200],
                "confidence": 0.95
            },
            {
                "class_name": "no-vest",
                "box": [100, 200, 200, 300],
                "confidence": 0.90
            }
        ]
        
        violations = compliance_service.check_compliance(detections)
        
        assert len(violations) == 2, "Should have two violations"
        violation_types = {v["violation_type"] for v in violations}
        assert "NO_HELMET" in violation_types
        assert "NO_VEST" in violation_types
    
    def test_empty_detections(self, compliance_service):
        """Test that empty detections list produces no violations."""
        violations = compliance_service.check_compliance([])
        
        assert len(violations) == 0, "Should have no violations with empty detections"
