"""
Pydantic schemas for the common Security module.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel


class Severity(str, Enum):
    low = "low"
    med = "med"
    high = "high"
    crit = "crit"


class EventType(str, Enum):
    attack_graph = "attack_graph"
    honeytoken = "honeytoken"
    llm_gateway = "llm_gateway"


# ── Events ──────────────────────────────────────────
class SecurityEventOut(BaseModel):
    id: int
    ts: datetime
    type: str
    severity: str
    title: str
    summary: Optional[str] = None
    payload: Optional[Any] = None

    class Config:
        from_attributes = True


# ── Audit ───────────────────────────────────────────
class SecurityAuditOut(BaseModel):
    id: int
    ts: datetime
    actor_user_id: Optional[str] = None
    action: str
    target: Optional[str] = None
    result: Optional[str] = None
    details: Optional[Any] = None

    class Config:
        from_attributes = True
