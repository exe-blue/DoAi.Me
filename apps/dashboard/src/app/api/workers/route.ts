import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createServerClient,
  type WorkerSummaryView,
  type WorkerRow,
} from "@doai/supabase";

export const dynamic = "force-dynamic";

const heartbeatSchema = z.object({
  hostname: z.string().min(1),
  ip_local: z.string().optional(),
  ip_public: z.string().optional(),
  xiaowei_connected: z.boolean().optional(),
  devices: z
    .array(
      z.object({
        serial: z.string().min(1),
        model: z.string().optional(),
        status: z.string().optional(),
        battery: z.number().int().min(0).max(100).optional(),
        ip_intranet: z.string().optional(),
      })
    )
    .optional(),
});

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("v_worker_summary")
      .select("*")
      .returns<WorkerSummaryView[]>()
      .order("hostname", { ascending: true });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    const validated = heartbeatSchema.parse(body);
    const now = new Date().toISOString();
    const deviceCount = validated.devices?.length ?? 0;

    // Upsert worker
    const { data: worker, error: workerError } = await supabase
      .from("workers")
      .upsert(
        {
          hostname: validated.hostname,
          ip_local: validated.ip_local,
          ip_public: validated.ip_public,
          xiaowei_connected: validated.xiaowei_connected ?? false,
          status: "online" as const,
          last_heartbeat: now,
          device_count: deviceCount,
        },
        { onConflict: "hostname" }
      )
      .select("*")
      .returns<WorkerRow[]>()
      .single();

    if (workerError || !worker) {
      return NextResponse.json(
        { success: false, error: workerError?.message ?? "Worker upsert failed" },
        { status: 500 }
      );
    }

    // Upsert devices
    if (validated.devices && validated.devices.length > 0) {
      const deviceUpserts = validated.devices.map((device) => ({
        serial: device.serial,
        worker_id: worker.id,
        model: device.model,
        status: "online" as const,
        battery_level: device.battery,
        ip_intranet: device.ip_intranet,
        last_seen: now,
      }));

      const { error: devicesError } = await supabase
        .from("devices")
        .upsert(deviceUpserts, { onConflict: "serial" });

      if (devicesError) {
        return NextResponse.json(
          { success: false, error: devicesError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, data: worker });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0].message },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
