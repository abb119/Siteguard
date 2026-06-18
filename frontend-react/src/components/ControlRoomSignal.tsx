import React, { useEffect, useRef } from "react";

/**
 * Three-channel control-room oscilloscope — the landing's signature.
 * OBRA (EPP compliance), VÍA (driver EAR), RED (network threat): three EQUAL
 * lanes, same colour, distinguished by signal shape. Each lane feeds one shared
 * "incidentes detectados" log so the instrument has consequence. Illustrative
 * demo signal (labelled as such), not real fleet data. Degrades to static under
 * prefers-reduced-motion.
 */
const TRACE = "#38E1C6";
const ALARM = "#FF3B30";
const DIM = "#8a9094";
const VOID = "#07090A";

type Sample = { v: number; alarm: boolean };
type Step = { v: number; alarm: boolean; ev: string | null };
type Kind = "obra" | "via" | "red";

const LANES: { kind: Kind; label: string; read: (v: number) => string }[] = [
    { kind: "obra", label: "CH·1  OBRA · EPP", read: (v) => "cumpl. " + Math.round(v * 100) + "%" },
    { kind: "via", label: "CH·2  VÍA · CONDUCTOR", read: (v) => "EAR " + (v * 0.42).toFixed(2) },
    { kind: "red", label: "CH·3  RED · SEGURIDAD", read: (v) => (v > 0.5 ? "AMENAZA" : "nominal") },
];

function makeModel(kind: Kind) {
    let st = "idle";
    let ph = 0;
    let dur = 0;
    let armed = false;
    let tEv = 3 + Math.random() * 4;
    const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];

    return function advance(dt: number): Step {
        tEv -= dt;
        if (kind === "via") {
            let v: number;
            if (st === "idle") {
                v = 0.71 + 0.03 * Math.sin(performance.now() / 620) + (Math.random() - 0.5) * 0.025;
                if (tEv <= 0) { st = "micro"; ph = 0; dur = 1.1 + Math.random() * 0.7; armed = true; tEv = 9 + Math.random() * 6; }
                else if (Math.random() < dt * 0.55) { st = "blink"; ph = 0; }
            } else if (st === "blink") {
                ph += dt; const h = ph / 0.16; v = h < 0.5 ? 0.71 - 0.5 * (h / 0.5) : 0.21 + 0.5 * ((h - 0.5) / 0.5); if (ph >= 0.16) st = "idle";
            } else {
                ph += dt;
                if (ph < 0.3) v = 0.71 - 0.55 * (ph / 0.3);
                else if (ph < 0.3 + dur) v = 0.16 + (Math.random() - 0.5) * 0.02;
                else if (ph < 0.6 + dur) v = 0.16 + 0.55 * ((ph - 0.3 - dur) / 0.3);
                else { st = "idle"; v = 0.71; if (armed) { armed = false; return { v, alarm: false, ev: "VÍA · microsueño " + dur.toFixed(1) + " s — frenada evitada" }; } }
            }
            return { v, alarm: st === "micro" && v < 0.36, ev: null };
        }
        if (kind === "obra") {
            let v: number;
            if (st === "idle") {
                v = 0.86 + (Math.random() - 0.5) * 0.03;
                if (tEv <= 0) { st = "viol"; ph = 0; dur = 0.5 + Math.random() * 0.3; armed = true; tEv = 6 + Math.random() * 5; }
            } else {
                ph += dt;
                if (ph < 0.18) v = 0.86 - 0.42 * (ph / 0.18);
                else if (ph < 0.18 + dur) v = 0.44 + (Math.random() - 0.5) * 0.03;
                else if (ph < 0.36 + dur) v = 0.44 + 0.42 * ((ph - 0.18 - dur) / 0.18);
                else { st = "idle"; v = 0.86; if (armed) { armed = false; return { v, alarm: false, ev: "OBRA · " + pick(["sin casco", "sin chaleco", "sin mascarilla"]) + " — aviso emitido" }; } }
            }
            return { v, alarm: st === "viol" && v < 0.6, ev: null };
        }
        let v: number;
        if (st === "idle") {
            v = 0.1 + Math.abs(Math.sin(performance.now() / 300)) * 0.02 + Math.random() * 0.02;
            if (tEv <= 0) { st = "spike"; ph = 0; dur = 0.22 + Math.random() * 0.18; armed = true; tEv = 8 + Math.random() * 6; }
        } else {
            ph += dt;
            if (ph < 0.06) v = 0.1 + 0.82 * (ph / 0.06);
            else if (ph < 0.06 + dur) v = 0.92 + (Math.random() - 0.5) * 0.04;
            else if (ph < 0.18 + dur) v = 0.92 - 0.82 * ((ph - 0.06 - dur) / 0.12);
            else { st = "idle"; v = 0.1; if (armed) { armed = false; return { v, alarm: false, ev: "RED · " + pick(["señuelo activado — IP aislada", "inyección LLM bloqueada", "credencial trampa usada"]) }; } }
        }
        return { v, alarm: st === "spike" && v > 0.5, ev: null };
    };
}

