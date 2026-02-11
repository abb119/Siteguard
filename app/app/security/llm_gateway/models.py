"""
LLM Security Gateway database models.
"""
import json
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Float
from app.app.db.database import Base


class LlmPolicy(Base):
    __tablename__ = "llm_policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), nullable=False, unique=True)
    yaml_text = Column(Text, nullable=False)
    version = Column(Integer, default=1)
    active = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "yaml_text": self.yaml_text,
            "version": self.version, "active": self.active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class LlmAudit(Base):
    __tablename__ = "llm_audit"

    id = Column(Integer, primary_key=True, index=True)
    ts = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    session_id = Column(String(64), nullable=True, index=True)
    user_id = Column(String(64), nullable=True)
    decision = Column(String(16), nullable=False)           # allow | block | redact
    injection_score = Column(Float, default=0.0)
    dlp_hits_json = Column(Text, nullable=True)
    rules_triggered_json = Column(Text, nullable=True)
    prompt_hash = Column(String(128), nullable=True)
    response_hash = Column(String(128), nullable=True)
    prompt_text = Column(Text, nullable=True)                # demo mode only
    diff_json = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "ts": self.ts.isoformat() if self.ts else None,
            "session_id": self.session_id,
            "decision": self.decision,
            "injection_score": self.injection_score,
            "dlp_hits": json.loads(self.dlp_hits_json) if self.dlp_hits_json else [],
            "rules_triggered": json.loads(self.rules_triggered_json) if self.rules_triggered_json else [],
            "prompt_hash": self.prompt_hash,
            "prompt_text": self.prompt_text,
            "diff": json.loads(self.diff_json) if self.diff_json else None,
        }
