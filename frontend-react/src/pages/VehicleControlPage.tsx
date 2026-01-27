import React, { useRef, useEffect, useState, useCallback } from "react";
import { ShieldCheck, Truck, Camera, Upload, AlertTriangle, Users } from "lucide-react";
import { ServiceLayout } from "../components/ServiceLayout";
import { PPENavItems } from "./PPEServicePage";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000";

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
                        const color = isPerson ? "#3b82f6" : "#f59e0b";

                        ctx.strokeStyle = color;
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

                        ctx.fillStyle = color;
                        ctx.font = "bold 12px Inter";
                        ctx.fillText(det.class_name, x1, y1 - 5);
                    }

                    // Draw proximity lines between people and vehicles
                    if (r.proximity_alerts.length > 0 && r.risk_level !== "low") {
                        // Flash red overlay
                        ctx.fillStyle = r.risk_level === "high" ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.1)";
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
            <div className="p-8">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
                        <Truck className="text-orange-400" />
                        Control de Vehículos
                    </h1>
                    <p className="text-slate-400">
                        Detecta cuando un trabajador está demasiado cerca de un vehículo industrial (carretilla, transpaleta, etc.).
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Video Feed */}
                    <div className="lg:col-span-2 bg-slate-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-2 bg-orange-600/30 flex items-center justify-between">
                            <span className="font-semibold">📹 Cámara</span>
                            <span className="text-xs text-slate-300">{fps} fps · {result?.latency_ms?.toFixed(0) || 0}ms</span>
                        </div>
                        <div className="relative aspect-video bg-slate-900">
                            <video ref={videoRef} className="hidden" playsInline muted loop />
                            <canvas ref={canvasRef} width={640} height={480} className="w-full h-full object-contain" />

                            {!activeMode && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="flex gap-3">
                                        <button onClick={startWebcam} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
                                            <Camera size={18} /> Webcam
                                        </button>
                                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg">
                                            <Upload size={18} /> Video
                                        </button>
                                    </div>
                                </div>
                            )}
                            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                        </div>
                        <div className="px-4 py-2 text-sm text-slate-400 flex justify-between">
                            <span>{wsStatus}</span>
                            {activeMode && (
                                <button onClick={stopEverything} className="text-red-400 hover:text-red-300">
                                    Detener
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Status Panel */}
                    <div className="space-y-4">
                        {/* Detection Stats */}
                        <div className="bg-slate-800 rounded-xl p-6">
                            <h3 className="text-lg font-semibold mb-4">Detecciones</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="text-center">
                                    <Users className="mx-auto text-blue-400 mb-2" size={32} />
                                    <div className="text-3xl font-bold">{result?.people_count ?? 0}</div>
                                    <div className="text-xs text-slate-400">Trabajadores</div>
                                </div>
                                <div className="text-center">
                                    <Truck className="mx-auto text-orange-400 mb-2" size={32} />
                                    <div className="text-3xl font-bold">{result?.vehicles_count ?? 0}</div>
                                    <div className="text-xs text-slate-400">Vehículos</div>
                                </div>
                            </div>
                        </div>

                        {/* Risk Level */}
                        <div className={`rounded-xl p-6 text-center ${result?.risk_level === "high" ? "bg-red-500/20 border border-red-500/50" :
                                result?.risk_level === "medium" ? "bg-orange-500/20 border border-orange-500/50" :
                                    "bg-green-500/20 border border-green-500/50"
                            }`}>
                            <div className={`text-2xl font-bold ${result?.risk_level === "high" ? "text-red-400" :
                                    result?.risk_level === "medium" ? "text-orange-400" : "text-green-400"
                                }`}>
                                {result?.risk_level === "high" ? "⚠️ PELIGRO" :
                                    result?.risk_level === "medium" ? "⚡ PRECAUCIÓN" : "✓ SEGURO"}
                            </div>
                        </div>

                        {/* Alerts List */}
                        <div className="bg-slate-800 rounded-xl p-4">
                            <h3 className="font-semibold mb-3">Alertas de Proximidad</h3>
                            {result?.proximity_alerts && result.proximity_alerts.length > 0 ? (
                                <div className="space-y-2">
                                    {result.proximity_alerts.map((alert, i) => (
                                        <div key={i} className={`rounded-lg px-3 py-2 text-sm ${alert.level === "danger"
                                                ? "bg-red-500/20 border border-red-500/50 text-red-400 animate-pulse"
                                                : "bg-orange-500/20 border border-orange-500/50 text-orange-400"
                                            }`}>
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle size={14} />
                                                <span>{alert.message}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-slate-500 text-sm">
                                    ✓ Distancia segura entre trabajadores y vehículos
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </ServiceLayout>
    );
};
