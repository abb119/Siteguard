import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Building2, LogOut, Plus, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { adminCreateCompany, adminListCompanies } from "../lib/api";

type Company = { id: number; name: string; workers: number; manager: string | null };

export const AdminPanelPage: React.FC = () => {
    const { user, logout } = useAuth();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [form, setForm] = useState({ name: "", manager_username: "", manager_password: "", manager_full_name: "" });
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        adminListCompanies().then(setCompanies).catch(() => { });
    }, []);
    useEffect(load, [load]);

    const onCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            await adminCreateCompany({
                name: form.name.trim(),
                manager_username: form.manager_username.trim(),
                manager_password: form.manager_password,
                manager_full_name: form.manager_full_name.trim() || undefined,
            });
            setForm({ name: "", manager_username: "", manager_password: "", manager_full_name: "" });
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
                        <span className="font-mono font-semibold tracking-[0.2em] text-sm">SITEGUARD · ADMIN</span>
                    </div>
                    <button onClick={logout} className="flex items-center gap-2 hud-label hover:text-amber-400 transition-colors">
                        <LogOut size={14} /> {user?.username}
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-10">
                <span className="hud-label">▸ Administración de la plataforma</span>
                <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight uppercase mt-2 mb-8">Empresas</h1>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Create company */}
                    <form onSubmit={onCreate} className="hud-panel hud-corners p-5 space-y-4 h-fit">
                        <div className="flex items-center gap-2">
                            <Plus size={16} className="text-amber-400" />
                            <span className="font-mono uppercase tracking-wide text-sm">Nueva empresa</span>
                        </div>
                        <div>
                            <label className="hud-label block mb-1.5">Nombre de la empresa</label>
                            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="hud-label block mb-1.5">Usuario gestor</label>
                            <input className={input} value={form.manager_username} onChange={(e) => setForm({ ...form, manager_username: e.target.value })} />
                        </div>
                        <div>
                            <label className="hud-label block mb-1.5">Contraseña inicial</label>
                            <input type="password" className={input} value={form.manager_password} onChange={(e) => setForm({ ...form, manager_password: e.target.value })} />
                        </div>
                        <div>
                            <label className="hud-label block mb-1.5">Nombre del gestor (opcional)</label>
                            <input className={input} value={form.manager_full_name} onChange={(e) => setForm({ ...form, manager_full_name: e.target.value })} />
                        </div>
                        {error && <div className="border-l-2 border-alarm-400 pl-3 text-alarm-400 font-mono text-xs uppercase">{error}</div>}
                        <button
                            type="submit"
                            disabled={busy || !form.name || !form.manager_username || !form.manager_password}
                            className="w-full px-4 py-2.5 bg-amber-400 text-hud-bg hover:bg-amber-300 disabled:opacity-40 transition-colors font-mono uppercase tracking-widest text-xs"
                        >
                            {busy ? "Creando…" : "Crear empresa + gestor"}
                        </button>
                    </form>

                    {/* Companies list */}
                    <div className="lg:col-span-2 hud-panel">
                        <div className="hud-label p-4 border-b border-hud-line">Empresas registradas ({companies.length})</div>
                        {companies.length === 0 ? (
                            <div className="p-10 text-center hud-label">Sin empresas — crea la primera</div>
                        ) : (
                            <div className="divide-y divide-hud-line">
                                {companies.map((c) => (
                                    <div key={c.id} className="p-4 flex items-center gap-4 hover:bg-hud-bg transition-colors">
                                        <Building2 size={18} className="text-amber-400" />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-mono text-sm uppercase tracking-wide truncate">{c.name}</div>
                                            <div className="hud-label mt-0.5">Gestor: {c.manager ?? "—"}</div>
                                        </div>
                                        <div className="flex items-center gap-2 font-mono text-xs text-hud-dim">
                                            <Users size={14} />
                                            <span className="tnum">{c.workers} trabajadores</span>
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
