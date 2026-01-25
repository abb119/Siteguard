import React from "react";
import { Link, NavLink } from "react-router-dom";
import {
    ShieldCheck,
    ArrowLeft,
    Video,
    Upload,
    History,
} from "lucide-react";

type NavItem = {
    to: string;
    label: string;
    icon: React.ElementType;
};

type ServiceLayoutProps = {
    children: React.ReactNode;
    serviceName: string;
    serviceIcon: React.ReactNode;
    accentColor: string;
    navItems: NavItem[];
};

export const ServiceLayout: React.FC<ServiceLayoutProps> = ({
    children,
    serviceName,
    serviceIcon,
    accentColor,
    navItems,
}) => {
    return (
        <div className="flex min-h-screen bg-slate-950 text-white font-sans">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col fixed h-full z-10">
                {/* Header */}
                <div className="p-4 border-b border-slate-800">
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm mb-4"
                    >
                        <ArrowLeft size={16} />
                        Volver al inicio
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${accentColor}`}>
                            {serviceIcon}
                        </div>
                        <div>
                            <h1 className="font-bold text-lg tracking-tight">{serviceName}</h1>
                            <p className="text-xs text-slate-500">SiteGuard</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end
                            className={({ isActive }) =>
                                [
                                    "flex items-center gap-3 w-full p-3 rounded-lg transition-all font-medium text-sm",
                                    isActive
                                        ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                        : "text-slate-400 hover:bg-slate-800 hover:text-white",
                                ].join(" ")
                            }
                        >
                            <item.icon size={18} />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center gap-3 text-slate-500 text-xs">
                        <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-1.5 rounded-lg">
                            <ShieldCheck className="text-white" size={16} />
                        </div>
                        <div>
                            <p className="font-semibold text-slate-400">SiteGuard v1.0</p>
                            <p>GPU Acelerado</p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 ml-64 min-h-screen">{children}</main>
        </div>
    );
};

// Pre-configured layouts for each service
export const PPELayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
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
        {children}
    </ServiceLayout>
);
