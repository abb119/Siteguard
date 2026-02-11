import React, { useState, useEffect, useRef, useCallback } from "react";
import { Network, Play, Download, AlertCircle, Shield, Zap, CheckCircle2 } from "lucide-react";
import { ServiceLayout } from "../components/ServiceLayout";
import { SecurityNavItems } from "./SecurityDashboard";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

type GraphNode = {
    id: string;
    label: string;
    type: string;
    zone?: string;
    criticality?: number;
    crown_jewel?: boolean;
};

type GraphEdge = {
    source: string;
    target: string;
    prob: number;
    reason: string;
};

type AttackPath = {
    path_index: number;
    total_risk: number;
    steps: { node_id: string; label: string; prob: number; reason: string }[];
};

type Action = {
    id: number;
    type: string;
    description: string;
    cost: number;
    impact: number;
    score: number;
    cuts_paths: number;
};

const zoneColors: Record<string, string> = {
    internet: "#ef4444",
    dmz: "#f59e0b",
    internal: "#3b82f6",
    cloud: "#8b5cf6",
    ot: "#ec4899",
};

const nodeTypeShapes: Record<string, string> = {
    internet: "◆", gateway: "◈", zone: "▣", asset: "●",
    service: "○", server: "●", database: "◉", firewall: "◼",
    cloud_service: "☁", workstation: "◻", iot: "◎",
};

