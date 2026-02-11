"""
Pydantic schemas for Attack Graph module.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class AssetOut(BaseModel):
    id: int
    scenario_id: str
    name: str
    type: str
    zone: str
    criticality: int
    tags: Optional[List[str]] = None

    class Config:
        from_attributes = True


class GraphNode(BaseModel):
    id: str
    label: str
    type: str          # internet | zone | asset | service | data
    zone: Optional[str] = None
    criticality: Optional[int] = None
    data: Optional[Dict] = None


class GraphEdge(BaseModel):
    source: str
    target: str
    prob: float
    reason: str
    controls: Optional[List[str]] = None


class GraphOut(BaseModel):
    scenario_id: str
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    risk_score: float


class PathStep(BaseModel):
    node_id: str
    label: str
    prob: float = 1.0
    reason: str = ""


class AttackPath(BaseModel):
    path_index: int
    total_risk: float
    steps: List[PathStep]


class PathsOut(BaseModel):
    scenario_id: str
    target: str
    paths: List[AttackPath]


class ActionOut(BaseModel):
    id: int
    type: str
    description: str
    cost: float
    downtime_risk: float
    impact: float = 0.0          # filled by planner
    score: float = 0.0           # impact / (cost + penalty)
    cuts_paths: int = 0          # how many paths it eliminates


class PlanOut(BaseModel):
    scenario_id: str
    actions: List[ActionOut]
    risk_before: float
    risk_after: float
    paths_eliminated: int


class PlanRequest(BaseModel):
    scenario_id: str
    target: str = "crown_jewel"
    max_actions: int = 6


class ApplyRequest(BaseModel):
    scenario_id: str
    action_ids: List[int]


class LoadScenarioRequest(BaseModel):
    scenario_name: str     # "cloud_webapp" or "factory_ot"
