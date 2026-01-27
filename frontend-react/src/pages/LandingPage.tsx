import React from "react";
import { Link } from "react-router-dom";
import {
    ShieldCheck,
    Truck,
    Zap,
    Eye,
    Bell,
    Lock,
    ArrowRight,
    Play,
    Sparkles,
} from "lucide-react";

export const LandingPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-slate-900/70 border-b border-slate-800">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2 rounded-xl">
                            <ShieldCheck className="text-white" size={28} />
                        </div>
                        <span className="font-bold text-xl tracking-tight">SiteGuard</span>
                    </div>
                    <nav className="hidden md:flex items-center gap-8 text-sm text-slate-300">
                        <a href="#services" className="hover:text-white transition-colors">Servicios</a>
                        <a href="#features" className="hover:text-white transition-colors">Características</a>
                        <a href="#contact" className="hover:text-white transition-colors">Contacto</a>
                    </nav>
                    <div className="flex items-center gap-3">
                        <button className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
                            Iniciar Sesión
                        </button>
                        <Link
                            to="/services/ppe"
                            className="px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/25"
                        >
                            Demo Gratis
                        </Link>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-6 overflow-hidden">
                {/* Background Effects */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
                </div>

                <div className="max-w-7xl mx-auto relative z-10">
                    <div className="text-center max-w-4xl mx-auto">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-sm mb-8">
                            <Sparkles size={16} />
                            <span>Potenciado por Inteligencia Artificial</span>
                        </div>

                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                            Seguridad Industrial
                            <br />
                            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                                Potenciada por IA
                            </span>
                        </h1>

                        <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
                            Detectamos riesgos en tiempo real antes de que se conviertan en accidentes.
                            Monitoreo continuo, alertas instantáneas, cumplimiento garantizado.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                            <Link
                                to="/services/ppe"
                                className="group flex items-center gap-2 px-8 py-4 text-lg font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all shadow-xl shadow-cyan-500/30"
                            >
                                <Play size={20} />
                                Ver Demo en Vivo
                                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                            </Link>
                            <button className="flex items-center gap-2 px-8 py-4 text-lg font-semibold border border-slate-600 rounded-xl hover:bg-slate-800 transition-all">
                                Solicitar Presupuesto
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto">
                            <div className="text-center">
                                <div className="text-4xl font-bold text-cyan-400 mb-1">99.2%</div>
                                <div className="text-sm text-slate-500">Precisión</div>
                            </div>
                            <div className="text-center">
                                <div className="text-4xl font-bold text-cyan-400 mb-1">&lt;50ms</div>
                                <div className="text-sm text-slate-500">Latencia</div>
                            </div>
                            <div className="text-center">
                                <div className="text-4xl font-bold text-cyan-400 mb-1">24/7</div>
                                <div className="text-sm text-slate-500">Monitoreo</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Services Section */}
            <section id="services" className="py-24 px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4">Nuestros Servicios</h2>
                        <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                            Soluciones de seguridad inteligente para diferentes entornos industriales
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* PPE Card */}
                        <Link
                            to="/services/ppe"
                            className="group relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700 rounded-2xl p-8 hover:border-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-300 hover:-translate-y-1"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10">
                                <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <ShieldCheck size={28} className="text-white" />
                                </div>
                                <h3 className="text-2xl font-bold mb-3">Detección de EPP</h3>
                                <p className="text-slate-400 mb-6 leading-relaxed">
                                    Verifica en tiempo real el uso correcto de Equipos de Protección Personal: cascos, chalecos, guantes y más.
                                </p>
                                <div className="flex flex-wrap gap-2 mb-6">
                                    <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-xs rounded-full">Casco</span>
                                    <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-xs rounded-full">Chaleco</span>
                                    <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-xs rounded-full">Guantes</span>
                                    <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-xs rounded-full">Gafas</span>
                                </div>
                                <div className="flex items-center gap-2 text-cyan-400 font-semibold">
                                    Explorar
                                    <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
                                </div>
                            </div>
                        </Link>

                        {/* Driver Card */}
                        <Link
                            to="/services/driver"
                            className="group relative bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-slate-700 rounded-2xl p-8 hover:border-orange-500/50 hover:shadow-xl hover:shadow-orange-500/10 transition-all duration-300 hover:-translate-y-1"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="relative z-10">
                                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                    <Truck size={28} className="text-white" />
                                </div>
                                <h3 className="text-2xl font-bold mb-3">Conducción Segura</h3>
                                <p className="text-slate-400 mb-6 leading-relaxed">
                                    Sistema ADAS para monitorear fatiga, distracciones y comportamiento del conductor en tiempo real.
                                </p>
                                <div className="flex flex-wrap gap-2 mb-6">
                                    <span className="px-3 py-1 bg-orange-500/10 text-orange-400 text-xs rounded-full">Fatiga</span>
                                    <span className="px-3 py-1 bg-orange-500/10 text-orange-400 text-xs rounded-full">Distracción</span>
                                    <span className="px-3 py-1 bg-orange-500/10 text-orange-400 text-xs rounded-full">Cinturón</span>
                                </div>
                                <div className="flex items-center gap-2 text-orange-400 font-semibold">
                                    Explorar
                                    <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
                                </div>
                            </div>
                        </Link>

                        {/* Coming Soon Card */}
                        <div className="group relative bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-slate-800 border-dashed rounded-2xl p-8 opacity-60">
                            <div className="relative z-10">
                                <div className="w-14 h-14 bg-slate-700 rounded-xl flex items-center justify-center mb-6">
                                    <Sparkles size={28} className="text-slate-500" />
                                </div>
                                <h3 className="text-2xl font-bold mb-3 text-slate-500">Próximamente</h3>
                                <p className="text-slate-600 mb-6 leading-relaxed">
                                    Nuevos módulos de seguridad en desarrollo. ¿Tienes una idea? Contáctanos.
                                </p>
                                <button className="flex items-center gap-2 text-slate-500 font-semibold">
                                    Notifícame
                                    <ArrowRight size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-24 px-6 bg-slate-900/50">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold mb-4">¿Por qué SiteGuard?</h2>
                        <p className="text-slate-400 text-lg">Tecnología de vanguardia al servicio de la seguridad</p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <FeatureCard
                            icon={<Zap className="text-yellow-400" size={24} />}
                            title="Tiempo Real"
                            description="Detección en menos de 50ms con aceleración GPU"
                            gradient="from-yellow-500/10"
                        />
                        <FeatureCard
                            icon={<Eye className="text-cyan-400" size={24} />}
                            title="Alta Precisión"
                            description="Modelos entrenados con 99.2% de precisión"
                            gradient="from-cyan-500/10"
                        />
                        <FeatureCard
                            icon={<Bell className="text-red-400" size={24} />}
                            title="Alertas Instantáneas"
                            description="Notificaciones inmediatas ante cualquier violación"
                            gradient="from-red-500/10"
                        />
                        <FeatureCard
                            icon={<Lock className="text-green-400" size={24} />}
                            title="100% On-Premise"
                            description="Tus datos nunca salen de tu infraestructura"
                            gradient="from-green-500/10"
                        />
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section id="contact" className="py-24 px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-4xl font-bold mb-4">¿Listo para prevenir accidentes?</h2>
                    <p className="text-slate-400 text-lg mb-10">
                        Agenda una demo personalizada y descubre cómo SiteGuard puede proteger a tu equipo.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <input
                            type="email"
                            placeholder="tu@empresa.com"
                            className="w-full sm:w-80 px-6 py-4 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                        <button className="w-full sm:w-auto px-8 py-4 font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/25">
                            Solicitar Demo
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-slate-800 py-12 px-6">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-2 rounded-xl">
                            <ShieldCheck className="text-white" size={24} />
                        </div>
                        <span className="font-bold text-lg">SiteGuard</span>
                    </div>
                    <div className="flex items-center gap-8 text-sm text-slate-500">
                        <a href="#" className="hover:text-white transition-colors">Privacidad</a>
                        <a href="#" className="hover:text-white transition-colors">Términos</a>
                        <a href="#" className="hover:text-white transition-colors">Documentación</a>
                        <Link to="/admin" className="hover:text-white transition-colors text-cyan-500/50 hover:text-cyan-400">Admin Panel</Link>
                    </div>
                    <div className="text-sm text-slate-500">
                        © 2025 SiteGuard. Made with 🇪🇸
                    </div>
                </div>
            </footer>
        </div>
    );
};

const FeatureCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    description: string;
    gradient: string;
}> = ({ icon, title, description, gradient }) => (
    <div className={`bg-gradient-to-br ${gradient} to-transparent border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition-colors`}>
        <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-4">
            {icon}
        </div>
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-slate-400 text-sm">{description}</p>
    </div>
);
