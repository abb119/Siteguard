import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, LogIn, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

// Where each role lands after login
const HOME: Record<string, string> = {
    admin: "/admin",
    company: "/company",
    worker: "/services/driver",
};

export const LoginPage: React.FC = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation() as { state?: { from?: string } };

    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
            const me = await login(username.trim(), password);
            navigate(location.state?.from || HOME[me.role] || "/", { replace: true });
        } catch {
            setError("Usuario o contraseña incorrectos");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen bg-grid text-hud-bone flex flex-col">
            <header className="border-b border-hud-line bg-hud-bg/80">
                <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-hud-dim hover:text-amber-400 transition-colors hud-label">
                        <ArrowLeft size={14} /> Inicio
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="border border-amber-400 text-amber-400 p-1.5"><ShieldCheck size={16} /></div>
                        <span className="font-mono font-semibold tracking-[0.2em] text-sm">SITEGUARD</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 flex items-center justify-center px-6">
                <div className="w-full max-w-sm">
                    <span className="hud-label">▸ Control de acceso</span>
                    <h1 className="font-mono text-3xl font-bold tracking-tight uppercase mt-2 mb-8">Iniciar sesión</h1>

                    <form onSubmit={onSubmit} className="hud-panel hud-corners p-6 space-y-5">
                        <div>
                            <label className="hud-label block mb-2">Usuario</label>
                            <input
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoFocus
                                autoComplete="username"
                                className="w-full px-3 py-2.5 bg-hud-bg border border-hud-line text-hud-bone font-mono text-sm focus:outline-none focus:border-amber-400"
                            />
                        </div>
                        <div>
                            <label className="hud-label block mb-2">Contraseña</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                className="w-full px-3 py-2.5 bg-hud-bg border border-hud-line text-hud-bone font-mono text-sm focus:outline-none focus:border-amber-400"
                            />
                        </div>

                        {error && (
                            <div className="border-l-2 border-alarm-400 pl-3 py-1 text-alarm-400 font-mono text-xs uppercase tracking-wider">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={busy || !username || !password}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-400 text-hud-bg hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono uppercase tracking-widest text-xs"
                        >
                            <LogIn size={14} /> {busy ? "Accediendo…" : "Acceder"}
                        </button>
                    </form>

                    <p className="hud-label mt-6 leading-relaxed">
                        Alta solo por invitación: el administrador crea empresas y cada empresa
                        da de alta a sus trabajadores.
                    </p>
                </div>
            </main>
        </div>
    );
};
