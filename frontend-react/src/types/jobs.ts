export interface CreateJobResponse {
  job_id: number;
  status: string;
  limits: {
    max_duration_seconds: number;
    max_file_size_bytes: number;
    queue_size: number;
  };
}

export interface JobInfo {
  job_id: number;
  id?: number;
  type?: string;
  status: string;
  progress?: number;
  error?: string | null;
  input_duration_sec?: number;
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export type JobStatusResponse = JobInfo;

export interface SnapshotInfo {
  file?: string;
  path?: string;
  url?: string;
  label?: string;
  timestamp?: number;
}

export interface JobArtifactInfo {
  id?: number;
  kind: string;
  path: string;
  url?: string;
  timestamp_sec?: number;
  metadata?: Record<string, unknown> | null;
}

export interface JobResultPayload {
  summary?: Record<string, unknown>;
  events?: Array<Record<string, unknown>>;
  frames?: Array<Record<string, unknown>>;
  snapshots?: SnapshotInfo[];
}

export interface JobResultResponse {
  job_id: number;
  result: JobResultPayload;
  artifacts?: JobArtifactInfo[];
}
