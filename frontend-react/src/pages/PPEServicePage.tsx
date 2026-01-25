import React from "react";
import { ShieldCheck } from "lucide-react";
import { VideoFeed } from "../components/VideoFeed";
import { ServiceLayout } from "../components/ServiceLayout";
import { Video, Upload, History } from "lucide-react";

export const PPEServicePage: React.FC = () => {
    return (
        <ServiceLayout
            serviceName="Detección de EPP"
            serviceIcon={<ShieldCheck className="text-cyan-400" size={24} />}
            accentColor="bg-cyan-500/20"
            navItems={[
                { to: "/services/ppe", label: "Análisis en Vivo", icon: Video },
                { to: "/services/ppe/upload", label: "Subir Video", icon: Upload },
                { to: "/services/ppe/history", label: "Historial", icon: History },
            ]}
        >
            <div className="p-8">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2">Detección de EPP en Tiempo Real</h1>
                    <p className="text-slate-400">
                        Monitorea el uso correcto de Equipos de Protección Personal: cascos, chalecos, guantes, gafas y más.
                    </p>
                </div>

                {/* Video Feed Component - Existing functionality */}
                <VideoFeed />
            </div>
        </ServiceLayout>
    );
};
