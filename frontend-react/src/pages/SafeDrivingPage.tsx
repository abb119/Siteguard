import React, { useRef, useEffect, useState, useCallback } from "react";
import {
    Camera,
    Upload,
    AlertTriangle,
    CheckCircle,
    Users,
    Car,
    ArrowLeft,
    Volume2,
    VolumeX
} from "lucide-react";
import { Link } from "react-router-dom";

// Types for camera results
type FrontCamResult = {
    type: string;
    frame_id: number;
    detections: Array<{ box: number[]; class_name: string; confidence: number; distance_m?: number }>;
    alerts: Array<{ type: string; level: string; message: string; distance?: number }>;
    risk_level: "low" | "medium" | "high";
    pedestrians_count: number;
    vehicles_ahead: Array<{ type: string; distance: number }>;
    traffic_light: string | null;
    latency_ms: number;
};

type RearCamResult = {
    type: string;
    frame_id: number;
    detections: Array<{ box: number[]; class_name: string; confidence: number; distance_m?: number }>;
    alerts: Array<{ type: string; level: string; message: string; distance?: number }>;
    risk_level: "low" | "medium" | "high";
    safe_to_maneuver: boolean;
    closest_vehicle_distance: number | null;
    approaching_vehicles: Array<{ type: string; distance: number }>;
    latency_ms: number;
    approach_speed_kmh?: number;
    approach_status?: "approaching_fast" | "approaching_slow" | "stable" | "moving_away";
};

// HUD Data types
type FrontHudData = {
    distance: number | null;
    pedestrians: number;
    vehicles: number;
    riskLevel: string;
};

type RearHudData = {
    distance: number | null;
    speedKmh: number;
    approachStatus: string;
    safeToManeuver: boolean;
    riskLevel: string;
};

