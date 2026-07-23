import React, { useEffect, useState } from "react";
import { Check, ShieldAlert, Calendar, ShieldCheck } from "lucide-react";
import { getSessionId } from "../utils/session";
import { ServiceLayout } from "../components/ServiceLayout";
import { PPENavItems } from "./PPEServicePage";
import { apiFetch } from "../lib/api";
import { EvidenceImg } from "../components/EvidenceImg";

const API_HOST = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

type Violation = {
    id: number;
    timestamp: string;
    violation_type: string;
    confidence: number;
    image_path: string;
    is_reviewed: boolean;
    is_false_positive: boolean;
    reviewer_notes?: string;
};

export const AdminDashboard: React.FC = () => {
    const [violations, setViolations] = useState<Violation[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<"all" | "pending" | "reviewed">("pending");

    const fetchViolations = async () => {
        try {
            const res = await apiFetch(`${API_HOST}/violations?limit=100&session_id=${getSessionId()}`);
            if (res.ok) setViolations(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchViolations();
    }, []);

    const handleReview = async (id: number, isFalsePositive: boolean) => {
        try {
            const res = await apiFetch(`${API_HOST}/violations/${id}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_false_positive: isFalsePositive }),
            });
            if (res.ok) {
                setViolations((prev) =>
                    prev.map((v) =>
                        v.id === id ? { ...v, is_reviewed: true, is_false_positive: isFalsePositive } : v
                    )
                );
            }
        } catch (e) {
            alert("Error updating violation");
        }
    };

    const filteredViolations = violations.filter((v) => {
        if (filter === "pending") return !v.is_reviewed;
        if (filter === "reviewed") return v.is_reviewed;
        return true;
    });

    return (
        <ServiceLayout
            serviceName="Detección de EPP"
            serviceIcon={<ShieldCheck size={22} />}
            accentColor="amber"
            navItems={PPENavItems}
        >
            <div className="p-4 md:p-8">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 border-b border-hud-line pb-5 mb-8">
                    <div>
                        <span className="hud-label">▸ Validación de incidentes</span>
                        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight uppercase mt-2">Historial EPP</h1>
                    </div>
                    <div className="flex gap-px bg-hud-line border border-hud-line">
                        {(["pending", "reviewed", "all"] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2 font-mono uppercase tracking-widest text-xs transition-colors ${filter === f
                                    ? "bg-amber-400 text-hud-bg"
                                    : "bg-hud-panel text-hud-dim hover:text-amber-400"
                                    }`}
                            >
                                {f === "pending" ? "Pendientes" : f === "reviewed" ? "Revisados" : "Todos"}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-20 hud-label">Cargando incidentes…</div>
                ) : filteredViolations.length === 0 ? (
                    <div className="hud-panel hud-corners text-center py-20">
                        <ShieldAlert className="w-12 h-12 text-hud-dim mx-auto mb-4" />
                        <p className="hud-label">No hay infracciones {filter === "pending" ? "pendientes" : "encontradas"}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-px bg-hud-line border border-hud-line">
                        {filteredViolations.map((v) => (
                            <div
                                key={v.id}
                                className={`group relative bg-hud-panel border-l-2 transition-colors ${v.is_reviewed
                                    ? v.is_false_positive
                                        ? "border-phosphor-400/50 opacity-70"
                                        : "border-alarm-400/50 opacity-70"
                                    : "border-transparent hover:bg-hud-bg"
                                    }`}
                            >
                                <div className="aspect-video relative overflow-hidden bg-hud-bg">
                                    <EvidenceImg
                                        path={v.image_path}
                                        alt={v.violation_type}
                                        className="w-full h-full object-contain"
                                    />
                                    <div className="absolute top-2 right-2 px-2 py-1 bg-hud-bg/80 text-xs font-mono tnum border border-hud-line">
                                        {Math.round(v.confidence * 100)}%
                                    </div>
                                </div>

                                <div className="p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <span
                                            className={`px-2 py-1 border font-mono text-xs uppercase tracking-widest ${v.violation_type === "NO_HELMET"
                                                ? "border-alarm-400/50 text-alarm-400"
                                                : "border-amber-400/50 text-amber-400"
                                                }`}
                                        >
                                            {v.violation_type.replace("NO_", "SIN ")}
                                        </span>
                                        <span className="text-xs text-hud-dim font-mono flex items-center gap-1 tnum">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(v.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </span>
                                    </div>

                                    {!v.is_reviewed ? (
                                        <div className="flex gap-2 mt-4">
                                            <button
                                                onClick={() => handleReview(v.id, false)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-alarm-400/40 text-alarm-400 hover:bg-alarm-400/10 text-xs font-mono uppercase tracking-widest transition-colors"
                                            >
                                                <ShieldAlert className="w-4 h-4" />
                                                Confirmar
                                            </button>
                                            <button
                                                onClick={() => handleReview(v.id, true)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-phosphor-400/40 text-phosphor-400 hover:bg-phosphor-400/10 text-xs font-mono uppercase tracking-widest transition-colors"
                                            >
                                                <Check className="w-4 h-4" />
                                                Falso
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={`mt-4 text-center text-xs font-mono uppercase tracking-widest py-2 ${v.is_false_positive ? "text-phosphor-400" : "text-alarm-400"}`}>
                                            {v.is_false_positive ? "Falso positivo" : "Infracción confirmada"}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </ServiceLayout>
    );
};
