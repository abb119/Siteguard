import React, { useRef, useEffect, useState, useCallback } from "react";
import { ShieldCheck, Truck, Camera, Upload, AlertTriangle, Users } from "lucide-react";
import { ServiceLayout } from "../components/ServiceLayout";
import { PPENavItems } from "./PPEServicePage";

// VITE_WS_URL trae el sufijo /ws/ppe-stream (usado por el módulo de EPP); hay
// que quitarlo para construir la URL de este stream, igual que en las demás
// páginas. Sin esto, en producción la URL quedaba malformada y no conectaba.
const WS_URL = (import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000").replace("/ws/ppe-stream", "");

type ProximityAlert = {
    type: string;
    level: "warning" | "danger";
    message: string;
    vehicle_type?: string;
    distance_px?: number;
};

type AnalysisResult = {
    detections: Array<{ box: number[]; class_name: string; confidence: number }>;
    people_count: number;
    vehicles_count: number;
    proximity_alerts: ProximityAlert[];
    closest_distance: number | null;
    risk_level: "low" | "medium" | "high";
    latency_ms: number;
};

export const VehicleControlPage: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const [activeMode, setActiveMode] = useState<"webcam" | "video" | null>(null);
    const [wsStatus, setWsStatus] = useState("Desconectado");
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [fps, setFps] = useState(0);
    const latestResultRef = useRef<AnalysisResult | null>(null);

    const frameCountRef = useRef(0);
    const lastFpsTimeRef = useRef(Date.now());

    // Connect WebSocket
    const connectWs = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(`${WS_URL}/ws/vehicle-control-stream`);

        ws.onopen = () => setWsStatus("Conectado ✓");
        ws.onclose = () => setWsStatus("Desconectado");
        ws.onerror = () => setWsStatus("Error de conexión");

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "result") {
                setResult(data);
                latestResultRef.current = data;

                // Calculate FPS
                frameCountRef.current++;
                const now = Date.now();
                if (now - lastFpsTimeRef.current >= 1000) {
                    setFps(frameCountRef.current);
                    frameCountRef.current = 0;
                    lastFpsTimeRef.current = now;
                }
            }
        };

        wsRef.current = ws;
    }, []);

    // Send frame to backend
    const sendFrame = useCallback(() => {
        const video = videoRef.current;
        const ws = wsRef.current;

        if (!video || !ws || ws.readyState !== WebSocket.OPEN) return;
        if (video.readyState < 2) return;

        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = 640;
        tempCanvas.height = 480;
        const ctx = tempCanvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, 640, 480);
        const dataUrl = tempCanvas.toDataURL("image/jpeg", 0.7);
        const base64 = dataUrl.split(",")[1];

        ws.send(JSON.stringify({
            image: base64,
            frame_id: Date.now(),
            timestamp: Date.now(),
            capture_width: 640,
            capture_height: 480,
            display_width: canvasRef.current?.clientWidth || 640,
            display_height: canvasRef.current?.clientHeight || 480,
        }));
    }, []);

    // Start webcam
    const startWebcam = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                setActiveMode("webcam");
                connectWs();
            }
        } catch (e) {
            console.error("Webcam error:", e);
        }
    }, [connectWs]);

    // Handle file upload
    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !videoRef.current) return;

        const url = URL.createObjectURL(file);
        videoRef.current.src = url;
        videoRef.current.loop = true;
        videoRef.current.play();
        setActiveMode("video");
        connectWs();
    }, [connectWs]);

    // Stop everything
    const stopEverything = useCallback(() => {
        if (videoRef.current) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream?.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
            videoRef.current.src = "";
        }
        wsRef.current?.close();
        setActiveMode(null);
        setResult(null);
    }, []);

    // Draw detections
    useEffect(() => {
        if (!activeMode) return;

        let renderId: number;
        let lastSendTime = 0;
        const SEND_INTERVAL = 100; // 10 fps

        const render = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");

            if (video && canvas && ctx && video.readyState >= 2) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Send frame periodically
                const now = Date.now();
                if (now - lastSendTime >= SEND_INTERVAL) {
                    sendFrame();
                    lastSendTime = now;
                }

                // Draw detections
                const r = latestResultRef.current;
                if (r?.detections) {
                    for (const det of r.detections) {
                        const [x1, y1, x2, y2] = det.box;

                        // Color: red for vehicles, blue for people
                        const isPerson = det.class_name === "person";
                        const color = isPerson ? "#2a9bb0" : "#ffb000";

                        ctx.strokeStyle = color;
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

                        ctx.fillStyle = color;
                        ctx.font = "bold 12px 'IBM Plex Mono', monospace";
                        ctx.fillText(det.class_name, x1, y1 - 5);
                    }

                    // Draw proximity lines between people and vehicles
                    if (r.proximity_alerts.length > 0 && r.risk_level !== "low") {
                        // Flash red overlay
                        ctx.fillStyle = r.risk_level === "high" ? "rgba(255, 59, 48, 0.2)" : "rgba(255, 176, 0, 0.1)";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                    }
                }
            }

            renderId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(renderId);
    }, [activeMode, sendFrame]);

    return (
        <ServiceLayout
            serviceName="Detección de EPP"
            serviceIcon={<ShieldCheck className="text-cyan-400" size={24} />}
            accentColor="bg-cyan-500/20"
            navItems={PPENavItems}
        >
            <div className="p-4 md:p-8">
                <div className="border-b border-hud-line pb-5 mb-6">
                    <span className="hud-label">▸ Proximidad persona-vehículo</span>
                    <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight uppercase mt-2 flex items-center gap-3">
                        <Truck className="text-amber-400" />
                        Control de Vehículos
                    </h1>
                    <p className="text-hud-dim text-sm mt-2 max-w-2xl">
                        Detecta cuando un trabajador está demasiado cerca de un vehículo industrial (carretilla, transpaleta, etc.).
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Video Feed */}
                    <div className="lg:col-span-2 hud-panel hud-corners overflow-hidden">
                        <div className="px-4 py-2 border-b border-hud-line flex items-center justify-between">
                            <span className="hud-label">Cámara</span>
                            <span className="font-mono text-xs text-hud-dim tnum">{fps} FPS · {result?.latency_ms?.toFixed(0) || 0}MS</span>
                        </div>
                        <div className="relative aspect-video bg-hud-bg">
                            <video ref={videoRef} className="hidden" playsInline muted loop />
                            <canvas ref={canvasRef} width={640} height={480} className="w-full h-full object-contain" />

                            {!activeMode && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="flex gap-3">
                                        <button onClick={startWebcam} className="flex items-center gap-2 px-4 py-2 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors font-mono uppercase tracking-widest text-xs">
                                            <Camera size={16} /> Webcam
                                        </button>
                                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-amber-400 text-hud-bg hover:bg-amber-300 transition-colors font-mono uppercase tracking-widest text-xs">
                                            <Upload size={16} /> Vídeo
                                        </button>
                                    </div>
                                </div>
                            )}
                            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                        </div>
                        <div className="px-4 py-2 border-t border-hud-line font-mono text-xs flex justify-between items-center">
                            <span className="flex items-center gap-2 text-hud-dim">
                                <span className={`hud-dot inline-block ${wsStatus.startsWith("Conectado") ? "bg-phosphor-400" : "bg-hud-dim"}`} />
                                {wsStatus}
                            </span>
                            {activeMode && (
                                <button onClick={stopEverything} className="text-alarm-400 hover:text-alarm-300 uppercase tracking-widest">
                                    Detener
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Status Panel */}
                    <div className="space-y-4">
                        {/* Detection Stats */}
                        <div className="hud-panel p-6">
                            <h3 className="hud-label mb-4">Detecciones</h3>
                            <div className="grid grid-cols-2 gap-px bg-hud-line border border-hud-line">
                                <div className="text-center bg-hud-panel p-4">
                                    <Users className="mx-auto text-steel-400 mb-2" size={28} />
                                    <div className="text-3xl font-mono font-bold tnum">{result?.people_count ?? 0}</div>
                                    <div className="hud-label mt-1">Trabajadores</div>
                                </div>
                                <div className="text-center bg-hud-panel p-4">
                                    <Truck className="mx-auto text-amber-400 mb-2" size={28} />
                                    <div className="text-3xl font-mono font-bold tnum">{result?.vehicles_count ?? 0}</div>
                                    <div className="hud-label mt-1">Vehículos</div>
                                </div>
                            </div>
                        </div>

                        {/* Risk Level */}
                        <div className={`hud-panel p-6 text-center border-l-2 ${result?.risk_level === "high" ? "border-alarm-400" :
                            result?.risk_level === "medium" ? "border-amber-400" : "border-phosphor-400"
                            }`}>
                            <div className={`text-2xl font-mono font-bold uppercase tracking-widest ${result?.risk_level === "high" ? "text-alarm-400" :
                                result?.risk_level === "medium" ? "text-amber-400" : "text-phosphor-400"
                                }`}>
                                {result?.risk_level === "high" ? "Peligro" :
                                    result?.risk_level === "medium" ? "Precaución" : "Seguro"}
                            </div>
                        </div>

                        {/* Alerts List */}
                        <div className="hud-panel p-4">
                            <h3 className="hud-label mb-3">Alertas de proximidad</h3>
                            {result?.proximity_alerts && result.proximity_alerts.length > 0 ? (
                                <div className="space-y-2">
                                    {result.proximity_alerts.map((alert, i) => (
                                        <div key={i} className={`border-l-2 px-3 py-2 text-sm font-mono ${alert.level === "danger"
                                            ? "border-alarm-400 text-alarm-400 animate-pulse"
                                            : "border-amber-400 text-amber-400"
                                            }`}>
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle size={14} />
                                                <span>{alert.message}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="hud-label">
                                    Distancia segura entre trabajadores y vehículos
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </ServiceLayout>
    );
};
