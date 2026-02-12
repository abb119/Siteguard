import React, { useState, useEffect, useRef } from "react";
import { Shield, Network, Key, Brain, Activity } from "lucide-react";
import { ServiceLayout } from "../components/ServiceLayout";
import { apiFetch } from "../lib/api";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const WS_BASE = (import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000").replace(/\/ws\/.*/, "");

export const SecurityNavItems = [
    { to: "/services/security", label: "SOC Dashboard", icon: Shield },
    { to: "/services/security/honeytokens", label: "Honeytokens", icon: Key },
    { to: "/services/security/attack-graph", label: "Attack Graph", icon: Network },
    { to: "/services/security/llm-gateway", label: "LLM Gateway", icon: Brain },
];

type SecurityEvent = {
    id: number;
    ts: string;
    type: string;
    severity: string;
    title: string;
    summary?: string;
    payload?: any;
};

const severityColor: Record<string, string> = {
    crit: "text-red-400 bg-red-500/20 border-red-500/40",
    high: "text-orange-400 bg-orange-500/20 border-orange-500/40",
    med: "text-yellow-400 bg-yellow-500/20 border-yellow-500/40",
    low: "text-blue-400 bg-blue-500/20 border-blue-500/40",
};

const severityBadge: Record<string, string> = {
    crit: "bg-red-500/30 text-red-300",
    high: "bg-orange-500/30 text-orange-300",
    med: "bg-yellow-500/30 text-yellow-300",
    low: "bg-blue-500/30 text-blue-300",
};

export const SecurityDashboard: React.FC = () => {
    const [events, setEvents] = useState<SecurityEvent[]>([]);
    const [stats, setStats] = useState({ total_events: 0, critical: 0, high: 0, ws_clients: 0 });
    const wsRef = useRef<WebSocket | null>(null);

    // Fetch initial stats
    useEffect(() => {
        apiFetch(`${API_URL}/api/security/stats`).then(r => r.json()).then(setStats).catch(() => { });
        apiFetch(`${API_URL}/api/security/events?limit=50`).then(r => r.json()).then(setEvents).catch(() => { });
    }, []);

    // WebSocket live feed with reconnection
    useEffect(() => {
        let cancelled = false;
        let ws: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

        const connect = () => {
            if (cancelled) return;
            try {
                ws = new WebSocket(`${WS_BASE}/api/security/ws/events`);
                wsRef.current = ws;
                ws.onopen = () => {
                    if (!cancelled) ws?.send("ping");
                };
                ws.onmessage = (ev) => {
                    try {
                        const event = JSON.parse(ev.data);
                        setEvents(prev => [event, ...prev].slice(0, 100));
                        setStats(prev => ({
                            ...prev,
                            total_events: prev.total_events + 1,
                            critical: event.severity === "crit" ? prev.critical + 1 : prev.critical,
                            high: event.severity === "high" ? prev.high + 1 : prev.high,
                        }));
                    } catch { /* ignore bad messages */ }
                };
                ws.onclose = () => {
                    if (!cancelled) {
                        reconnectTimer = setTimeout(connect, 3000);
                    }
                };
                ws.onerror = () => {
                    ws?.close();
                };
            } catch {
                if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
            }
        };

        connect();
        return () => {
            cancelled = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (ws) { try { ws.close(); } catch { /* ignore */ } }
        };
    }, []);

    return (
        <ServiceLayout
            serviceName="Security Operations Center"
            serviceIcon={<Shield className="text-emerald-400" size={24} />}
            accentColor="bg-emerald-500/20"
            navItems={SecurityNavItems}
        >
            <div className="p-4 md:p-8">
                <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3"><Shield size={28} className="text-cyan-400" /> SOC Dashboard</h1>
                <p className="text-slate-400 text-sm md:text-base mb-6">Real-time security event monitoring across all modules.</p>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 md:mb-8">
                    <div className="bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-xl p-4">
                        <div className="text-sm text-slate-400 mb-1">Total Events</div>
                        <div className="text-3xl font-bold text-white">{stats.total_events}</div>
                    </div>
                    <div className="bg-red-500/10 backdrop-blur border border-red-500/30 rounded-xl p-4">
                        <div className="text-sm text-red-400 mb-1">Critical</div>
                        <div className="text-3xl font-bold text-red-300">{stats.critical}</div>
                    </div>
                    <div className="bg-orange-500/10 backdrop-blur border border-orange-500/30 rounded-xl p-4">
                        <div className="text-sm text-orange-400 mb-1">High</div>
                        <div className="text-3xl font-bold text-orange-300">{stats.high}</div>
                    </div>
                    <div className="bg-emerald-500/10 backdrop-blur border border-emerald-500/30 rounded-xl p-4">
                        <div className="text-sm text-emerald-400 mb-1">WS Clients</div>
                        <div className="text-3xl font-bold text-emerald-300">{stats.ws_clients}</div>
                    </div>
                </div>

                {/* Live Event Feed */}
                <div className="bg-slate-800/30 backdrop-blur border border-slate-700/50 rounded-xl p-6">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                        <Activity size={20} className="text-emerald-400" />
                        Live Event Feed
                        <span className="ml-auto text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full animate-pulse">
                            ● LIVE
                        </span>
                    </h2>
                    <div className="space-y-2 max-h-[600px] overflow-y-auto">
                        {events.length === 0 && (
                            <p className="text-slate-500 text-center py-8">No events yet. Create honeytokens or run the LLM test suite to generate events.</p>
                        )}
                        {events.map((ev, i) => (
                            <div
                                key={ev.id || i}
                                className={`border rounded-lg p-3 transition-all animate-in fade-in ${severityColor[ev.severity] || severityColor.low}`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${severityBadge[ev.severity] || severityBadge.low}`}>
                                        {ev.severity.toUpperCase()}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700/50 text-slate-300">
                                        {ev.type}
                                    </span>
                                    <span className="text-xs text-slate-500 ml-auto">
                                        {ev.ts ? new Date(ev.ts).toLocaleTimeString() : ""}
                                    </span>
                                </div>
                                <div className="font-medium text-sm">{ev.title}</div>
                                {ev.summary && <div className="text-xs text-slate-400 mt-1">{ev.summary}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </ServiceLayout>
    );
};
