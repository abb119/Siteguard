import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Images } from "lucide-react";
import { StatsCard } from "../components/StatsCard";
import { buildArtifactUrl, getJobResult } from "../lib/api";
import type { JobArtifactInfo, JobResultResponse } from "../types/jobs";

export const JobResultPage = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [payload, setPayload] = useState<JobResultResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!jobId) return;
      try {
        const response = await getJobResult(jobId);
        if (!active) return;
        setPayload(response);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "No hay resultados aun.");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [jobId]);

  const result = payload?.result;
  const summaryEntries = useMemo(() => Object.entries(result?.summary ?? {}), [result?.summary]);
  const events = result?.events ?? [];
  const snapshots = result?.snapshots ?? [];
  const artifacts = payload?.artifacts ?? [];
  const numericJobId = payload?.job_id ?? (jobId ? Number(jobId) : undefined);

  const resolveArtifactUrl = useCallback(
    (artifact?: JobArtifactInfo) => {
      if (!artifact) return "";
      const relative =
        artifact.url ?? (numericJobId ? `/api/v1/jobs/${numericJobId}/artifacts/${artifact.path}` : "");
      if (!relative) return "";
      return buildArtifactUrl(relative);
    },
    [numericJobId],
  );

  const videoArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.kind === "video"),
    [artifacts],
  );
  const videoUrl = videoArtifact ? resolveArtifactUrl(videoArtifact) : "";

  const snapshotArtifactMap = useMemo(() => {
    const map = new Map<string, string>();
    artifacts
      .filter((artifact) => artifact.kind === "snapshot" && artifact.path)
      .forEach((artifact) => {
        map.set(artifact.path, resolveArtifactUrl(artifact));
      });
    return map;
  }, [artifacts, resolveArtifactUrl]);

  const handleDownload = () => {
    if (!result) return;
    setDownloading(true);
    try {
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `siteguard_job_${jobId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const summaryCards = useMemo(() => {
    if (summaryEntries.length === 0) return [];
    return summaryEntries.slice(0, 3).map(([key, value]) => ({
      title: key,
      value: typeof value === "number" ? value.toString() : String(value),
      icon: Images,
      color: "secondary" as const,
    }));
  }, [summaryEntries]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm text-slate-400 uppercase">Job #{jobId}</p>
          <h2 className="text-3xl font-bold text-white">Resultados</h2>
          <p className="text-slate-400 mt-2">Eventos, metricas y snapshots anotados listos para compartir.</p>
        </div>
        <div className="flex gap-3">
          <Link to="/" className="px-5 py-2 rounded-xl border border-slate-600 text-slate-200 hover:bg-slate-700 transition">
            Nuevo upload
          </Link>
          <button
            onClick={handleDownload}
            disabled={!result || downloading}
            className="px-5 py-2 rounded-xl bg-emerald-500 text-slate-900 font-semibold hover:bg-emerald-400 transition disabled:opacity-50"
          >
            <Download className="inline-block mr-2" size={18} />
            Descargar JSON
          </button>
        </div>
      </div>

      {error && <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl text-amber-100">{error}</div>}

      {result && (
        <>
          {summaryCards.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {summaryCards.map((card) => (
                <StatsCard key={card.title} {...card} />
              ))}
            </div>
          )}

          {summaryEntries.length > 3 && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {summaryEntries.slice(3).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs uppercase text-slate-500">{key}</p>
                  <p className="text-lg text-white font-semibold">{String(value)}</p>
                </div>
              ))}
            </div>
          )}

          {videoArtifact && videoUrl && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">Video anotado</h3>
                <a
                  href={videoUrl}
                  download={`job_${jobId}_annotated.mp4`}
                  className="text-sm text-emerald-300 hover:text-emerald-200 inline-flex items-center gap-2"
                >
                  <Download size={16} />
                  Descargar MP4
                </a>
              </div>
              <video controls className="w-full rounded-xl border border-slate-700" src={videoUrl}>
                Tu navegador no soporta la reproduccion de video.
              </video>
              <p className="text-xs text-slate-500">
                Artefacto generado automaticamente para compartir evidencia completa.
              </p>
            </div>
          )}

          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Timeline de eventos</h3>
              <span className="text-sm text-slate-400">{events.length} hallazgos</span>
            </div>
            {events.length === 0 ? (
              <p className="text-slate-500">Sin eventos detectados.</p>
            ) : (
              <div className="space-y-3">
                {events.map((event, index) => (
                  <div key={`${event?.timestamp || index}-${index}`} className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
                    <p className="font-semibold text-white">{String(event.type ?? "EVENTO")}</p>
                    <p className="text-xs text-slate-400">
                      {Object.entries(event)
                        .filter(([k]) => k !== "type")
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white mb-4">Evidencia visual</h3>
            {snapshots.length === 0 ? (
              <p className="text-slate-500">No generamos snapshots.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {snapshots.map((snapshot, idx) => {
                  const fileKey = snapshot.file ?? snapshot.path ?? "";
                  const src =
                    snapshotArtifactMap.get(fileKey) || (snapshot.url ? buildArtifactUrl(snapshot.url) : "");
                  return (
                    <figure key={`${fileKey}-${idx}`} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                      <img src={src} alt={`Snapshot ${snapshot.timestamp ?? ""}s`} className="w-full h-48 object-cover" />
                      <figcaption className="p-3 text-sm text-slate-300">
                        {snapshot.label ?? "Evento"} {snapshot.timestamp !== undefined ? `${snapshot.timestamp}s` : ""}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {artifacts.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Artefactos</h3>
          <div className="space-y-3">
            {artifacts.map((artifact) => {
              const url = resolveArtifactUrl(artifact);
              return (
                <a
                  key={`${artifact.kind}-${artifact.path}`}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block p-3 rounded-xl border border-slate-700 hover:border-emerald-400 transition"
                >
                  <p className="text-white font-semibold">{artifact.kind}</p>
                  <p className="text-xs text-slate-500">{artifact.path}</p>
                  {artifact.metadata && (
                    <p className="text-xs text-slate-600 mt-1">
                      {Object.entries(artifact.metadata)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </p>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
