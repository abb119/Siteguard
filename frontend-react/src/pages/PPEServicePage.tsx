import React from "react";
import { ShieldCheck } from "lucide-react";
import { VideoFeed } from "../components/VideoFeed";
import { ServiceLayout } from "../components/ServiceLayout";
import { Video, History, Activity, Truck } from "lucide-react";

export const PPENavItems = [
    { to: "/services/ppe", label: "Detección EPP", icon: Video },
    { to: "/services/ppe/ergonomics", label: "Ergonomía", icon: Activity },
    { to: "/services/ppe/vehicle-control", label: "Control Vehículos", icon: Truck },
    { to: "/services/ppe/history", label: "Historial", icon: History },
];
export const PPEServicePage: React.FC = () => {
    return (
        <ServiceLayout
            serviceName="Detección de EPP"
            serviceIcon={<ShieldCheck className="text-cyan-400" size={24} />}
            accentColor="bg-cyan-500/20"
            navItems={PPENavItems}
        >
            <div className="p-4 md:p-8">
                <div className="border-b border-hud-line pb-5 mb-6">
                    <span className="hud-label">▸ Visión por computador · Tiempo real</span>
                    <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight uppercase mt-2">Detección de EPP</h1>
                    <p className="text-hud-dim text-sm mt-2 max-w-2xl">
                        Verifica el uso correcto de Equipos de Protección Personal: cascos, chalecos, guantes, gafas y más.
                    </p>
                </div>

                {/* Video Feed Component - Existing functionality */}
                <VideoFeed />
            </div>
        </ServiceLayout>
    );
};
