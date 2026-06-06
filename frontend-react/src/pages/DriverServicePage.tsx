import React from "react";
import { Truck, Video, AlertTriangle, Settings, Car, Map as MapIcon } from "lucide-react";
import { ServiceLayout } from "../components/ServiceLayout";
import { DriverVideoFeed } from "../components/DriverVideoFeed";

export const DriverServicePage: React.FC = () => {
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

                {/* Driver Video Feed Component with real-time analysis */}
                <DriverVideoFeed />
            </div>
        </ServiceLayout>
    );
};
