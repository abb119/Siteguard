import React from "react";
import { Link } from "react-router-dom";
import {
    ShieldCheck,
    Truck,
    Lock,
    ArrowRight,
    Eye,
    Bell,
    Zap,
    Activity,
} from "lucide-react";
import DotGrid from "../components/DotGrid";

export const LandingPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-grid text-hud-bone overflow-x-hidden font-sans">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-hud-bg/80 backdrop-blur-sm border-b border-hud-line">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="border border-amber-400 text-amber-400 p-1.5">
                            <ShieldCheck size={20} />
                        </div>
                        <span className="font-mono font-semibold tracking-[0.2em] text-sm">SITEGUARD</span>
                    </div>
                    <nav className="hidden md:flex items-center gap-8 hud-label">
                        <a href="#services" className="hover:text-amber-400 transition-colors">Módulos</a>
                        <a href="#features" className="hover:text-amber-400 transition-colors">Capacidades</a>
                        <Link to="/metrics" className="hover:text-amber-400 transition-colors">Métricas</Link>
                        <a href="#contact" className="hover:text-amber-400 transition-colors">Contacto</a>
                    </nav>
                    <div className="hidden md:flex items-center gap-2">
                        <span className="hud-dot bg-phosphor-400 text-phosphor-400 rounded-full inline-block animate-pulse" />
                        <span className="hud-label text-phosphor-400">Operativo</span>
                    </div>
                </div>
            </header>

            {/* Hero */}
            <section className="relative pt-32 pb-20 px-6 overflow-hidden border-b border-hud-line">
                <DotGrid
                    dotSize={4}
                    gap={18}
                    baseColor="#1b1b1e"
                    activeColor="#ffb000"
                    proximity={120}
                    shockRadius={250}
                    shockStrength={5}
                    resistance={750}
                    returnDuration={1.5}
                />

                <div className="max-w-7xl mx-auto relative z-10">
                    <div className="max-w-4xl">
                        <div className="flex items-center gap-3 mb-8">
                            <span className="text-amber-400 font-mono text-xs">▸</span>
                            <span className="hud-label">Visión por computador · Tiempo real</span>
                        </div>

                        <h1 className="font-mono font-bold tracking-tight text-5xl md:text-7xl leading-[0.95] mb-8">
                            SEGURIDAD
                            <br />
                            INDUSTRIAL
                            <br />
                            <span className="text-amber-400">MONITORIZADA.</span>
                        </h1>

                        <p className="text-hud-dim text-lg max-w-2xl mb-10 leading-relaxed border-l-2 border-hud-line pl-5">
                            Detección de riesgos en tiempo real antes de que se conviertan en
                            accidentes. EPP, fatiga del conductor y ciberseguridad — un solo panel
                            de control.
                        </p>

                        <div className="flex flex-col sm:flex-row items-start gap-4 mb-16">
                            <a
                                href="#services"
                                className="group flex items-center gap-3 px-7 py-3.5 font-mono uppercase tracking-widest text-sm bg-amber-400 text-hud-bg hover:bg-amber-300 transition-colors"
                            >
                                Iniciar demo
                                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                            </a>
                            <a
                                href="#features"
                                className="px-7 py-3.5 font-mono uppercase tracking-widest text-sm border border-hud-line text-hud-bone hover:border-amber-400 hover:text-amber-400 transition-colors"
                            >
                                Especificaciones
                            </a>
                        </div>

                        {/* Instrument readouts */}
                        <div className="grid grid-cols-3 max-w-2xl border border-hud-line divide-x divide-hud-line">
                            <Readout value="99.2%" label="Precisión" />
                            <Readout value="<50ms" label="Latencia" />
                            <Readout value="24/7" label="Vigilancia" />
                        </div>
                    </div>
                </div>
            </section>

            {/* Services */}
            <section id="services" className="py-24 px-6 border-b border-hud-line">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-end justify-between mb-12 border-b border-hud-line pb-5">
                        <h2 className="font-mono text-2xl md:text-4xl font-bold tracking-tight">MÓDULOS</h2>
                        <span className="hud-label">03 Sistemas</span>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-hud-line border border-hud-line">
                        <ServiceCard
                            to="/services/ppe"
                            index="01"
                            icon={<ShieldCheck size={26} />}
                            title="Detección de EPP"
                            description="Verifica en tiempo real el uso correcto de Equipos de Protección Personal: cascos, chalecos y más."
                            tags={["Casco", "Chaleco", "Guantes", "Gafas"]}
                        />
                        <ServiceCard
                            to="/services/driver"
                            index="02"
                            icon={<Truck size={26} />}
                            title="Monitor de Conductor"
                            description="Sistema ADAS: fatiga, microsueños, distracción y uso de móvil mediante visión por computador."
                            tags={["Fatiga", "PERCLOS", "Distracción"]}
                        />
                        <ServiceCard
                            to="/services/security"
                            index="03"
                            icon={<Lock size={26} />}
                            title="Ciberseguridad"
                            description="Honeytokens, grafos de ataque con auto-remediación y firewall LLM para proteger activos digitales."
                            tags={["Honeytokens", "Attack Graph", "LLM Gateway"]}
                        />
                    </div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="py-24 px-6 border-b border-hud-line">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-end justify-between mb-12 border-b border-hud-line pb-5">
                        <h2 className="font-mono text-2xl md:text-4xl font-bold tracking-tight">CAPACIDADES</h2>
                        <span className="hud-label">¿Por qué SiteGuard?</span>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-hud-line border border-hud-line">
                        <FeatureCard icon={<Zap size={22} />} code="LAT" title="Tiempo Real" description="Inferencia en <50ms con aceleración GPU." />
                        <FeatureCard icon={<Eye size={22} />} code="ACC" title="Alta Precisión" description="Modelos entrenados con 99.2% de precisión." />
                        <FeatureCard icon={<Bell size={22} />} code="ALR" title="Alertas Inmediatas" description="Notificación instantánea ante cada violación." />
                        <FeatureCard icon={<Activity size={22} />} code="LOC" title="100% On-Premise" description="Tus datos nunca salen de tu infraestructura." />
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section id="contact" className="py-24 px-6 border-b border-hud-line">
                <div className="max-w-4xl mx-auto">
                    <span className="hud-label">▸ Solicitar acceso</span>
                    <h2 className="font-mono text-2xl md:text-4xl font-bold tracking-tight mt-3 mb-4">
                        ¿LISTO PARA PREVENIR ACCIDENTES?
                    </h2>
                    <p className="text-hud-dim text-lg mb-10 max-w-2xl">
                        Agenda una demo y descubre cómo SiteGuard protege a tu equipo en tiempo real.
                    </p>
                    <div className="flex flex-col sm:flex-row items-stretch gap-px max-w-xl bg-hud-line border border-hud-line">
                        <input
                            type="email"
                            placeholder="tu@empresa.com"
                            className="flex-1 px-5 py-4 bg-hud-panel text-hud-bone font-mono text-sm placeholder-hud-dim focus:outline-none focus:bg-hud-bg"
                        />
                        <button className="px-7 py-4 font-mono uppercase tracking-widest text-sm bg-amber-400 text-hud-bg hover:bg-amber-300 transition-colors">
                            Solicitar
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-10 px-6">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="border border-amber-400 text-amber-400 p-1.5">
                            <ShieldCheck size={18} />
                        </div>
                        <span className="font-mono font-semibold tracking-[0.2em] text-sm">SITEGUARD</span>
                    </div>
                    <div className="flex items-center gap-6 hud-label">
                        <a href="#" className="hover:text-amber-400 transition-colors">Privacidad</a>
                        <a href="#" className="hover:text-amber-400 transition-colors">Términos</a>
                        <Link to="/metrics" className="hover:text-amber-400 transition-colors">Métricas</Link>
                        <Link to="/admin" className="hover:text-amber-400 transition-colors">Admin</Link>
                    </div>
                    <span className="hud-label">© 2025 · Made in Spain</span>
                </div>
            </footer>
        </div>
    );
};

