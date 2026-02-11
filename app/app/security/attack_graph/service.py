"""
Attack Graph service — loads scenarios, builds graphs, finds paths, generates plans.
"""
import json
import os
from typing import Dict, List, Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.app.security.attack_graph.models import (
    AgAsset, AgService, AgFinding, AgAction, AgGraphCache,
)
from app.app.security.attack_graph.algorithms import (
    build_attack_graph, find_k_shortest_paths, calculate_risk_score,
    greedy_remediation, graph_to_json,
)
from app.app.security.common.models import SecurityEvent
from app.app.security.common.ws import get_broadcaster


SCENARIOS_DIR = os.path.join(os.path.dirname(__file__), "demo_scenarios")


async def load_scenario(db: AsyncSession, scenario_name: str) -> Dict:
    """Load a demo scenario from JSON into the database."""
    filepath = os.path.join(SCENARIOS_DIR, f"scenario_{scenario_name}.json")
    if not os.path.exists(filepath):
        # Try without prefix
        filepath = os.path.join(SCENARIOS_DIR, f"{scenario_name}.json")
    if not os.path.exists(filepath):
        return {"error": f"Scenario file not found: {scenario_name}"}

    with open(filepath, "r") as f:
        data = json.load(f)

    scenario_id = data["scenario_id"]

    # Clear existing data for this scenario
    for model in [AgService, AgFinding, AgAsset, AgAction, AgGraphCache]:
        await db.execute(delete(model).where(model.scenario_id == scenario_id))
    await db.flush()

    # Load assets + services + findings
    asset_id_map = {}  # json index → db id
    for i, a_data in enumerate(data.get("assets", [])):
        asset = AgAsset(
            scenario_id=scenario_id,
            name=a_data["name"],
            type=a_data["type"],
            zone=a_data["zone"],
            criticality=a_data.get("criticality", 5),
            tags_json=json.dumps(a_data.get("tags", [])),
        )
        db.add(asset)
        await db.flush()
        asset_id_map[i] = asset.id

        # Services
        for s_data in a_data.get("services", []):
            svc = AgService(
                asset_id=asset.id,
                scenario_id=scenario_id,
                name=s_data["name"],
                port=s_data.get("port"),
                protocol=s_data.get("protocol"),
                exposed=s_data.get("exposed", False),
                auth_type=s_data.get("auth_type"),
            )
            db.add(svc)

        # Findings
        for f_data in a_data.get("findings", []):
            finding = AgFinding(
                asset_id=asset.id,
                scenario_id=scenario_id,
                kind=f_data["kind"],
                title=f_data["title"],
                cvss=f_data.get("cvss", 5.0),
                exploitability=f_data.get("exploitability", 0.5),
            )
            db.add(finding)

    # Load actions
    for act_data in data.get("actions", []):
        action = AgAction(
            scenario_id=scenario_id,
            type=act_data["type"],
            description=act_data["description"],
            cost=act_data.get("cost", 1.0),
            downtime_risk=act_data.get("downtime_risk", 0.1),
        )
        db.add(action)

    await db.commit()

    # Emit event
    event = SecurityEvent(
        type="attack_graph",
        severity="low",
        title=f"📊 Scenario Loaded: {data['name']}",
        summary=f"Loaded {len(data.get('assets', []))} assets with {len(data.get('actions', []))} remediation actions.",
        payload_json=json.dumps({"scenario_id": scenario_id, "name": data["name"]}),
    )
    db.add(event)
    await db.commit()
    await get_broadcaster().broadcast(event.to_dict())

    return {"scenario_id": scenario_id, "name": data["name"], "assets_loaded": len(data.get("assets", []))}


