import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
    ShieldCheck,
    ArrowLeft,
    Video,
    Upload,
    History,
    Menu,
    X,
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
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-slate-950 text-white font-sans">
            {/* Mobile header bar */}
            <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 bg-slate-900 border-b border-slate-800 p-3 md:hidden">
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
                    aria-label="Toggle menu"
                >
                    {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
                <div className={`p-1.5 rounded-lg ${accentColor}`}>
                    {serviceIcon}
                </div>
                <h1 className="font-bold text-sm tracking-tight truncate">{serviceName}</h1>
            </div>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-20 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar — hidden on mobile by default, slide in when toggled */}
            <aside className={`
                w-64 bg-slate-900 border-r border-slate-800 flex flex-col fixed h-full z-20
                transition-transform duration-200 ease-in-out
                ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
                md:translate-x-0
            `}>
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
                            onClick={() => setSidebarOpen(false)}
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

            {/* Main Content — offset for sidebar on desktop, top bar on mobile */}
            <main className="flex-1 md:ml-64 min-h-screen pt-14 md:pt-0">{children}</main>
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
