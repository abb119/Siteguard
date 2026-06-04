import React, { useRef, useEffect, useState, useCallback } from "react";
import {
    Camera, Upload, AlertTriangle, Eye, EyeOff, Phone, CheckCircle,
    Activity, Gauge, ScanFace, Volume2, VolumeX,
} from "lucide-react";

type DmsAlert = { type: string; severity: string; message: string };

type DriverResult = {
    type?: string;
    frame_id: number;
    timestamp?: number;
    // legacy-compatible
    drowsiness: string | null;
    drowsiness_confidence: number;
    distractions: Array<{ type: string; confidence: number }>;
    is_alert: boolean;
    risk_level: "low" | "medium" | "high";
    detections: Array<{ box: number[]; class_name?: string; confidence?: number }>;
    latency_ms?: number;
    // Phase-1 fields (v2 stream)
    calibrating?: boolean;
    face_found?: boolean;
    eyes_closed?: boolean;
    perclos?: number;
    microsleep?: boolean;
    fatigue_score?: number;
    blink_count?: number;
    microsleep_count?: number;
    yawn_count?: number;
    head_pose?: { yaw: number | null; pitch: number | null };
    ear?: number | null;
    ear_threshold?: number;
    alerts?: DmsAlert[];
};

const DEFAULT_STATUS: DriverResult = {
    frame_id: 0,
    drowsiness: null,
    drowsiness_confidence: 0,
    distractions: [],
    is_alert: true,
    risk_level: "low",
    detections: [],
    calibrating: false,
    face_found: false,
    eyes_closed: false,
    perclos: 0,
    microsleep: false,
    fatigue_score: 0,
    blink_count: 0,
    microsleep_count: 0,
    yawn_count: 0,
    head_pose: { yaw: null, pitch: null },
    alerts: [],
};

