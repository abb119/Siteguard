import { useEffect, useState } from "react";
import { Upload, FileVideo, RefreshCw } from "lucide-react";
import { buildArtifactUrl, getJob, getJobResult } from "../lib/api";
import type { JobInfo, JobResultResponse } from "../types/jobs";

type Props = {
  title: string;
  description: string;
  createJobFn: (file: File) => Promise<JobInfo>;
  sampleLabel?: string;
  sampleUrl?: string;
  badges?: string[];
};

type PanelState = "idle" | "uploading" | "processing" | "completed" | "error";

export function DriverJobPanel({ title, description, createJobFn, sampleLabel, sampleUrl, badges }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [job, setJob] = useState<JobInfo | null>(null);
  const [jobResult, setJobResult] = useState<JobResultResponse | null>(null);
  const [state, setState] = useState<PanelState>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job?.id && !job?.job_id) {
      return;
    }
    if (job.status === "completed" || job.status === "failed") {
      return;
    }
    setState("processing");
    const jobIdentifier = String(job.id ?? job.job_id);
    const interval = setInterval(async () => {
      try {
        const updated = await getJob(jobIdentifier);
        setJob(updated);
        if (updated.status === "completed") {
          clearInterval(interval);
          const result = await getJobResult(jobIdentifier);
          setJobResult(result);
          setState("completed");
        } else if (updated.status === "failed") {
          clearInterval(interval);
          setState("error");
          setError(updated.error || "El job falló");
        }
      } catch (err) {
        clearInterval(interval);
        setState("error");
        setError(err instanceof Error ? err.message : "Error consultando job");
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [job?.id, job?.job_id, job?.status]);

  const handleSubmit = async () => {
    if (!selectedFile) {
      setError("Selecciona un video corto (<= 10s)");
      return;
    }
    setState("uploading");
    setError(null);
    setJob(null);
    setJobResult(null);
    try {
      const jobInfo = await createJobFn(selectedFile);
      setJob(jobInfo);
      const jobIdentifier = jobInfo.id ?? jobInfo.job_id;
      if (!jobIdentifier) {
        throw new Error("Job ID inválido");
      }
      if (jobInfo.status === "completed") {
        const result = await getJobResult(String(jobIdentifier));
        setJobResult(result);
        setState("completed");
      } else {
        setState("processing");
      }
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "No se pudo crear el job");
    }
  };

  const handleSample = async () => {
    if (!sampleUrl) return;
    try {
      const response = await fetch(sampleUrl);
      if (!response.ok) {
        throw new Error("No se pudo descargar el sample");
      }
      const blob = await response.blob();
      const file = new File([blob], sampleUrl.split("/").pop() || "sample.mp4", { type: blob.type || "video/mp4" });
      setSelectedFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sample no disponible");
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <p className="text-slate-400 text-sm mt-1">{description}</p>
        </div>
        {badges && (
          <div className="flex gap-2">
            {badges.map((badge) => (
              <span key={badge} className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                {badge}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="border border-dashed border-slate-700 rounded-xl p-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer text-slate-200">
          <Upload size={18} />
          <input
            type="file"
            accept="video/mp4,video/quicktime,video/x-matroska"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                setSelectedFile(file);
                setError(null);
              }
            }}
          />
          {selectedFile ? selectedFile.name : "Selecciona un video corto (≤ 20MB, ≤ 10s)"}
        </label>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FileVideo size={14} />
          Solo se almacena durante minutos para generar el reporte.
        </div>
        <div className="flex gap-2">
          <button onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            Analizar video
          </button>
          {sampleUrl && (
            <button onClick={handleSample} className="text-slate-400 border border-slate-700 px-3 py-2 rounded-lg text-sm hover:text-white hover:border-slate-500 transition-colors">
              {sampleLabel || "Usar sample"}
            </button>
          )}
        </div>
      </div>

      {state !== "idle" && (
        <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">Estado</p>
            <p className="text-white font-semibold uppercase tracking-wide">{state}</p>
          </div>
          {state === "processing" && <RefreshCw className="animate-spin text-emerald-400" size={20} />}
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {job && (
        <div className="p-4 bg-slate-950/50 border border-slate-800 rounded-xl space-y-2 text-sm">
          <div className="flex justify-between text-slate-400">
            <span>ID</span>
            <span className="text-white font-mono">{job.id ?? job.job_id}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Status</span>
            <span className="text-white font-semibold">{job.status}</span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Duración analizada</span>
            <span className="text-white">{job.input_duration_sec?.toFixed(1)} s</span>
          </div>
        </div>
      )}

      {jobResult && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-400 mb-2">Resumen</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {jobResult.result.summary &&
                Object.entries(jobResult.result.summary).map(([key, value]) => (
                  <div key={key} className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
                    <p className="text-slate-500 text-xs uppercase">{key}</p>
                    <p className="text-white font-semibold">{String(value)}</p>
                  </div>
                ))}
            </div>
          </div>

          {jobResult.result.events && jobResult.result.events.length > 0 && (
            <div>
              <p className="text-sm text-slate-400 mb-2">Eventos</p>
              <div className="space-y-2 text-sm">
                {jobResult.result.events.map((event, index) => (
                  <div key={index} className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                    <p className="text-white font-semibold">{String(event.type ?? "Evento")}</p>
                    <p className="text-xs text-slate-400">
                      {Object.entries(event)
                        .filter(([k]) => k !== "type")
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" • ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {jobResult.result.snapshots && jobResult.result.snapshots.length > 0 && (
            <div>
              <p className="text-sm text-slate-400 mb-2">Snapshots</p>
              <div className="grid md:grid-cols-2 gap-4">
                {jobResult.result.snapshots.map((snap, index) => (
                  <div key={`${snap.file ?? index}`} className="bg-slate-950/40 border border-slate-800 rounded-xl overflow-hidden">
                    <a href={buildArtifactUrl(snap.url || snap.path || "")} target="_blank" rel="noreferrer">
                      <img src={buildArtifactUrl(snap.url || snap.path || "")} alt={snap.label || "snapshot"} className="w-full h-48 object-cover" />
                    </a>
                    <div className="p-3 text-sm text-slate-300">
                      <p className="font-semibold text-white">{snap.label || "Evento"}</p>
                      {snap.timestamp !== undefined && <p className="text-xs text-slate-500">{snap.timestamp}s</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