async def build_graph(db: AsyncSession, scenario_id: str) -> Dict:
    """Build the attack graph and cache it."""
    # Fetch all data
    assets_q = await db.execute(select(AgAsset).where(AgAsset.scenario_id == scenario_id))
    assets = [a.to_dict() for a in assets_q.scalars().all()]

    services_q = await db.execute(select(AgService).where(AgService.scenario_id == scenario_id))
    services = [s.to_dict() for s in services_q.scalars().all()]

    findings_q = await db.execute(select(AgFinding).where(AgFinding.scenario_id == scenario_id))
    findings = [f.to_dict() for f in findings_q.scalars().all()]

    actions_q = await db.execute(select(AgAction).where(AgAction.scenario_id == scenario_id))
    actions = [a.to_dict() for a in actions_q.scalars().all()]

    if not assets:
        return {"error": "No assets found for this scenario"}

    # Build graph
    G = build_attack_graph(assets, services, findings, actions)
    graph_data = graph_to_json(G)

    # Find crown jewels and compute initial risk
    crown_jewels = [n["id"] for n in graph_data["nodes"] if n.get("crown_jewel")]
    all_paths = []
    for cj in crown_jewels:
        paths = find_k_shortest_paths(G, "Internet", cj, k=10)
        all_paths.extend(paths)

    risk_score = calculate_risk_score(all_paths)

    # Cache
    await db.execute(delete(AgGraphCache).where(AgGraphCache.scenario_id == scenario_id))
    cache = AgGraphCache(
        scenario_id=scenario_id,
        graph_json=json.dumps(graph_data),
        risk_score=risk_score,
    )
    db.add(cache)

    # Event
    event = SecurityEvent(
        type="attack_graph",
        severity="med",
        title=f"🔍 Attack Graph Built",
        summary=f"Graph with {len(graph_data['nodes'])} nodes, {len(graph_data['edges'])} edges. Risk: {risk_score:.1%}",
        payload_json=json.dumps({"scenario_id": scenario_id, "risk_score": risk_score}),
    )
    db.add(event)
    await db.commit()
    await get_broadcaster().broadcast(event.to_dict())

    graph_data["risk_score"] = risk_score
    graph_data["scenario_id"] = scenario_id
    return graph_data


async def get_paths(db: AsyncSession, scenario_id: str, target: Optional[str] = None, k: int = 10) -> Dict:
    """Get top-K attack paths to crown jewels or specific target."""
    # Fetch cached graph
    cache_q = await db.execute(select(AgGraphCache).where(AgGraphCache.scenario_id == scenario_id))
    cache = cache_q.scalars().first()
    if not cache:
        return {"error": "Graph not built yet. Call /build first."}

    graph_data = json.loads(cache.graph_json)

    # Rebuild NetworkX graph from cache
    assets_q = await db.execute(select(AgAsset).where(AgAsset.scenario_id == scenario_id))
    assets = [a.to_dict() for a in assets_q.scalars().all()]
    services_q = await db.execute(select(AgService).where(AgService.scenario_id == scenario_id))
    services = [s.to_dict() for s in services_q.scalars().all()]
    findings_q = await db.execute(select(AgFinding).where(AgFinding.scenario_id == scenario_id))
    findings = [f.to_dict() for f in findings_q.scalars().all()]
    actions_q = await db.execute(select(AgAction).where(AgAction.scenario_id == scenario_id))
    actions = [a.to_dict() for a in actions_q.scalars().all()]

    G = build_attack_graph(assets, services, findings, actions)

    # Find targets
    if target and target != "crown_jewel":
        targets = [target]
    else:
        targets = [n["id"] for n in graph_data["nodes"] if n.get("crown_jewel")]

    all_paths = []
    for t in targets:
        raw_paths = find_k_shortest_paths(G, "Internet", t, k=k)
        for idx, (prob, nodes) in enumerate(raw_paths):
            steps = []
            for j, node_id in enumerate(nodes):
                node_data = G.nodes.get(node_id, {})
                reason = ""
                p = 1.0
                if j > 0:
                    edge_data = G[nodes[j - 1]][node_id]
                    reason = edge_data.get("reason", "")
                    p = edge_data.get("prob", 1.0)
                steps.append({
                    "node_id": node_id,
                    "label": node_data.get("label", node_id),
                    "prob": round(p, 4),
                    "reason": reason,
                })
            all_paths.append({
                "path_index": len(all_paths),
                "total_risk": round(prob, 6),
                "steps": steps,
            })

    return {
        "scenario_id": scenario_id,
        "target": target or "crown_jewels",
        "paths": all_paths[:k],
    }


