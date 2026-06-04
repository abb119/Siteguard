import React from "react";
import { PPENavItems } from "./PPEServicePage"; // We will export nav items to reuse
import { VideoFeed } from "../components/VideoFeed";
import { ServiceLayout } from "../components/ServiceLayout";
import { ShieldCheck } from "lucide-react";

export const PPEUploadPage: React.FC = () => {
    return (
        <ServiceLayout
            serviceName="Detección de EPP"
            serviceIcon={<ShieldCheck className="text-cyan-400" size={24} />}
            accentColor="bg-cyan-500/20"
            navItems={PPENavItems}
        >
            <div className="p-4 md:p-8">
                <div className="border-b border-hud-line pb-5 mb-6">
                    <span className="hud-label">▸ Análisis de vídeo</span>
                    <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight uppercase mt-2">Subir Vídeo</h1>
                </div>
                <VideoFeed initialMode="file" />
            </div>
        </ServiceLayout>
    );
};
