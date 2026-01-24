import React from "react";
import { LayoutDashboard, ShieldCheck, Upload, Video, Truck } from "lucide-react";
import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Subir video corto", icon: Upload },
  { to: "/driver", label: "Driver demo", icon: Truck },
  { to: "/lab", label: "Análisis en tiempo real (WS)", icon: Video },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <div className="flex min-h-screen bg-background text-white font-sans">
      <aside className="w-64 bg-surface border-r border-slate-700 flex flex-col fixed h-full z-10">
        <div className="p-6 flex items-center gap-3 border-b border-slate-700">
          <div className="bg-primary/20 p-2 rounded-lg">
            <ShieldCheck className="text-primary" size={28} />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight">SiteGuard PPE</h1>
            <p className="text-xs text-slate-400">Demo pública</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <NavItem to="/" icon={LayoutDashboard} label="Resumen" />
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700 text-xs text-slate-500 space-y-1">
          <p className="font-semibold text-slate-300">Límites:</p>
          <p>• 1 job en paralelo</p>
          <p>• 10 s · 20 MB · CPU-only</p>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-8 overflow-y-auto">{children}</main>
    </div>
  );
};

const NavItem = ({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Upload;
  label: string;
}) => (
  <NavLink
    to={to}
    end
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
