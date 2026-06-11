import React from "react";
import { useSearchParams } from "react-router-dom";
import { Truck, Video, AlertTriangle, Settings, Car, Map as MapIcon, User } from "lucide-react";
import { ServiceLayout } from "../components/ServiceLayout";
import { DriverVideoFeed } from "../components/DriverVideoFeed";
import { useAuth } from "../auth/AuthContext";

export const DriverServicePage: React.FC = () => {
    const [params] = useSearchParams();
    const { user } = useAuth();
    // Explicit ?driver= wins; otherwise a logged-in worker records under their own identity
    const driver = params.get("driver") || (user?.role === "worker" ? user.username : null);
    const name = params.get("name") || (user?.role === "worker" ? (user.full_name || user.username) : null);
    return (
        <ServiceLayout
            serviceName="Sistema ADAS"
            serviceIcon={<Truck className="text-orange-400" size={24} />}
            accentColor="bg-orange-500/20"
            navItems={[
                { to: "/services/driver", label: "Monitor Conductor", icon: Video },
                { to: "/services/driver/safe-driving", label: "Conducción Segura", icon: Car },
                { to: "/services/driver/fleet", label: "Flota", icon: MapIcon },
                { to: "/services/driver/alerts", label: "Alertas", icon: AlertTriangle },
                { to: "/services/driver/settings", label: "Configuración", icon: Settings },
            ]}
        >
            <div className="p-4 md:p-8">
                <div className="border-b border-hud-line pb-5 mb-6">
                    <span className="hud-label">▸ Monitorización en tiempo real</span>
                    <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight mt-2">MONITOR DE CONDUCTOR</h1>
                    <p className="text-hud-dim text-sm mt-2 max-w-2xl">
                        Detección de fatiga, microsueños y distracciones por visión por computador.
                    </p>
                </div>

                {driver && (
                    <div className="mb-6 flex items-center gap-3 hud-panel border-l-2 border-amber-400 p-3">
                        <User size={18} className="text-amber-400" />
                        <span className="font-mono uppercase tracking-wide text-sm">
                            Monitorizando conductor: <span className="text-amber-400">{name || driver}</span>
                        </span>
                        <span className="hud-label ml-auto">Los eventos se registran bajo {driver}</span>
                    </div>
                )}

                {/* Driver Video Feed Component with real-time analysis */}
                <DriverVideoFeed driverId={driver ?? undefined} />
            </div>
        </ServiceLayout>
    );
};
