const BASE = typeof import.meta.env.VITE_API_BASE === "string"
  ? import.meta.env.VITE_API_BASE
  : "http://localhost:3000";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  return (json.data ?? json) as T;
}

export interface WorkerRow {
  id: string;
  pc_number?: string;
  hostname?: string;
  status?: string;
  last_heartbeat?: string | null;
  device_count?: number;
  online_count?: number;
  max_devices?: number;
}

export interface WorkersResponse {
  workers?: WorkerRow[];
}

export async function fetchWorkers(): Promise<WorkerRow[]> {
  try {
    const data = await get<WorkersResponse>("/api/workers");
    return data?.workers ?? [];
  } catch {
    return [];
  }
}

export interface DeviceRow {
  id: string;
  serial_number?: string;
  connection_id?: string;
  status?: string;
  worker_id?: string;
  last_seen?: string | null;
}

export interface DevicesListResponse {
  ok?: boolean;
  data?: DeviceRow[];
  total?: number;
}

export async function fetchDevices(params?: { page?: number; pageSize?: number }): Promise<{ data: DeviceRow[]; total: number }> {
  try {
    const qs = params ? `?page=${params.page ?? 1}&pageSize=${params.pageSize ?? 50}` : "";
    const raw = await fetch(`${BASE}/api/devices${qs}`);
    const json = await raw.json();
    const data = Array.isArray(json.data) ? json.data : (json.ok && json.data ? json.data : []);
    const total = json.total ?? data.length;
    return { data, total };
  } catch {
    return { data: [], total: 0 };
  }
}

export interface LogEntry {
  id?: string;
  task_id?: string;
  device_serial?: string;
  level?: string;
  message?: string;
  created_at?: string;
}

export interface LogsResponse {
  logs?: LogEntry[];
}

export async function fetchLogs(params?: { limit?: number }): Promise<LogEntry[]> {
  try {
    const qs = params?.limit ? `?limit=${params.limit}` : "?limit=100";
    const data = await get<LogsResponse>(`/api/logs${qs}`);
    return data?.logs ?? [];
  } catch {
    return [];
  }
}

export interface ErrorEntry {
  type?: string;
  count?: number;
  severity?: string;
  lastOccurred?: string;
}

export async function fetchDashboardErrors(params?: { hours?: number }): Promise<ErrorEntry[]> {
  try {
    const qs = params?.hours ? `?hours=${params.hours}` : "?hours=24";
    const raw = await fetch(`${BASE}/api/dashboard/errors${qs}`);
    const json = await raw.json();
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}
