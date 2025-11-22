import pytest
from fastapi.testclient import TestClient
from app.main import app
import io
from PIL import Image
import numpy as np


@pytest.fixture
def client():
    """Fixture to create a FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def test_image():
    """Fixture to create a test image in memory."""
    # Create a simple 640x640 RGB image
    img_array = np.random.randint(0, 255, (640, 640, 3), dtype=np.uint8)
    img = Image.fromarray(img_array)
    
    # Save to bytes buffer
    img_buffer = io.BytesIO()
    img.save(img_buffer, format='JPEG')
    img_buffer.seek(0)
    
    return img_buffer


class TestDetectEndpoint:
    """Test suite for /detect endpoint."""
    
    def test_detect_endpoint_success(self, client, test_image):
        """Test that /detect endpoint returns 200 with valid image."""
        response = client.post(
            "/detect",
            files={"file": ("test.jpg", test_image, "image/jpeg")}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "detections" in data
        assert "violations" in data
        assert "compliant" in data
        assert isinstance(data["detections"], list)
        assert isinstance(data["violations"], list)
        assert isinstance(data["compliant"], bool)
    
    def test_detect_endpoint_response_structure(self, client, test_image):
        """Test that response has correct structure."""
        response = client.post(
            "/detect",
            files={"file": ("test.jpg", test_image, "image/jpeg")}
        )
        
        data = response.json()
        
        # Check detections structure
        if len(data["detections"]) > 0:
            detection = data["detections"][0]
            assert "class_name" in detection
            assert "box" in detection
            assert "confidence" in detection
        
        # Check violations structure
        if len(data["violations"]) > 0:
            violation = data["violations"][0]
            assert "violation_type" in violation
            assert "severity" in violation
            assert "details" in violation
    
    def test_detect_endpoint_without_file(self, client):
        """Test that endpoint returns error when no file is provided."""
        response = client.post("/detect")
        
        assert response.status_code == 422, "Should return 422 for missing file"
    
    def test_health_endpoint(self, client):
        """Test that health endpoint returns correct status."""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
    
    def test_metrics_endpoint_exists(self, client):
        """Test that Prometheus metrics endpoint is accessible."""
        response = client.get("/metrics")
        
        assert response.status_code == 200
        # Prometheus metrics are in plain text format
        assert "http_request" in response.text or "process_" in response.text
