import enum
from sqlalchemy import Column, Integer, String, DateTime, JSON, Boolean, Enum, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.app.db.database import Base

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

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True, nullable=True)
    hashed_password = Column(String)
    is_active = Column(Integer, default=True) # Using Integer as Boolean for broader compatibility if needed, or just Boolean
    # Note: SQLite/Postgres handle Boolean differently, but SQLAlchemy abstracts it. Let's use Boolean if possible, or Integer 0/1.
    # For simplicity with the existing jwt.py which expects 'disabled' (bool), let's use Boolean.
    disabled = Column(Boolean, default=False)


class JobType(str, enum.Enum):
    PPE_VIDEO = "PPE_VIDEO"
    DMS_CABIN_VIDEO = "DMS_CABIN_VIDEO"
    ADAS_ROAD_VIDEO = "ADAS_ROAD_VIDEO"


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(Enum(JobType), nullable=False, default=JobType.PPE_VIDEO)
    status = Column(Enum(JobStatus), default=JobStatus.QUEUED, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    progress = Column(Float, default=0.0)
    error = Column(Text, nullable=True)
    input_filename = Column(String, nullable=True)
    input_path = Column(String, nullable=False)
    input_size_bytes = Column(Integer, nullable=True)
    input_duration_sec = Column(Float, nullable=True)
    result = Column(JSON, nullable=True)

    artifacts = relationship("JobArtifact", back_populates="job", cascade="all, delete-orphan")


class JobArtifact(Base):
    __tablename__ = "job_artifacts"

    id = Column(Integer, primary_key=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    path = Column(String, nullable=False)
    timestamp_sec = Column(Float, nullable=True)
    metadata_json = Column(JSON, nullable=True)

    job = relationship("Job", back_populates="artifacts")
