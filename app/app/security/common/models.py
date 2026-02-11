"""
Shared database models for the Security module.
Provides a unified event log and audit trail across all 3 sub-modules.
"""
import json
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, Enum as SAEnum
from app.app.db.database import Base


class SecurityEvent(Base):
    """Unified security event log — fed to the SOC dashboard via WebSocket."""
    __tablename__ = "security_events"

    id = Column(Integer, primary_key=True, index=True)
    ts = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    type = Column(String(32), nullable=False, index=True)          # attack_graph | honeytoken | llm_gateway
    severity = Column(String(8), nullable=False, default="low")    # low | med | high | crit
    title = Column(String(256), nullable=False)
    summary = Column(Text, nullable=True)
    payload_json = Column(Text, nullable=True)                     # arbitrary JSON blob

    def to_dict(self):
        return {
            "id": self.id,
            "ts": self.ts.isoformat() if self.ts else None,
            "type": self.type,
            "severity": self.severity,
            "title": self.title,
            "summary": self.summary,
            "payload": json.loads(self.payload_json) if self.payload_json else None,
        }


class SecurityAudit(Base):
    """Audit trail for all security-related actions (RBAC-aware)."""
    __tablename__ = "security_audit"

    id = Column(Integer, primary_key=True, index=True)
    ts = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    actor_user_id = Column(String(64), nullable=True)
    action = Column(String(128), nullable=False)
    target = Column(String(256), nullable=True)
    result = Column(String(32), nullable=True)          # success | failure | blocked
    details_json = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "ts": self.ts.isoformat() if self.ts else None,
            "actor_user_id": self.actor_user_id,
            "action": self.action,
            "target": self.target,
            "result": self.result,
            "details": json.loads(self.details_json) if self.details_json else None,
        }
