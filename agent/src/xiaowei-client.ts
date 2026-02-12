import { EventEmitter } from "events";
import WebSocket from "ws";
import { getLogger } from "./logger";

const log = getLogger("Xiaowei");

export interface XiaoweiDevice {
  onlySerial: string;
  serial: string;
  name: string;
  mode: number;
  intranetIp: string;
  model?: string;
  battery?: number;
  screenOn?: boolean;
}

export interface XiaoweiResponse {
  code: number;
  msg?: string;
  data?: unknown;
  [key: string]: unknown;
}

interface PendingRequest {
  resolve: (value: XiaoweiResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  action: string;
}

const XIAOWEI_SUCCESS = 10000;

export class XiaoweiClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private _connected = false;
  private shouldReconnect = true;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private readonly pending = new Map<number, PendingRequest>();
  private requestId = 0;

  constructor(private readonly wsUrl: string) {
    super();
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    log.info(`Connecting to ${this.wsUrl}`);

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch (err) {
      log.error("Connection error", { error: (err as Error).message });
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      log.info("Connected");
      this._connected = true;
      this.reconnectDelay = 1000;
      this.emit("connected");
    });

    this.ws.on("message", (raw: WebSocket.Data) => {
      try {
        const msg = JSON.parse(raw.toString()) as XiaoweiResponse;
        this.emit("response", msg);
        // Resolve oldest pending request (Xiaowei doesn't echo requestId)
        if (this.pending.size > 0) {
          const [id, req] = this.pending.entries().next().value as [number, PendingRequest];
          this.pending.delete(id);
          clearTimeout(req.timer);
          req.resolve(msg);
        }
      } catch (err) {
        log.error("Failed to parse message", { error: (err as Error).message });
      }
    });

    this.ws.on("close", () => {
      const was = this._connected;
      this._connected = false;
      if (was) {
        log.warn("Disconnected");
        this.emit("disconnected");
      }
      this.rejectAllPending("WebSocket disconnected");
      this.scheduleReconnect();
    });

    this.ws.on("error", (err: Error) => {
      log.error("WebSocket error", { error: err.message });
      this.emit("error", err);
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.rejectAllPending("Client disconnecting");
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    log.info("Disconnected by client");
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    log.info(`Reconnecting in ${this.reconnectDelay / 1000}s`);
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  private rejectAllPending(reason: string): void {
    for (const [, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new Error(reason));
    }
    this.pending.clear();
  }

  send(message: Record<string, unknown>, timeout = 30000): Promise<XiaoweiResponse> {
    return new Promise((resolve, reject) => {
      if (!this._connected || !this.ws) {
        return reject(new Error("Not connected to Xiaowei"));
      }

      const id = ++this.requestId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${message.action}`));
      }, timeout);

      this.pending.set(id, {
        resolve,
        reject,
        timer,
        action: String(message.action || "unknown"),
      });

      try {
        this.ws.send(JSON.stringify(message));
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  async list(): Promise<XiaoweiDevice[]> {
    const resp = await this.send({ action: "list" });
    return this.parseDeviceList(resp);
  }

  async actionCreate(
    devices: string,
    actionName: string,
    options: { count?: number; taskInterval?: [number, number]; deviceInterval?: string } = {}
  ): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "actionCreate",
      devices,
      data: [
        {
          actionName,
          count: options.count ?? 1,
          taskInterval: options.taskInterval ?? [1000, 3000],
          deviceInterval: options.deviceInterval ?? "500",
        },
      ],
    });
    this.checkResponse(resp, "actionCreate");
    return resp;
  }

  async autojsCreate(
    devices: string,
    scriptPath: string,
    options: { count?: number; taskInterval?: [number, number]; deviceInterval?: string } = {}
  ): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "autojsCreate",
      devices,
      data: [
        {
          path: scriptPath,
          count: options.count ?? 1,
          taskInterval: options.taskInterval ?? [2000, 5000],
          deviceInterval: options.deviceInterval ?? "1000",
        },
      ],
    });
    this.checkResponse(resp, "autojsCreate");
    return resp;
  }

  async adbShell(devices: string, command: string): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "adbShell",
      devices,
      data: [{ command }],
    });
    return resp;
  }

  async screen(serial: string): Promise<XiaoweiResponse> {
    return this.send({ action: "screen", devices: serial });
  }

  private checkResponse(resp: XiaoweiResponse, action: string): void {
    if (resp.code !== XIAOWEI_SUCCESS) {
      log.warn(`${action} returned code ${resp.code}: ${resp.msg || "unknown"}`);
    }
  }

  private parseDeviceList(response: XiaoweiResponse): XiaoweiDevice[] {
    if (!response) return [];
    const raw = response.data ?? response;

    if (Array.isArray(raw)) {
      return raw.map((d: Record<string, unknown>) => this.normalizeDevice(d));
    }

    if (typeof raw === "object" && raw !== null) {
      const obj = raw as Record<string, unknown>;
      const arr = obj.data ?? obj.devices ?? obj.list;
      if (Array.isArray(arr)) {
        return arr.map((d: Record<string, unknown>) => this.normalizeDevice(d));
      }

      // Device map: serial → info
      return Object.entries(obj)
        .filter(([k]) => !["action", "code", "msg", "data"].includes(k))
        .map(([serial, info]) => {
          const i = (info ?? {}) as Record<string, unknown>;
          return {
            onlySerial: String(i.onlySerial ?? serial),
            serial: String(i.serial ?? serial),
            name: String(i.name ?? ""),
            mode: Number(i.mode ?? 0),
            intranetIp: String(i.intranetIp ?? i.ip ?? ""),
            model: i.model ? String(i.model) : undefined,
            battery: i.battery != null ? Number(i.battery) : undefined,
          };
        });
    }

    return [];
  }

  private normalizeDevice(d: Record<string, unknown>): XiaoweiDevice {
    return {
      onlySerial: String(d.onlySerial ?? d.serial ?? d.id ?? d.deviceId ?? ""),
      serial: String(d.serial ?? d.onlySerial ?? d.id ?? ""),
      name: String(d.name ?? d.model ?? ""),
      mode: Number(d.mode ?? 0),
      intranetIp: String(d.intranetIp ?? d.ip ?? ""),
      model: d.model ? String(d.model) : undefined,
      battery: d.battery != null ? Number(d.battery) : undefined,
      screenOn: d.screenOn != null ? Boolean(d.screenOn) : undefined,
    };
  }
}