export const DriverVideoFeed: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const displayCanvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const latestResultRef = useRef<DriverResult | null>(null);
    const capturedFrameRef = useRef<ImageData | null>(null);
    const pendingFramesMap = useRef<Map<number, ImageData>>(new Map());

    // ── Audio alerting ──
    const audioCtxRef = useRef<AudioContext | null>(null);
    const lastBeepRef = useRef<number>(0);
    const [soundOn, setSoundOn] = useState(true);
    const soundOnRef = useRef(true);
    useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

    const [activeMode, setActiveMode] = useState<"webcam" | "file" | null>(null);
    const [fps, setFps] = useState(0);
    const [latencyMs, setLatencyMs] = useState(0);
    const [isPaused] = useState(false);
    const [wsStatus, setWsStatus] = useState<string>("Selecciona una fuente");
    const [status, setStatus] = useState<DriverResult>(DEFAULT_STATUS);

    const framesCount = useRef(0);
    const lastFpsTime = useRef(Date.now());
    const frameSequence = useRef(0);

    const playAlarm = useCallback((urgent: boolean) => {
        if (!soundOnRef.current) return;
        const now = Date.now();
        const cooldown = urgent ? 1200 : 2800;
        if (now - lastBeepRef.current < cooldown) return;
        lastBeepRef.current = now;
        try {
            if (!audioCtxRef.current) {
                const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                audioCtxRef.current = new Ctx();
            }
            const ctx = audioCtxRef.current;
            const beeps = urgent ? 3 : 1;
            for (let i = 0; i < beeps; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "square";
                osc.frequency.value = urgent ? 880 : 520;
                gain.gain.value = 0.0001;
                osc.connect(gain);
                gain.connect(ctx.destination);
                const start = ctx.currentTime + i * 0.22;
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
                osc.start(start);
                osc.stop(start + 0.2);
            }
        } catch {
            /* audio not available */
        }
    }, []);

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
        setStatus(DEFAULT_STATUS);
        latestResultRef.current = null;
        capturedFrameRef.current = null;
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

    // WebSocket connection for driver analysis (v2 stream)
    useEffect(() => {
        if (!activeMode) return;

        const wsUrl = import.meta.env.VITE_DRIVER_WS_URL || "ws://127.0.0.1:8000/ws/driver-stream-v2";
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
            if (isProcessing) {
                animationFrameId = requestAnimationFrame(processLoop);
                return;
            }
            if (pendingFramesMap.current.size > 2) {
                if (loopCount % 60 === 1) console.log("⏳ Driver: Backpressure wait...");
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
                    setTimeout(() => {
                        if (isProcessing) isProcessing = false;
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

                if (pendingFramesMap.current.has(data.frame_id)) {
                    capturedFrameRef.current = pendingFramesMap.current.get(data.frame_id)!;
                    latestResultRef.current = data;
                    pendingFramesMap.current.delete(data.frame_id);
                    for (const key of pendingFramesMap.current.keys()) {
                        if (key < data.frame_id) pendingFramesMap.current.delete(key);
                    }
                } else {
                    return;
                }

                if (data.latency_ms) setLatencyMs(data.latency_ms);
                setStatus(data);

                // Escalating audio alarm
                if (data.microsleep) playAlarm(true);
                else if (data.risk_level === "high") playAlarm(false);

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
    }, [activeMode, isPaused, playAlarm]);

    // Render loop
    useEffect(() => {
        if (!activeMode) return;
        let renderId: number;

        const drawDetections = (ctx: CanvasRenderingContext2D, result: DriverResult) => {
            const critical = result.microsleep || result.risk_level === "high";
            for (const det of result.detections) {
                const [x1, y1, x2, y2] = det.box;
                ctx.strokeStyle = critical ? "#ef4444" : result.face_found ? "#22c55e" : "#64748b";
                ctx.lineWidth = 3;
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                if (det.class_name) {
                    ctx.fillStyle = ctx.strokeStyle;
                    ctx.font = "bold 15px Inter, sans-serif";
                    ctx.fillText(det.class_name, x1, y1 - 6);
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
            const W = displayCanvasRef.current.width;
            const H = displayCanvasRef.current.height;

            if (capturedFrameRef.current) {
                const tempCanvas = document.createElement("canvas");
                tempCanvas.width = capturedFrameRef.current.width;
                tempCanvas.height = capturedFrameRef.current.height;
                const tempCtx = tempCanvas.getContext("2d");
                if (tempCtx) {
                    tempCtx.putImageData(capturedFrameRef.current, 0, 0);
                    ctx.drawImage(tempCanvas, 0, 0, W, H);
                }
            } else if (videoRef.current && videoRef.current.readyState >= 2) {
                ctx.drawImage(videoRef.current, 0, 0, W, H);
            } else {
                ctx.fillStyle = "#020617";
                ctx.fillRect(0, 0, W, H);
            }

            const result = latestResultRef.current;
            if (result) {
                drawDetections(ctx, result);

                // Critical microsleep overlay
                if (result.microsleep) {
                    ctx.fillStyle = "rgba(239,68,68,0.28)";
                    ctx.fillRect(0, 0, W, H);
                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 38px Inter, sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("⚠️ ¡MICROSUEÑO!", W / 2, H / 2);
                    ctx.textAlign = "left";
                } else if (result.calibrating) {
                    ctx.fillStyle = "rgba(15,23,42,0.55)";
                    ctx.fillRect(0, 0, W, H);
                    ctx.fillStyle = "#fbbf24";
                    ctx.font = "bold 24px Inter, sans-serif";
                    ctx.textAlign = "center";
                    ctx.fillText("Calibrando… mira al frente", W / 2, H / 2);
                    ctx.textAlign = "left";
                }
            }
            renderId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(renderId);
    }, [activeMode]);

    const getRiskColor = (level: string) =>
        level === "high" ? "bg-red-500" : level === "medium" ? "bg-orange-500" : "bg-green-500";

    const fatigue = status.fatigue_score ?? 0;
    const fatigueColor = fatigue >= 66 ? "text-red-400" : fatigue >= 33 ? "text-orange-400" : "text-green-400";
    const perclosPct = Math.round((status.perclos ?? 0) * 100);
    const yaw = status.head_pose?.yaw ?? null;
    const eyesOffRoad = yaw !== null && Math.abs(yaw) > 18;

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
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                <button
                    onClick={() => setSoundOn((s) => !s)}
                    title={soundOn ? "Silenciar alarma" : "Activar alarma"}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                >
                    {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} className="text-slate-500" />}
                </button>
                <div className="flex items-center gap-4 text-sm text-slate-400 sm:ml-auto">
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
                    <canvas ref={displayCanvasRef} width={854} height={480} className="w-full h-full object-contain" />
                    {!activeMode && (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                            <p>Selecciona Webcam o sube un video para comenzar</p>
                        </div>
                    )}
                </div>

                {/* Status Panel */}
                <div className="space-y-4">
                    {/* Calibration banner */}
                    {status.calibrating && activeMode && (
                        <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-sm flex items-center gap-2">
                            <ScanFace size={18} /> Calibrando línea base ocular… mira al frente
                        </div>
                    )}

                    {/* Risk Level */}
                    <div className={`p-4 rounded-xl ${getRiskColor(status.risk_level)} bg-opacity-20 border border-opacity-30 ${getRiskColor(status.risk_level).replace("bg-", "border-")}`}>
                        <div className="flex items-center gap-3 mb-2">
                            {status.is_alert ? (
                                <CheckCircle className="text-green-400" size={24} />
                            ) : (
                                <AlertTriangle className="text-red-400" size={24} />
                            )}
                            <span className="font-bold text-lg">
                                {status.is_alert ? "Conductor Alerta" : "¡Atención Requerida!"}
                            </span>
                        </div>
                        <p className="text-sm text-slate-300">
                            Nivel de riesgo: <span className="font-semibold capitalize">{status.risk_level}</span>
                        </p>
                    </div>

                    {/* Fatigue score */}
                    <div className="bg-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <Gauge className={fatigueColor} size={20} />
                            <span className="font-semibold">Índice de Fatiga</span>
                            <span className={`ml-auto font-bold text-lg ${fatigueColor}`}>{Math.round(fatigue)}</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
                            <div
                                className={`h-2.5 rounded-full transition-all duration-500 ${fatigue >= 66 ? "bg-red-500" : fatigue >= 33 ? "bg-orange-500" : "bg-green-500"}`}
                                style={{ width: `${Math.min(100, fatigue)}%` }}
                            />
                        </div>
                    </div>

                    {/* PERCLOS + eyes */}
                    <div className="bg-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                            {status.eyes_closed ? <EyeOff className="text-red-400" size={20} /> : <Eye className="text-green-400" size={20} />}
                            <span className="font-semibold">Cierre Ocular (PERCLOS)</span>
                            <span className="ml-auto text-slate-300 text-sm">{perclosPct}%</span>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                            <div
                                className={`h-2 rounded-full transition-all ${perclosPct >= 30 ? "bg-red-500" : perclosPct >= 15 ? "bg-orange-500" : "bg-green-500"}`}
                                style={{ width: `${Math.min(100, perclosPct)}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-3 text-xs text-slate-400">
                            <span>Parpadeos: <b className="text-slate-200">{status.blink_count ?? 0}</b></span>
                            <span>Microsueños: <b className="text-red-300">{status.microsleep_count ?? 0}</b></span>
                            <span>Bostezos: <b className="text-amber-300">{status.yawn_count ?? 0}</b></span>
                        </div>
                    </div>

                    {/* Head pose / attention */}
                    <div className="bg-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                            <Activity className={eyesOffRoad ? "text-red-400" : "text-green-400"} size={20} />
                            <span className="font-semibold">Atención</span>
                            <span className={`ml-auto text-sm ${eyesOffRoad ? "text-red-400" : "text-green-400"}`}>
                                {!status.face_found ? "Sin rostro" : eyesOffRoad ? "Mirada desviada" : "En la vía"}
                            </span>
                        </div>
                        {yaw !== null && (
                            <p className="text-xs text-slate-500 mt-2">Giro de cabeza: {yaw.toFixed(0)}°</p>
                        )}
                    </div>

                    {/* Distractions */}
                    <div className="bg-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <Phone className="text-orange-400" size={20} />
                            <span className="font-semibold">Distracciones</span>
                        </div>
                        {status.distractions.length > 0 ? (
                            <ul className="space-y-2">
                                {status.distractions.map((d, i) => (
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
