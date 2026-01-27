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

      <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-slate-800 flex items-center justify-center">
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
            <div className="absolute top-4 right-4 text-xs bg-black/60 px-3 py-2 rounded-lg border border-slate-700 max-w-xs">
              <p className="font-semibold text-white">Violaciones recientes</p>
              {violationLog.length === 0 ? (
                <p className="text-slate-400">Sin alertas</p>
              ) : (
                <ul className="space-y-1 mt-2 max-h-48 overflow-y-auto">
                  {violationLog.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2 text-rose-200">
                      <AlertTriangle size={12} />
                      <span>
                        {entry.label} · {entry.severity}
                        {typeof entry.timestamp === "number" && (
                          <span className="text-slate-400"> ({entry.timestamp.toFixed(1)}s)</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function drawDetections(ctx: CanvasRenderingContext2D, detections: FrameResult["detections"]) {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.font = "12px 'Space Grotesk'";
  detections.forEach((det) => {
    const [x1, y1, x2, y2] = det.box;
    const compliant = !(det.class_name ?? "").toUpperCase().startsWith("NO");
    ctx.strokeStyle = compliant ? "#10b981" : "#f87171";
    ctx.fillStyle = compliant ? "rgba(16,185,129,0.15)" : "rgba(248,113,113,0.15)";
    ctx.beginPath();
    ctx.rect(x1, y1, x2 - x1, y2 - y1);
    ctx.fill();
    ctx.stroke();

    const label = det.class_name ?? "objeto";
    const textWidth = ctx.measureText(label).width + 8;
    ctx.fillStyle = compliant ? "#10b981" : "#f87171";
    ctx.fillRect(x1, Math.max(0, y1 - 16), textWidth, 16);
    ctx.fillStyle = "#020617";
    ctx.fillText(label, x1 + 4, Math.max(12, y1 - 4));
  });
  ctx.restore();
}