async def generate_plan(db: AsyncSession, scenario_id: str, target: str = "crown_jewel", max_actions: int = 6) -> Dict:
    """Generate greedy remediation plan."""
    # Rebuild graph
    assets_q = await db.execute(select(AgAsset).where(AgAsset.scenario_id == scenario_id))
    assets = [a.to_dict() for a in assets_q.scalars().all()]
    services_q = await db.execute(select(AgService).where(AgService.scenario_id == scenario_id))
    services = [s.to_dict() for s in services_q.scalars().all()]
    findings_q = await db.execute(select(AgFinding).where(AgFinding.scenario_id == scenario_id))
    findings = [f.to_dict() for f in findings_q.scalars().all()]
    actions_q = await db.execute(select(AgAction).where(AgAction.scenario_id == scenario_id))
    actions_raw = [a.to_dict() for a in actions_q.scalars().all()]

    G = build_attack_graph(assets, services, findings, actions_raw)

    # Find all paths to crown jewels
    graph_data = graph_to_json(G)
    if target and target != "crown_jewel":
        targets = [target]
    else:
        targets = [n["id"] for n in graph_data["nodes"] if n.get("crown_jewel")]

    all_paths = []
    for t in targets:
        all_paths.extend(find_k_shortest_paths(G, "Internet", t, k=10))

    risk_before = calculate_risk_score(all_paths)

    # Run greedy planner
    selected_actions = greedy_remediation(G, all_paths, actions_raw, max_actions)

    # Estimate risk_after (simplified: remove cut paths)
    total_cuts = sum(a.get("cuts_paths", 0) for a in selected_actions)
    risk_after = max(0, risk_before * (1 - (total_cuts / max(len(all_paths), 1)) * 0.8))

    # Event
    event = SecurityEvent(
        type="attack_graph",
        severity="low",
        title="📋 Remediation Plan Generated",
        summary=f"{len(selected_actions)} actions to reduce risk from {risk_before:.1%} to {risk_after:.1%}",
        payload_json=json.dumps({"scenario_id": scenario_id, "risk_before": risk_before, "risk_after": risk_after}),
    )
    db.add(event)
    await db.commit()
    await get_broadcaster().broadcast(event.to_dict())

    return {
        "scenario_id": scenario_id,
        "actions": selected_actions,
        "risk_before": round(risk_before, 4),
        "risk_after": round(risk_after, 4),
        "paths_eliminated": total_cuts,
    }


async def apply_simulated(db: AsyncSession, scenario_id: str, action_ids: List[int]) -> Dict:
    """Simulate applying remediation actions (for before/after view)."""
    event = SecurityEvent(
        type="attack_graph",
        severity="med",
        title="✅ Remediation Applied (Simulated)",
        summary=f"Applied {len(action_ids)} actions on scenario {scenario_id}.",
        payload_json=json.dumps({"scenario_id": scenario_id, "action_ids": action_ids, "simulated": True}),
    )
    db.add(event)
    await db.commit()
    await get_broadcaster().broadcast(event.to_dict())

    # Re-generate plan to show new risk
    return {"status": "applied", "actions_applied": len(action_ids), "scenario_id": scenario_id}


def list_available_scenarios() -> List[Dict]:
    """List available demo scenarios."""
    scenarios = []
    if os.path.isdir(SCENARIOS_DIR):
        for fname in os.listdir(SCENARIOS_DIR):
            if fname.endswith(".json"):
                filepath = os.path.join(SCENARIOS_DIR, fname)
                try:
                    with open(filepath) as f:
                        data = json.load(f)
                    scenarios.append({
                        "scenario_id": data.get("scenario_id", fname),
                        "name": data.get("name", fname),
                        "description": data.get("description", ""),
                    })
                except Exception:
                    pass
    return scenarios
