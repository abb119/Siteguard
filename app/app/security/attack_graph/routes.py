"""
Attack Graph API routes.
"""
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.app.db.database import get_db
from app.app.security.attack_graph.schemas import (
    LoadScenarioRequest, PlanRequest, ApplyRequest,
)
from app.app.security.attack_graph.service import (
    load_scenario, build_graph, get_paths, generate_plan,
    apply_simulated, list_available_scenarios,
)

attack_graph_router = APIRouter(tags=["attack-graph"])


@attack_graph_router.get("/scenarios")
async def get_scenarios():
    """List available demo scenarios."""
    return list_available_scenarios()


@attack_graph_router.post("/scenarios/load")
async def load(body: LoadScenarioRequest, db: AsyncSession = Depends(get_db)):
    return await load_scenario(db, body.scenario_name)


@attack_graph_router.post("/build")
async def build(scenario_id: str, db: AsyncSession = Depends(get_db)):
    return await build_graph(db, scenario_id)


@attack_graph_router.get("/graph")
async def graph(scenario_id: str, db: AsyncSession = Depends(get_db)):
    """Get cached graph data."""
    from sqlalchemy import select
    from app.app.security.attack_graph.models import AgGraphCache
    import json

    cache_q = await db.execute(
        select(AgGraphCache).where(AgGraphCache.scenario_id == scenario_id)
    )
    cache = cache_q.scalars().first()
    if not cache:
        return {"error": "Graph not built. Call /build first."}
    data = json.loads(cache.graph_json)
    data["risk_score"] = cache.risk_score
    data["scenario_id"] = scenario_id
    return data


@attack_graph_router.get("/paths")
async def paths(scenario_id: str, target: str = "crown_jewel", k: int = 10, db: AsyncSession = Depends(get_db)):
    return await get_paths(db, scenario_id, target, k)


@attack_graph_router.post("/plan")
async def plan(body: PlanRequest, db: AsyncSession = Depends(get_db)):
    return await generate_plan(db, body.scenario_id, body.target, body.max_actions)


@attack_graph_router.post("/apply-simulated")
async def apply_sim(body: ApplyRequest, db: AsyncSession = Depends(get_db)):
    return await apply_simulated(db, body.scenario_id, body.action_ids)