export const AttackGraphPage: React.FC = () => {
    const [scenarios, setScenarios] = useState<any[]>([]);
    const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [edges, setEdges] = useState<GraphEdge[]>([]);
    const [riskScore, setRiskScore] = useState(0);
    const [paths, setPaths] = useState<AttackPath[]>([]);
    const [plan, setPlan] = useState<{ actions: Action[]; risk_before: number; risk_after: number } | null>(null);
    const [loading, setLoading] = useState<string | null>(null);
    const [selectedPath, setSelectedPath] = useState<number | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        fetch(`${API_URL}/api/security/attack-graph/scenarios`).then(r => r.json()).then(setScenarios).catch(() => { });
    }, []);

    const loadScenario = async (scenarioId: string) => {
        try {
            setLoading("Loading scenario...");
            // Map scenario_id to file-based load name
            const nameMap: Record<string, string> = {
                cloud_webapp: "cloud",
                factory_ot: "factory",
            };
            const loadName = nameMap[scenarioId] || scenarioId;

            const loadRes = await fetch(`${API_URL}/api/security/attack-graph/scenarios/load`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scenario_name: loadName }),
            });
            const loadData = await loadRes.json();
            if (loadData.error) { console.error("Load error:", loadData.error); setLoading(null); return; }

            const sid = loadData.scenario_id || scenarioId;
            setSelectedScenario(sid);

            // Build graph
            setLoading("Building attack graph...");
            const res = await fetch(`${API_URL}/api/security/attack-graph/build?scenario_id=${sid}`, { method: "POST" });
            const data = await res.json();
            if (data.error) { console.error("Build error:", data.error); setLoading(null); return; }
            setNodes(data.nodes || []);
            setEdges(data.edges || []);
            setRiskScore(data.risk_score || 0);

            // Get paths
            setLoading("Finding attack paths...");
            const pathsRes = await fetch(`${API_URL}/api/security/attack-graph/paths?scenario_id=${sid}`);
            const pathsData = await pathsRes.json();
            setPaths(pathsData.paths || []);

            setPlan(null);
            setLoading(null);
        } catch (err) {
            console.error("Attack graph error:", err);
            setLoading(null);
        }
    };

    const generatePlan = async () => {
        if (!selectedScenario) return;
        setLoading("Generating remediation plan...");
        try {
            const res = await fetch(`${API_URL}/api/security/attack-graph/plan`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ scenario_id: selectedScenario }),
            });
            const data = await res.json();
            setPlan(data);
        } catch (err) {
            console.error("Plan error:", err);
        }
        setLoading(null);
    };

    // Canvas graph visualization
    const drawGraph = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || nodes.length === 0) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const W = canvas.width = canvas.offsetWidth * 2;
        const H = canvas.height = canvas.offsetHeight * 2;
        ctx.scale(2, 2);

        const w = W / 2, h = H / 2;
        ctx.clearRect(0, 0, w, h);

        // Layout: position nodes by zone
        const zoneOrder = ["internet", "dmz", "internal", "cloud", "ot"];
        const nodePositions = new Map<string, { x: number; y: number }>();

        const zones = [...new Set(nodes.map(n => n.zone || "internal"))];
        zones.sort((a, b) => zoneOrder.indexOf(a) - zoneOrder.indexOf(b));

        const colWidth = (w - 100) / Math.max(zones.length, 1);

        zones.forEach((zone, zi) => {
            const zoneNodes = nodes.filter(n => (n.zone || "internal") === zone);
            const rowHeight = (h - 80) / Math.max(zoneNodes.length, 1);

            zoneNodes.forEach((node, ni) => {
                const x = 60 + zi * colWidth + colWidth / 2;
                const y = 50 + ni * rowHeight + rowHeight / 2;
                nodePositions.set(node.id, { x: Math.min(x, w - 30), y: Math.min(y, h - 30) });
            });
        });

        // Draw zone backgrounds
        zones.forEach((zone, zi) => {
            const x = 50 + zi * colWidth;
            ctx.fillStyle = (zoneColors[zone] || "#6b7280") + "10";
            ctx.strokeStyle = (zoneColors[zone] || "#6b7280") + "40";
            ctx.lineWidth = 1;
            ctx.fillRect(x, 20, colWidth - 10, h - 40);
            ctx.strokeRect(x, 20, colWidth - 10, h - 40);
            ctx.fillStyle = (zoneColors[zone] || "#6b7280") + "cc";
            ctx.font = "bold 11px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(zone.toUpperCase(), x + colWidth / 2 - 5, 38);
        });

        // Determine highlighted path nodes
        const highlightedNodes = new Set<string>();
        const highlightedEdges = new Set<string>();
        if (selectedPath !== null && paths[selectedPath]) {
            const p = paths[selectedPath];
            p.steps.forEach(s => highlightedNodes.add(s.node_id));
            for (let i = 0; i < p.steps.length - 1; i++) {
                highlightedEdges.add(`${p.steps[i].node_id}→${p.steps[i + 1].node_id}`);
            }
        }

        // Draw edges
        edges.forEach(edge => {
            const from = nodePositions.get(edge.source);
            const to = nodePositions.get(edge.target);
            if (!from || !to) return;

            const isHighlighted = highlightedEdges.has(`${edge.source}→${edge.target}`);
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.strokeStyle = isHighlighted ? "#ef4444" : `rgba(100,116,139,${Math.max(edge.prob * 0.6, 0.1)})`;
            ctx.lineWidth = isHighlighted ? 2.5 : 1;
            ctx.stroke();

            // Arrow
            const angle = Math.atan2(to.y - from.y, to.x - from.x);
            const len = 8;
            ctx.beginPath();
            ctx.moveTo(to.x - 14 * Math.cos(angle), to.y - 14 * Math.sin(angle));
            ctx.lineTo(
                to.x - 14 * Math.cos(angle) - len * Math.cos(angle - 0.4),
                to.y - 14 * Math.sin(angle) - len * Math.sin(angle - 0.4)
            );
            ctx.lineTo(
                to.x - 14 * Math.cos(angle) - len * Math.cos(angle + 0.4),
                to.y - 14 * Math.sin(angle) - len * Math.sin(angle + 0.4)
            );
            ctx.fillStyle = isHighlighted ? "#ef4444" : "rgba(100,116,139,0.4)";
            ctx.fill();
        });

        // Draw nodes
        nodes.forEach(node => {
            const pos = nodePositions.get(node.id);
            if (!pos) return;

            const isHighlighted = highlightedNodes.has(node.id);
            const radius = node.crown_jewel ? 16 : (node.type === "zone" ? 14 : 10);
            const color = zoneColors[node.zone || "internal"] || "#6b7280";

            // Glow for crown jewels
            if (node.crown_jewel) {
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius + 6, 0, Math.PI * 2);
                ctx.fillStyle = "#ef444440";
                ctx.fill();
            }

            // Node circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = isHighlighted ? "#ef4444" : color;
            ctx.fill();
            ctx.strokeStyle = isHighlighted ? "#fff" : color + "80";
            ctx.lineWidth = isHighlighted ? 2 : 1;
            ctx.stroke();

            // Label
            ctx.fillStyle = isHighlighted ? "#fff" : "#cbd5e1";
            ctx.font = `${isHighlighted ? "bold " : ""}9px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText(node.label.substring(0, 18), pos.x, pos.y + radius + 14);
        });
    }, [nodes, edges, selectedPath, paths]);

    useEffect(() => {
        drawGraph();
    }, [drawGraph]);

    return (
        <ServiceLayout
            serviceName="Attack Graph"
            serviceIcon={<Network className="text-violet-400" size={24} />}
            accentColor="bg-violet-500/20"
            navItems={SecurityNavItems}
        >
            <div className="p-4 md:p-8">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">🕸️ Attack Graph Analysis</h1>
                <p className="text-slate-400 text-sm md:text-base mb-4 md:mb-6">Visualize attack paths and generate AI-driven remediation plans.</p>

                {/* Scenario Selector */}
                <div className="flex flex-wrap gap-2 md:gap-3 mb-4 md:mb-6">
                    {scenarios.map(s => (
                        <button
                            key={s.scenario_id}
                            onClick={() => loadScenario(s.scenario_id)}
                            className={`px-3 py-2 rounded-lg border transition-all text-sm ${selectedScenario === s.scenario_id
                                ? "bg-violet-500/20 border-violet-500/50 text-violet-300"
                                : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:border-slate-600"
                                }`}
                        >
                            {s.name}
                        </button>
                    ))}
                    {scenarios.length === 0 && (
                        <p className="text-slate-500">Loading scenarios...</p>
                    )}
                </div>

                {loading && (
                    <div className="text-center py-4 text-violet-400 animate-pulse">{loading}</div>
                )}

                {nodes.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                        {/* Graph Canvas */}
                        <div className="lg:col-span-2 bg-slate-800/30 backdrop-blur border border-slate-700/50 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Network size={18} className="text-violet-400" />
                                    Attack Graph ({nodes.length} nodes, {edges.length} edges)
                                </h2>
                                <div className={`px-3 py-1 rounded-full text-sm font-bold ${riskScore > 0.7 ? "bg-red-500/20 text-red-400" :
                                    riskScore > 0.4 ? "bg-orange-500/20 text-orange-400" :
                                        "bg-emerald-500/20 text-emerald-400"
                                    }`}>
                                    Risk: {(riskScore * 100).toFixed(1)}%
                                </div>
                            </div>
                            <canvas
                                ref={canvasRef}
                                className="w-full bg-slate-900/50 rounded-lg"
                                style={{ height: "min(420px, 60vw)" }}
                            />
                            <div className="mt-2 flex flex-wrap gap-2">
                                {Object.entries(zoneColors).map(([zone, color]) => (
                                    <span key={zone} className="text-xs flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                        {zone.toUpperCase()}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Right Panel */}
                        <div className="space-y-4">
                            {/* Risk Score */}
                            <div className={`rounded-xl p-4 text-center border ${riskScore > 0.7 ? "bg-red-500/10 border-red-500/30" :
                                riskScore > 0.4 ? "bg-orange-500/10 border-orange-500/30" :
                                    "bg-emerald-500/10 border-emerald-500/30"
                                }`}>
                                <div className="text-4xl font-bold mb-1">{(riskScore * 100).toFixed(1)}%</div>
                                <div className="text-sm opacity-75">Composite Risk Score</div>
                            </div>

                            {/* Attack Paths */}
                            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
                                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                    <AlertCircle size={14} className="text-red-400" />
                                    Attack Paths ({paths.length})
                                </h3>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                    {paths.map((p, i) => (
                                        <div
                                            key={i}
                                            className={`rounded-lg p-2 text-xs cursor-pointer transition-all ${selectedPath === i
                                                ? "bg-red-500/20 border border-red-500/40"
                                                : "bg-slate-800/50 hover:bg-slate-700/50 border border-transparent"
                                                }`}
                                            onClick={() => setSelectedPath(selectedPath === i ? null : i)}
                                        >
                                            <div className="flex justify-between mb-1">
                                                <span className="font-medium">Path #{i + 1}</span>
                                                <span className="text-red-400">{(p.total_risk * 100).toFixed(2)}%</span>
                                            </div>
                                            <div className="text-slate-400 truncate">
                                                {p.steps.map(s => s.label).join(" → ")}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Remediation Button */}
                            <button
                                onClick={generatePlan}
                                className="w-full flex items-center justify-center gap-2 bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/40 rounded-lg px-4 py-3 transition-all"
                            >
                                <Zap size={18} /> Generate Remediation Plan
                            </button>
                        </div>
                    </div>
                )}

                {/* Remediation Plan */}
                {plan && (
                    <div className="mt-6 bg-slate-800/30 backdrop-blur border border-slate-700/50 rounded-xl p-6">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Shield size={20} className="text-emerald-400" />
                            Remediation Plan
                        </h2>

                        {/* Before/After */}
                        <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                                <div className="text-3xl font-bold text-red-400">{(plan.risk_before * 100).toFixed(1)}%</div>
                                <div className="text-sm text-red-300">Risk Before</div>
                            </div>
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-center">
                                <div className="text-3xl font-bold text-emerald-400">{(plan.risk_after * 100).toFixed(1)}%</div>
                                <div className="text-sm text-emerald-300">Risk After</div>
                            </div>
                        </div>

                        {/* Actions table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-slate-400 border-b border-slate-700">
                                        <th className="text-left py-2 px-2">#</th>
                                        <th className="text-left py-2 px-2">Type</th>
                                        <th className="text-left py-2 px-2">Description</th>
                                        <th className="text-right py-2 px-2">Cost</th>
                                        <th className="text-right py-2 px-2">Impact</th>
                                        <th className="text-right py-2 px-2">Paths Cut</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {plan.actions.map((a, i) => (
                                        <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/30">
                                            <td className="py-2 px-2 text-slate-400">{i + 1}</td>
                                            <td className="py-2 px-2">
                                                <span className="px-2 py-0.5 rounded text-xs bg-violet-500/20 text-violet-300">{a.type}</span>
                                            </td>
                                            <td className="py-2 px-2">{a.description}</td>
                                            <td className="py-2 px-2 text-right text-slate-400">{a.cost.toFixed(1)}</td>
                                            <td className="py-2 px-2 text-right text-amber-400">{(a.impact * 100).toFixed(1)}%</td>
                                            <td className="py-2 px-2 text-right text-red-400">{a.cuts_paths}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </ServiceLayout>
    );
};
