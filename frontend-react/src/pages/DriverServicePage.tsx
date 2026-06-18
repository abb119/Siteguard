import React from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Activity, ShieldCheck, Phone, ScanFace, User } from "lucide-react";
import { DriverLayout } from "../components/ServiceLayout";
import { DriverVideoFeed } from "../components/DriverVideoFeed";
import { useAuth } from "../auth/AuthContext";

const CAPABILITIES = [
    { icon: ScanFace, label: "Fatiga · PERCLOS" },
    { icon: Eye, label: "Microsueño" },
    { icon: Activity, label: "Atención · pose" },
    { icon: Phone, label: "Móvil · bebida" },
    { icon: ShieldCheck, label: "Cinturón" },
];

export const DriverServicePage: React.FC = () => {
    const [params] = useSearchParams();
    const { user } = useAuth();
    // Explicit ?driver= wins; otherwise a logged-in worker records under their own identity
    const driver = params.get("driver") || (user?.role === "worker" ? user.username : null);
    const name = params.get("name") || (user?.role === "worker" ? (user.full_name || user.username) : null);

    return (
        <DriverLayout>
            <div className="p-4 md:p-8 space-y-6">
                {/* Elevated header — live indicator + capabilities, in the HUD system */}
                <header className="relative hud-panel hud-corners overflow-hidden">
                    <div className="bg-grid-fine absolute inset-0 opacity-40 pointer-events-none" />
                    <div className="relative p-5 md:p-6">
                        <div className="flex items-center gap-2">
                            <span className="hud-dot bg-alarm-400 text-alarm-400 inline-block motion-safe:animate-pulse" />
                            <span className="hud-label text-alarm-300">En vivo · DMS v2</span>
                        </div>
                        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight mt-3">
                            MONITOR DE CONDUCTOR
                        </h1>
                        <p className="text-hud-dim text-sm mt-2 max-w-2xl">
                            Fatiga, microsueños, distracción y cinturón en tiempo real con visión por
                            computador <span className="text-hud-bone">explicable</span> (MediaPipe + detectores
                            propios entrenados con datos públicos).
                        </p>

                        {/* Capability chips — communicate what the monitor detects */}
                        <div className="flex flex-wrap gap-2 mt-5">
                            {CAPABILITIES.map((c) => (
                                <span
                                    key={c.label}
                                    className="inline-flex items-center gap-2 px-2.5 py-1 border border-hud-line text-hud-dim font-mono uppercase text-[11px] tracking-wider"
                                >
                                    <c.icon size={13} className="text-amber-400" />
                                    {c.label}
                                </span>
                            ))}
                        </div>
                    </div>
                </header>

                {driver && (
                    <div className="flex items-center gap-3 hud-panel border-l-2 border-amber-400 p-3">
                        <User size={18} className="text-amber-400 shrink-0" />
                        <span className="font-mono uppercase tracking-wide text-sm">
                            Monitorizando: <span className="text-amber-400">{name || driver}</span>
                        </span>
                        <span className="hud-label ml-auto hidden sm:block">Eventos registrados bajo {driver}</span>
                    </div>
                )}

                {/* Real-time analysis (detection overlay + metrics) */}
                <DriverVideoFeed driverId={driver ?? undefined} />
            </div>
        </DriverLayout>
    );
};
