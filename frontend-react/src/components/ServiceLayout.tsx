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
    navItems,
}) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex min-h-screen bg-grid text-hud-bone font-sans">
            {/* Mobile header bar */}
            <div className="fixed top-0 left-0 right-0 z-30 flex items-center gap-3 bg-hud-panel border-b border-hud-line p-3 md:hidden">
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="p-2 border border-hud-line hover:border-amber-400 transition-colors"
                    aria-label="Toggle menu"
                >
                    {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
                <span className="text-amber-400">{serviceIcon}</span>
                <h1 className="font-mono uppercase tracking-wider text-sm truncate">{serviceName}</h1>
            </div>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/70 z-20 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
                w-64 bg-hud-panel border-r border-hud-line flex flex-col fixed h-full z-20
                transition-transform duration-200 ease-in-out
                ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
                md:translate-x-0
            `}
            >
                {/* Header */}
                <div className="relative p-4 border-b border-hud-line hud-corners">
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-hud-dim hover:text-amber-400 transition-colors text-xs font-mono uppercase tracking-widest mb-5"
                    >
                        <ArrowLeft size={14} />
                        Volver
                    </Link>
                    <div className="flex items-center gap-3">
                        <div className="border border-amber-400/40 text-amber-400 p-2">{serviceIcon}</div>
                        <div>
                            <h1 className="font-mono font-semibold uppercase tracking-wide text-base leading-tight">
                                {serviceName}
                            </h1>
                            <p className="hud-label mt-1">SiteGuard · Módulo</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-3 space-y-1">
                    <p className="hud-label px-2 py-2">Navegación</p>
                    {navItems.map((item, i) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end
                            onClick={() => setSidebarOpen(false)}
                            className={({ isActive }) =>
                                [
                                    "group flex items-center gap-3 w-full px-3 py-2.5 font-mono uppercase tracking-wider text-xs transition-all border-l-2",
                                    isActive
                                        ? "bg-amber-400/10 text-amber-400 border-amber-400"
                                        : "text-hud-dim border-transparent hover:text-hud-bone hover:border-hud-line",
                                ].join(" ")
                            }
                        >
                            <span className="text-[10px] text-hud-dim group-hover:text-current tnum">
                                {String(i + 1).padStart(2, "0")}
                            </span>
                            <item.icon size={16} />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-hud-line">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="hud-dot bg-phosphor-400 text-phosphor-400 rounded-full inline-block animate-pulse" />
                        <span className="hud-label text-phosphor-400">Online · GPU</span>
                    </div>
                    <div className="flex items-center gap-2 text-hud-dim">
                        <ShieldCheck size={14} className="text-amber-400" />
                        <span className="font-mono text-xs tracking-wide">SITEGUARD v1.0</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 md:ml-64 min-h-screen pt-14 md:pt-0">{children}</main>
        </div>
    );
};

// Pre-configured layouts for each service
export const PPELayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <ServiceLayout
        serviceName="Detección de EPP"
        serviceIcon={<ShieldCheck size={22} />}
        accentColor="amber"
        navItems={[
            { to: "/services/ppe", label: "Análisis en Vivo", icon: Video },
            { to: "/services/ppe/upload", label: "Subir Video", icon: Upload },
            { to: "/services/ppe/history", label: "Historial", icon: History },
        ]}
    >
        {children}
    </ServiceLayout>
);
