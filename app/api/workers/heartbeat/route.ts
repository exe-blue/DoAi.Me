import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { WorkerRow } from "@/lib/supabase/types";
import { heartbeatSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

interface HeartbeatDevice {
  serial: string;
  model?: string;
  status?: string;
  battery?: number;
  ip_intranet?: string;
}

interface HeartbeatBody {
  hostname: string;
  ip_local?: string;
  ip_public?: string;
  xiaowei_connected?: boolean;
  devices?: HeartbeatDevice[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const result = heartbeatSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues },
        { status: 400 }
      );
    }

    const { hostname, ip_local, ip_public, xiaowei_connected, devices } = result.data;

    const supabase = createServerClient();

    // Upsert worker by hostname
    const { data: worker, error: workerErr } = await supabase
      .from("workers")
      .upsert(
        {
          hostname,
          ip_local: ip_local ?? null,
          ip_public: ip_public ?? null,
          xiaowei_connected: xiaowei_connected ?? false,
          status: "online",
          last_heartbeat: new Date().toISOString(),
          device_count: devices?.length ?? 0,
        } as any,
        { onConflict: "hostname" }
      )
      .select("*")
      .single()
      .returns<WorkerRow>();

    if (workerErr) throw workerErr;

    // Upsert each device by serial
    if (devices && devices.length > 0 && worker) {
      for (const dev of devices) {
        const { error: devErr } = await supabase
          .from("devices")
          .upsert(
            {
              serial: dev.serial,
              worker_id: worker.id,
              model: dev.model ?? null,
              status: (dev.status as any) ?? "online",
              battery_level: dev.battery ?? null,
              ip_intranet: dev.ip_intranet ?? null,
              last_seen: new Date().toISOString(),
            } as any,
            { onConflict: "serial" }
          );

        if (devErr) {
          console.error(`Error upserting device ${dev.serial}:`, devErr);
        }
      }
    }

    return NextResponse.json({ worker });
  } catch (error) {
    console.error("Error processing heartbeat:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process heartbeat" },
      { status: 500 }
    );
  }
}
