import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Truck, Video, Car, AlertTriangle, Settings, Map as MapIcon, Gauge, X, Activity } from "lucide-react";
import { ServiceLayout } from "../components/ServiceLayout";
import { ROUTES } from "../data/alicanteRoutes";

const NAV = [
    { to: "/services/driver", label: "Monitor Conductor", icon: Video },
    { to: "/services/driver/safe-driving", label: "Conducción Segura", icon: Car },
    { to: "/services/driver/fleet", label: "Flota", icon: MapIcon },
    { to: "/services/driver/alerts", label: "Alertas", icon: AlertTriangle },
    { to: "/services/driver/settings", label: "Configuración", icon: Settings },
];

const CENTER: [number, number] = [38.3525, -0.482];

// ── Route geometry (cumulative distance for interpolation) ──────────────────
function haversine(a: [number, number], b: [number, number]): number {
    const R = 6371000, toRad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * toRad, dLng = (b[1] - a[1]) * toRad;
    const la1 = a[0] * toRad, la2 = b[0] * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
const ROUTE_GEOM = ROUTES.map((pts) => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
    return { pts, cum, len: cum[cum.length - 1] || 1 };
});
function posAt(ri: number, dist: number): [number, number] {
    const g = ROUTE_GEOM[ri];
    const d = ((dist % g.len) + g.len) % g.len;
    let i = 1;
    while (i < g.cum.length && g.cum[i] < d) i++;
    const segStart = g.cum[i - 1], segLen = (g.cum[i] - g.cum[i - 1]) || 1;
    const f = (d - segStart) / segLen;
    const [la1, lo1] = g.pts[i - 1], [la2, lo2] = g.pts[i];
    return [la1 + (la2 - la1) * f, lo1 + (lo2 - lo1) * f];
}

type Risk = "low" | "medium" | "high";
type Driver = {
    id: string; name: string; vehicle: string;
    routeIdx: number; dist: number; lat: number; lng: number;
    speed: number; risk: Risk; fatigue: number; alert: string | null;
};

const NAMES = ["J. Martínez", "L. García", "M. López", "A. Sánchez", "C. Pérez",
    "R. Gómez", "S. Ruiz", "D. Torres", "N. Ramírez", "P. Navarro"];
const VEHICLES = ["Furgoneta 01", "Camión 02", "Furgoneta 03", "Camión 04", "Van 05",
    "Camión 06", "Furgoneta 07", "Van 08", "Camión 09", "Furgoneta 10"];
const ALERTS = ["Somnolencia", "Mirada desviada", "Uso de móvil", "Mirando abajo", "Sin cinturón", "Bostezo"];

const riskColor = (r: Risk) => (r === "high" ? "#ff3b30" : r === "medium" ? "#ffb000" : "#00d97e");
const riskText = (r: Risk) => (r === "high" ? "text-alarm-400" : r === "medium" ? "text-amber-400" : "text-phosphor-400");

function makeDrivers(): Driver[] {
    return NAMES.map((name, i) => {
        const routeIdx = i % ROUTE_GEOM.length;
        const dist = Math.random() * ROUTE_GEOM[routeIdx].len;
        const [lat, lng] = posAt(routeIdx, dist);
        return {
            id: `D${String(i + 1).padStart(2, "0")}`, name, vehicle: VEHICLES[i],
            routeIdx, dist, lat, lng,
            speed: 25 + Math.random() * 35, risk: "low",
            fatigue: Math.random() * 30, alert: null,
        };
    });
}

function step(d: Driver): Driver {
    const distM = (d.speed * 1000) / 3600; // ~1s of travel
    const dist = d.dist + distM;
    const [lat, lng] = posAt(d.routeIdx, dist);

    const speed = Math.min(90, Math.max(8, d.speed + (Math.random() - 0.5) * 10));
    const fatigue = Math.min(100, Math.max(0, d.fatigue + (Math.random() - 0.45) * 4));
    let alert = d.alert;
    let risk: Risk = "low";
    if (d.alert) { if (Math.random() < 0.25) alert = null; }
    else if (Math.random() < 0.04) alert = ALERTS[Math.floor(Math.random() * ALERTS.length)];
    if (alert) risk = Math.random() < 0.5 ? "high" : "medium";
    else if (fatigue > 65) risk = "medium";

    return { ...d, dist, lat, lng, speed, fatigue, alert, risk };
}

