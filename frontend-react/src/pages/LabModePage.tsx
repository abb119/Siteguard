import { VideoFeed } from "../components/VideoFeed";

export const LabModePage = () => {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-400 uppercase">Análisis en tiempo real</p>
        <h2 className="text-3xl font-bold text-white mt-2">Streaming WebSocket (sin jobs)</h2>
        <p className="text-slate-400 mt-2 max-w-3xl">
          Aquí no hay colas ni artefactos: el video se queda en tu navegador, se trocea en frames y se envía por
          WebSocket para recibir detecciones en <strong>~200&nbsp;ms</strong>. Úsalo para demos en vivo o para ajustar
          modelos antes de lanzar un job completo.
        </p>
      </div>
      <VideoFeed />
    </div>
  );
};
