import React, { useRef, useEffect, useState, useCallback } from "react";
import { Camera, Video, StopCircle, Upload, Play, Pause, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { getSessionId } from "../utils/session";

type FrameResult = {
  frame_id: number;
  timestamp?: number;
  detections: Array<{ box: number[]; class_name?: string; confidence?: number }>;
  violations?: Array<{ violation_type: string; severity: string; details?: Record<string, unknown> }>;
  latency_ms?: number;
};



const StatsPanel: React.FC<{ latestResultRef: React.MutableRefObject<FrameResult | null>; activeMode: string | null }> = ({ latestResultRef, activeMode }) => {
  const [stats, setStats] = useState<{ counts: Record<string, number>; compliance: number }>({ counts: {}, compliance: 100 });

  useEffect(() => {
    if (!activeMode) return;
    const interval = setInterval(() => {
      const result = latestResultRef.current;
      if (!result) return;

      const counts: Record<string, number> = {};
      let totalDetections = 0;
      let violations = 0;

      result.detections.forEach(d => {
        const cls = (d.class_name || "").toLowerCase();
        // Group by type (simplify keys)
        let key = cls;
        if (cls.includes("helmet") || cls.includes("casco")) key = "helmet";
        else if (cls.includes("vest") || cls.includes("chaleco")) key = "vest";
        else if (cls.includes("glove") || cls.includes("guante")) key = "gloves";
        else if (cls.includes("goggle") || cls.includes("gafa")) key = "goggles";
        else if (cls.includes("boot") || cls.includes("bota")) key = "boots";
        else if (cls.includes("mask") || cls.includes("mascarilla")) key = "mask";
        else if (cls.includes("person")) key = "person";

        counts[key] = (counts[key] || 0) + 1;
        totalDetections++;

        if (cls.startsWith("no ") || cls.startsWith("no_")) {
          violations++;
        }
      });

      // Calculate simple compliance score (100 - (violations/people * 50)) or similar

      const calculatedScore = Math.max(0, 100 - (violations * 20)); // Arbitrary penalty

      setStats({ counts, compliance: calculatedScore });
    }, 200); // Update stats every 200ms

    return () => clearInterval(interval);
  }, [activeMode]);

  if (!activeMode) return null;

  return (
    <div className="hud-panel p-4 space-y-4">
      {/* High Level Status */}
      <div className={clsx("p-3 rounded-lg border flex items-center justify-between",
        stats.compliance === 100 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
          stats.compliance > 70 ? "bg-orange-500/10 border-orange-500/30 text-orange-400" :
            "bg-red-500/10 border-red-500/30 text-red-400"
      )}>
        <div className="flex items-center gap-3">
          <div className="text-2xl font-mono font-bold tnum">{stats.compliance}%</div>
          <div className="text-xs font-mono uppercase tracking-widest">
            {stats.compliance === 100 ? "Seguro" : "Riesgo detectado"}
          </div>
        </div>
        {stats.compliance < 100 && <AlertTriangle size={24} />}
      </div>

      {/* Grid of Items */}
      <div className="grid grid-cols-2 lg:grid-cols-2 gap-3">
        <StatItem icon="P" label="Personas" count={stats.counts["person"] || 0} color="text-slate-300" />
        <StatItem icon="H" label="Cascos" count={stats.counts["helmet"] || 0} color="text-blue-400" />
        <StatItem icon="V" label="Chalecos" count={stats.counts["vest"] || 0} color="text-orange-400" />
        <StatItem icon="G" label="Guantes" count={stats.counts["gloves"] || 0} color="text-purple-400" />
        <StatItem icon="O" label="Gafas" count={stats.counts["goggles"] || 0} color="text-cyan-400" />
        <StatItem icon="B" label="Botas" count={stats.counts["boots"] || 0} color="text-lime-400" />
      </div>
    </div>
  );
};

const StatItem = ({ icon, label, count, color }: { icon: string, label: string, count: number, color: string }) => (
  <div className="border border-hud-line p-2 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <span className="font-mono text-hud-dim text-xs">{icon}</span>
      <span className="text-xs text-hud-dim font-mono uppercase tracking-wider">{label}</span>
    </div>
    <span className={clsx("font-mono font-bold tnum", color)}>{count}</span>
  </div>
);

export const VideoFeed: React.FC<{ initialMode?: "webcam" | "file" }> = ({ initialMode }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestResultRef = useRef<FrameResult | null>(null);
  const capturedFrameRef = useRef<ImageData | null>(null); // Store analyzed frame for sync display
  const pendingFramesMap = useRef<Map<number, ImageData>>(new Map()); // Store all frames sent for analysis

  const [activeMode, setActiveMode] = useState<"webcam" | "file" | null>(initialMode || null);
  const [fps, setFps] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [wsStatus, setWsStatus] = useState<string>("Selecciona una fuente");
  const [violationLog, setViolationLog] = useState<
    Array<{ id: number; label: string; severity: string; timestamp?: number }>
  >([]);

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
      if (videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      videoRef.current.src = "";
      videoRef.current.load();
    }
    latestResultRef.current = null;
    setActiveMode(null);
    setFps(0);
    setLatencyMs(0);
    setIsPaused(false);
    setViolationLog([]);
    setWsStatus("Idle");
  }, []);

  const startWebcam = async () => {
    stopEverything();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
        };
      }
      setActiveMode("webcam");
      setWsStatus("Webcam activa");
    } catch (e) {
      alert("No se pudo acceder a la cámara.");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopEverything();
    const url = URL.createObjectURL(file);
    if (videoRef.current) {
      videoRef.current.src = url;
      videoRef.current.loop = false;
      videoRef.current.muted = true;
      videoRef.current.onloadedmetadata = () => {
        videoRef.current?.play();
      };
    }
    setActiveMode("file");
    setWsStatus("Procesando video local…");
  };

  useEffect(() => {
    if (!activeMode) return;

    const baseUrl = import.meta.env.VITE_WS_URL || "ws://127.0.0.1:8000/ws/ppe-stream";
    const wsUrl = `${baseUrl}?session_id=${getSessionId()}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    let animationFrameId: number;
    let isProcessing = false;
    let loopCount = 0;

    console.log("🚀 FREEZE-FRAME MODE v2 - VideoFeed initialized");

    const processLoop = () => {
      loopCount++;
      if (loopCount % 60 === 1) {
        console.log(`📊 STATUS: Processing=${isProcessing}, MapSize=${pendingFramesMap.current.size}, LastID=${frameSequence.current}, Latency=${latencyMs}ms`);
      }
      if (!videoRef.current || ws.readyState !== WebSocket.OPEN) {
        animationFrameId = requestAnimationFrame(processLoop);
        return;
      }

      if (isPaused || videoRef.current.ended) {
        animationFrameId = requestAnimationFrame(processLoop);
        return;
      }

      // LOCK-STEP: Only send next frame after previous response received
      if (isProcessing) {
        animationFrameId = requestAnimationFrame(processLoop);
        return;
      }

      // BACKPRESSURE: If we have pending frames (even if isProcessing is false due to timeout),
      // DO NOT send more. Wait for the queue to drain.
      if (pendingFramesMap.current.size > 2) {
        if (loopCount % 60 === 1) console.log("⏳ Backpressure: Waiting for pending frames to clear...");
        animationFrameId = requestAnimationFrame(processLoop);
        return;
      }

      // Need valid frame from video (not paused, not ended, ready)
      if (videoRef.current.readyState < 2 || videoRef.current.paused || videoRef.current.ended) {
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
        // Capture the current frame
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Store this frame with its ID for later retrieval
        const currentFrameId = ++frameSequence.current;
        pendingFramesMap.current.set(currentFrameId, frameData);

        // Clean up old frames (Keep last 100 to handle latency spikes)
        if (pendingFramesMap.current.size > 100) {
          const firstKey = pendingFramesMap.current.keys().next().value;
          if (firstKey !== undefined) {
            pendingFramesMap.current.delete(firstKey);
            console.log("⚠️ MAP FULL - Dropped oldest frame to prevent overflow");
          }
        }

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
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
          // console.log(`📤 Sent frame ${currentFrameId}`); // Commented out to reduce noise

          // Timeout to recover if response never arrives
          setTimeout(() => {
            if (isProcessing) {
              console.log(`⏰ TIMEOUT - Resetting isProcessing (MapSize: ${pendingFramesMap.current.size})`);
              isProcessing = false;
            }
          }, 5000); // Increased timeout to 5s to prevent flooding
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
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data) as { type: string } & FrameResult & { message?: string };
        if (payload.type === "frame_result") {
          // SYNC: Retrieve the exact frame that matches this result
          if (pendingFramesMap.current.has(payload.frame_id)) {
            capturedFrameRef.current = pendingFramesMap.current.get(payload.frame_id)!;
            latestResultRef.current = payload; // Only update results if we have the frame!

            // Clean up this frame and any older frames (no longer needed)
            pendingFramesMap.current.delete(payload.frame_id);
            for (const key of pendingFramesMap.current.keys()) {
              if (key < payload.frame_id) pendingFramesMap.current.delete(key);
            }
          } else {
            console.warn(`⚠️ DROP: Result ID ${payload.frame_id} ignored (Frame not found in Map)`);
            // Do NOT update latestResultRef here - checking for frame is critical for sync
            return;
          }

          // Debug log
          // console.log(`📥 Received result for frame ${payload.frame_id}`);
          if (typeof payload.latency_ms === "number") {
            setLatencyMs(payload.latency_ms);
          }
          if (payload.violations?.length) {
            setViolationLog((prev) => {
              const annotated = payload.violations!.map((v, idx) => ({
                id: payload.frame_id * 10 + idx,
                label: v.violation_type,
                severity: v.severity,
                timestamp: payload.timestamp,
              }));
              return [...annotated, ...prev].slice(0, 12);
            });
          }
          framesCount.current++;
          if (Date.now() - lastFpsTime.current >= 1000) {
            setFps(framesCount.current);
            framesCount.current = 0;
            lastFpsTime.current = Date.now();
          }
        } else if (payload.type === "error" && payload.message) {
          setWsStatus(`Error: ${payload.message}`);
        }
      } catch (error) {
        console.error("WS payload error", error);
      }
    };

    ws.onerror = () => {
      setWsStatus("Error de WebSocket");
      isProcessing = false;
    };

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

  useEffect(() => {
    if (!activeMode) return;
    let renderId: number;

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

      // FREEZE-FRAME MODE: Only show analyzed frames for perfect sync
      if (capturedFrameRef.current) {
        // Scale captured frame to display canvas size
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = capturedFrameRef.current.width;
        tempCanvas.height = capturedFrameRef.current.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (tempCtx) {
          tempCtx.putImageData(capturedFrameRef.current, 0, 0);
          ctx.drawImage(
            tempCanvas,
            0,
            0,
            displayCanvasRef.current.width,
            displayCanvasRef.current.height
          );
        }
      } else {
        // Show loading screen until first analyzed frame arrives
        ctx.fillStyle = "#0a0a0b";
        ctx.fillRect(0, 0, displayCanvasRef.current.width, displayCanvasRef.current.height);
        ctx.fillStyle = "#86847a";
        ctx.font = "14px 'IBM Plex Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText("ANALIZANDO…", displayCanvasRef.current.width / 2, displayCanvasRef.current.height / 2);
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

  const togglePause = () => {
    if (!videoRef.current) return;
    if (isPaused) {
      videoRef.current.play();
      setIsPaused(false);
    } else {
      videoRef.current.pause();
      setIsPaused(true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 hud-panel p-3">
        <div className="flex gap-2">
          <button
            onClick={startWebcam}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 font-mono uppercase tracking-widest text-xs transition-colors",
              activeMode === "webcam" ? "bg-amber-400 text-hud-bg" : "border border-hud-line text-hud-dim hover:text-amber-400 hover:border-amber-400"
            )}
          >
            <Camera size={16} /> Webcam
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 font-mono uppercase tracking-widest text-xs transition-colors",
              activeMode === "file" ? "bg-amber-400 text-hud-bg" : "border border-hud-line text-hud-dim hover:text-amber-400 hover:border-amber-400"
            )}
          >
            <Upload size={16} /> Subir Vídeo
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={handleFileSelect} />
        </div>

        {activeMode && (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span className="flex items-center gap-2 px-3 py-1 border border-hud-line text-hud-dim">
              <span className={`hud-dot inline-block ${wsStatus === "Conectado" ? "bg-phosphor-400" : "bg-hud-dim"}`} />
              {wsStatus}
            </span>
            <span className="px-3 py-1 border border-hud-line text-hud-dim tnum">
              {fps} FPS · {latencyMs.toFixed(1)} MS
            </span>
            <button onClick={togglePause} className="p-2 border border-hud-line hover:border-amber-400 text-hud-bone transition-colors">
              {isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
            </button>
            <button
              onClick={stopEverything}
              className="p-2 border border-hud-line text-alarm-400 hover:border-alarm-400 transition-colors"
            >
              <StopCircle size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Main Grid Layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Video Area */}
        <div className="lg:col-span-2 relative w-full aspect-video bg-hud-bg hud-panel hud-corners overflow-hidden flex items-center justify-center group">
          {!activeMode && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-hud-dim">
              <Video size={56} className="opacity-20 mb-4" />
              <p className="hud-label">Selecciona una fuente de vídeo</p>
            </div>
          )}

          <video ref={videoRef} className="hidden" playsInline loop muted />

          {activeMode && (
            <>
              <canvas
                ref={displayCanvasRef}
                className="w-full h-full object-contain"
                width={640}
                height={480}
              />

              {/* Warning Overlay for active violation */}
              {violationLog.length > 0 && violationLog[0].timestamp === latestResultRef.current?.timestamp && (
                <div className="absolute top-4 right-4 animate-pulse">
                  <div className="bg-alarm-400 text-hud-bg px-4 py-2 font-mono uppercase tracking-widest text-xs flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Violación detectada
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Real-time Stats Panel */}
        <div className="space-y-4">
          {/* Compliance Score Card */}
          <StatsPanel latestResultRef={latestResultRef} activeMode={activeMode} />

          {/* Violation Log */}
          <div className="hud-panel flex flex-col h-64">
            <div className="p-3 border-b border-hud-line flex items-center gap-2">
              <div className="w-1 h-4 bg-amber-400" />
              <h3 className="hud-label">Registro de violaciones</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {violationLog.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-hud-dim text-xs">
                  <span className="text-2xl mb-2 opacity-20">—</span>
                  <span className="hud-label">Sin violaciones recientes</span>
                </div>
              ) : (
                violationLog.map((log) => (
                  <div
                    key={log.id}
                    className="text-xs border border-hud-line p-2 flex items-center justify-between group hover:border-amber-400/40 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="text-amber-400" size={12} />
                      <span className="text-hud-bone font-mono">{log.label}</span>
                    </div>
                    <span className="text-hud-dim font-mono tnum group-hover:text-hud-bone">
                      {new Date(log.timestamp || Date.now()).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// PPE color mapping with icons
const PPE_STYLES: Record<string, { color: string; icon: string; bgColor: string }> = {
  // Compliant items (green variants)
  "helmet": { color: "#3b82f6", icon: "H", bgColor: "rgba(59, 130, 246, 0.15)" },
  "hardhat": { color: "#3b82f6", icon: "H", bgColor: "rgba(59, 130, 246, 0.15)" },
  "casco": { color: "#3b82f6", icon: "H", bgColor: "rgba(59, 130, 246, 0.15)" },
  "vest": { color: "#f97316", icon: "V", bgColor: "rgba(249, 115, 22, 0.15)" },
  "chaleco": { color: "#f97316", icon: "V", bgColor: "rgba(249, 115, 22, 0.15)" },
  "gloves": { color: "#a855f7", icon: "G", bgColor: "rgba(168, 85, 247, 0.15)" },
  "guantes": { color: "#a855f7", icon: "G", bgColor: "rgba(168, 85, 247, 0.15)" },
  "goggles": { color: "#06b6d4", icon: "O", bgColor: "rgba(6, 182, 212, 0.15)" },
  "gafas": { color: "#06b6d4", icon: "O", bgColor: "rgba(6, 182, 212, 0.15)" },
  "glasses": { color: "#06b6d4", icon: "O", bgColor: "rgba(6, 182, 212, 0.15)" },
  "boots": { color: "#84cc16", icon: "B", bgColor: "rgba(132, 204, 22, 0.15)" },
  "botas": { color: "#84cc16", icon: "B", bgColor: "rgba(132, 204, 22, 0.15)" },
  "mask": { color: "#ec4899", icon: "M", bgColor: "rgba(236, 72, 153, 0.15)" },
  "mascarilla": { color: "#ec4899", icon: "M", bgColor: "rgba(236, 72, 153, 0.15)" },
  "person": { color: "#22c55e", icon: "P", bgColor: "rgba(34, 197, 94, 0.15)" },
  "persona": { color: "#22c55e", icon: "P", bgColor: "rgba(34, 197, 94, 0.15)" },
  // Non-compliant items (red tones)
  "no helmet": { color: "#ef4444", icon: "!", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no hardhat": { color: "#ef4444", icon: "!", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no vest": { color: "#ef4444", icon: "!", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no gloves": { color: "#ef4444", icon: "!", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no goggles": { color: "#ef4444", icon: "!", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no mask": { color: "#ef4444", icon: "!", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no boots": { color: "#ef4444", icon: "!", bgColor: "rgba(239, 68, 68, 0.2)" },
};

function getStyleForClass(className: string): { color: string; icon: string; bgColor: string } {
  const normalized = className.toLowerCase().trim();

  // Direct match
  if (PPE_STYLES[normalized]) return PPE_STYLES[normalized];

  // Partial match
  for (const [key, style] of Object.entries(PPE_STYLES)) {
    if (normalized.includes(key) || key.includes(normalized)) return style;
  }

  // Fallback based on compliance
  const isViolation = normalized.startsWith("no ") || normalized.startsWith("no_");
  return isViolation
    ? { color: "#ef4444", icon: "!", bgColor: "rgba(239, 68, 68, 0.2)" }
    : { color: "#22c55e", icon: "✓", bgColor: "rgba(34, 197, 94, 0.15)" };
}

function drawDetections(ctx: CanvasRenderingContext2D, detections: FrameResult["detections"]) {
  ctx.save();

  detections.forEach((det) => {
    const [x1, y1, x2, y2] = det.box;
    const className = det.class_name ?? "objeto";
    const confidence = det.confidence ?? 0;
    const style = getStyleForClass(className);
    const isViolation = className.toLowerCase().startsWith("no ");

    // Draw filled bounding box
    ctx.fillStyle = style.bgColor;
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

    // Draw border with glow effect for violations
    if (isViolation) {
      ctx.shadowColor = style.color;
      ctx.shadowBlur = 8;
    }
    ctx.strokeStyle = style.color;
    ctx.lineWidth = isViolation ? 3 : 2;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.shadowBlur = 0;

    // Corner accents for more modern look
    const cornerLen = Math.min(15, (x2 - x1) / 4, (y2 - y1) / 4);
    ctx.lineWidth = 3;
    ctx.strokeStyle = style.color;

    // Top-left corner
    ctx.beginPath();
    ctx.moveTo(x1, y1 + cornerLen);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + cornerLen, y1);
    ctx.stroke();

    // Top-right corner
    ctx.beginPath();
    ctx.moveTo(x2 - cornerLen, y1);
    ctx.lineTo(x2, y1);
    ctx.lineTo(x2, y1 + cornerLen);
    ctx.stroke();

    // Bottom-left corner
    ctx.beginPath();
    ctx.moveTo(x1, y2 - cornerLen);
    ctx.lineTo(x1, y2);
    ctx.lineTo(x1 + cornerLen, y2);
    ctx.stroke();

    // Bottom-right corner
    ctx.beginPath();
    ctx.moveTo(x2 - cornerLen, y2);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, y2 - cornerLen);
    ctx.stroke();

    // Prepare label
    const label = `${style.icon} ${className}`;
    const confText = `${Math.round(confidence * 100)}%`;
    ctx.font = "bold 12px 'IBM Plex Mono', monospace";
    const labelWidth = ctx.measureText(label).width;
    ctx.font = "10px 'IBM Plex Mono', monospace";
    const confWidth = ctx.measureText(confText).width;

    const totalWidth = labelWidth + confWidth + 20;
    const labelHeight = 22;
    const labelY = Math.max(0, y1 - labelHeight - 4);

    // Draw pill-shaped label background
    const radius = 6;
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(x1 + radius, labelY);
    ctx.lineTo(x1 + totalWidth - radius, labelY);
    ctx.quadraticCurveTo(x1 + totalWidth, labelY, x1 + totalWidth, labelY + radius);
    ctx.lineTo(x1 + totalWidth, labelY + labelHeight - radius);
    ctx.quadraticCurveTo(x1 + totalWidth, labelY + labelHeight, x1 + totalWidth - radius, labelY + labelHeight);
    ctx.lineTo(x1 + radius, labelY + labelHeight);
    ctx.quadraticCurveTo(x1, labelY + labelHeight, x1, labelY + labelHeight - radius);
    ctx.lineTo(x1, labelY + radius);
    ctx.quadraticCurveTo(x1, labelY, x1 + radius, labelY);
    ctx.closePath();
    ctx.fill();

    // Draw label text
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px 'IBM Plex Mono', monospace";
    ctx.fillText(label, x1 + 6, labelY + 15);

    // Draw confidence percentage (slightly dimmer)
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillText(confText, x1 + labelWidth + 12, labelY + 14);
  });

  ctx.restore();
}
