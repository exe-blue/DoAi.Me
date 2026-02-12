export type Worker = {
  id: string;
  hostname: string;
  status: string;
  device_count: number;
  last_heartbeat: string | null;
};

export type Device = {
  id: string;
  serial: string;
  worker_id: string | null;
  status: string;
  nickname: string | null;
};

export type Task = {
  id: string;
  type: string;
  status: string;
  preset_id: string | null;
  worker_id: string | null;
  created_at: string;
};