// Generic Camera Feed Component
const CameraFeed: React.FC<{
    title: string;
    wsUrl: string;
    onResult: (result: FrontCamResult | RearCamResult) => void;
    accentColor: string;
    hudType: "front" | "rear";
    hudData?: FrontHudData | RearHudData;
}> = ({ title, wsUrl, onResult, accentColor, hudType, hudData }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const pendingFramesMap = useRef<Map<number, ImageData>>(new Map());
    const capturedFrameRef = useRef<ImageData | null>(null);
    const latestResultRef = useRef<FrontCamResult | RearCamResult | null>(null);

    const [activeMode, setActiveMode] = useState<"webcam" | "file" | null>(null);
    const [wsStatus, setWsStatus] = useState("Selecciona fuente");
    const [fps, setFps] = useState(0);
    const [latencyMs, setLatencyMs] = useState(0);

    const framesCount = useRef(0);
    const lastFpsTime = useRef(Date.now());
    const frameSequence = useRef(0);

    const stopEverything = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.srcObject = null;
            videoRef.current.src = "";
        }
        setActiveMode(null);
        setWsStatus("Selecciona fuente");
    }, []);

    const startWebcam = async () => {
        stopEverything();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            setActiveMode("webcam");
        } catch (e) {
            alert("No se pudo acceder a la cámara");
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        stopEverything();
        const url = URL.createObjectURL(file);
        if (videoRef.current) {
            videoRef.current.src = url;
            videoRef.current.loop = true;
            videoRef.current.muted = true;
            videoRef.current.play();
        }
        setActiveMode("file");
    };

    // WebSocket connection
    useEffect(() => {
        if (!activeMode) return;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        let animationFrameId: number;
        let isProcessing = false;
        let loopCount = 0;

        const processLoop = () => {
            loopCount++;
            if (!videoRef.current || ws.readyState !== WebSocket.OPEN) {
                animationFrameId = requestAnimationFrame(processLoop);
                return;
            }

            if (isProcessing || pendingFramesMap.current.size > 2) {
                animationFrameId = requestAnimationFrame(processLoop);
                return;
            }

            if (videoRef.current.readyState < 2) {
                animationFrameId = requestAnimationFrame(processLoop);
                return;
            }

            let canvas = offscreenCanvasRef.current;
            if (!canvas) {
                canvas = document.createElement("canvas");
                canvas.width = 640;
                canvas.height = 480;
                offscreenCanvasRef.current = canvas;
            }

            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const currentFrameId = ++frameSequence.current;
                pendingFramesMap.current.set(currentFrameId, frameData);

                if (pendingFramesMap.current.size > 100) {
                    const firstKey = pendingFramesMap.current.keys().next().value;
                    if (firstKey !== undefined) pendingFramesMap.current.delete(firstKey);
                }

                const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
                const base64 = dataUrl.split(",")[1];
                if (base64) {
                    ws.send(JSON.stringify({
                        frame_id: currentFrameId,
                        timestamp: videoRef.current.currentTime,
                        capture_width: canvas.width,
                        capture_height: canvas.height,
                        display_width: canvasRef.current?.width ?? canvas.width,
                        display_height: canvasRef.current?.height ?? canvas.height,
                        image: base64,
                    }));
                    isProcessing = true;
                    setTimeout(() => { if (isProcessing) isProcessing = false; }, 5000);
                }
            }

            animationFrameId = requestAnimationFrame(processLoop);
        };

        ws.onopen = () => {
            setWsStatus("Conectado");
            processLoop();
        };

        ws.onmessage = (event) => {
            isProcessing = false;
            try {
                const data = JSON.parse(event.data);
                if (data.type === "ready") return;

                if (pendingFramesMap.current.has(data.frame_id)) {
                    capturedFrameRef.current = pendingFramesMap.current.get(data.frame_id)!;
                    latestResultRef.current = data;
                    pendingFramesMap.current.delete(data.frame_id);
                    for (const key of pendingFramesMap.current.keys()) {
                        if (key < data.frame_id) pendingFramesMap.current.delete(key);
                    }
                }

                if (data.latency_ms) setLatencyMs(data.latency_ms);
                onResult(data);

                framesCount.current++;
                const now = Date.now();
                if (now - lastFpsTime.current >= 1000) {
                    setFps(framesCount.current);
                    framesCount.current = 0;
                    lastFpsTime.current = now;
                }
            } catch (e) {
                console.error("Parse error", e);
            }
        };

        ws.onerror = () => setWsStatus("Error");
        ws.onclose = () => {
            setWsStatus("Desconectado");
            cancelAnimationFrame(animationFrameId);
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
            cancelAnimationFrame(animationFrameId);
        };
    }, [activeMode, wsUrl, onResult]);

    // Render loop
    useEffect(() => {
        if (!activeMode) return;
        let renderId: number;

        const render = () => {
            if (!canvasRef.current) {
                renderId = requestAnimationFrame(render);
                return;
            }
            const ctx = canvasRef.current.getContext("2d");
            if (!ctx) {
                renderId = requestAnimationFrame(render);
                return;
            }

            if (capturedFrameRef.current) {
                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = capturedFrameRef.current.width;
                tempCanvas.height = capturedFrameRef.current.height;
                const tempCtx = tempCanvas.getContext("2d");
                if (tempCtx) {
                    tempCtx.putImageData(capturedFrameRef.current, 0, 0);
                    ctx.drawImage(tempCanvas, 0, 0, canvasRef.current.width, canvasRef.current.height);
                }
            } else if (videoRef.current && videoRef.current.readyState >= 2) {
                ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
            }

            const result = latestResultRef.current;
            if (result?.detections) {
                for (const det of result.detections) {
                    const [x1, y1, x2, y2] = det.box;
                    ctx.strokeStyle = det.class_name === "person" ? "#ef4444" : "#22c55e";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                    if (det.class_name) {
                        ctx.fillStyle = det.class_name === "person" ? "#ef4444" : "#22c55e";
                        ctx.font = "bold 12px Inter";
                        const label = det.distance_m ? `${det.class_name} ${det.distance_m}m` : det.class_name;
                        ctx.fillText(label, x1, y1 - 5);
                    }
                }
            }

            renderId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(renderId);
    }, [activeMode]);

    return (
        <div className="bg-slate-800 rounded-xl overflow-hidden">
            <div className={`px-4 py-2 ${accentColor} flex items-center justify-between`}>
                <span className="font-semibold">{title}</span>
                <span className="text-xs text-slate-300">{fps} fps · {latencyMs.toFixed(0)}ms</span>
            </div>
            <div className="relative aspect-video bg-slate-900">
                <video ref={videoRef} className="hidden" playsInline muted loop />
                <canvas ref={canvasRef} width={640} height={360} className="w-full h-full object-contain" />

                {/* Tesla-style HUD Overlay */}
                {activeMode && hudData && (
                    <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
                        <div className="bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                            <div className="flex items-center justify-between text-white">
                                {hudType === "front" ? (
                                    <>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <Car size={16} className="text-cyan-400" />
                                                <span className="text-sm font-mono">
                                                    {(hudData as FrontHudData).distance
                                                        ? `${(hudData as FrontHudData).distance}m`
                                                        : "—"}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Users size={16} className="text-yellow-400" />
                                                <span className="text-sm font-mono">{(hudData as FrontHudData).pedestrians}</span>
                                            </div>
                                        </div>
                                        <div className={`px-2 py-1 rounded text-xs font-bold ${(hudData as FrontHudData).riskLevel === "high" ? "bg-red-500" :
                                            (hudData as FrontHudData).riskLevel === "medium" ? "bg-orange-500" : "bg-green-500"
                                            }`}>
                                            {(hudData as FrontHudData).riskLevel === "high" ? "⚠️" :
                                                (hudData as FrontHudData).riskLevel === "medium" ? "⚡" : "✓"}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <ArrowLeft size={16} className="text-orange-400 rotate-180" />
                                                <span className="text-sm font-mono">
                                                    {(hudData as RearHudData).distance
                                                        ? `${(hudData as RearHudData).distance}m`
                                                        : "—"}
                                                </span>
                                            </div>
                                            {(hudData as RearHudData).speedKmh > 0 && (
                                                <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${(hudData as RearHudData).approachStatus === "approaching_fast"
                                                    ? "bg-red-500/80"
                                                    : "bg-blue-500/60"
                                                    }`}>
                                                    <span className="text-xs font-mono">
                                                        {(hudData as RearHudData).speedKmh} km/h
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className={`px-2 py-1 rounded text-xs font-bold ${(hudData as RearHudData).safeToManeuver ? "bg-green-500" : "bg-red-500"
                                            }`}>
                                            {(hudData as RearHudData).safeToManeuver ? "SAFE" : "WAIT"}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {!activeMode && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex gap-3">
                            <button onClick={startWebcam} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg">
                                <Camera size={18} /> Webcam
                            </button>
                            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg">
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
    );
};

// Main Page Component
export const SafeDrivingPage: React.FC = () => {
    const [frontResult, setFrontResult] = useState<FrontCamResult | null>(null);
    const [rearResult, setRearResult] = useState<RearCamResult | null>(null);
    const [audioEnabled, setAudioEnabled] = useState(true);
    const alertAudioRef = useRef<HTMLAudioElement | null>(null);

    const wsBaseUrl = import.meta.env.VITE_WS_URL?.replace("/ws/ppe-stream", "") || "ws://127.0.0.1:8000";

    // Play alert sound on danger
    useEffect(() => {
        if (!audioEnabled) return;
        const frontDanger = frontResult?.risk_level === "high";
        const rearDanger = rearResult?.risk_level === "high";

        if (frontDanger || rearDanger) {
            if (!alertAudioRef.current) {
                alertAudioRef.current = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU");
            }
            // Simple beep would go here - for now just log
            console.log("🔊 ALERT!");
        }
    }, [frontResult?.risk_level, rearResult?.risk_level, audioEnabled]);

    const getRiskBadge = (level: string) => {
        switch (level) {
            case "high": return <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-bold">PELIGRO</span>;
            case "medium": return <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded-full text-xs font-bold">PRECAUCIÓN</span>;
            default: return <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold">SEGURO</span>;
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 text-white">
            {/* Header */}
            <header className="bg-slate-800 border-b border-slate-700 px-4 md:px-6 py-3 md:py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 md:gap-4">
                        <Link to="/services/driver" className="p-2 hover:bg-slate-700 rounded-lg transition-colors">
                            <ArrowLeft size={20} />
                        </Link>
                        <div>
                            <h1 className="text-lg md:text-xl font-bold">Conducción Segura</h1>
                            <p className="text-xs md:text-sm text-slate-400">Análisis dual de cámaras frontal y trasera</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setAudioEnabled(!audioEnabled)}
                        className={`p-2 rounded-lg ${audioEnabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'}`}
                    >
                        {audioEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                    </button>
                </div>
            </header>

            <main className="p-4 md:p-6">
                {/* Dual Camera Grid */}
                <div className="grid lg:grid-cols-2 gap-6 mb-6">
                    <div>
                        <CameraFeed
                            title="🚗 Cámara Frontal"
                            wsUrl={`${wsBaseUrl}/ws/front-cam-stream`}
                            onResult={(r) => setFrontResult(r as FrontCamResult)}
                            accentColor="bg-blue-600"
                            hudType="front"
                            hudData={frontResult ? {
                                distance: frontResult.vehicles_ahead?.[0]?.distance ?? null,
                                pedestrians: frontResult.pedestrians_count,
                                vehicles: frontResult.vehicles_ahead?.length ?? 0,
                                riskLevel: frontResult.risk_level
                            } : undefined}
                        />
                    </div>
                    <div>
                        <CameraFeed
                            title="🔙 Cámara Trasera"
                            wsUrl={`${wsBaseUrl}/ws/rear-cam-stream`}
                            onResult={(r) => setRearResult(r as RearCamResult)}
                            accentColor="bg-orange-600"
                            hudType="rear"
                            hudData={rearResult ? {
                                distance: rearResult.closest_vehicle_distance,
                                speedKmh: rearResult.approach_speed_kmh ?? 0,
                                approachStatus: rearResult.approach_status ?? "stable",
                                safeToManeuver: rearResult.safe_to_maneuver,
                                riskLevel: rearResult.risk_level
                            } : undefined}
                        />
                    </div>
                </div>

                {/* Alerts Section - Fixed height to prevent layout jumps */}
                <div className="min-h-[60px] mb-6">
                    {(frontResult?.alerts?.filter(a => a.level === "danger").length ||
                        rearResult?.alerts?.filter(a => a.level === "danger").length) ? (
                        <div className="space-y-2">
                            {frontResult?.alerts?.filter(a => a.level === "danger").map((alert, i) => (
                                <div key={`front-${i}`} className="bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-3 flex items-center gap-3 animate-pulse">
                                    <AlertTriangle className="text-red-400" size={20} />
                                    <span className="font-semibold text-red-400">{alert.message}</span>
                                </div>
                            ))}
                            {rearResult?.alerts?.filter(a => a.level === "danger").map((alert, i) => (
                                <div key={`rear-${i}`} className="bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-3 flex items-center gap-3 animate-pulse">
                                    <AlertTriangle className="text-red-400" size={20} />
                                    <span className="font-semibold text-red-400">{alert.message}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 flex items-center gap-3">
                            <CheckCircle className="text-green-400" size={20} />
                            <span className="text-green-400">Sin alertas de peligro</span>
                        </div>
                    )}
                </div>

                {/* Status Panels */}
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Front Camera Status */}
                    <div className="bg-slate-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Estado Frontal</h3>
                            {frontResult && getRiskBadge(frontResult.risk_level)}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-700/50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <Users size={16} className="text-blue-400" />
                                    <span className="text-sm text-slate-400">Peatones</span>
                                </div>
                                <span className="text-2xl font-bold">{frontResult?.pedestrians_count || 0}</span>
                            </div>
                            <div className="bg-slate-700/50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <Car size={16} className="text-green-400" />
                                    <span className="text-sm text-slate-400">Vehículos</span>
                                </div>
                                <span className="text-2xl font-bold">{frontResult?.vehicles_ahead?.length || 0}</span>
                            </div>
                        </div>
                    </div>

                    {/* Rear Camera Status */}
                    <div className="bg-slate-800 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold">Estado Trasero</h3>
                            {rearResult && getRiskBadge(rearResult.risk_level)}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-700/50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <Car size={16} className="text-orange-400" />
                                    <span className="text-sm text-slate-400">Vehículo más cerca</span>
                                </div>
                                <span className="text-2xl font-bold">
                                    {rearResult?.closest_vehicle_distance ? `${rearResult.closest_vehicle_distance}m` : "—"}
                                </span>
                            </div>
                            <div className="bg-slate-700/50 rounded-lg p-3">
                                <div className="flex items-center gap-2 mb-1">
                                    {rearResult?.safe_to_maneuver ? (
                                        <CheckCircle size={16} className="text-green-400" />
                                    ) : (
                                        <AlertTriangle size={16} className="text-red-400" />
                                    )}
                                    <span className="text-sm text-slate-400">Maniobra</span>
                                </div>
                                <span className={`text-lg font-bold ${rearResult?.safe_to_maneuver ? "text-green-400" : "text-red-400"}`}>
                                    {rearResult?.safe_to_maneuver ? "SEGURA" : "PELIGROSA"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};
