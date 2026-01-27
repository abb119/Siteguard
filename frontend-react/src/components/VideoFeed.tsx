import React, { useRef, useEffect, useState, useCallback } from "react";
import { Camera, Video, StopCircle, Upload, Play, Pause, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";

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
      const personCount = counts["person"] || 1;
      const calculatedScore = Math.max(0, 100 - (violations * 20)); // Arbitrary penalty

      setStats({ counts, compliance: calculatedScore });
    }, 200); // Update stats every 200ms

    return () => clearInterval(interval);
  }, [activeMode]);

  if (!activeMode) return null;

  return (
    <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 backdrop-blur space-y-4">
      {/* High Level Status */}
      <div className={clsx("p-3 rounded-lg border flex items-center justify-between",
        stats.compliance === 100 ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" :
          stats.compliance > 70 ? "bg-orange-500/10 border-orange-500/30 text-orange-400" :
            "bg-red-500/10 border-red-500/30 text-red-400"
      )}>
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold">{stats.compliance}%</div>
          <div className="text-xs font-semibold uppercase tracking-wider">
            {stats.compliance === 100 ? "Seguro" : "Riesgo Detectado"}
          </div>
        </div>
        {stats.compliance < 100 && <AlertTriangle size={24} />}
      </div>

      {/* Grid of Items */}
      <div className="grid grid-cols-2 lg:grid-cols-2 gap-3">
        <StatItem icon="👷" label="Personas" count={stats.counts["person"] || 0} color="text-slate-300" />
        <StatItem icon="🪖" label="Cascos" count={stats.counts["helmet"] || 0} color="text-blue-400" />
        <StatItem icon="🦺" label="Chalecos" count={stats.counts["vest"] || 0} color="text-orange-400" />
        <StatItem icon="🧤" label="Guantes" count={stats.counts["gloves"] || 0} color="text-purple-400" />
        <StatItem icon="🥽" label="Gafas" count={stats.counts["goggles"] || 0} color="text-cyan-400" />
        <StatItem icon="👢" label="Botas" count={stats.counts["boots"] || 0} color="text-lime-400" />
      </div>
    </div>
  );
};

