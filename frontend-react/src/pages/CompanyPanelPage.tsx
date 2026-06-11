import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, LogOut, Map as MapIcon, Plus, ShieldCheck, Video } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { companyCreateWorker, companyListWorkers } from "../lib/api";

type Worker = {
    id: number; username: string; full_name: string | null;
    events: number; safety_score: number;
};

const scoreText = (s: number) => (s >= 80 ? "text-phosphor-400" : s >= 50 ? "text-amber-400" : "text-alarm-400");
const scoreBar = (s: number) => (s >= 80 ? "bg-phosphor-400" : s >= 50 ? "bg-amber-400" : "bg-alarm-400");

export const CompanyPanelPage: React.FC = () => {
    const { user, logout } = useAuth();
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [form, setForm] = useState({ username: "", password: "", full_name: "" });
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        companyListWorkers().then(setWorkers).catch(() => { });
    }, []);
    useEffect(load, [load]);

    const onCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await companyCreateWorker({
                username: form.username.trim(),
                password: form.password,
                full_name: form.full_name.trim() || undefined,
            });
            setForm({ username: "", password: "", full_name: "" });
            load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error");
        } finally {
            setBusy(false);
        }
    };

    const input = "w-full px-3 py-2 bg-hud-bg border border-hud-line text-hud-bone font-mono text-sm focus:outline-none focus:border-amber-400";

    return (
        <div className="min-h-screen bg-grid text-hud-bone">
            <header className="border-b border-hud-line bg-hud-bg/80">
                <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-hud-dim hover:text-amber-400 transition-colors hud-label">
                        <ArrowLeft size={14} /> Inicio
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="border border-amber-400 text-amber-400 p-1.5"><ShieldCheck size={16} /></div>
                        <span className="font-mono font-semibold tracking-[0.2em] text-sm">SITEGUARD · EMPRESA</span>
                    </div>
                    <button onClick={logout} className="flex items-center gap-2 hud-label hover:text-amber-400 transition-colors">
                        <LogOut size={14} /> {user?.username}
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-10">
                <span className="hud-label">▸ {user?.company_name ?? "Mi empresa"}</span>
                <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight uppercase mt-2 mb-4">Trabajadores</h1>

                {/* Quick links to company data views */}
                <div className="flex flex-wrap gap-2 mb-8">
                    <Link to="/services/driver/fleet" className="flex items-center gap-2 px-4 py-2 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors font-mono uppercase tracking-widest text-xs">
                        <MapIcon size={14} /> Vista de flota
                    </Link>
                    <Link to="/services/driver/alerts" className="flex items-center gap-2 px-4 py-2 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors font-mono uppercase tracking-widest text-xs">
                        <AlertTriangle size={14} /> Historial de alertas
                    </Link>
                    <Link to="/services/ppe/history" className="flex items-center gap-2 px-4 py-2 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors font-mono uppercase tracking-widest text-xs">
                        <ShieldCheck size={14} /> Historial EPP
                    </Link>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Create worker */}
                    <form onSubmit={onCreate} className="hud-panel hud-corners p-5 space-y-4 h-fit">
                        <div className="flex items-center gap-2">
                            <Plus size={16} className="text-amber-400" />
                            <span className="font-mono uppercase tracking-wide text-sm">Nuevo trabajador</span>
                        </div>
                        <div>
                            <label className="hud-label block mb-1.5">Usuario</label>
                            <input className={input} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                        </div>
                        <div>
                            <label className="hud-label block mb-1.5">Contraseña inicial</label>
                            <input type="password" className={input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                        </div>
                        <div>
                            <label className="hud-label block mb-1.5">Nombre completo (opcional)</label>
                            <input className={input} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                        </div>
                        {error && <div className="border-l-2 border-alarm-400 pl-3 text-alarm-400 font-mono text-xs uppercase">{error}</div>}
                        <button
                            type="submit"
                            disabled={busy || !form.username || !form.password}
                            className="w-full px-4 py-2.5 bg-amber-400 text-hud-bg hover:bg-amber-300 disabled:opacity-40 transition-colors font-mono uppercase tracking-widest text-xs"
                        >
                            {busy ? "Creando…" : "Dar de alta"}
                        </button>
                    </form>

                    {/* Workers list */}
                    <div className="lg:col-span-2 hud-panel">
                        <div className="hud-label p-4 border-b border-hud-line">Plantilla ({workers.length})</div>
                        {workers.length === 0 ? (
                            <div className="p-10 text-center hud-label">Sin trabajadores — da de alta al primero</div>
                        ) : (
                            <div className="divide-y divide-hud-line">
                                {workers.map((w) => (
                                    <div key={w.id} className="p-4 flex items-center gap-4 hover:bg-hud-bg transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-mono text-sm truncate">{w.full_name || w.username}</div>
                                            <div className="hud-label mt-0.5">@{w.username} · {w.events} eventos</div>
                                            <div className="h-1 bg-hud-bg mt-2 max-w-[200px]">
                                                <div className={`h-1 ${scoreBar(w.safety_score)}`} style={{ width: `${w.safety_score}%` }} />
                                            </div>
                                        </div>
                                        <span className={`font-mono text-2xl font-bold tnum ${scoreText(w.safety_score)}`}>{w.safety_score}</span>
                                        <div className="flex flex-col gap-1.5">
                                            <Link
                                                to={`/services/driver/alerts?session=${encodeURIComponent(w.username)}`}
                                                className="flex items-center gap-1.5 px-3 py-1.5 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors font-mono uppercase tracking-wider text-[10px]"
                                            >
                                                <AlertTriangle size={12} /> Historial
                                            </Link>
                                            <Link
                                                to={`/services/driver?driver=${encodeURIComponent(w.username)}&name=${encodeURIComponent(w.full_name || w.username)}`}
                                                className="flex items-center gap-1.5 px-3 py-1.5 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors font-mono uppercase tracking-wider text-[10px]"
                                            >
                                                <Video size={12} /> Monitorizar
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};
