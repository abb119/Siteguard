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
            <div className="p-8">
                <h1 className="text-3xl font-bold mb-6">Subir Video para Análisis</h1>
                <VideoFeed initialMode="file" />
            </div>
        </ServiceLayout>
    );
};
