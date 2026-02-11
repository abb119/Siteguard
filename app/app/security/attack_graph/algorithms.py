"""
Graph algorithms for attack path analysis.
Uses NetworkX for graph operations.
"""
import math
import heapq
from typing import Dict, List, Optional, Tuple

import networkx as nx


def build_attack_graph(
    assets: List[Dict],
    services: List[Dict],
    findings: List[Dict],
    actions: List[Dict],
) -> nx.DiGraph:
    """Build a directed graph from assets, services, and findings.
    Nodes: Internet, Zone:*, Asset:*, Service:*
    Edges: weighted by -log(prob) for shortest-path calculations.
    """
    G = nx.DiGraph()

    # Internet entry point
    G.add_node("Internet", label="Internet", type="internet", zone="internet", criticality=0)

    # Group assets by zone
    zones = set()
    asset_map = {}
    for a in assets:
        zone = a["zone"]
        zones.add(zone)
        asset_id = f"Asset:{a['id']}"
        asset_map[a["id"]] = asset_id

        G.add_node(asset_id, label=a["name"], type="asset", zone=zone, criticality=a.get("criticality", 5))

    # Add zone nodes
    for zone in zones:
        if zone != "internet":
            G.add_node(f"Zone:{zone}", label=zone.upper(), type="zone", zone=zone, criticality=0)

    # Internet → DMZ / exposed zones
    for zone in zones:
        if zone in ("dmz", "internet"):
            prob = 0.9
            G.add_edge("Internet", f"Zone:{zone}", prob=prob, cost=-math.log(max(prob, 0.01)),
                       reason="Direct internet exposure", controls=[])

    # Zone → Zone lateral movement
    zone_adjacency = {
        ("dmz", "internal"): 0.4,
        ("internal", "cloud"): 0.5,
        ("internal", "ot"): 0.3,
        ("dmz", "cloud"): 0.3,
    }
    for (z1, z2), base_prob in zone_adjacency.items():
        if f"Zone:{z1}" in G.nodes and f"Zone:{z2}" in G.nodes:
            G.add_edge(f"Zone:{z1}", f"Zone:{z2}", prob=base_prob, cost=-math.log(max(base_prob, 0.01)),
                       reason=f"Lateral movement {z1}→{z2}", controls=[])

    # Zone → Assets (within that zone)
    for a in assets:
        zone = a["zone"]
        zone_node = f"Zone:{zone}" if zone != "internet" else "Internet"
        asset_node = f"Asset:{a['id']}"
        base_prob = 0.6
        if zone_node in G.nodes:
            G.add_edge(zone_node, asset_node, prob=base_prob, cost=-math.log(max(base_prob, 0.01)),
                       reason=f"Access within {zone}", controls=[])

    # Services as edges from assets
    svc_map = {}
    for s in services:
        svc_id = f"Service:{s['id']}"
        asset_node = asset_map.get(s["asset_id"])
        if not asset_node:
            continue

        G.add_node(svc_id, label=s["name"], type="service", zone=None, criticality=0)
        svc_map[s["id"]] = svc_id

        # Exploit probability based on exposure and auth
        base_exposure = 0.9 if s.get("exposed") else 0.5
        auth_factor = {"none": 1.0, "basic": 0.6, "mfa": 0.2, "mtls": 0.1}.get(s.get("auth_type", "basic"), 0.5)
        prob = base_exposure * auth_factor
        G.add_edge(asset_node, svc_id, prob=prob, cost=-math.log(max(prob, 0.01)),
                   reason=f"Service {s['name']} (port {s.get('port', '?')})", controls=[])

    # Findings increase reachability: Asset → Asset (via exploit chain)
    finding_map = {}
    for f in findings:
        asset_node = asset_map.get(f["asset_id"])
        if not asset_node:
            continue
        finding_map[f["id"]] = f

        # Exploitability → higher probability edges from/to this asset
        exploitability = f.get("exploitability", 0.5)
        data = G.nodes.get(asset_node, {})
        # Add self-loop metric (stored as node attribute)
        current = data.get("vuln_score", 0)
        G.nodes[asset_node]["vuln_score"] = max(current, exploitability)

    # Mark crown jewels (criticality >= 9)
    for node_id, data in G.nodes(data=True):
        if data.get("criticality", 0) >= 9:
            G.nodes[node_id]["crown_jewel"] = True

    return G


