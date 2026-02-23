import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { getLogger } from "./logger";
import type { XiaoweiDevice } from "./xiaowei-client";

const log = getLogger("Broadcaster");

/**
 * Supabase Realtime Broadcaster — matched to pcs/nodes schema
 */
export class Broadcaster {
  private channels = new Map<string, RealtimeChannel>();

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly pcId: string,
    private readonly pcNumber: string
  ) {}

  async broadcastPcDevices(devices: XiaoweiDevice[]): Promise<void> {
    const topic = `room:pc:${this.pcNumber}:devices`;
    await this.sendBroadcast(topic, "update", {
      pc_id: this.pcId,
      pc_number: this.pcNumber,
      devices: devices.map((d) => ({
        serial: d.serial,
        name: d.name,
        model: d.model,
        mode: d.mode,
        battery: d.battery,
        intranetIp: d.intranetIp,
        screenOn: d.screenOn,
      })),
      count: devices.length,
      timestamp: new Date().toISOString(),
    });
  }

  async broadcastDeviceBatch(changed: XiaoweiDevice[]): Promise<void> {
    if (changed.length === 0) return;
    await this.sendBroadcast("room:devices", "update", {
      pc_id: this.pcId,
      pc_number: this.pcNumber,
      devices: changed.map((d) => ({
        serial: d.serial,
        status: "online",
        model: d.model,
        battery: d.battery,
      })),
      timestamp: new Date().toISOString(),
    });
  }

  async broadcastPcHeartbeat(deviceCount: number, xiaoweiConnected: boolean): Promise<void> {
    const topic = `room:pc:${this.pcNumber}`;
    await this.sendBroadcast(topic, "heartbeat", {
      pc_id: this.pcId,
      pc_number: this.pcNumber,
      status: "online",
      device_count: deviceCount,
      xiaowei_connected: xiaoweiConnected,
      timestamp: new Date().toISOString(),
    });
  }

  async broadcastTaskProgress(
    taskId: string,
    done: number,
    failed: number,
    total: number
  ): Promise<void> {
    await this.sendBroadcast(`room:task:${taskId}`, "progress", {
      task_id: taskId,
      done,
      failed,
      total,
      timestamp: new Date().toISOString(),
    });
  }

  private async sendBroadcast(
    topic: string,
    event: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      let channel = this.channels.get(topic);
      if (!channel) {
        channel = this.supabase.channel(topic, {
          config: { broadcast: { self: false, ack: true } },
        });
        channel.on("broadcast", { event: "__noop__" }, () => {});
        await new Promise<void>((resolve, reject) => {
          channel!.subscribe((status) => {
            if (status === "SUBSCRIBED") resolve();
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              reject(new Error(`Channel failed: ${topic} (${status})`));
            }
          });
        });
        this.channels.set(topic, channel);
      }

      await channel.send({ type: "broadcast", event, payload });
    } catch (err) {
      log.error(`Broadcast failed: ${topic}/${event}`, {
        error: (err as Error).message,
      });
    }
  }

  async cleanup(): Promise<void> {
    for (const [topic, channel] of this.channels) {
      await this.supabase.removeChannel(channel);
      log.info(`Unsubscribed from ${topic}`);
    }
    this.channels.clear();
  }
}