export const ControlRoomSignal: React.FC = () => {
    const cvRef = useRef<HTMLCanvasElement>(null);
    const logRef = useRef<HTMLUListElement>(null);
    const countRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const cv = cvRef.current;
        const ctx = cv?.getContext("2d");
        if (!cv || !ctx) return;
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const LANE = 58, PADY = 16;
        const cssH = PADY * 2 + LANE * 3;
        let cssW = 640, N = 200;

        const resize = () => {
            cssW = cv.clientWidth || 640;
            N = Math.max(120, Math.floor((cssW - 200) / 2));
            cv.width = cssW * dpr; cv.height = cssH * dpr;
            cv.style.height = cssH + "px";
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            buffers.forEach((b) => { while (b.length < N) b.unshift({ v: 0.6, alarm: false }); while (b.length > N) b.shift(); });
        };

        const buffers: Sample[][] = LANES.map(() => Array.from({ length: N }, () => ({ v: 0.6, alarm: false })));
        const xL = 100, xRpad = 96;
        const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const laneTop = (i: number) => PADY + i * LANE;
        const yOf = (i: number, v: number) => {
            const top = laneTop(i) + 20, bot = laneTop(i) + LANE - 8;
            return bot - Math.max(0, Math.min(1, v)) * (bot - top);
        };

        const drawLane = (i: number) => {
            const buf = buffers[i];
            const xR = cssW - xRpad, step = (xR - xL) / (N - 1);
            ctx.strokeStyle = "#0e1517"; ctx.lineWidth = 1;
            ctx.beginPath(); const yb = laneTop(i) + LANE - 8; ctx.moveTo(xL, yb + 0.5); ctx.lineTo(xR, yb + 0.5); ctx.stroke();
            if (LANES[i].kind === "via") {
                ctx.strokeStyle = "#3a221f"; ctx.setLineDash([5, 5]); ctx.beginPath();
                const ty = yOf(i, 0.36); ctx.moveTo(xL, ty); ctx.lineTo(xR, ty); ctx.stroke(); ctx.setLineDash([]);
            }
            ctx.font = '11px "IBM Plex Mono", monospace'; ctx.textBaseline = "alphabetic";
            ctx.fillStyle = DIM; ctx.fillText(LANES[i].label, 4, laneTop(i) + 13);
            const last = buf[N - 1];
            ctx.fillStyle = last.alarm ? ALARM : TRACE; ctx.textAlign = "right";
            ctx.fillText(LANES[i].read(last.v), cssW - 6, laneTop(i) + 13); ctx.textAlign = "left";
            ctx.shadowBlur = 7; ctx.shadowColor = TRACE; ctx.strokeStyle = TRACE; ctx.lineWidth = 1.6; ctx.beginPath();
            for (let k = 0; k < N; k++) { const x = xL + k * step, y = yOf(i, buf[k].v); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
            ctx.stroke(); ctx.shadowBlur = 0;
            ctx.strokeStyle = ALARM; ctx.lineWidth = 2.4; let k = 0;
            while (k < N) {
                if (buf[k].alarm) { ctx.beginPath(); ctx.moveTo(xL + k * step, yOf(i, buf[k].v)); let j = k; while (j < N && buf[j].alarm) { ctx.lineTo(xL + j * step, yOf(i, buf[j].v)); j++; } ctx.stroke(); k = j; } else k++;
            }
            ctx.shadowBlur = 9; ctx.shadowColor = last.alarm ? ALARM : TRACE; ctx.fillStyle = last.alarm ? ALARM : TRACE;
            ctx.beginPath(); ctx.arc(xL + (N - 1) * step, yOf(i, last.v), 3, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
        };

        const drawAll = () => { ctx.clearRect(0, 0, cssW, cssH); ctx.fillStyle = VOID; ctx.fillRect(0, 0, cssW, cssH); for (let i = 0; i < 3; i++) drawLane(i); };

        let count = 1248;
        const addLog = (msg: string) => {
            count++; if (countRef.current) countRef.current.textContent = count.toLocaleString("es-ES");
            const ul = logRef.current; if (!ul) return;
            const li = document.createElement("li");
            li.className = "flex gap-3 items-baseline py-1.5 font-mono text-xs anim-in";
            const t = new Date().toLocaleTimeString("es-ES", { hour12: false });
            li.innerHTML = '<span style="color:#8a9094;flex:0 0 auto">' + t + '</span><span style="color:#cfd2d0"><span style="color:#FFB000">▦</span> ' + msg + "</span>";
            ul.insertBefore(li, ul.firstChild);
            while (ul.children.length > 4) ul.removeChild(ul.lastChild as Node);
        };

        resize();
        window.addEventListener("resize", resize);

        if (reduce) {
            for (let i = 0; i < 3; i++) {
                const m = makeModel(LANES[i].kind);
                for (let k = 0; k < N; k++) { const s = m(0.033); buffers[i][k] = { v: s.v, alarm: s.alarm }; }
            }
            drawAll();
            return () => window.removeEventListener("resize", resize);
        }

        const models = LANES.map((l) => makeModel(l.kind));
        let prev = performance.now(), acc = 0, raf = 0;
        const loop = (t: number) => {
            const dt = Math.min(0.05, (t - prev) / 1000); prev = t; acc += dt;
            let moved = false;
            while (acc >= 0.033) {
                for (let i = 0; i < 3; i++) { const s = models[i](0.033); buffers[i].push({ v: s.v, alarm: s.alarm }); buffers[i].shift(); if (s.ev) addLog(s.ev); }
                acc -= 0.033; moved = true;
            }
            if (moved) drawAll();
            raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
        return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
    }, []);

    return (
        <div className="hud-panel hud-corners overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-hud-line">
                <span className="font-mono text-[11px] tracking-[0.18em] text-hud-dim">OSCILOSCOPIO · 3 CANALES</span>
                <span className="font-mono text-[11px] tracking-[0.18em] text-trace">DEMO EN VIVO</span>
            </div>
            <canvas ref={cvRef} className="block w-full" role="img"
                aria-label="Osciloscopio de tres canales iguales: Obra (cumplimiento de EPP), Vía (señal ocular del conductor) y Red (amenazas), con eventos en tiempo real." />
            <div className="px-4 py-3 border-t border-hud-line grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
                <div>
                    <div className="font-mono text-[10.5px] tracking-[0.2em] text-hud-dim uppercase">Incidentes detectados</div>
                    <b ref={countRef} className="block font-martian text-2xl text-hud-bone tnum mt-1">1.248</b>
                </div>
                <ul ref={logRef} className="m-0 p-0 list-none min-h-[88px]">
                    <li className="flex gap-3 items-baseline py-1.5 font-mono text-xs"><span className="text-hud-dim">—</span><span className="text-charcoal-200"><span className="text-amber-400">▦</span> RED · señuelo activado — IP aislada</span></li>
                    <li className="flex gap-3 items-baseline py-1.5 font-mono text-xs"><span className="text-hud-dim">—</span><span className="text-charcoal-200"><span className="text-amber-400">▦</span> VÍA · microsueño 1.3 s — frenada evitada</span></li>
                    <li className="flex gap-3 items-baseline py-1.5 font-mono text-xs"><span className="text-hud-dim">—</span><span className="text-charcoal-200"><span className="text-amber-400">▦</span> OBRA · sin casco — aviso emitido</span></li>
                </ul>
            </div>
        </div>
    );
};
