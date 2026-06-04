// Driver-monitor tunables, persisted in localStorage and pushed to the
// backend over the WebSocket on connect. Keys + defaults mirror the backend
// DmsConfig dataclass.

export type DmsConfig = {
    calibration_seconds: number;
    ear_ratio: number;
    perclos_drowsy: number;
    microsleep_sec: number;
    mar_yawn: number;
    yaw_distract_deg: number;
    pitch_down_deg: number;
    distract_min_sec: number;
    lookdown_min_sec: number;
};

export const DEFAULT_DMS_CONFIG: DmsConfig = {
    calibration_seconds: 4.0,
    ear_ratio: 0.72,
    perclos_drowsy: 0.15,
    microsleep_sec: 0.8,
    mar_yawn: 0.6,
    yaw_distract_deg: 18.0,
    pitch_down_deg: 15.0,
    distract_min_sec: 1.3,
    lookdown_min_sec: 1.2,
};

const KEY = "siteguard_dms_config";

export function loadDmsConfig(): DmsConfig {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) return { ...DEFAULT_DMS_CONFIG, ...JSON.parse(raw) };
    } catch {
        /* ignore */
    }
    return { ...DEFAULT_DMS_CONFIG };
}

export function saveDmsConfig(cfg: DmsConfig): void {
    localStorage.setItem(KEY, JSON.stringify(cfg));
}

export function resetDmsConfig(): void {
    localStorage.removeItem(KEY);
}