const Readout: React.FC<{ value: string; label: string }> = ({ value, label }) => (
    <div className="px-5 py-5">
        <div className="font-mono text-2xl md:text-4xl font-bold text-amber-400 tnum">{value}</div>
        <div className="hud-label mt-2">{label}</div>
    </div>
);

const ServiceCard: React.FC<{
    to: string;
    index: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    tags: string[];
}> = ({ to, index, icon, title, description, tags }) => (
    <Link
        to={to}
        className="group relative bg-hud-panel p-8 hover:bg-hud-bg transition-colors"
    >
        <div className="flex items-start justify-between mb-6">
            <span className="text-amber-400 border border-amber-400/40 p-3 group-hover:bg-amber-400 group-hover:text-hud-bg transition-colors">
                {icon}
            </span>
            <span className="font-mono text-3xl font-bold text-hud-line group-hover:text-amber-400/40 transition-colors tnum">
                {index}
            </span>
        </div>
        <h3 className="font-mono text-xl font-semibold uppercase tracking-wide mb-3">{title}</h3>
        <p className="text-hud-dim text-sm mb-6 leading-relaxed">{description}</p>
        <div className="flex flex-wrap gap-2 mb-6">
            {tags.map((t) => (
                <span key={t} className="px-2 py-1 border border-hud-line text-hud-dim font-mono text-[11px] uppercase tracking-wider">
                    {t}
                </span>
            ))}
        </div>
        <div className="flex items-center gap-2 text-amber-400 font-mono uppercase tracking-widest text-xs">
            Acceder
            <ArrowRight size={16} className="group-hover:translate-x-1.5 transition-transform" />
        </div>
    </Link>
);

const FeatureCard: React.FC<{
    icon: React.ReactNode;
    code: string;
    title: string;
    description: string;
}> = ({ icon, code, title, description }) => (
    <div className="bg-hud-panel p-6 hover:bg-hud-bg transition-colors">
        <div className="flex items-center justify-between mb-4">
            <span className="text-amber-400">{icon}</span>
            <span className="hud-label">{code}</span>
        </div>
        <h3 className="font-mono font-semibold uppercase tracking-wide text-base mb-2">{title}</h3>
        <p className="text-hud-dim text-sm leading-relaxed">{description}</p>
    </div>
);