export const FleetMapPage: React.FC = () => {
    const mapDivRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<Record<string, L.Marker>>({});
    const driversRef = useRef<Driver[]>(makeDrivers());
    const selectedRef = useRef<string | null>(null);

    const [drivers, setDrivers] = useState<Driver[]>(driversRef.current);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

    const icon = (d: Driver, selected: boolean) =>
        L.divIcon({
            className: "",
            iconSize: [12, 12],
            html: `<div class="fleet-marker ${d.risk}${selected ? " sel" : ""}" style="--c:${riskColor(d.risk)}"></div>`,
        });

    // Map init (once)
    useEffect(() => {
        if (!mapDivRef.current || mapRef.current) return;
        const map = L.map(mapDivRef.current, { center: CENTER, zoom: 13 });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png", {
            attribution: "© OpenStreetMap © CARTO", subdomains: "abcd", maxZoom: 19,
        }).addTo(map);

        // Draw the road network faintly
        for (const pts of ROUTES) {
            L.polyline(pts as [number, number][], { color: "#3a3a40", weight: 2, opacity: 0.6 }).addTo(map);
        }

        for (const d of driversRef.current) {
            const m = L.marker([d.lat, d.lng], { icon: icon(d, false) }).addTo(map);
            m.on("click", () => setSelectedId(d.id));
            markersRef.current[d.id] = m;
        }
        return () => { map.remove(); mapRef.current = null; markersRef.current = {}; };
    }, []);

    // Simulation tick
    useEffect(() => {
        const iv = setInterval(() => {
            driversRef.current = driversRef.current.map(step);
            const sel = selectedRef.current;
            for (const d of driversRef.current) {
                const m = markersRef.current[d.id];
                if (!m) continue;
                m.setLatLng([d.lat, d.lng]);
                m.setIcon(icon(d, d.id === sel));
            }
            setDrivers([...driversRef.current]);
        }, 1000);
        return () => clearInterval(iv);
    }, []);

    useEffect(() => {
        if (!selectedId || !mapRef.current) return;
        const d = driversRef.current.find((x) => x.id === selectedId);
        if (d) mapRef.current.panTo([d.lat, d.lng]);
    }, [selectedId]);

    const selected = drivers.find((d) => d.id === selectedId) || null;
    const counts = {
        high: drivers.filter((d) => d.risk === "high").length,
        active: drivers.filter((d) => d.alert).length,
    };

    return (
        <ServiceLayout serviceName="Sistema ADAS" serviceIcon={<Truck size={22} />} accentColor="amber" navItems={NAV}>
            <div className="p-4 md:p-8">
                {/* Header */}
                <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hud-line pb-5 mb-6">
                    <div>
                        <span className="hud-label">▸ Operaciones de flota · Alicante</span>
                        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight uppercase mt-2">Flota</h1>
                    </div>
                    <div className="flex gap-px bg-hud-line border border-hud-line font-mono text-xs">
                        <div className="bg-hud-panel px-4 py-2 text-center">
                            <div className="hud-label">Conductores</div>
                            <div className="text-hud-bone tnum text-lg">{drivers.length}</div>
                        </div>
                        <div className="bg-hud-panel px-4 py-2 text-center">
                            <div className="hud-label">Riesgo alto</div>
                            <div className="text-alarm-400 tnum text-lg">{counts.high}</div>
                        </div>
                        <div className="bg-hud-panel px-4 py-2 text-center">
                            <div className="hud-label">Alertas</div>
                            <div className="text-amber-400 tnum text-lg">{counts.active}</div>
                        </div>
                    </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Map */}
                    <div className="lg:col-span-2 relative hud-panel hud-corners overflow-hidden">
                        <div ref={mapDivRef} className="w-full h-[60vh] min-h-[420px]" />
                    </div>

                    {/* Driver list */}
                    <div className="hud-panel flex flex-col max-h-[60vh] min-h-[420px]">
                        <div className="hud-label p-3 border-b border-hud-line">Conductores activos</div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-hud-line">
                            {drivers.map((d) => (
                                <button
                                    key={d.id}
                                    onClick={() => setSelectedId(d.id)}
                                    className={`w-full text-left p-3 flex items-center gap-3 hover:bg-hud-bg transition-colors ${selectedId === d.id ? "bg-hud-bg border-l-2 border-amber-400" : "border-l-2 border-transparent"}`}
                                >
                                    <span className="w-2 h-2 inline-block" style={{ background: riskColor(d.risk), transform: "rotate(45deg)" }} />
                                    <div className="flex-1 min-w-0">
                                        <div className="font-mono text-sm truncate">{d.id} · {d.name}</div>
                                        <div className="hud-label mt-0.5 truncate">{d.alert ?? "En ruta"}</div>
                                    </div>
                                    <span className="font-mono text-xs text-hud-dim tnum">{d.speed.toFixed(0)} km/h</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Driver detail drawer */}
                {selected && (
                    <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setSelectedId(null)}>
                        <div className="absolute inset-0 bg-black/60" />
                        <div className="relative w-full max-w-md bg-hud-panel border-l border-hud-line h-full overflow-y-auto custom-scrollbar p-6" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-start justify-between mb-6">
                                <div>
                                    <span className="hud-label">▸ {selected.id} · {selected.vehicle}</span>
                                    <h2 className="font-mono text-2xl font-bold tracking-tight uppercase mt-2">{selected.name}</h2>
                                </div>
                                <button onClick={() => setSelectedId(null)} className="p-2 border border-hud-line hover:border-amber-400 transition-colors"><X size={16} /></button>
                            </div>

                            <div className={`hud-panel p-4 border-l-2 mb-4 ${selected.risk === "high" ? "border-alarm-400" : selected.risk === "medium" ? "border-amber-400" : "border-phosphor-400"}`}>
                                <div className="flex items-center gap-3">
                                    {selected.alert ? <AlertTriangle className="text-alarm-400" size={22} /> : <Activity className="text-phosphor-400" size={22} />}
                                    <span className="font-mono uppercase tracking-wide">{selected.alert ?? "Conducción normal"}</span>
                                    <span className={`ml-auto font-mono uppercase text-xs tracking-widest ${riskText(selected.risk)}`}>{selected.risk}</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-px bg-hud-line border border-hud-line mb-4">
                                <div className="bg-hud-panel p-4">
                                    <div className="hud-label mb-1">Velocidad</div>
                                    <div className="font-mono text-2xl font-bold tnum text-amber-400">{selected.speed.toFixed(0)}<span className="text-sm text-hud-dim"> km/h</span></div>
                                </div>
                                <div className="bg-hud-panel p-4">
                                    <div className="flex items-center gap-2 mb-1"><Gauge size={12} className="text-amber-400" /><span className="hud-label">Fatiga</span></div>
                                    <div className={`font-mono text-2xl font-bold tnum ${selected.fatigue >= 66 ? "text-alarm-400" : selected.fatigue >= 33 ? "text-amber-400" : "text-phosphor-400"}`}>{selected.fatigue.toFixed(0)}</div>
                                </div>
                            </div>

                            <div className="hud-panel p-4 mb-6">
                                <div className="hud-label mb-2">Posición</div>
                                <div className="font-mono text-sm text-hud-dim tnum">{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</div>
                            </div>

                            <div className="hud-label mb-2">Abrir en directo</div>
                            <div className="grid gap-2">
                                <Link to="/services/driver" className="flex items-center gap-3 px-4 py-3 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors font-mono uppercase tracking-widest text-xs">
                                    <Video size={16} /> Monitor de Conductor
                                </Link>
                                <Link to="/services/driver/safe-driving" className="flex items-center gap-3 px-4 py-3 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors font-mono uppercase tracking-widest text-xs">
                                    <Car size={16} /> Conducción Segura
                                </Link>
                            </div>
                            <p className="hud-label mt-4 leading-relaxed">
                                Datos simulados para demostración de flota. El monitor en directo usa la
                                webcam del dispositivo.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </ServiceLayout>
    );
};
