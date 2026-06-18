import React, { useRef, useEffect, useState, useCallback } from "react";
import {
    Camera, Upload, AlertTriangle, Eye, EyeOff, Phone, CheckCircle,
    Activity, Gauge, ScanFace, Volume2, VolumeX,
} from "lucide-react";
import { getSessionId } from "../utils/session";
import { loadDmsConfig } from "../utils/dmsConfig";

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
    detections: Array<{ box: number[]; class_name?: string; confidence?: number; kind?: string }>;
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
    head_pose?: { yaw: number | null; pitch: number | null; roll?: number | null };
    ear?: number | null;
    ear_threshold?: number;
    low_light?: boolean;
    camera_blocked?: boolean;
    eye_reliable?: boolean;
    seatbelt?: "worn" | "absent" | "unknown";
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
    low_light: false,
    camera_blocked: false,
    eye_reliable: true,
    seatbelt: "unknown",
    alerts: [],
};

const DISTRACTION_LABEL: Record<string, string> = {
    cell_phone: "Uso de móvil",
    drinking: "Bebida detectada",
    looking_down: "Mirando abajo",
};

export const DriverVideoFeed: React.FC<{ driverId?: string }> = ({ driverId }) => {
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

        // Always target the v2 DMS endpoint. We only take the HOST from the env
        // var (which may be set in the Vercel dashboard with the legacy path) and
        // force the path to /ws/driver-stream-v2 so a stale env value can't pin
        // us to the old stream. session_id groups events for the trip report.
        const sid = driverId || getSessionId();
        const DRIVER_WS_PATH = "/ws/driver-stream-v2";
        const rawWs = import.meta.env.VITE_DRIVER_WS_URL;
        let wsUrl = `ws://127.0.0.1:8000${DRIVER_WS_PATH}?session_id=${sid}`;
        if (rawWs) {
            try {
                const u = new URL(rawWs);
                u.pathname = DRIVER_WS_PATH;
                u.searchParams.set("session_id", sid);
                wsUrl = u.toString();
            } catch {
                wsUrl = `${rawWs}?session_id=${sid}`;
            }
        }
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
            // Push the user's tuned thresholds before streaming frames
            try {
                ws.send(JSON.stringify({ type: "config", config: loadDmsConfig() }));
            } catch {
                /* ignore */
            }
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
    }, [activeMode, isPaused, playAlarm, driverId]);

    // Render loop
    useEffect(() => {
        if (!activeMode) return;
        let renderId: number;

        const drawDetections = (ctx: CanvasRenderingContext2D, result: DriverResult) => {
            const critical = result.microsleep || result.risk_level === "high";
            for (const det of result.detections) {
                const [x1, y1, x2, y2] = det.box;
                const isObj = det.kind === "object";
                // object boxes (phone/bottle/cup) in amber + dashed so they read
                // distinctly from the face/status box.
                const color = isObj
                    ? "#ffb000"
                    : critical ? "#ef4444" : result.face_found ? "#22c55e" : "#64748b";
                ctx.strokeStyle = color;
                ctx.lineWidth = isObj ? 2 : 3;
                ctx.setLineDash(isObj ? [6, 4] : []);
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
                ctx.setLineDash([]);
                if (det.class_name) {
                    ctx.font = "bold 13px 'IBM Plex Mono', monospace";
                    const tw = ctx.measureText(det.class_name).width;
                    ctx.fillStyle = color;
                    ctx.fillRect(x1, Math.max(0, y1 - 18), tw + 10, 16);
                    ctx.fillStyle = "#0a0a0b";
                    ctx.fillText(det.class_name, x1 + 5, Math.max(11, y1 - 5));
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

                // Status overlays (priority: blocked > microsleep > calibrating)
                if (result.camera_blocked) {
                    ctx.fillStyle = "rgba(10,10,11,0.82)";
                    ctx.fillRect(0, 0, W, H);
                    ctx.fillStyle = "#ff3b30";
                    ctx.font = "bold 26px 'IBM Plex Mono', monospace";
                    ctx.textAlign = "center";
                    ctx.fillText("CÁMARA BLOQUEADA", W / 2, H / 2);
                    ctx.textAlign = "left";
                } else if (result.microsleep) {
                    ctx.fillStyle = "rgba(255,59,48,0.28)";
                    ctx.fillRect(0, 0, W, H);
                    ctx.fillStyle = "#fff";
                    ctx.font = "bold 34px 'IBM Plex Mono', monospace";
                    ctx.textAlign = "center";
                    ctx.fillText("⚠ MICROSUEÑO", W / 2, H / 2);
                    ctx.textAlign = "left";
                } else if (result.calibrating) {
                    ctx.fillStyle = "rgba(10,10,11,0.55)";
                    ctx.fillRect(0, 0, W, H);
                    ctx.fillStyle = "#ffb000";
                    ctx.font = "bold 22px 'IBM Plex Mono', monospace";
                    ctx.textAlign = "center";
                    ctx.fillText("CALIBRANDO — mira al frente", W / 2, H / 2);
                    ctx.textAlign = "left";
                }
            }
            renderId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(renderId);
    }, [activeMode]);

    const fatigue = status.fatigue_score ?? 0;
    const fatigueColor = fatigue >= 66 ? "text-red-400" : fatigue >= 33 ? "text-orange-400" : "text-green-400";
    const perclosPct = Math.round((status.perclos ?? 0) * 100);
    const yaw = status.head_pose?.yaw ?? null;
    const pitch = status.head_pose?.pitch ?? null;
    const eyesOffRoad = yaw !== null && Math.abs(yaw) > 18;
    const lookingDown = pitch !== null && pitch > 15;
    const attentionBad = eyesOffRoad || lookingDown || !status.face_found;
    const lowLight = status.low_light === true;
    const eyeDegraded = status.eye_reliable === false;
    const seatbelt = status.seatbelt ?? "unknown";

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap">
                <button
                    onClick={startWebcam}
                    className="flex items-center gap-2 px-4 py-2 border border-hud-line hover:border-amber-400 hover:text-amber-400 transition-colors font-mono uppercase tracking-widest text-xs"
                >
                    <Camera size={16} />
                    Webcam
                </button>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-400 text-hud-bg hover:bg-amber-300 transition-colors font-mono uppercase tracking-widest text-xs"
                >
                    <Upload size={16} />
                    Subir Vídeo
                </button>
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />
                <button
                    onClick={() => setSoundOn((s) => !s)}
                    title={soundOn ? "Silenciar alarma" : "Activar alarma"}
                    className="flex items-center gap-2 px-3 py-2 border border-hud-line hover:border-amber-400 transition-colors"
                >
                    {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} className="text-hud-dim" />}
                </button>
                <div className="flex items-center gap-4 sm:ml-auto font-mono text-xs">
                    <span className={`flex items-center gap-2 px-3 py-1 border ${wsStatus === "Conectado" ? "border-phosphor-400/40 text-phosphor-400" : "border-hud-line text-hud-dim"}`}>
                        <span className={`hud-dot inline-block ${wsStatus === "Conectado" ? "bg-phosphor-400" : "bg-hud-dim"}`} />
                        {wsStatus}
                    </span>
                    <span className="text-hud-dim tnum">{fps} FPS · {latencyMs.toFixed(1)} MS</span>
                </div>
            </div>

            {/* Persistent status bar — fixed slot so alerts never reflow the metrics below */}
            <div className="hud-panel hud-corners p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div
                    className={`flex items-center gap-3 sm:min-w-[240px] border-l-2 pl-3 ${status.risk_level === "high"
                        ? "border-alarm-400"
                        : status.risk_level === "medium"
                            ? "border-amber-400"
                            : "border-phosphor-400"
                        }`}
                >
                    {status.is_alert ? (
                        <CheckCircle className="text-phosphor-400 shrink-0" size={24} />
                    ) : (
                        <AlertTriangle className="text-alarm-400 shrink-0" size={24} />
                    )}
                    <div className="leading-tight">
                        <div className="font-mono uppercase tracking-wide text-sm">
                            {status.is_alert ? "Conductor alerta" : "Atención requerida"}
                        </div>
                        <div className="hud-label">
                            Riesgo ·{" "}
                            <span
                                className={
                                    status.risk_level === "high"
                                        ? "text-alarm-400"
                                        : status.risk_level === "medium"
                                            ? "text-amber-400"
                                            : "text-phosphor-400"
                                }
                            >
                                {status.risk_level}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex-1 flex flex-wrap items-center gap-2 sm:justify-end min-h-[2rem]">
                    {status.calibrating && activeMode && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-amber-400/40 text-amber-300 font-mono uppercase text-[11px] tracking-wider">
                            <ScanFace size={13} /> Calibrando
                        </span>
                    )}
                    {(status.alerts?.length ?? 0) > 0 ? (
                        status.alerts!.map((a, i) => {
                            const hot = a.severity === "critical" || a.severity === "high";
                            return (
                                <span
                                    key={i}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 border font-mono uppercase text-[11px] tracking-wider ${hot ? "border-alarm-400/50 text-alarm-300" : "border-amber-400/50 text-amber-300"
                                        }`}
                                >
                                    <span className={`w-1.5 h-1.5 ${hot ? "bg-alarm-400" : "bg-amber-400"}`} />
                                    {a.message}
                                </span>
                            );
                        })
                    ) : (
                        !status.calibrating && <span className="hud-label">Sin alertas activas</span>
                    )}
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Video Feed */}
                <div className="lg:col-span-2 relative hud-panel hud-corners overflow-hidden aspect-video">
                    <video ref={videoRef} className="hidden" playsInline muted loop />
                    <canvas ref={displayCanvasRef} width={854} height={480} className="w-full h-full object-contain" />
                    {!activeMode && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <p className="hud-label">Selecciona webcam o sube un vídeo</p>
                        </div>
                    )}
                </div>

                {/* Status Panel */}
                <div className="space-y-4">
                    {/* Fatigue score */}
                    <div className="hud-panel p-4">
                        <div className="flex items-center gap-3 mb-2">
                            <Gauge className={fatigueColor} size={20} />
                            <span className="font-mono uppercase tracking-wide text-sm">Índice de Fatiga</span>
                            <span className={`ml-auto font-bold text-lg ${fatigueColor}`}>{Math.round(fatigue)}</span>
                        </div>
                        <div className="w-full bg-slate-700 h-2.5 overflow-hidden">
                            <div
                                className={`h-2.5 transition-all duration-500 ${fatigue >= 66 ? "bg-red-500" : fatigue >= 33 ? "bg-orange-500" : "bg-green-500"}`}
                                style={{ width: `${Math.min(100, fatigue)}%` }}
                            />
                        </div>
                    </div>

                    {/* PERCLOS + eyes */}
                    <div className="hud-panel p-4">
                        <div className="flex items-center gap-3 mb-3">
                            {status.eyes_closed ? <EyeOff className="text-red-400" size={20} /> : <Eye className="text-green-400" size={20} />}
                            <span className="font-mono uppercase tracking-wide text-sm">Cierre Ocular (PERCLOS)</span>
                            <span className="ml-auto text-slate-300 text-sm">{perclosPct}%</span>
                        </div>
                        <div className="w-full bg-slate-700 h-2 overflow-hidden">
                            <div
                                className={`h-2 transition-all ${perclosPct >= 30 ? "bg-red-500" : perclosPct >= 15 ? "bg-orange-500" : "bg-green-500"}`}
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
                    <div className="hud-panel p-4">
                        <div className="flex items-center gap-3">
                            <Activity className={attentionBad ? "text-red-400" : "text-green-400"} size={20} />
                            <span className="font-mono uppercase tracking-wide text-sm">Atención</span>
                            <span className={`ml-auto text-sm ${attentionBad ? "text-red-400" : "text-green-400"}`}>
                                {!status.face_found
                                    ? "Sin rostro"
                                    : lookingDown
                                        ? "Mirando abajo"
                                        : eyesOffRoad
                                            ? "Mirada desviada"
                                            : "En la vía"}
                            </span>
                        </div>
                        {(yaw !== null || pitch !== null) && (
                            <p className="text-xs text-slate-500 mt-2">
                                Giro: {yaw !== null ? `${yaw.toFixed(0)}°` : "—"} · Inclinación: {pitch !== null ? `${pitch.toFixed(0)}°` : "—"}
                            </p>
                        )}
                    </div>

                    {/* Environment / robustness */}
                    <div className="hud-panel p-4">
                        <div className="hud-label mb-3">Entorno</div>
                        <div className="space-y-2 font-mono text-sm">
                            <div className="flex items-center justify-between">
                                <span className="hud-label">Luz</span>
                                <span className={lowLight ? "text-amber-400" : "text-phosphor-400"}>
                                    {lowLight ? "Baja · realce ON" : "OK"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="hud-label">Seguimiento ocular</span>
                                <span className={eyeDegraded ? "text-alarm-400" : "text-phosphor-400"}>
                                    {eyeDegraded ? "Degradado" : "Fiable"}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="hud-label">Cinturón</span>
                                <span className={seatbelt === "absent" ? "text-alarm-400" : seatbelt === "worn" ? "text-phosphor-400" : "text-hud-dim"}>
                                    {seatbelt === "absent" ? "Sin cinturón" : seatbelt === "worn" ? "Puesto" : "—"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Distractions */}
                    <div className="hud-panel p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <Phone className="text-orange-400" size={20} />
                            <span className="font-mono uppercase tracking-wide text-sm">Distracciones</span>
                        </div>
                        {status.distractions.length > 0 ? (
                            <ul className="space-y-2">
                                {status.distractions.map((d, i) => (
                                    <li key={i} className="flex items-center justify-between text-sm">
                                        <span className="text-red-400">{DISTRACTION_LABEL[d.type] ?? d.type.replace("_", " ")}</span>
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
