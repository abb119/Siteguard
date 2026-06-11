import type { JobResultResponse } from "../types/jobs";

const API_BASE = "/api/v1";

export async function createJob(file: File): Promise<{ job_id: number; status: string; limits: any }> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${API_BASE}/jobs`, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(error.detail || "Error creating job");
    }

    return response.json();
}

export async function getJobResult(jobId: string): Promise<JobResultResponse> {
    const response = await fetch(`${API_BASE}/jobs/${jobId}/result`);

    if (!response.ok) {
        if (response.status === 404) {
            // Check if job exists but is not done (status check)
            // For now, simpler to just throw as "not ready" or "not found"
            // Ideally we would check status endpoint, but strict adherence to error handling:
            throw new Error("Job result not found or not ready.");
        }
        throw new Error("Failed to fetch job result");
    }

    return response.json();
}

export async function getJob(jobId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/jobs/${jobId}`);
    if (!response.ok) throw new Error("Failed to fetch job");
    return response.json();
}

export async function createDriverJob(file: File): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/driver/jobs`, { method: "POST", body: formData });
    if (!response.ok) throw new Error("Failed to upload driver job");
    return response.json();
}

export async function createRoadJob(file: File): Promise<any> {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/road/jobs`, { method: "POST", body: formData });
    if (!response.ok) throw new Error("Failed to upload road job");
    return response.json();
}

export function buildArtifactUrl(path: string): string {
    if (path.startsWith("http")) return path;
    if (path.startsWith("/")) return path;
    return `${API_BASE}/${path}`;
}

/**
 * Wrapper around fetch that adds ngrok-skip-browser-warning header.
 * Prevents ngrok free-tier HTML interstitial from breaking API calls.
 */
export const TOKEN_KEY = "siteguard_token";

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
}

export function apiFetch(url: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set("ngrok-skip-browser-warning", "true");
    const token = getToken();
    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(url, { ...init, headers });
}

// ── Driver events / trip report ──────────────────────────────────────────────
const API_HOST = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

/** Prefix a backend-relative /static path with the API host (for prod/ngrok). */
export function staticUrl(path?: string | null): string {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    return `${API_HOST}${path}`;
}

export async function listDriverEvents(sessionId?: string): Promise<any[]> {
    const url = new URL(`${API_HOST}/driver/events`);
    if (sessionId) url.searchParams.set("session_id", sessionId);
    url.searchParams.set("limit", "200");
    const res = await apiFetch(url.toString());
    if (!res.ok) throw new Error("Failed to fetch driver events");
    return res.json();
}

export async function listDriverSessions(): Promise<any[]> {
    const res = await apiFetch(`${API_HOST}/driver/sessions`);
    if (!res.ok) throw new Error("Failed to fetch driver sessions");
    return res.json();
}

export async function getDriverReport(sessionId: string): Promise<any> {
    const res = await apiFetch(`${API_HOST}/driver/sessions/${sessionId}/report`);
    if (!res.ok) throw new Error("Failed to fetch driver report");
    return res.json();
}

export async function reviewDriverEvent(id: number, isFalsePositive: boolean): Promise<any> {
    const res = await apiFetch(`${API_HOST}/driver/events/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_false_positive: isFalsePositive }),
    });
    if (!res.ok) throw new Error("Failed to review event");
    return res.json();
}

// ── Auth / multi-tenant ──────────────────────────────────────────────────────
export type Me = {
    id: number;
    username: string;
    full_name: string | null;
    role: "admin" | "company" | "worker";
    company_id: number | null;
    company_name: string | null;
};

export async function authLogin(username: string, password: string): Promise<string> {
    const body = new URLSearchParams({ username, password });
    const res = await apiFetch(`${API_HOST}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!res.ok) throw new Error("Credenciales incorrectas");
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    return data.access_token;
}

export function authLogout(): void {
    localStorage.removeItem(TOKEN_KEY);
}

export async function authMe(): Promise<Me> {
    const res = await apiFetch(`${API_HOST}/users/me`);
    if (!res.ok) throw new Error("No autenticado");
    return res.json();
}

export async function adminListCompanies(): Promise<any[]> {
    const res = await apiFetch(`${API_HOST}/admin/companies`);
    if (!res.ok) throw new Error("Failed to list companies");
    return res.json();
}

export async function adminCreateCompany(payload: {
    name: string; manager_username: string; manager_password: string; manager_full_name?: string;
}): Promise<any> {
    const res = await apiFetch(`${API_HOST}/admin/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "Error creando empresa");
    return res.json();
}

export async function companyListWorkers(): Promise<any[]> {
    const res = await apiFetch(`${API_HOST}/company/workers`);
    if (!res.ok) throw new Error("Failed to list workers");
    return res.json();
}

export async function companyCreateWorker(payload: {
    username: string; password: string; full_name?: string;
}): Promise<any> {
    const res = await apiFetch(`${API_HOST}/company/workers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || "Error creando trabajador");
    return res.json();
}
