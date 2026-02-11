"""
Pydantic schemas for LLM Security Gateway.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class EvaluateRequest(BaseModel):
    session_id: Optional[str] = None
    prompt: str
    context: Optional[str] = None
    tools_requested: Optional[List[str]] = None


class DlpHit(BaseModel):
    type: str                    # email | phone | api_key | ssn | credit_card
    original: str
    redacted: str
    position: Optional[int] = None


class EvaluateResponse(BaseModel):
    decision: str                # allow | block | redact
    injection_score: float
    dlp_hits: List[DlpHit] = []
    redacted_prompt: Optional[str] = None
    rules_triggered: List[str] = []
    explanation: str = ""
    tool_decisions: Optional[Dict[str, str]] = None   # tool_name → allow/deny


class AuditOut(BaseModel):
    id: int
    ts: Optional[str] = None
    session_id: Optional[str] = None
    decision: str
    injection_score: float
    dlp_hits: Optional[List] = None
    rules_triggered: Optional[List] = None
    prompt_text: Optional[str] = None
    diff: Optional[Any] = None

    class Config:
        from_attributes = True


class PolicyOut(BaseModel):
    id: int
    name: str
    yaml_text: str
    version: int
    active: bool

    class Config:
        from_attributes = True


class ActivatePolicyRequest(BaseModel):
    policy_name: str


class TestCase(BaseModel):
    name: str
    prompt: str
    expected_decision: str            # allow | block | redact
    expected_injection_above: Optional[float] = None


class TestResult(BaseModel):
    name: str
    prompt: str
    expected: str
    actual: str
    passed: bool
    injection_score: float
    details: Optional[str] = None


class TestSuiteResult(BaseModel):
    total: int
    passed: int
    failed: int
    results: List[TestResult]
