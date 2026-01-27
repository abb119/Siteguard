import React, { useRef, useEffect, useState, useCallback } from "react";
import { Camera, Upload, AlertTriangle, Eye, EyeOff, Phone, CheckCircle } from "lucide-react";

type DriverResult = {
    type?: string;
    frame_id: number;
    timestamp?: number;
    drowsiness: string | null;
    drowsiness_confidence: number;
    distractions: Array<{ type: string; confidence: number }>;
    is_alert: boolean;
    risk_level: "low" | "medium" | "high";
    detections: Array<{ box: number[]; class_name?: string; confidence?: number }>;
    latency_ms?: number;
};

export const DriverVideoFeed: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const displayCanvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const latestResultRef = useRef<DriverResult | null>(null);
    const capturedFrameRef = useRef<ImageData | null>(null);
    const pendingFramesMap = useRef<Map<number, ImageData>>(new Map()); // Store frames for sync

    const [activeMode, setActiveMode] = useState<"webcam" | "file" | null>(null);
    const [fps, setFps] = useState(0);
    const [latencyMs, setLatencyMs] = useState(0);
    const [isPaused, _setIsPaused] = useState(false);
    const [wsStatus, setWsStatus] = useState<string>("Selecciona una fuente");
    const [driverStatus, setDriverStatus] = useState<{
        drowsiness: string | null;
        drowsiness_confidence: number;
        is_alert: boolean;
        risk_level: string;
        distractions: Array<{ type: string; confidence: number }>;
    }>({
        drowsiness: null,
        drowsiness_confidence: 0,
        is_alert: true,
        risk_level: "low",
        distractions: [],
    });

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
        setWsStatus("Selecciona una fuente");
    }, []);

    const startWebcam = useCallback(async () => {
        stopEverything();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
            setActiveMode("webcam");
        } catch (e) {
            console.error("Error accessing webcam", e);
            alert("No se pudo acceder a la webcam");
        }
    }, [stopEverything]);

    const handleFileUpload = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            stopEverything();
            const url = URL.createObjectURL(file);
            if (videoRef.current) {
                videoRef.current.src = url;
                videoRef.current.play();
            }
            setActiveMode("file");
        },
        [stopEverything]
    );

    // WebSocket connection for driver analysis
    useEffect(() => {
        if (!activeMode) return;

        const wsUrl = import.meta.env.VITE_DRIVER_WS_URL || "ws://127.0.0.1:8000/ws/driver-stream";
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

            if (isPaused || videoRef.current.paused || videoRef.current.ended) {
                animationFrameId = requestAnimationFrame(processLoop);
                return;
            }

            // LOCK-STEP: Only send next frame after previous response received
            if (isProcessing) {
                animationFrameId = requestAnimationFrame(processLoop);
                return;
            }

            // BACKPRESSURE: Don't send more if too many pending frames
            if (pendingFramesMap.current.size > 2) {
                if (loopCount % 60 === 1) console.log("⏳ Driver: Backpressure wait...");
                animationFrameId = requestAnimationFrame(processLoop);
                return;
            }

            // Need valid frame from video
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

                // Store this frame with its ID for later retrieval
                const currentFrameId = ++frameSequence.current;
                pendingFramesMap.current.set(currentFrameId, frameData);

                // Cleanup old frames (keep last 100)
                if (pendingFramesMap.current.size > 100) {
                    const firstKey = pendingFramesMap.current.keys().next().value;
                    if (firstKey !== undefined) {
                        pendingFramesMap.current.delete(firstKey);
                    }
                }

                const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
                const base64 = dataUrl.split(",")[1];
                if (base64) {
                    const payload = {
                        frame_id: currentFrameId,
                        timestamp: videoRef.current.currentTime,
                        capture_width: canvas.width,
                        capture_height: canvas.height,
                        display_width: displayCanvasRef.current?.width ?? canvas.width,
                        display_height: displayCanvasRef.current?.height ?? canvas.height,
                        image: base64,
                    };
                    ws.send(JSON.stringify(payload));
                    isProcessing = true;
                    // Timeout to recover if response never arrives
                    setTimeout(() => {
                        if (isProcessing) {
                            console.log(`⏰ Driver: TIMEOUT - Resetting`);
                            isProcessing = false;
                        }
                    }, 5000);
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
                const data: DriverResult = JSON.parse(event.data);
                if (data.type === "ready") return;

                // SYNC: Retrieve the exact frame that matches this result
                if (pendingFramesMap.current.has(data.frame_id)) {
                    capturedFrameRef.current = pendingFramesMap.current.get(data.frame_id)!;
                    latestResultRef.current = data; // Only update results if we have the frame!

                    // Clean up this frame and any older frames (no longer needed)
                    pendingFramesMap.current.delete(data.frame_id);
                    for (const key of pendingFramesMap.current.keys()) {
                        if (key < data.frame_id) pendingFramesMap.current.delete(key);
                    }
                } else {
                    console.warn(`⚠️ Driver: Result ID ${data.frame_id} ignored (Frame not found)`);
                    return;
                }

                if (data.latency_ms) setLatencyMs(data.latency_ms);

                // Update driver status
                setDriverStatus({
                    drowsiness: data.drowsiness,
                    drowsiness_confidence: data.drowsiness_confidence,
                    is_alert: data.is_alert,
                    risk_level: data.risk_level,
                    distractions: data.distractions || [],
                });

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

        ws.onerror = () => setWsStatus("Error de conexión");
        ws.onclose = () => {
            setWsStatus("Conexión cerrada");
            cancelAnimationFrame(animationFrameId);
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) ws.close();
            wsRef.current = null;
            cancelAnimationFrame(animationFrameId);
        };
    }, [activeMode, isPaused]);

    // Render loop
    useEffect(() => {
        if (!activeMode) return;
        let renderId: number;

        const drawDetections = (ctx: CanvasRenderingContext2D, detections: DriverResult["detections"]) => {
            for (const det of detections) {
                const [x1, y1, x2, y2] = det.box;
                ctx.strokeStyle = "#ef4444";
                ctx.lineWidth = 3;
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                if (det.class_name) {
                    ctx.fillStyle = "#ef4444";
                    ctx.font = "bold 14px Inter, sans-serif";
                    ctx.fillText(det.class_name, x1, y1 - 5);
                }
            }
        };

        const render = () => {
            if (!displayCanvasRef.current) {
                renderId = requestAnimationFrame(render);
                return;
            }
            const ctx = displayCanvasRef.current.getContext("2d");
            if (!ctx) {
                renderId = requestAnimationFrame(render);
                return;
            }

            // Draw captured frame for sync
            if (capturedFrameRef.current) {
                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = capturedFrameRef.current.width;
                tempCanvas.height = capturedFrameRef.current.height;
                const tempCtx = tempCanvas.getContext("2d");
                if (tempCtx) {
                    tempCtx.putImageData(capturedFrameRef.current, 0, 0);
                    ctx.drawImage(tempCanvas, 0, 0, displayCanvasRef.current.width, displayCanvasRef.current.height);
                }
            } else if (videoRef.current && videoRef.current.readyState >= 2) {
                ctx.drawImage(videoRef.current, 0, 0, displayCanvasRef.current.width, displayCanvasRef.current.height);
            } else {
                ctx.fillStyle = "#020617";
                ctx.fillRect(0, 0, displayCanvasRef.current.width, displayCanvasRef.current.height);
            }

            const result = latestResultRef.current;
            if (result?.detections) {
                drawDetections(ctx, result.detections);
            }

            renderId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(renderId);
    }, [activeMode]);

    const getRiskColor = (level: string) => {
        switch (level) {
            case "high": return "bg-red-500";
            case "medium": return "bg-orange-500";
            default: return "bg-green-500";
        }
    };

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex items-center gap-4 flex-wrap">
                <button
                    onClick={startWebcam}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                    <Camera size={18} />
                    Webcam
                </button>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg transition-colors"
                >
                    <Upload size={18} />
                    Subir Video
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleFileUpload}
                />
                <div className="ml-auto flex items-center gap-4 text-sm text-slate-400">
                    <span className={`px-3 py-1 rounded-full ${wsStatus === "Conectado" ? "bg-green-500/20 text-green-400" : "bg-slate-700"}`}>
                        {wsStatus}
                    </span>
                    <span>{fps} fps · {latencyMs.toFixed(1)} ms</span>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Video Feed */}
                <div className="lg:col-span-2 relative bg-slate-900 rounded-xl overflow-hidden aspect-video">
                    <video ref={videoRef} className="hidden" playsInline muted loop />
                    <canvas
                        ref={displayCanvasRef}
                        width={854}
                        height={480}
                        className="w-full h-full object-contain"
                    />
                    {!activeMode && (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                            <p>Selecciona Webcam o sube un video para comenzar</p>
                        </div>
                    )}
                </div>

                {/* Status Panel */}
                <div className="space-y-4">
                    {/* Risk Level */}
                    <div className={`p-4 rounded-xl ${getRiskColor(driverStatus.risk_level)} bg-opacity-20 border border-opacity-30 ${getRiskColor(driverStatus.risk_level).replace("bg-", "border-")}`}>
                        <div className="flex items-center gap-3 mb-2">
                            {driverStatus.is_alert ? (
                                <CheckCircle className="text-green-400" size={24} />
                            ) : (
                                <AlertTriangle className="text-red-400" size={24} />
                            )}
                            <span className="font-bold text-lg">
                                {driverStatus.is_alert ? "Conductor Alerta" : "¡Atención Requerida!"}
                            </span>
                        </div>
                        <p className="text-sm text-slate-300">
                            Nivel de riesgo: <span className="font-semibold capitalize">{driverStatus.risk_level}</span>
                        </p>
                    </div>

                    {/* Drowsiness Status */}
                    <div className="bg-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                            {driverStatus.drowsiness?.toLowerCase() === "drowsy" ? (
                                <EyeOff className="text-red-400" size={20} />
                            ) : (
                                <Eye className="text-green-400" size={20} />
                            )}
                            <span className="font-semibold">Estado de Somnolencia</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className={driverStatus.drowsiness?.toLowerCase() === "drowsy" ? "text-red-400" : "text-green-400"}>
                                {driverStatus.drowsiness || "Analizando..."}
                            </span>
                            <span className="text-slate-400 text-sm">
                                {(driverStatus.drowsiness_confidence * 100).toFixed(0)}%
                            </span>
                        </div>
                    </div>

                    {/* Distractions */}
                    <div className="bg-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <Phone className="text-orange-400" size={20} />
                            <span className="font-semibold">Distracciones Detectadas</span>
                        </div>
                        {driverStatus.distractions.length > 0 ? (
                            <ul className="space-y-2">
                                {driverStatus.distractions.map((d, i) => (
                                    <li key={i} className="flex items-center justify-between text-sm">
                                        <span className="text-red-400 capitalize">{d.type.replace("_", " ")}</span>
                                        <span className="text-slate-400">{(d.confidence * 100).toFixed(0)}%</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-green-400 text-sm">Sin distracciones detectadas</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
