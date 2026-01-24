import type { LucideIcon } from "lucide-react";
import { clsx } from "clsx";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  color?: "primary" | "secondary" | "danger" | "warning";
}

const COLOR_STYLES = {
  primary: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  secondary: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  danger: "bg-red-500/10 text-red-500 border-red-500/20",
  warning: "bg-amber-500/10 text-amber-500 border-amber-500/20",
} as const;

export const StatsCard = ({
  title,
  value,
  icon: Icon,
  trend,
  trendUp,
  color = "primary",
}: StatsCardProps) => {
  return (
    <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl shadow-lg hover:border-slate-600 transition-all">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-slate-400 text-sm font-medium uppercase tracking-wider">{title}</p>
          <h3 className="text-3xl font-bold text-white mt-2">{value}</h3>
        </div>
        <div className={clsx("p-3 rounded-lg border", COLOR_STYLES[color])}>
          <Icon size={24} />
        </div>
      </div>
      {trend && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <span className={clsx("font-bold", trendUp ? "text-emerald-400" : "text-red-400")}> {trendUp ? "+" : "-"} {trend}</span>
          <span className="text-slate-500">vs último lote</span>
        </div>
      )}
    </div>
  );
};
