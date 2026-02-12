import React, { useState, useEffect } from "react";
import { Key, Plus, Zap, ShieldAlert, AlertTriangle, Shield, Link2, KeyRound, User, FileText } from "lucide-react";
import { ServiceLayout } from "../components/ServiceLayout";
import { apiFetch } from "../lib/api";
import { SecurityNavItems } from "./SecurityDashboard";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

type Token = {
    id: number;
    type: string;
    value_preview?: string;
    placement?: string;
    severity: string;
    revoked: boolean;
    pack_id?: string;
};

type Event = {
    id: number;
    token_id: number;
    ts: string;
    source_ip?: string;
    user_agent?: string;
};

const tokenTypeLabel: Record<string, { label: string; icon: string; color: string }> = {
    canary_url: { label: "Canary URL", icon: "link", color: "text-red-400" },
    fake_api_key: { label: "Fake API Key", icon: "key", color: "text-amber-400" },
    decoy_login: { label: "Decoy Login", icon: "user", color: "text-purple-400" },
    decoy_doc: { label: "Decoy Document", icon: "file", color: "text-blue-400" },
};

export const HoneytokensPage: React.FC = () => {
    const [tokens, setTokens] = useState<Token[]>([]);
    const [events, setEvents] = useState<Event[]>([]);
    const [selectedToken, setSelectedToken] = useState<Token | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [playResult, setPlayResult] = useState<any>(null);

    const fetchTokens = () => {
        apiFetch(`${API_URL}/api/security/honeytokens/tokens`).then(r => r.json()).then(setTokens).catch(() => { });
    };

    const fetchEvents = (tokenId?: number) => {
        const url = tokenId
            ? `${API_URL}/api/security/honeytokens/events?token_id=${tokenId}`
            : `${API_URL}/api/security/honeytokens/events`;
        apiFetch(url).then(r => r.json()).then(setEvents).catch(() => { });
    };

    useEffect(() => {
        fetchTokens();
        fetchEvents();
    }, []);

    const createPack = async () => {
        setLoading(true);
        const res = await apiFetch(`${API_URL}/api/security/honeytokens/packs/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ placement: "Production Environment" }),
        });
        const data = await res.json();
        setMessage(`Pack ${data.pack_id} created with ${data.tokens.length} tokens`);
        fetchTokens();
        setLoading(false);
        setTimeout(() => setMessage(null), 5000);
    };

    const simulateTrigger = async (tokenId: number) => {
        setLoading(true);
        const res = await apiFetch(`${API_URL}/api/security/honeytokens/simulate-trigger/${tokenId}`, {
            method: "POST",
        });
        await res.json();
        setMessage(`Token triggered! Critical event emitted.`);
        fetchEvents(tokenId);
        setLoading(false);
        setTimeout(() => setMessage(null), 5000);
    };

    const runPlaybook = async (tokenId: number, action: string) => {
        setLoading(true);
        const res = await apiFetch(`${API_URL}/api/security/honeytokens/playbooks/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token_id: tokenId, action, simulate: true }),
        });
        const data = await res.json();
        setPlayResult(data);
        setMessage(`⚡ Playbook "${action}" executed: ${data.result}`);
        setLoading(false);
        setTimeout(() => setMessage(null), 5000);
    };

    return (
        <ServiceLayout
            serviceName="Honeytokens"
            serviceIcon={<Key className="text-amber-400" size={24} />}
            accentColor="bg-amber-500/20"
            navItems={SecurityNavItems}
        >
            <div className="p-4 md:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold mb-1 flex items-center gap-3"><Key size={28} className="text-amber-400" /> Honeytokens & Deception</h1>
                        <p className="text-slate-400 text-sm md:text-base">Deploy decoy credentials and monitor for unauthorized access.</p>
                    </div>
                    <button
                        onClick={createPack}
                        disabled={loading}
                        className="flex items-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 rounded-lg px-4 py-2 transition-all self-start sm:self-auto whitespace-nowrap"
                    >
                        <Plus size={18} /> Create Token Pack
                    </button>
                </div>

                {/* Status message */}
                {message && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg p-3 mb-4 animate-in fade-in">
                        {message}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Token Catalog */}
                    <div className="lg:col-span-2 bg-slate-800/30 backdrop-blur border border-slate-700/50 rounded-xl p-6">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <Shield size={18} className="text-amber-400" />
                            Token Catalog ({tokens.length})
                        </h2>
                        {tokens.length === 0 && (
                            <p className="text-slate-500 text-center py-8">No tokens deployed. Click "Create Token Pack" to get started.</p>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {tokens.map((token) => {
                                const cfg = tokenTypeLabel[token.type] || { label: token.type, icon: "?", color: "text-slate-400" };
                                return (
                                    <div
                                        key={token.id}
                                        className={`border rounded-lg p-4 cursor-pointer transition-all hover:scale-[1.01] ${selectedToken?.id === token.id
                                            ? "border-amber-500/60 bg-amber-500/10"
                                            : "border-slate-700/50 bg-slate-800/50 hover:border-slate-600"
                                            } ${token.revoked ? "opacity-50" : ""}`}
                                        onClick={() => { setSelectedToken(token); fetchEvents(token.id); }}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            {cfg.icon === "link" && <Link2 size={18} className={cfg.color} />}
                                            {cfg.icon === "key" && <KeyRound size={18} className={cfg.color} />}
                                            {cfg.icon === "user" && <User size={18} className={cfg.color} />}
                                            {cfg.icon === "file" && <FileText size={18} className={cfg.color} />}
                                            <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                                            {token.revoked && (
                                                <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded ml-auto">REVOKED</span>
                                            )}
                                        </div>
                                        <code className="text-xs text-slate-400 block truncate">{token.value_preview}</code>
                                        <div className="text-xs text-slate-500 mt-1">{token.placement}</div>

                                        {/* Actions */}
                                        {!token.revoked && (
                                            <div className="flex gap-2 mt-3">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); simulateTrigger(token.id); }}
                                                    className="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 px-2 py-1 rounded flex items-center gap-1 transition-all"
                                                >
                                                    <Zap size={12} /> Simulate
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); runPlaybook(token.id, "open_incident"); }}
                                                    className="text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 px-2 py-1 rounded flex items-center gap-1 transition-all"
                                                >
                                                    <ShieldAlert size={12} /> Incident
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); runPlaybook(token.id, "block_ip"); }}
                                                    className="text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 px-2 py-1 rounded flex items-center gap-1 transition-all"
                                                >
                                                    <ShieldAlert size={12} /> Block
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Events & Playbook Panel */}
                    <div className="space-y-4">
                        {/* Confidence Indicator */}
                        {events.length > 0 && (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center">
                                <div className="text-4xl font-bold text-red-400 mb-1">99%</div>
                                <div className="text-sm text-red-300">Detection Confidence</div>
                                <div className="text-xs text-slate-400 mt-1">Unique token → high-confidence indicator of breach</div>
                            </div>
                        )}

                        {/* Playbook Result */}
                        {playResult && (
                            <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4">
                                <h3 className="text-sm font-semibold text-emerald-400 mb-2">Last Playbook Result</h3>
                                <div className="text-xs space-y-1">
                                    <div><span className="text-slate-400">Action:</span> {playResult.action}</div>
                                    <div><span className="text-slate-400">Result:</span> <span className="text-emerald-400">{playResult.result}</span></div>
                                    {playResult.details && Object.entries(playResult.details).map(([k, v]) => (
                                        <div key={k}><span className="text-slate-400">{k}:</span> {String(v)}</div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Event Log */}
                        <div className="bg-slate-800/30 backdrop-blur border border-slate-700/50 rounded-xl p-4">
                            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                                <AlertTriangle size={14} className="text-red-400" />
                                Trigger Events ({events.length})
                            </h3>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {events.length === 0 && <p className="text-xs text-slate-500">No triggers yet</p>}
                                {events.map((ev) => (
                                    <div key={ev.id} className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs">
                                        <div className="font-medium text-red-300">Token #{ev.token_id} accessed</div>
                                        <div className="text-slate-400">IP: {ev.source_ip || "—"}</div>
                                        <div className="text-slate-500">{ev.ts ? new Date(ev.ts).toLocaleString() : ""}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ServiceLayout>
    );
};
