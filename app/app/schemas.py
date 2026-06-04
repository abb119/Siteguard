from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ViolationBase(BaseModel):
    violation_type: str
    confidence: float
    image_path: str
    is_reviewed: bool
    is_false_positive: bool
    reviewer_notes: Optional[str] = None

class ViolationOut(ViolationBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

class ViolationReview(BaseModel):
    is_false_positive: bool
    notes: Optional[str] = None


class DriverEventOut(BaseModel):
    id: int
    timestamp: datetime
    session_id: Optional[str] = None
    event_type: str
    severity: str
    message: Optional[str] = None
    perclos: Optional[float] = None
    fatigue_score: Optional[float] = None
    image_path: Optional[str] = None
    is_reviewed: bool
    is_false_positive: bool

    class Config:
        from_attributes = True


class DriverEventReview(BaseModel):
    is_false_positive: bool
