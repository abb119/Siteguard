import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Gauge, Cpu, Target } from "lucide-react";

// ── Static evaluation results (reproducible via ml/benchmark.py + evaluate.py) ──
const LATENCY = [
    { model: "PPE (best.pt)", imgsz: 640, cpu: 428.7, cpuFps: 2.3, gpu: 21.6, gpuFps: 46.4 },
    { model: "PPE fallback (6 cls)", imgsz: 640, cpu: 85.4, cpuFps: 11.7, gpu: 13.2, gpuFps: 75.6 },
    { model: "Objetos yolov8n (móvil)", imgsz: 320, cpu: 46.3, cpuFps: 21.6, gpu: 12.9, gpuFps: 77.5 },
    { model: "Somnolencia (clasif. antiguo)", imgsz: 640, cpu: 787.9, cpuFps: 1.3, gpu: 50.2, gpuFps: 19.9 },
    { model: "Pose (ergonomía)", imgsz: 640, cpu: 97.9, cpuFps: 10.2, gpu: 18.2, gpuFps: 55.0 },
    { model: "Cinturón", imgsz: 320, cpu: 41.0, cpuFps: 24.4, gpu: 12.2, gpuFps: 82.1 },
    { model: "MediaPipe FaceMesh (DMS v2)", imgsz: null as number | null, cpu: 5.7, cpuFps: 175.2, gpu: null as number | null, gpuFps: null as number | null },
];

const OVERALL = [
    { label: "mAP@50", value: "0.525", icon: Target },
    { label: "mAP@50-95", value: "0.304", icon: Target },
    { label: "Precision", value: "0.718", icon: Gauge },
    { label: "Recall", value: "0.496", icon: Gauge },
];

const PERCLASS = [
    { c: "Hardhat", n: 110, p: 0.98, r: 0.71, m50: 0.82, m: 0.52 },
    { c: "Mask", n: 28, p: 0.95, r: 0.57, m50: 0.65, m: 0.35 },
    { c: "NO-Hardhat", n: 41, p: 0.55, r: 0.44, m50: 0.34, m: 0.12 },
    { c: "NO-Mask", n: 79, p: 0.42, r: 0.35, m50: 0.26, m: 0.05 },
    { c: "NO-Safety Vest", n: 90, p: 0.70, r: 0.44, m50: 0.45, m: 0.15 },
    { c: "Person", n: 174, p: 0.83, r: 0.62, m50: 0.68, m: 0.49 },
    { c: "Safety Cone", n: 92, p: 0.58, r: 0.01, m50: 0.09, m: 0.04 },
    { c: "Safety Vest", n: 61, p: 0.68, r: 0.68, m50: 0.68, m: 0.38 },
    { c: "machinery", n: 44, p: 0.79, r: 0.73, m50: 0.77, m: 0.67 },
    { c: "vehicle", n: 41, p: 0.71, r: 0.42, m50: 0.53, m: 0.28 },
];

const COMPARISON: Array<[string, string, string]> = [
    ["Somnolencia / PERCLOS / microsueño", "✅", "✅ explicable"],
    ["Distracción / mirar abajo / móvil", "✅", "✅"],
    ["Cinturón", "parte", "✅"],
    ["Colisión frontal / peatón (ADAS)", "✅", "✅"],
    ["EPP + ergonomía + proximidad vehículos", "❌", "✅ diferencial"],
    ["Robustez (gafas, oclusión, poca luz)", "parcial", "✅ diferencial"],
    ["Telemetría GPS/IMU, visión IR", "✅ (hardware)", "❌"],
    ["On-premise / sin nube, abierto", "❌ (SaaS)", "✅ diferencial"],
];

const barColor = (v: number) => (v >= 0.6 ? "bg-phosphor-400" : v >= 0.3 ? "bg-amber-400" : "bg-alarm-400");
const fpsColor = (v: number | null) => (v == null ? "text-hud-dim" : v >= 24 ? "text-phosphor-400" : v >= 10 ? "text-amber-400" : "text-alarm-400");