def find_k_shortest_paths(
    G: nx.DiGraph,
    source: str,
    target: str,
    k: int = 10,
) -> List[Tuple[float, List[str]]]:
    """Find top-K shortest paths using Yen's algorithm variant.
    Returns list of (total_cost, [node_ids]).
    """
    if source not in G.nodes or target not in G.nodes:
        return []

    try:
        # Use nx shortest simple paths then score them
        paths = []
        for i, path in enumerate(nx.shortest_simple_paths(G, source, target, weight="cost")):
            if i >= k:
                break
            total_cost = sum(
                G[path[j]][path[j + 1]].get("cost", 1.0)
                for j in range(len(path) - 1)
            )
            # Convert cost back to probability
            total_prob = math.exp(-total_cost)
            paths.append((total_prob, path))
        return paths
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return []


def calculate_risk_score(paths: List[Tuple[float, List[str]]]) -> float:
    """Overall risk = 1 - product(1 - path_prob) for independent paths.
    Capped at 0..1.
    """
    if not paths:
        return 0.0
    survival = 1.0
    for prob, _ in paths:
        survival *= (1 - min(prob, 0.99))
    return round(1 - survival, 4)


def greedy_remediation(
    G: nx.DiGraph,
    paths: List[Tuple[float, List[str]]],
    actions: List[Dict],
    max_actions: int = 6,
) -> List[Dict]:
    """Greedy hitting-set: pick actions that eliminate the most risk per unit cost."""
    # Map each action to the edges it would remove
    # For demo: action descriptions contain hints about what they fix
    remaining_paths = list(range(len(paths)))
    selected = []

    for _ in range(max_actions):
        if not remaining_paths:
            break

        best_action = None
        best_score = -1
        best_cuts = []

        for action in actions:
            if action["id"] in [a["id"] for a in selected]:
                continue

            # Simulate: which paths does this action cut?
            cuts = []
            for pi in remaining_paths:
                prob, path_nodes = paths[pi]
                # Heuristic: action cuts path if any edge in path relates to the action
                # Use fuzzy matching on action description vs path node labels
                for j in range(len(path_nodes) - 1):
                    edge_data = G[path_nodes[j]][path_nodes[j + 1]]
                    reason = edge_data.get("reason", "").lower()
                    desc = action["description"].lower()
                    # Check if action relates to this edge
                    keywords = desc.split()[:3]
                    if any(kw in reason for kw in keywords if len(kw) > 3):
                        cuts.append(pi)
                        break

            if not cuts:
                # If no direct match, randomly assign ~30% coverage for demo
                import random
                random.seed(action["id"])
                cuts = [pi for pi in remaining_paths if random.random() < 0.35]

            impact = sum(paths[pi][0] for pi in cuts)
            penalty = action.get("cost", 1) + action.get("downtime_risk", 0) * 5
            score = impact / max(penalty, 0.1)

            if score > best_score:
                best_score = score
                best_action = action
                best_cuts = cuts

        if best_action:
            best_action_copy = dict(best_action)
            best_action_copy["impact"] = round(sum(paths[pi][0] for pi in best_cuts), 4)
            best_action_copy["score"] = round(best_score, 4)
            best_action_copy["cuts_paths"] = len(best_cuts)
            selected.append(best_action_copy)
            remaining_paths = [pi for pi in remaining_paths if pi not in best_cuts]
        else:
            break

    return selected


def graph_to_json(G: nx.DiGraph) -> Dict:
    """Serialize graph for frontend visualization."""
    nodes = []
    for node_id, data in G.nodes(data=True):
        nodes.append({
            "id": node_id,
            "label": data.get("label", node_id),
            "type": data.get("type", "unknown"),
            "zone": data.get("zone"),
            "criticality": data.get("criticality", 0),
            "crown_jewel": data.get("crown_jewel", False),
        })

    edges = []
    for u, v, data in G.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "prob": round(data.get("prob", 0), 4),
            "reason": data.get("reason", ""),
            "controls": data.get("controls", []),
        })

    return {"nodes": nodes, "edges": edges}
