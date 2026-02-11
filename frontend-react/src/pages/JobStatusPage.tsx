import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { getJob } from "../lib/api";
import type { JobStatusResponse } from "../types/jobs";

export const JobStatusPage = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchStatus = async () => {
      if (!jobId) return;
      try {
        const data = await getJob(jobId);
        if (!active) return;

        setJob(data);

        if (data.status === "done" || data.status === "completed") {
          navigate(`/jobs/${jobId}/result`, { replace: true });
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "No se pudo consultar el job.");
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [jobId, navigate]);

  const statusTone = useMemo(() => {
    if (!job) {
      return { label: "Creando job...", color: "text-slate-400" };
    }

    const status = job.status;
    if (status === "queued") {
      return { label: "En cola (1 job a la vez)", color: "text-amber-400" };
    }
    if (status === "running") {
      return { label: "Procesando video...", color: "text-blue-400" };
    }
    if (status === "done" || status === "completed") {
      return { label: "Listo — generando reporte", color: "text-emerald-400" };
    }
    if (status === "failed") {
      return { label: "Falló el procesamiento", color: "text-red-400" };
    }
    return { label: status, color: "text-slate-400" };
  }, [job]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 sm:gap-6">
        <div>
          <p className="text-sm text-slate-400 uppercase">Job #{jobId}</p>
          <h2 className="text-2xl md:text-3xl font-bold text-white">Seguimiento del job</h2>
          <p className={`mt-2 text-sm font-semibold ${statusTone.color}`}>{statusTone.label}</p>
        </div>
        <div className="text-right text-sm text-slate-400 space-y-1 hidden sm:block">
          <p>Creado: {job?.created_at ?? "..."}</p>
          <p>Inicio: {job?.started_at ?? "pendiente"}</p>
          <p>Fin: {job?.finished_at ?? "pendiente"}</p>
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-emerald-400" size={24} />
          <div>
            <p className="text-sm text-slate-400">Progreso</p>
            <p className="text-xl font-semibold text-white">{job?.progress ?? 0}%</p>
          </div>
        </div>
        <div className="w-full h-3 bg-slate-900 rounded-full mt-4 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all"
            style={{ width: `${job?.progress ?? 0}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">Tomamos frames cada 200-400 ms para detectar incumplimientos PPE.</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-red-200">
          <ShieldAlert size={18} />
          <span>{error}</span>
        </div>
      )}

      {job?.status === "failed" && job.error && (
        <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl text-red-100">{job.error}</div>
      )}

      {(job?.status === "done" || job?.status === "completed") && (
        <Link
          to={`/jobs/${jobId}/result`}
          className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-slate-900 font-semibold rounded-xl hover:bg-emerald-400 transition"
        >
          <CheckCircle2 />
          Ver resultados
        </Link>
      )}

      <div className="text-sm text-slate-500">
        <p>
          ¿Necesitas otro upload?{" "}
          <Link to="/" className="text-emerald-400 underline">
            Regresa al inicio
          </Link>
        </p>
        {location.state?.limits && (
          <p className="mt-2">
            Límite aplicado: {location.state.limits.max_duration_seconds}s ·{" "}
            {(location.state.limits.max_file_size_bytes / (1024 * 1024)).toFixed(0)} MB
          </p>
        )}
      </div>
    </div>
  );
};
