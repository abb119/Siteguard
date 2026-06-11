import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Truck, Video, Car, AlertTriangle, Settings, RefreshCw, ShieldAlert, Map as MapIcon } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import {
    Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { ServiceLayout } from "../components/ServiceLayout";
import { getSessionId } from "../utils/session";
import { listDriverSessions, getDriverReport, listDriverEvents, staticUrl } from "../lib/api";

const NAV = [
    { to: "/services/driver", label: "Monitor Conductor", icon: Video },
    { to: "/services/driver/safe-driving", label: "Conducción Segura", icon: Car },
    { to: "/services/driver/fleet", label: "Flota", icon: MapIcon },
    { to: "/services/driver/alerts", label: "Alertas", icon: AlertTriangle },
    { to: "/services/driver/settings", label: "Configuración", icon: Settings },
];

const TYPE_LABEL: Record<string, string> = {
    MICROSLEEP: "Microsueño",
    DROWSY: "Somnolencia",
    DISTRACTION: "Mirada desviada",
    LOOK_DOWN: "Mirando abajo",
    PHONE: "Uso de móvil",
    DRINKING: "Bebiendo",
    YAWN: "Bostezo",
    NO_FACE: "Sin conductor",
};

const sevText = (s: string) =>
    s === "critical" ? "text-alarm-400" : s === "high" ? "text-amber-400" : "text-steel-300";
const sevBar = (s: string) =>
    s === "critical" ? "bg-alarm-400" : s === "high" ? "bg-amber-400" : "bg-steel-400";

const scoreColor = (n: number) =>
    n >= 80 ? "text-phosphor-400" : n >= 50 ? "text-amber-400" : "text-alarm-400";

type Report = {
    session_id: string;
    total_events: number;
    counts: Record<string, number>;
    safety_score: number;
    max_fatigue: number;
    first: string | null;
    last: string | null;
    timeline: Array<{ id: number; timestamp: string; event_type: string; severity: string; fatigue_score: number | null; image_path: string | null }>;
};

export const DriverAlertsPage: React.FC = () => {
    const [params] = useSearchParams();
    const { user } = useAuth();
    const isWorker = user?.role === "worker";
    const [sessions, setSessions] = useState<any[]>([]);
    const [selected, setSelected] = useState<string>(
        params.get("session") || (isWorker ? user!.username : getSessionId())
    );
    const [report, setReport] = useState<Report | null>(null);
    const [events, setEvents] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const loadSessions = useCallback(async () => {
        try {
            const s = await listDriverSessions();
            setSessions(s);
        } catch { /* offline */ }
    }, []);

    const loadReport = useCallback(async (sid: string) => {
        setLoading(true);
        try {
            const [rep, evs] = await Promise.all([getDriverReport(sid), listDriverEvents(sid)]);
            setReport(rep);
            setEvents(evs);
        } catch {
            setReport(null);
            setEvents([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadSessions(); }, [loadSessions]);
    useEffect(() => { if (selected) loadReport(selected); }, [selected, loadReport]);

    const counts = report?.counts ?? {};
    const maxCount = Math.max(1, ...Object.values(counts));
    const fatigueData = (report?.timeline ?? []).map((e, i) => ({
        i: i + 1,
        fatiga: e.fatigue_score ?? 0,
    }));

    return (
        <ServiceLayout serviceName="Sistema ADAS" serviceIcon={<Truck size={22} />} accentColor="amber" navItems={NAV}>
            <div className="p-4 md:p-8 max-w-6xl">
                {/* Header */}
                <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hud-line pb-5 mb-8">
                    <div>
                        <span className="hud-label">▸ Registro de incidentes</span>
                        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight mt-2">ALERTAS</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        {isWorker ? (
                            <span className="px-3 py-2 border border-amber-400/40 text-amber-400 font-mono text-xs uppercase tracking-wider">
                                @{user!.username}
                            </span>
                        ) : (
                            <select
                                value={selected}
                                onChange={(e) => setSelected(e.target.value)}
                                className="bg-hud-panel border border-hud-line text-hud-bone font-mono text-xs px-3 py-2 focus:outline-none focus:border-amber-400"
                            >
                                <option value={selected}>{selected.length > 12 ? `${selected.slice(0, 8)}…` : selected}</option>
                                {sessions
                                    .filter((s) => s.session_id && s.session_id !== selected)
                                    .map((s) => (
                                        <option key={s.session_id} value={s.session_id}>
                                            {(s.session_id as string).slice(0, 12)} · {s.events} ev
                                        </option>
                                    ))}
                            </select>
                        )}
                        <button
                            onClick={() => { loadSessions(); loadReport(selected); }}
                            className="p-2 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors"
                            title="Refrescar"
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

                {/* Empty state */}
                {(!report || report.total_events === 0) && !loading && (
                    <div className="hud-panel hud-corners p-10 text-center">
                        <ShieldAlert className="mx-auto text-hud-dim mb-3" size={32} />
                        <p className="font-mono uppercase tracking-widest text-sm text-hud-dim">
                            Sin incidentes registrados
                        </p>
                        <p className="text-hud-dim text-sm mt-2">
                            Abre el Monitor de Conductor y los microsueños, distracciones y demás
                            quedarán registrados aquí automáticamente.
                        </p>
                    </div>
                )}

                {report && report.total_events > 0 && (
                    <div className="space-y-6">
                        {/* Instrument readouts */}
                        <div className="grid grid-cols-3 border border-hud-line divide-x divide-hud-line bg-hud-panel">
                            <div className="p-5">
                                <div className="hud-label mb-2">Safety Score</div>
                                <div className={`font-mono text-4xl font-bold tnum ${scoreColor(report.safety_score)}`}>
                                    {report.safety_score}
                                </div>
                            </div>
                            <div className="p-5">
                                <div className="hud-label mb-2">Incidentes</div>
                                <div className="font-mono text-4xl font-bold tnum text-hud-bone">{report.total_events}</div>
                            </div>
                            <div className="p-5">
                                <div className="hud-label mb-2">Fatiga máx.</div>
                                <div className="font-mono text-4xl font-bold tnum text-amber-400">{Math.round(report.max_fatigue)}</div>
                            </div>
                        </div>

                        {/* Counts + Fatigue chart */}
                        <div className="grid lg:grid-cols-2 gap-6">
                            <div className="hud-panel p-5">
                                <div className="hud-label mb-4">Incidentes por tipo</div>
                                <div className="space-y-3">
                                    {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
                                        <div key={type}>
                                            <div className="flex justify-between font-mono text-xs mb-1">
                                                <span className="text-hud-bone">{TYPE_LABEL[type] ?? type}</span>
                                                <span className="text-hud-dim tnum">{n}</span>
                                            </div>
                                            <div className="h-1.5 bg-hud-bg">
                                                <div className="h-1.5 bg-amber-400" style={{ width: `${(n / maxCount) * 100}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="hud-panel p-5">
                                <div className="hud-label mb-4">Evolución de la fatiga</div>
                                {fatigueData.length > 1 ? (
                                    <ResponsiveContainer width="100%" height={180}>
                                        <AreaChart data={fatigueData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#ffb000" stopOpacity={0.4} />
                                                    <stop offset="100%" stopColor="#ffb000" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid stroke="#26262b" strokeDasharray="2 4" />
                                            <XAxis dataKey="i" stroke="#605f58" fontSize={10} />
                                            <YAxis domain={[0, 100]} stroke="#605f58" fontSize={10} />
                                            <Tooltip
                                                contentStyle={{ background: "#121214", border: "1px solid #26262b", fontFamily: "IBM Plex Mono", fontSize: 12 }}
                                                labelStyle={{ color: "#86847a" }}
                                            />
                                            <Area type="monotone" dataKey="fatiga" stroke="#ffb000" strokeWidth={2} fill="url(#fatGrad)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <p className="text-hud-dim text-sm font-mono">Datos insuficientes</p>
                                )}
                            </div>
                        </div>

                        {/* Events table */}
                        <div className="hud-panel">
                            <div className="hud-label p-4 border-b border-hud-line">Cronología de incidentes</div>
                            <div className="divide-y divide-hud-line">
                                {events.map((e) => (
                                    <div key={e.id} className="flex items-center gap-4 p-3 hover:bg-hud-bg transition-colors">
                                        {e.image_path ? (
                                            <img src={staticUrl(e.image_path)} alt="" className="w-16 h-12 object-cover border border-hud-line" />
                                        ) : (
                                            <div className="w-16 h-12 bg-hud-bg border border-hud-line" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-mono text-sm uppercase tracking-wide">{TYPE_LABEL[e.event_type] ?? e.event_type}</div>
                                            <div className="hud-label mt-1">{e.message}</div>
                                        </div>
                                        <span className={`hud-dot rounded-full inline-block ${sevBar(e.severity)}`} />
                                        <div className={`font-mono text-[11px] uppercase tracking-widest w-16 text-right ${sevText(e.severity)}`}>
                                            {e.severity}
                                        </div>
                                        <div className="font-mono text-xs text-hud-dim w-20 text-right tnum">
                                            {new Date(e.timestamp).toLocaleTimeString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ServiceLayout>
    );
};
