import React, { useState } from "react";
import { Truck, Video, Car, AlertTriangle, Settings, Save, RotateCcw, Check } from "lucide-react";
import { ServiceLayout } from "../components/ServiceLayout";
import {
    type DmsConfig, DEFAULT_DMS_CONFIG, loadDmsConfig, saveDmsConfig, resetDmsConfig,
} from "../utils/dmsConfig";

const NAV = [
    { to: "/services/driver", label: "Monitor Conductor", icon: Video },
    { to: "/services/driver/safe-driving", label: "Conducción Segura", icon: Car },
    { to: "/services/driver/alerts", label: "Alertas", icon: AlertTriangle },
    { to: "/services/driver/settings", label: "Configuración", icon: Settings },
];

type Field = {
    key: keyof DmsConfig;
    label: string;
    min: number;
    max: number;
    step: number;
    unit?: string;
    percent?: boolean;
    help: string;
};

const FIELDS: Field[] = [
    { key: "calibration_seconds", label: "Calibración", min: 2, max: 10, step: 0.5, unit: "s", help: "Segundos de calibración de la línea base ocular al iniciar." },
    { key: "ear_ratio", label: "Sensibilidad ocular", min: 0.5, max: 0.9, step: 0.01, help: "Umbral de ojo cerrado = base × ratio. Más alto = más sensible." },
    { key: "perclos_drowsy", label: "PERCLOS somnolencia", min: 0.05, max: 0.4, step: 0.01, percent: true, help: "% de tiempo con ojos cerrados que dispara la alerta de somnolencia." },
    { key: "microsleep_sec", label: "Microsueño", min: 0.3, max: 2.0, step: 0.1, unit: "s", help: "Ojos cerrados de forma continua durante este tiempo = microsueño." },
    { key: "mar_yawn", label: "Bostezo (MAR)", min: 0.4, max: 1.0, step: 0.05, help: "Apertura de boca que cuenta como bostezo." },
    { key: "yaw_distract_deg", label: "Giro de cabeza", min: 8, max: 45, step: 1, unit: "°", help: "Grados de giro lateral sostenido = mirada desviada." },
    { key: "pitch_down_deg", label: "Mirar hacia abajo", min: 5, max: 45, step: 1, unit: "°", help: "Inclinación hacia abajo sostenida = móvil en el regazo." },
    { key: "distract_min_sec", label: "Duración distracción", min: 0.4, max: 3.0, step: 0.1, unit: "s", help: "Tiempo mínimo de mirada desviada antes de alertar." },
    { key: "lookdown_min_sec", label: "Duración mirar abajo", min: 0.4, max: 3.0, step: 0.1, unit: "s", help: "Tiempo mínimo mirando hacia abajo antes de alertar." },
];

const fmt = (f: Field, v: number) =>
    f.percent ? `${Math.round(v * 100)}%` : `${Number.isInteger(v) ? v : v.toFixed(2)}${f.unit ?? ""}`;

export const DriverSettingsPage: React.FC = () => {
    const [cfg, setCfg] = useState<DmsConfig>(loadDmsConfig());
    const [saved, setSaved] = useState(false);

    const update = (key: keyof DmsConfig, value: number) => {
        setCfg((c) => ({ ...c, [key]: value }));
        setSaved(false);
    };

    const onSave = () => {
        saveDmsConfig(cfg);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    const onReset = () => {
        resetDmsConfig();
        setCfg({ ...DEFAULT_DMS_CONFIG });
        setSaved(false);
    };

    return (
        <ServiceLayout serviceName="Sistema ADAS" serviceIcon={<Truck size={22} />} accentColor="amber" navItems={NAV}>
            <div className="p-4 md:p-8 max-w-4xl">
                {/* Header */}
                <div className="flex flex-wrap items-end justify-between gap-4 border-b border-hud-line pb-5 mb-6">
                    <div>
                        <span className="hud-label">▸ Umbrales de detección</span>
                        <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight mt-2">CONFIGURACIÓN</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onReset}
                            className="flex items-center gap-2 px-4 py-2 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors font-mono uppercase tracking-widest text-xs"
                        >
                            <RotateCcw size={14} /> Restablecer
                        </button>
                        <button
                            onClick={onSave}
                            className="flex items-center gap-2 px-4 py-2 bg-amber-400 text-hud-bg hover:bg-amber-300 transition-colors font-mono uppercase tracking-widest text-xs"
                        >
                            {saved ? <Check size={14} /> : <Save size={14} />}
                            {saved ? "Guardado" : "Guardar"}
                        </button>
                    </div>
                </div>

                <p className="hud-label mb-8 leading-relaxed">
                    Los cambios se aplican al <span className="text-amber-400">(re)abrir el Monitor de Conductor</span>.
                    Se guardan en este navegador y se envían a la sesión al conectar.
                </p>

                {/* Sliders */}
                <div className="grid md:grid-cols-2 gap-px bg-hud-line border border-hud-line">
                    {FIELDS.map((f) => {
                        const v = cfg[f.key];
                        const isDefault = v === DEFAULT_DMS_CONFIG[f.key];
                        return (
                            <div key={f.key} className="bg-hud-panel p-5">
                                <div className="flex items-baseline justify-between mb-1">
                                    <span className="font-mono uppercase tracking-wide text-sm">{f.label}</span>
                                    <span className="font-mono text-amber-400 tnum">{fmt(f, v)}</span>
                                </div>
                                <input
                                    type="range"
                                    min={f.min}
                                    max={f.max}
                                    step={f.step}
                                    value={v}
                                    onChange={(e) => update(f.key, parseFloat(e.target.value))}
                                    className="w-full accent-amber-400 my-2 cursor-pointer"
                                />
                                <div className="flex items-center justify-between">
                                    <p className="text-hud-dim text-xs leading-snug max-w-[80%]">{f.help}</p>
                                    {!isDefault && (
                                        <span className="hud-label text-steel-300 shrink-0">def {fmt(f, DEFAULT_DMS_CONFIG[f.key])}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </ServiceLayout>
    );
};