export const MetricsPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-grid text-hud-bone font-sans">
            {/* Top bar */}
            <header className="border-b border-hud-line bg-hud-bg/80 backdrop-blur-sm">
                <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
                    <Link to="/" className="flex items-center gap-2 text-hud-dim hover:text-amber-400 transition-colors hud-label">
                        <ArrowLeft size={14} /> Inicio
                    </Link>
                    <div className="flex items-center gap-2">
                        <div className="border border-amber-400 text-amber-400 p-1.5"><ShieldCheck size={16} /></div>
                        <span className="font-mono font-semibold tracking-[0.2em] text-sm">SITEGUARD</span>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">
                {/* Hero */}
                <section>
                    <span className="hud-label">▸ Informe técnico · Evaluación cuantitativa</span>
                    <h1 className="font-mono text-3xl md:text-5xl font-bold tracking-tight uppercase mt-3 mb-4">
                        Evaluación / Métricas
                    </h1>
                    <p className="text-hud-dim max-w-3xl border-l-2 border-hud-line pl-5">
                        Resultados reales medidos sobre el modelo de EPP desplegado (82 imágenes de
                        test, 760 instancias) y benchmark de latencia en NVIDIA RTX 2070.
                        Reproducible con <span className="font-mono text-amber-400">ml/benchmark.py</span> y
                        <span className="font-mono text-amber-400"> ml/evaluate.py</span>.
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-4 mt-8 border border-hud-line divide-x divide-y md:divide-y-0 divide-hud-line">
                        {OVERALL.map((o) => (
                            <div key={o.label} className="bg-hud-panel p-5">
                                <div className="flex items-center gap-2 mb-2"><o.icon size={14} className="text-amber-400" /><span className="hud-label">{o.label}</span></div>
                                <div className="font-mono text-3xl md:text-4xl font-bold text-amber-400 tnum">{o.value}</div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Latency */}
                <section>
                    <div className="flex items-center gap-3 border-b border-hud-line pb-4 mb-6">
                        <Cpu size={18} className="text-amber-400" />
                        <h2 className="font-mono text-xl md:text-2xl font-bold tracking-tight uppercase">Latencia · CPU vs GPU</h2>
                    </div>
                    <div className="hud-panel overflow-x-auto">
                        <table className="w-full text-sm font-mono">
                            <thead>
                                <tr className="border-b border-hud-line hud-label">
                                    <th className="text-left p-3">Modelo</th>
                                    <th className="text-right p-3">imgsz</th>
                                    <th className="text-right p-3">CPU ms</th>
                                    <th className="text-right p-3">CPU fps</th>
                                    <th className="text-right p-3">GPU ms</th>
                                    <th className="text-right p-3">GPU fps</th>
                                </tr>
                            </thead>
                            <tbody>
                                {LATENCY.map((m) => (
                                    <tr key={m.model} className="border-b border-hud-line/50 last:border-0 hover:bg-hud-bg">
                                        <td className="p-3 text-hud-bone">{m.model}</td>
                                        <td className="p-3 text-right text-hud-dim tnum">{m.imgsz ?? "—"}</td>
                                        <td className="p-3 text-right text-hud-dim tnum">{m.cpu}</td>
                                        <td className={`p-3 text-right tnum ${fpsColor(m.cpuFps)}`}>{m.cpuFps}</td>
                                        <td className="p-3 text-right text-hud-dim tnum">{m.gpu ?? "n/a"}</td>
                                        <td className={`p-3 text-right tnum ${fpsColor(m.gpuFps)}`}>{m.gpuFps ?? "n/a"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-hud-dim text-sm mt-3">
                        La GPU acelera EPP <span className="text-phosphor-400">×19</span> (2.3 → 46 fps). El núcleo del
                        DMS v2 (MediaPipe) corre a <span className="text-phosphor-400">175 fps en CPU</span>: ~137× más
                        rápido que el clasificador de somnolencia antiguo (788 ms) y, además, explicable.
                    </p>
                </section>

                {/* Per-class accuracy */}
                <section>
                    <div className="flex items-center gap-3 border-b border-hud-line pb-4 mb-6">
                        <Target size={18} className="text-amber-400" />
                        <h2 className="font-mono text-xl md:text-2xl font-bold tracking-tight uppercase">Precisión por clase (EPP)</h2>
                    </div>
                    <div className="hud-panel overflow-x-auto">
                        <table className="w-full text-sm font-mono">
                            <thead>
                                <tr className="border-b border-hud-line hud-label">
                                    <th className="text-left p-3">Clase</th>
                                    <th className="text-right p-3">Inst.</th>
                                    <th className="text-right p-3">P</th>
                                    <th className="text-right p-3">R</th>
                                    <th className="text-left p-3 w-40">mAP@50</th>
                                </tr>
                            </thead>
                            <tbody>
                                {PERCLASS.map((c) => (
                                    <tr key={c.c} className="border-b border-hud-line/50 last:border-0 hover:bg-hud-bg">
                                        <td className="p-3 text-hud-bone">{c.c}</td>
                                        <td className="p-3 text-right text-hud-dim tnum">{c.n}</td>
                                        <td className="p-3 text-right text-hud-dim tnum">{c.p.toFixed(2)}</td>
                                        <td className="p-3 text-right text-hud-dim tnum">{c.r.toFixed(2)}</td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-1.5 bg-hud-bg">
                                                    <div className={`h-1.5 ${barColor(c.m50)}`} style={{ width: `${c.m50 * 100}%` }} />
                                                </div>
                                                <span className="text-hud-dim tnum w-9 text-right">{c.m50.toFixed(2)}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Figures */}
                <section>
                    <div className="flex items-center gap-3 border-b border-hud-line pb-4 mb-6">
                        <h2 className="font-mono text-xl md:text-2xl font-bold tracking-tight uppercase">Gráficas</h2>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                        <figure className="hud-panel hud-corners p-4">
                            <figcaption className="hud-label mb-3">Matriz de confusión</figcaption>
                            <img src="/eval/confusion-matrix.png" alt="Matriz de confusión" className="w-full bg-white" />
                        </figure>
                        <figure className="hud-panel hud-corners p-4">
                            <figcaption className="hud-label mb-3">Curva Precision-Recall</figcaption>
                            <img src="/eval/pr-curve.png" alt="Curva PR" className="w-full bg-white" />
                        </figure>
                    </div>
                </section>

                {/* Competitor comparison */}
                <section>
                    <div className="flex items-center gap-3 border-b border-hud-line pb-4 mb-6">
                        <h2 className="font-mono text-xl md:text-2xl font-bold tracking-tight uppercase">Comparativa vs competencia</h2>
                    </div>
                    <div className="hud-panel overflow-x-auto">
                        <table className="w-full text-sm font-mono">
                            <thead>
                                <tr className="border-b border-hud-line hud-label">
                                    <th className="text-left p-3">Capacidad</th>
                                    <th className="text-left p-3">Samsara/Motive/Netradyne…</th>
                                    <th className="text-left p-3">SiteGuard</th>
                                </tr>
                            </thead>
                            <tbody>
                                {COMPARISON.map(([cap, comp, sg]) => (
                                    <tr key={cap} className="border-b border-hud-line/50 last:border-0 hover:bg-hud-bg">
                                        <td className="p-3 text-hud-bone">{cap}</td>
                                        <td className="p-3 text-hud-dim">{comp}</td>
                                        <td className={`p-3 ${sg.includes("diferencial") ? "text-phosphor-400" : sg.startsWith("❌") ? "text-alarm-400" : "text-hud-bone"}`}>{sg}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <footer className="border-t border-hud-line pt-6 hud-label">
                    Dataset: Construction Site Safety (test, 82 img) · Hardware: NVIDIA RTX 2070 ·
                    Reproducible: ml/download_test_set.py → ml/evaluate.py · Informe completo: docs/INFORME_TECNICO.md
                </footer>
            </main>
        </div>
    );
};