const StatItem = ({ icon, label, count, color }: { icon: string, label: string, count: number, color: string }) => (
  <div className="bg-slate-950/50 p-2 rounded-lg flex items-center justify-between border border-slate-800/50">
    <div className="flex items-center gap-2">
      <span>{icon}</span>
      <span className="text-xs text-slate-400 font-medium">{label}</span>
    </div>
    <span className={clsx("text-sm font-bold", color)}>{count}</span>
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

    const wsUrl =
      import.meta.env.VITE_WS_URL ||
      "ws://127.0.0.1:8000/ws/ppe-stream";
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
        ctx.fillStyle = "#020617";
        ctx.fillRect(0, 0, displayCanvasRef.current.width, displayCanvasRef.current.height);
        ctx.fillStyle = "#64748b";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Analizando...", displayCanvasRef.current.width / 2, displayCanvasRef.current.height / 2);
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
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/80 p-3 rounded-xl border border-slate-800 backdrop-blur">
        <div className="flex gap-2">
          <button
            onClick={startWebcam}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all",
              activeMode === "webcam" ? "bg-emerald-500 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
            )}
          >
            <Camera size={16} /> Webcam
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all",
              activeMode === "file" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
            )}
          >
            <Upload size={16} /> Subir Video
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept="video/*" onChange={handleFileSelect} />
        </div>

        {activeMode && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-mono text-xs text-blue-400 font-bold bg-blue-900/30 px-3 py-1 rounded border border-blue-500/30">
              {wsStatus}
            </div>
            <div className="font-mono text-xs text-emerald-400 font-bold bg-emerald-900/30 px-3 py-1 rounded border border-emerald-500/30">
              {fps} fps · {latencyMs.toFixed(1)} ms
            </div>
            <button onClick={togglePause} className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white">
              {isPaused ? <Play size={20} fill="currentColor" /> : <Pause size={20} fill="currentColor" />}
            </button>
            <button
              onClick={stopEverything}
              className="p-2 rounded-full bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white transition-colors"
            >
              <StopCircle size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Main Grid Layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Video Area */}
        <div className="lg:col-span-2 relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-slate-800 flex items-center justify-center group">
          {!activeMode && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600">
              <Video size={64} className="opacity-20 mb-4" />
              <p className="font-semibold text-lg">Selecciona una fuente de video</p>
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
                <div className="absolute top-4 right-4 animate-bounce">
                  <div className="bg-red-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg flex items-center gap-2">
                    <AlertTriangle className="fill-white" size={20} />
                    VIOLACIÓN DETECTADA
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
          <div className="bg-slate-900/80 rounded-xl border border-slate-800/50 flex flex-col h-64 backdrop-blur">
            <div className="p-3 border-b border-slate-800/50 flex items-center gap-2">
              <div className="w-1 h-4 bg-orange-500 rounded-full" />
              <h3 className="font-semibold text-sm text-slate-200">Registro de Violaciones</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {violationLog.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
                  <span className="text-2xl mb-2 opacity-20">🛡️</span>
                  Sin violaciones recientes
                </div>
              ) : (
                violationLog.map((log) => (
                  <div
                    key={log.id}
                    className="text-xs bg-slate-950/50 p-2 rounded border border-slate-700/50 flex items-center justify-between group hover:border-orange-500/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="text-orange-500" size={12} />
                      <span className="text-slate-300 font-medium">{log.label}</span>
                    </div>
                    <span className="text-slate-500 group-hover:text-slate-400">
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
  "helmet": { color: "#3b82f6", icon: "🪖", bgColor: "rgba(59, 130, 246, 0.15)" },
  "hardhat": { color: "#3b82f6", icon: "🪖", bgColor: "rgba(59, 130, 246, 0.15)" },
  "casco": { color: "#3b82f6", icon: "🪖", bgColor: "rgba(59, 130, 246, 0.15)" },
  "vest": { color: "#f97316", icon: "🦺", bgColor: "rgba(249, 115, 22, 0.15)" },
  "chaleco": { color: "#f97316", icon: "🦺", bgColor: "rgba(249, 115, 22, 0.15)" },
  "gloves": { color: "#a855f7", icon: "🧤", bgColor: "rgba(168, 85, 247, 0.15)" },
  "guantes": { color: "#a855f7", icon: "🧤", bgColor: "rgba(168, 85, 247, 0.15)" },
  "goggles": { color: "#06b6d4", icon: "🥽", bgColor: "rgba(6, 182, 212, 0.15)" },
  "gafas": { color: "#06b6d4", icon: "🥽", bgColor: "rgba(6, 182, 212, 0.15)" },
  "glasses": { color: "#06b6d4", icon: "🥽", bgColor: "rgba(6, 182, 212, 0.15)" },
  "boots": { color: "#84cc16", icon: "👢", bgColor: "rgba(132, 204, 22, 0.15)" },
  "botas": { color: "#84cc16", icon: "👢", bgColor: "rgba(132, 204, 22, 0.15)" },
  "mask": { color: "#ec4899", icon: "😷", bgColor: "rgba(236, 72, 153, 0.15)" },
  "mascarilla": { color: "#ec4899", icon: "😷", bgColor: "rgba(236, 72, 153, 0.15)" },
  "person": { color: "#22c55e", icon: "👷", bgColor: "rgba(34, 197, 94, 0.15)" },
  "persona": { color: "#22c55e", icon: "👷", bgColor: "rgba(34, 197, 94, 0.15)" },
  // Non-compliant items (red tones)
  "no helmet": { color: "#ef4444", icon: "⚠️", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no hardhat": { color: "#ef4444", icon: "⚠️", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no vest": { color: "#ef4444", icon: "⚠️", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no gloves": { color: "#ef4444", icon: "⚠️", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no goggles": { color: "#ef4444", icon: "⚠️", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no mask": { color: "#ef4444", icon: "⚠️", bgColor: "rgba(239, 68, 68, 0.2)" },
  "no boots": { color: "#ef4444", icon: "⚠️", bgColor: "rgba(239, 68, 68, 0.2)" },
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
    ? { color: "#ef4444", icon: "⚠️", bgColor: "rgba(239, 68, 68, 0.2)" }
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
    ctx.font = "bold 12px 'Inter', 'Space Grotesk', sans-serif";
    const labelWidth = ctx.measureText(label).width;
    ctx.font = "10px 'Inter', sans-serif";
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
    ctx.font = "bold 12px 'Inter', 'Space Grotesk', sans-serif";
    ctx.fillText(label, x1 + 6, labelY + 15);

    // Draw confidence percentage (slightly dimmer)
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = "10px 'Inter', sans-serif";
    ctx.fillText(confText, x1 + labelWidth + 12, labelY + 14);
  });

  ctx.restore();
}
