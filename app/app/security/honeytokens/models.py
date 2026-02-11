"""
Honeytoken database models.
"""
import json
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from app.app.db.database import Base


class HoneyToken(Base):
    __tablename__ = "ht_tokens"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(32), nullable=False)           # canary_url | fake_api_key | decoy_login | decoy_doc
    value_hash = Column(String(128), nullable=False)     # SHA-256 of the actual value
    value_plain = Column(String(512), nullable=True)     # demo mode: store for display
    placement = Column(String(256), nullable=True)
    severity = Column(String(8), default="high")
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)
    revoked = Column(Boolean, default=False)
    pack_id = Column(String(64), nullable=True, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "value_preview": self.value_plain[:20] + "..." if self.value_plain and len(self.value_plain) > 20 else self.value_plain,
            "placement": self.placement,
            "severity": self.severity,
            "metadata": json.loads(self.metadata_json) if self.metadata_json else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "revoked": self.revoked,
            "pack_id": self.pack_id,
        }


class HoneyTokenEvent(Base):
    __tablename__ = "ht_events"

    id = Column(Integer, primary_key=True, index=True)
    token_id = Column(Integer, ForeignKey("ht_tokens.id"), nullable=False, index=True)
    ts = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    source_ip = Column(String(64), nullable=True)
    user_agent = Column(String(512), nullable=True)
    geo_json = Column(Text, nullable=True)
    context_json = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "token_id": self.token_id,
            "ts": self.ts.isoformat() if self.ts else None,
            "source_ip": self.source_ip,
            "user_agent": self.user_agent,
            "geo": json.loads(self.geo_json) if self.geo_json else None,
            "context": json.loads(self.context_json) if self.context_json else None,
        }


class PlaybookRun(Base):
    __tablename__ = "ht_playbook_runs"

    id = Column(Integer, primary_key=True, index=True)
    token_id = Column(Integer, ForeignKey("ht_tokens.id"), nullable=False)
    ts = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    action = Column(String(64), nullable=False)         # notify | block_ip | open_incident | rotate
    result = Column(String(32), nullable=True)
    details_json = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "token_id": self.token_id,
            "ts": self.ts.isoformat() if self.ts else None,
            "action": self.action,
            "result": self.result,
            "details": json.loads(self.details_json) if self.details_json else None,
        }
