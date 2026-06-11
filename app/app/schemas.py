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


# ── Auth / multi-tenant ──────────────────────────────────────────────
class UserOut(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: str
    company_id: Optional[int] = None
    disabled: Optional[bool] = False

    class Config:
        from_attributes = True


class MeOut(UserOut):
    company_name: Optional[str] = None


class CompanyCreate(BaseModel):
    name: str
    manager_username: str
    manager_password: str
    manager_full_name: Optional[str] = None


class CompanyOut(BaseModel):
    id: int
    name: str
    workers: int = 0
    manager: Optional[str] = None

    class Config:
        from_attributes = True


class WorkerCreate(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None


class WorkerOut(UserOut):
    events: int = 0
    safety_score: int = 100
