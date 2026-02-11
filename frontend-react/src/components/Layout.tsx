import React, { useState } from "react";
import { LayoutDashboard, ShieldCheck, Upload, Video, Truck, Menu, X } from "lucide-react";
import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Subir video corto", icon: Upload },
  { to: "/driver", label: "Driver demo", icon: Truck },
  { to: "/lab", label: "Análisis en tiempo real (WS)", icon: Video },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background text-white font-sans">
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 h-14 bg-surface border-b border-slate-700 flex items-center px-4 z-30 md:hidden">
        <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-slate-700 rounded-lg">
          <Menu size={22} />
        </button>
        <div className="ml-3 flex items-center gap-2">
          <ShieldCheck className="text-primary" size={20} />
          <span className="font-bold text-lg">SiteGuard PPE</span>
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed h-full z-40 bg-surface border-r border-slate-700 flex flex-col w-64
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
        `}
      >
        <div className="p-6 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg">
              <ShieldCheck className="text-primary" size={28} />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight">SiteGuard PPE</h1>
              <p className="text-xs text-slate-400">Demo pública</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="p-1 hover:bg-slate-700 rounded md:hidden">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <NavItem to="/" icon={LayoutDashboard} label="Resumen" onClick={() => setSidebarOpen(false)} />
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} onClick={() => setSidebarOpen(false)} />
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-300">Límites:</p>
          <p>• 1 job en paralelo</p>
          <p>• 10 s · 20 MB · CPU-only</p>
        </div>
      </aside>

      <main className="flex-1 md:ml-64 p-4 md:p-8 pt-16 md:pt-8 overflow-y-auto min-h-screen">{children}</main>
    </div>
  );
};

const NavItem = ({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string;
  icon: typeof Upload;
  label: string;
  onClick?: () => void;
}) => (
  <NavLink
    to={to}
    end
    onClick={onClick}
    className={({ isActive }) =>
      [
        "flex items-center gap-3 w-full p-3 rounded-lg transition-all font-medium",
        isActive
          ? "bg-primary/10 text-primary border border-primary/20"
          : "text-slate-400 hover:bg-slate-700 hover:text-white",
      ].join(" ")
    }
  >
    <Icon size={20} />
    <span>{label}</span>
  </NavLink>
);
