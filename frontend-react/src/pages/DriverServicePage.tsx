import React from "react";
import { Truck, Video, AlertTriangle, Settings, Car } from "lucide-react";
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
                { to: "/services/driver/alerts", label: "Alertas", icon: AlertTriangle },
                { to: "/services/driver/settings", label: "Configuración", icon: Settings },
            ]}
        >
            <div className="p-4 md:p-8">
                <div className="mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold mb-2">Sistema ADAS - Conducción Segura</h1>
                    <p className="text-slate-400">
                        Monitoreo en tiempo real de fatiga y distracciones del conductor. Detecta somnolencia, uso de teléfono y más.
                    </p>
                </div>

                {/* Driver Video Feed Component with real-time analysis */}
                <DriverVideoFeed />
            </div>
        </ServiceLayout>
    );
};
