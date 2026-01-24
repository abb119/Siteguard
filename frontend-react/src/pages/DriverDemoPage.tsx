import { Truck } from "lucide-react";
import { DriverJobPanel } from "../components/DriverJobPanel";
import { createDriverJob, createRoadJob } from "../lib/api";

export const DriverDemoPage = () => {
  return (
    <div className="space-y-8">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
          <Truck size={18} />
          Driver Safety AI (DMS + ADAS-lite)
        </div>
        <p className="text-slate-300 text-sm">
          Sube un video corto de cabina o carretera y SiteGuard Driver generará alertas de somnolencia, distracción y riesgos de
          colisión. Demo limitada: 10 s / 20 MB / CPU-only.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <DriverJobPanel
          title="Cabin DMS"
          description="Detecta somnolencia, mirada desviada y uso de móvil usando landmarks y heurísticas."
          createJobFn={createDriverJob}
          badges={["<=10s", "CPU-only"]}
          sampleLabel="Sample DMS"
          sampleUrl="/samples/dms_demo.mp4"
        />
        <DriverJobPanel
          title="Road ADAS-lite"
          description="Evalúa riesgos de colisión frontal, adelantamientos peligrosos y señales clave."
          createJobFn={createRoadJob}
          badges={["<=10s", "CPU-only"]}
          sampleLabel="Sample ADAS"
          sampleUrl="/samples/adas_demo.mp4"
        />
      </div>
    </div>
  );
};
