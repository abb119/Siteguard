import React, { useEffect, useState } from "react";
import { Check, ShieldAlert, Calendar } from "lucide-react";

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
            const res = await fetch("http://localhost:8000/violations?limit=100");
            if (res.ok) {
                const data = await res.json();
                setViolations(data);
            }
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
            const res = await fetch(`http://localhost:8000/violations/${id}/review`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_false_positive: isFalsePositive }),
            });
            if (res.ok) {
                // Optimistic update
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
        <div className="min-h-screen bg-slate-950 text-white p-8">
            <div className="max-w-7xl mx-auto">
                <header className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
                            Panel de Validación de Seguridad
                        </h1>
                        <p className="text-slate-400 mt-2">
                            Revisar y validar infracciones detectadas por AI
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {(["pending", "reviewed", "all"] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-2 rounded-lg font-medium transition-colors ${filter === f
                                    ? "bg-blue-600 text-white"
                                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                    }`}
                            >
                                {f === "pending"
                                    ? "Pendientes"
                                    : f === "reviewed"
                                        ? "Revisados"
                                        : "Todos"}
                            </button>
                        ))}
                    </div>
                </header>

                {loading ? (
                    <div className="text-center py-20 text-slate-500">Cargando incidentes...</div>
                ) : filteredViolations.length === 0 ? (
                    <div className="text-center py-20 bg-slate-900/50 rounded-xl border border-dashed border-slate-700">
                        <ShieldAlert className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                        <p className="text-lg text-slate-400">No hay infracciones {filter === "pending" ? "pendientes" : "encontradas"}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredViolations.map((v) => (
                            <div
                                key={v.id}
                                className={`group relative bg-slate-900 rounded-xl border transition-all ${v.is_reviewed
                                    ? v.is_false_positive
                                        ? "border-green-500/30 opacity-75"
                                        : "border-red-500/30 opacity-75"
                                    : "border-slate-700 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10"
                                    }`}
                            >
                                <div className="aspect-video relative overflow-hidden rounded-t-xl bg-black">
                                    <img
                                        src={`http://localhost:8000${v.image_path}`}
                                        alt={v.violation_type}
                                        className="w-full h-full object-contain"
                                        loading="lazy"
                                    />
                                    <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/70 text-xs font-mono border border-white/10">
                                        {Math.round(v.confidence * 100)}% Conf
                                    </div>
                                </div>

                                <div className="p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <span
                                            className={`px-2 py-1 rounded text-xs font-bold ${v.violation_type === "NO_HELMET"
                                                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                                : "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                                                }`}
                                        >
                                            {v.violation_type.replace("NO_", "SIN ")}
                                        </span>
                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    {!v.is_reviewed ? (
                                        <div className="flex gap-2 mt-4">
                                            <button
                                                onClick={() => handleReview(v.id, false)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors border border-red-500/20"
                                            >
                                                <ShieldAlert className="w-4 h-4" />
                                                Confirmar
                                            </button>
                                            <button
                                                onClick={() => handleReview(v.id, true)}
                                                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-sm font-medium transition-colors border border-green-500/20"
                                            >
                                                <Check className="w-4 h-4" />
                                                Falso
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={`mt-4 text-center text-sm font-medium py-2 rounded-lg ${v.is_false_positive ? "text-green-400 bg-green-500/5" : "text-red-400 bg-red-500/5"
                                            }`}>
                                            {v.is_false_positive ? "Marcado como Falso Positivo" : "Infracción Confirmada"}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
