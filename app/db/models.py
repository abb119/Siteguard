from sqlalchemy import Column, Integer, String, DateTime, JSON
from sqlalchemy.sql import func
from app.db.database import Base

class Detection(Base):
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    image_hash = Column(String, index=True, nullable=True) # To avoid duplicates if needed
    result = Column(JSON) # Store the full JSON result from YOLO

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    detection_id = Column(Integer, nullable=True) # Link to the raw detection
    violation_type = Column(String) # e.g., "NO_HELMET", "NO_VEST"
    severity = Column(String) # "HIGH", "MEDIUM", "LOW"
    details = Column(JSON) # Specifics about the violation
