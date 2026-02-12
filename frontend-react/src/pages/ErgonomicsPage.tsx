import React, { useRef, useEffect, useState, useCallback } from "react";
import { ShieldCheck, Activity, Camera, Upload, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { ServiceLayout } from "../components/ServiceLayout";
import { PPENavItems } from "./PPEServicePage";

const WS_URL = (import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000").replace("/ws/ppe-stream", "");

type PostureIssue = {
    type: string;
    level: "warning" | "danger";
    message: string;
    angle?: number;
};

type AnalysisResult = {
    detections: Array<{ box: number[]; keypoints?: number[][]; posture_score?: number; issues?: PostureIssue[] }>;
    people_count: number;
    posture_issues: PostureIssue[];
    avg_posture_score: number;
    risk_level: "low" | "medium" | "high";
    latency_ms: number;
};

// Professional body diagram component with anatomical style
const BodyDiagram: React.FC<{ issues: PostureIssue[]; score: number }> = ({ issues }) => {
    const hasSpineIssue = issues.some(i => ["CURVED_SPINE", "SLIGHT_CURVE", "BENT_FORWARD"].includes(i.type));
    const hasLegIssue = issues.some(i => i.type === "STRAIGHT_LEG_LIFT");
    const hasArmIssue = issues.some(i => i.type === "OVERHEAD_REACH");

    const spineLevel = issues.find(i => ["CURVED_SPINE", "BENT_FORWARD"].includes(i.type))?.level ||
        issues.find(i => i.type === "SLIGHT_CURVE")?.level || null;
    const legLevel = issues.find(i => i.type === "STRAIGHT_LEG_LIFT")?.level || null;
    const armLevel = issues.find(i => i.type === "OVERHEAD_REACH")?.level || null;

    const getZoneStyle = (hasIssue: boolean, level: "danger" | "warning" | null) => {
        if (!hasIssue) return { fill: "url(#greenGradient)", filter: "url(#glowGreen)" };
        if (level === "danger") return { fill: "url(#redGradient)", filter: "url(#glowRed)" };
        return { fill: "url(#orangeGradient)", filter: "url(#glowOrange)" };
    };

    const spineStyle = getZoneStyle(hasSpineIssue, spineLevel);
    const armStyle = getZoneStyle(hasArmIssue, armLevel);
    const legStyle = getZoneStyle(hasLegIssue, legLevel);

    return (
        <div className="bg-slate-800 rounded-xl p-4">
            <h3 className="font-semibold mb-3 text-center text-sm">Mapa Corporal</h3>
            <svg viewBox="0 0 120 200" className="w-full h-52 mx-auto">
                <defs>
                    {/* Gradients */}
                    <linearGradient id="greenGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="orangeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#fbbf24" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <linearGradient id="redGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#f87171" />
                        <stop offset="100%" stopColor="#dc2626" />
                    </linearGradient>
                    <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#475569" />
                        <stop offset="100%" stopColor="#334155" />
                    </linearGradient>

                    {/* Glow filters */}
                    <filter id="glowGreen" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feFlood floodColor="#22c55e" floodOpacity="0.5" />
                        <feComposite in2="blur" operator="in" />
                        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="glowOrange" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="blur" />
                        <feFlood floodColor="#f59e0b" floodOpacity="0.6" />
                        <feComposite in2="blur" operator="in" />
                        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                    <filter id="glowRed" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feFlood floodColor="#ef4444" floodOpacity="0.7" />
                        <feComposite in2="blur" operator="in" />
                        <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* Head */}
                <ellipse cx="60" cy="22" rx="14" ry="16" fill="url(#bodyGradient)" />
                <ellipse cx="60" cy="20" rx="12" ry="14" fill="#64748b" />

                {/* Neck */}
                <rect x="54" y="36" width="12" height="10" rx="3" fill="url(#bodyGradient)" />

                {/* Shoulders and upper torso */}
                <path d="M 30 50 Q 35 46 60 46 Q 85 46 90 50 L 88 58 Q 60 55 32 58 Z" fill="url(#bodyGradient)" />

                {/* Arms with anatomical shape */}
                <g className="transition-all duration-500">
                    {/* Left arm */}
                    <path d="M 30 50 Q 22 52 18 65 Q 14 80 16 95 Q 18 105 20 110"
                        stroke={hasArmIssue ? (armLevel === "danger" ? "#ef4444" : "#f59e0b") : "#22c55e"}
                        strokeWidth="10" strokeLinecap="round" fill="none"
                        filter={armStyle.filter} className="transition-all duration-300" />
                    {/* Right arm */}
                    <path d="M 90 50 Q 98 52 102 65 Q 106 80 104 95 Q 102 105 100 110"
                        stroke={hasArmIssue ? (armLevel === "danger" ? "#ef4444" : "#f59e0b") : "#22c55e"}
                        strokeWidth="10" strokeLinecap="round" fill="none"
                        filter={armStyle.filter} className="transition-all duration-300" />
                </g>

                {/* Torso */}
                <path d="M 35 55 L 32 100 Q 35 108 60 108 Q 85 108 88 100 L 85 55 Q 60 52 35 55"
                    fill="url(#bodyGradient)" />

                {/* Spine highlight */}
                <g className="transition-all duration-500">
                    <path d="M 60 48 L 60 105"
                        stroke={hasSpineIssue ? (spineLevel === "danger" ? "#ef4444" : "#f59e0b") : "#22c55e"}
                        strokeWidth="8" strokeLinecap="round"
                        filter={spineStyle.filter} className="transition-all duration-300" />
                    {/* Vertebrae dots */}
                    {[52, 62, 72, 82, 92].map((y, i) => (
                        <circle key={i} cx="60" cy={y} r="3"
                            fill={hasSpineIssue ? (spineLevel === "danger" ? "#fca5a5" : "#fcd34d") : "#86efac"} />
                    ))}
                </g>

                {/* Pelvis */}
                <ellipse cx="60" cy="112" rx="26" ry="10" fill="url(#bodyGradient)" />

                {/* Legs with anatomical shape */}
                <g className="transition-all duration-500">
                    {/* Left leg */}
                    <path d="M 42 118 Q 38 145 40 165 Q 42 180 40 190"
                        stroke={hasLegIssue ? (legLevel === "danger" ? "#ef4444" : "#f59e0b") : "#22c55e"}
                        strokeWidth="14" strokeLinecap="round" fill="none"
                        filter={legStyle.filter} className="transition-all duration-300" />
                    {/* Right leg */}
                    <path d="M 78 118 Q 82 145 80 165 Q 78 180 80 190"
                        stroke={hasLegIssue ? (legLevel === "danger" ? "#ef4444" : "#f59e0b") : "#22c55e"}
                        strokeWidth="14" strokeLinecap="round" fill="none"
                        filter={legStyle.filter} className="transition-all duration-300" />
                </g>
            </svg>

            {/* Status indicators */}
            <div className="grid grid-cols-3 gap-1 mt-3 text-xs">
                <div className={`text-center py-1 rounded ${hasSpineIssue ? (spineLevel === "danger" ? "bg-red-500/20 text-red-400" : "bg-orange-500/20 text-orange-400") : "bg-green-500/20 text-green-400"}`}>
                    Columna
                </div>
                <div className={`text-center py-1 rounded ${hasArmIssue ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-400"}`}>
                    Brazos
                </div>
                <div className={`text-center py-1 rounded ${hasLegIssue ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-400"}`}>
                    Piernas
                </div>
            </div>
        </div>
    );
};

export const ErgonomicsPage: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const [activeMode, setActiveMode] = useState<"webcam" | "video" | null>(null);
    const [wsStatus, setWsStatus] = useState("Desconectado");
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [fps, setFps] = useState(0);
    const [showGuide, setShowGuide] = useState(true);
    const latestResultRef = useRef<AnalysisResult | null>(null);

    const frameCountRef = useRef(0);
    const lastFpsTimeRef = useRef(Date.now());

    // Connect WebSocket
    const connectWs = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(`${WS_URL}/ws/ergonomics-stream`);

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
            display_width: 640,
            display_height: 480,
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

    // Draw ideal posture guide overlay
    const drawIdealPostureGuide = (ctx: CanvasRenderingContext2D, midShoulderX: number, midShoulderY: number, midHipX: number, midHipY: number, nose: number[]) => {
        // Calculate the height from hip to shoulder
        const spineHeight = midHipY - midShoulderY;

        // Draw ideal vertical line from hip going straight up
        ctx.save();

        // Main vertical guide line (dashed)
        ctx.setLineDash([10, 6]);
        ctx.strokeStyle = "rgba(34, 197, 94, 0.7)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(midHipX, midHipY + 20); // Start below hips
        ctx.lineTo(midHipX, midShoulderY - spineHeight * 0.5); // Extend above head
        ctx.stroke();
        ctx.setLineDash([]);

        // Ideal shoulder position marker
        const idealShoulderY = midShoulderY;
        ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
        ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(midHipX, idealShoulderY, 12, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Ideal head position marker
        if (nose && nose[0] > 0) {
            const idealHeadY = midShoulderY - (midHipY - midShoulderY) * 0.4;
            ctx.fillStyle = "rgba(34, 197, 94, 0.2)";
            ctx.beginPath();
            ctx.arc(midHipX, idealHeadY, 18, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        }

        // Arrow indicator showing where shoulders should move
        if (Math.abs(midShoulderX - midHipX) > 15) {
            ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
            ctx.lineWidth = 2;
            ctx.setLineDash([]);

            // Arrow from current shoulder to ideal position
            ctx.beginPath();
            ctx.moveTo(midShoulderX, midShoulderY);
            ctx.lineTo(midHipX, midShoulderY);
            ctx.stroke();

            // Arrow head
            const arrowDir = midShoulderX > midHipX ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(midHipX, midShoulderY);
            ctx.lineTo(midHipX - arrowDir * 8, midShoulderY - 6);
            ctx.moveTo(midHipX, midShoulderY);
            ctx.lineTo(midHipX - arrowDir * 8, midShoulderY + 6);
            ctx.stroke();
        }

        ctx.restore();
    };

    // Draw skeleton and detections
    useEffect(() => {
        if (!activeMode) return;

        let renderId: number;
        let lastSendTime = 0;
        const SEND_INTERVAL = 100;

        const render = () => {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");

            if (video && canvas && ctx && video.readyState >= 2) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                const now = Date.now();
                if (now - lastSendTime >= SEND_INTERVAL) {
                    sendFrame();
                    lastSendTime = now;
                }

                const r = latestResultRef.current;
                if (r?.detections) {
                    const SKELETON_CONNECTIONS = [
                        [0, 1], [0, 2], [1, 3], [2, 4],
                        [5, 6], [5, 11], [6, 12], [11, 12],
                        [5, 7], [7, 9], [6, 8], [8, 10],
                        [11, 13], [13, 15], [12, 14], [14, 16],
                    ];

                    for (const det of r.detections) {
                        const [x1, y1] = det.box;
                        const score = det.posture_score ?? 100;

                        const kps = det.keypoints;
                        if (kps && kps.length >= 17) {
                            // Get key points
                            const leftShoulder = kps[5];
                            const rightShoulder = kps[6];
                            const leftHip = kps[11];
                            const rightHip = kps[12];
                            const nose = kps[0];

                            let midShoulderX = 0, midShoulderY = 0, midHipX = 0, midHipY = 0;
                            if (leftShoulder && rightShoulder && leftHip && rightHip &&
                                leftShoulder[0] > 0 && rightShoulder[0] > 0 && leftHip[0] > 0 && rightHip[0] > 0) {
                                midShoulderX = (leftShoulder[0] + rightShoulder[0]) / 2;
                                midShoulderY = (leftShoulder[1] + rightShoulder[1]) / 2;
                                midHipX = (leftHip[0] + rightHip[0]) / 2;
                                midHipY = (leftHip[1] + rightHip[1]) / 2;

                                // Draw ideal posture guide if enabled
                                if (showGuide && nose) {
                                    drawIdealPostureGuide(ctx, midShoulderX, midShoulderY, midHipX, midHipY, nose);
                                }

                                // Draw gradient spine line
                                const gradient = ctx.createLinearGradient(midHipX, midHipY, midShoulderX, midShoulderY);
                                if (score >= 80) {
                                    gradient.addColorStop(0, "#22c55e"); // Green at hip
                                    gradient.addColorStop(1, "#22c55e"); // Green at shoulder
                                } else if (score >= 50) {
                                    gradient.addColorStop(0, "#22c55e"); // Green at hip
                                    gradient.addColorStop(0.5, "#f59e0b"); // Orange middle
                                    gradient.addColorStop(1, "#f59e0b"); // Orange at shoulder
                                } else {
                                    gradient.addColorStop(0, "#22c55e"); // Green at hip
                                    gradient.addColorStop(0.3, "#f59e0b"); // Orange
                                    gradient.addColorStop(1, "#ef4444"); // Red at shoulder
                                }

                                ctx.strokeStyle = gradient;
                                ctx.lineWidth = 8;
                                ctx.lineCap = "round";
                                ctx.beginPath();
                                ctx.moveTo(midHipX, midHipY);
                                ctx.lineTo(midShoulderX, midShoulderY);
                                ctx.stroke();

                                // Draw head connection with color
                                if (nose && nose[0] > 0 && nose[1] > 0) {
                                    const headGradient = ctx.createLinearGradient(midShoulderX, midShoulderY, nose[0], nose[1]);
                                    headGradient.addColorStop(0, score >= 50 ? "#f59e0b" : "#ef4444");
                                    headGradient.addColorStop(1, score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444");

                                    ctx.strokeStyle = headGradient;
                                    ctx.lineWidth = 5;
                                    ctx.beginPath();
                                    ctx.moveTo(midShoulderX, midShoulderY);
                                    ctx.lineTo(nose[0], nose[1]);
                                    ctx.stroke();
                                }
                            }

                            // Draw skeleton lines
                            const color = score < 50 ? "#ef4444" : score < 80 ? "#f59e0b" : "#22c55e";
                            ctx.strokeStyle = color;
                            ctx.lineWidth = 2;

                            for (const [i, j] of SKELETON_CONNECTIONS) {
                                // Skip spine connections (we drew them with gradient)
                                if ((i === 5 && j === 11) || (i === 6 && j === 12)) continue;

                                const p1 = kps[i];
                                const p2 = kps[j];

                                if (p1 && p2 &&
                                    p1[0] > 0 && p1[1] > 0 && (p1[2] ?? 0) > 0.3 &&
                                    p2[0] > 0 && p2[1] > 0 && (p2[2] ?? 0) > 0.3) {
                                    ctx.beginPath();
                                    ctx.moveTo(p1[0], p1[1]);
                                    ctx.lineTo(p2[0], p2[1]);
                                    ctx.stroke();
                                }
                            }

                            // Draw keypoint circles
                            for (let idx = 0; idx < kps.length; idx++) {
                                const kp = kps[idx];
                                if (kp && kp[0] > 0 && kp[1] > 0 && (kp[2] ?? 0) > 0.3) {
                                    const isSpine = [5, 6, 11, 12].includes(idx);
                                    const radius = isSpine ? 8 : 4;

                                    ctx.fillStyle = isSpine ? color : "#94a3b8";
                                    ctx.beginPath();
                                    ctx.arc(kp[0], kp[1], radius, 0, 2 * Math.PI);
                                    ctx.fill();

                                    ctx.strokeStyle = "#ffffff";
                                    ctx.lineWidth = 2;
                                    ctx.stroke();
                                }
                            }
                        }

                        // Draw score label with background
                        const labelText = `Postura: ${score}%`;
                        ctx.font = "bold 14px Inter";
                        const textWidth = ctx.measureText(labelText).width;

                        ctx.fillStyle = score < 50 ? "rgba(239,68,68,0.8)" : score < 80 ? "rgba(245,158,11,0.8)" : "rgba(34,197,94,0.8)";
                        ctx.fillRect(x1, y1 - 24, textWidth + 12, 20);

                        ctx.fillStyle = "#ffffff";
                        ctx.fillText(labelText, x1 + 6, y1 - 9);
                    }
                }
            }

            renderId = requestAnimationFrame(render);
        };

        render();
        return () => cancelAnimationFrame(renderId);
    }, [activeMode, sendFrame, showGuide]);

    return (
        <ServiceLayout
            serviceName="Detección de EPP"
            serviceIcon={<ShieldCheck className="text-cyan-400" size={24} />}
            accentColor="bg-cyan-500/20"
            navItems={PPENavItems}
        >
            <div className="p-4 md:p-8">
                <div className="mb-6">
                    <h1 className="text-2xl md:text-3xl font-bold mb-2 flex items-center gap-3">
                        <Activity className="text-green-400" />
                        Análisis de Ergonomía
                    </h1>
                    <p className="text-slate-400">
                        Detecta posturas incorrectas: espalda encorvada, brazos elevados, levantamiento con piernas rectas.
                    </p>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Video Feed */}
                    <div className="lg:col-span-2 bg-slate-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-2 bg-green-600/30 flex items-center justify-between">
                            <span className="font-semibold">Cámara</span>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setShowGuide(!showGuide)}
                                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${showGuide ? "bg-green-600" : "bg-slate-600"}`}
                                >
                                    {showGuide ? <Eye size={12} /> : <EyeOff size={12} />}
                                    Guía
                                </button>
                                <span className="text-xs text-slate-300">{fps} fps · {result?.latency_ms?.toFixed(0) || 0}ms</span>
                            </div>
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
                                        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg">
                                            <Upload size={18} /> Video
                                        </button>
                                    </div>
                                </div>
                            )}
                            <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileUpload} />

                            {/* Guide Legend */}
                            {activeMode && showGuide && (
                                <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur-sm rounded-lg px-3 py-2 text-xs">
                                    <div className="flex items-center gap-2 text-green-400">
                                        <div className="w-8 h-0.5 border-t-2 border-dashed border-green-400"></div>
                                        <span>Postura ideal</span>
                                    </div>
                                </div>
                            )}
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

                    {/* Right Panel */}
                    <div className="space-y-4">
                        {/* Score Gauge */}
                        <div className="bg-slate-800 rounded-xl p-6 text-center">
                            <h3 className="text-lg font-semibold mb-4">Puntuación de Postura</h3>
                            <div className={`text-6xl font-bold transition-colors duration-300 ${(result?.avg_posture_score ?? 100) < 50 ? "text-red-400" :
                                (result?.avg_posture_score ?? 100) < 80 ? "text-orange-400" : "text-green-400"
                                }`}>
                                {result?.avg_posture_score ?? 100}%
                            </div>
                            <div className="mt-2 text-sm text-slate-400">
                                {result?.people_count ?? 0} trabajadores detectados
                            </div>
                        </div>

                        {/* Body Diagram */}
                        <BodyDiagram
                            issues={result?.posture_issues || []}
                            score={result?.avg_posture_score ?? 100}
                        />

                        {/* Issues List */}
                        <div className="bg-slate-800 rounded-xl p-4">
                            <h3 className="font-semibold mb-3">Problemas Detectados</h3>
                            {result?.posture_issues && result.posture_issues.length > 0 ? (
                                <div className="space-y-2">
                                    {result.posture_issues.map((issue, i) => (
                                        <div key={i} className={`rounded-lg px-3 py-2 text-sm ${issue.level === "danger"
                                            ? "bg-red-500/20 border border-red-500/50 text-red-400"
                                            : "bg-orange-500/20 border border-orange-500/50 text-orange-400"
                                            }`}>
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle size={14} />
                                                <span>{issue.message}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-slate-500 text-sm">
                                    ✓ Sin problemas de postura detectados
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </ServiceLayout>
    );
};
