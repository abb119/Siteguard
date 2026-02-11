"""
Attack Graph database models.
"""
import json
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, Float
from app.app.db.database import Base


class AgAsset(Base):
    __tablename__ = "ag_assets"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(String(64), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    type = Column(String(64), nullable=False)          # server | workstation | firewall | cloud_service | database | iot
    zone = Column(String(64), nullable=False)           # internet | dmz | internal | cloud | ot
    criticality = Column(Integer, default=5)            # 1-10
    tags_json = Column(Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id, "scenario_id": self.scenario_id, "name": self.name,
            "type": self.type, "zone": self.zone, "criticality": self.criticality,
            "tags": json.loads(self.tags_json) if self.tags_json else [],
        }


class AgService(Base):
    __tablename__ = "ag_services"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, nullable=False, index=True)
    scenario_id = Column(String(64), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    port = Column(Integer, nullable=True)
    protocol = Column(String(16), nullable=True)
    exposed = Column(Boolean, default=False)
    auth_type = Column(String(32), nullable=True)       # none | basic | mfa | mtls

    def to_dict(self):
        return {
            "id": self.id, "asset_id": self.asset_id, "name": self.name,
            "port": self.port, "protocol": self.protocol,
            "exposed": self.exposed, "auth_type": self.auth_type,
        }


class AgFinding(Base):
    __tablename__ = "ag_findings"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, nullable=False, index=True)
    scenario_id = Column(String(64), nullable=False, index=True)
    kind = Column(String(32), nullable=False)           # vuln | misconfig
    title = Column(String(256), nullable=False)
    cvss = Column(Float, default=5.0)
    exploitability = Column(Float, default=0.5)         # 0..1
    fix_action_id = Column(Integer, nullable=True)

    def to_dict(self):
        return {
            "id": self.id, "asset_id": self.asset_id, "kind": self.kind,
            "title": self.title, "cvss": self.cvss,
            "exploitability": self.exploitability, "fix_action_id": self.fix_action_id,
        }


class AgAction(Base):
    __tablename__ = "ag_actions"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(String(64), nullable=False, index=True)
    type = Column(String(32), nullable=False)           # patch | close_port | restrict_iam | segment
    description = Column(String(512), nullable=False)
    cost = Column(Float, default=1.0)
    downtime_risk = Column(Float, default=0.1)

    def to_dict(self):
        return {
            "id": self.id, "type": self.type, "description": self.description,
            "cost": self.cost, "downtime_risk": self.downtime_risk,
        }


class AgGraphCache(Base):
    __tablename__ = "ag_graph_cache"

    id = Column(Integer, primary_key=True, index=True)
    scenario_id = Column(String(64), nullable=False, unique=True, index=True)
    graph_json = Column(Text, nullable=False)
    risk_score = Column(Float, default=0.0)
    built_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id, "scenario_id": self.scenario_id,
            "graph": json.loads(self.graph_json) if self.graph_json else None,
            "risk_score": self.risk_score,
            "built_at": self.built_at.isoformat() if self.built_at else None,
        }
