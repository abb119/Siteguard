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
