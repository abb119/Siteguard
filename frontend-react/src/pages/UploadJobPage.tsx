import { useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { AlertTriangle, UploadCloud, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createJob } from "../lib/api";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const UploadJobPage = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const navigate = useNavigate();

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.type.includes("video")) {
      setError("Solo se aceptan videos MP4/MOV.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("El video supera el límite de 20 MB.");
      return;
    }
    setError(null);
    setSelectedFile(file);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const onSubmit = async () => {
    if (!selectedFile) {
      setError("Selecciona un video corto antes de subir.");
      return;
    }
    setIsUploading(true);
    try {
      const job = await createJob(selectedFile);
      navigate(`/jobs/${job.job_id}`, { state: { limits: job.limits } });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("No se pudo crear el job.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm uppercase tracking-wide text-slate-400">Demo pública</p>
          <h2 className="text-3xl font-bold text-white mt-2">
            PPE Jobs · análisis asincrónico
          </h2>
          <p className="text-slate-400 mt-2 max-w-2xl">
            Arrastra un video corto (obrero, casco, chaleco). Validamos tamaño,
            duración y límite de concurrencia antes de iniciar el procesamiento.
          </p>
        </div>
        <div className="text-right text-sm text-slate-400">
          <p>Cola global · 1 job en espera</p>
          <p>Tiempo estimado: 10-60 s (CPU)</p>
        </div>
      </div>

      <div
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all ${isDragging
            ? "border-emerald-400 bg-emerald-400/10"
            : "border-slate-700 bg-slate-900/60"
          }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={onDrop}
      >
        <UploadCloud className="mx-auto text-emerald-400" size={64} />
        <p className="text-xl font-semibold mt-4">
          Arrastra tu MP4/MOV o <label className="text-emerald-400 cursor-pointer">búscalo</label>
        </p>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/x-m4v"
          className="sr-only"
          id="file-input"
          onChange={onFileChange}
        />
        <label
          htmlFor="file-input"
          className="inline-block mt-4 px-6 py-2 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-pointer"
        >
          Seleccionar archivo
        </label>

        {selectedFile && (
          <div className="mt-6 text-left bg-slate-800/80 p-4 rounded-xl inline-flex gap-4 items-center">
            <Video className="text-blue-300" />
            <div>
              <p className="font-semibold text-white">{selectedFile.name}</p>
              <p className="text-sm text-slate-400">
                {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[260px] bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-sm text-slate-400 uppercase mb-1">Límites</p>
          <p className="text-lg font-bold text-white">10 s · 20 MB · MP4/MOV</p>
          <p className="text-sm text-slate-400 mt-2">
            Validamos duración real (OpenCV) y rechazamos uploads fuera de rango.
          </p>
        </div>
        <div className="flex-1 min-w-[260px] bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-sm text-slate-400 uppercase mb-1">Motor</p>
          <p className="text-lg font-bold text-white">YOLOv8 · Compliance PPE</p>
          <p className="text-sm text-slate-400 mt-2">
            Muestreamos a 2-5 FPS, generamos eventos + snapshots anotados.
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => navigate('/lab')}
          className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-2 transition-colors"
        >
          <span className="bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">🚀</span>
          ¿Quieres análisis instantáneo? Prueba el modo Real-Time Streaming (GPU)
        </button>
      </div>

      <button
        onClick={onSubmit}
        disabled={isUploading}
        className="px-8 py-3 rounded-xl bg-emerald-500 text-slate-900 font-semibold hover:bg-emerald-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isUploading ? "Subiendo..." : "Crear job"}
      </button>
    </div>
  );
};
