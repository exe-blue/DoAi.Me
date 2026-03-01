/**
 * app/api/youtube/deploy/route.ts
 *
 * 스크립트 파일을 디바이스로 배포하는 엔드포인트.
 * tasks에 upload_file 태스크를 넣으면 Agent가 Xiaowei uploadFile로 Node PC 로컬 파일을 디바이스 /sdcard/... 에 전송.
 *
 * POST /api/youtube/deploy
 * {
 *   "pc_id": "uuid",                         // required for resolving target devices
 *   "devices": "optional comma list",        // omit to use all online/busy for pc_id
 *   "local_path": "./scripts/youtube_commander.js",
 *   "remote_path": "/sdcard/scripts/youtube_commander.js"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 배포 가능한 스크립트 목록 (보안: 허용된 파일만 배포 가능)
const ALLOWED_SCRIPTS: Record<string, string> = {
  youtube_commander: "./scripts/youtube_commander.js",
  youtube_commander_run: "./scripts/youtube_commander_run.js",
};

const DEFAULT_REMOTE_DIR = "/sdcard/scripts/";

async function resolveTargetDevices(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  pc_id: string | null,
  devicesHint?: string,
): Promise<{ target_devices: string[]; devicesLabel: string }> {
  if (devicesHint && devicesHint !== "all") {
    const list = devicesHint
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { target_devices: list, devicesLabel: devicesHint };
  }
  if (!pc_id) return { target_devices: [], devicesLabel: "" };
  const { data } = await supabase
    .from("devices")
    .select("serial, connection_id")
    .eq("pc_id", pc_id)
    .in("status", ["online", "busy"]);
  const targets = (data || [])
    .map((d) => d.connection_id || d.serial)
    .filter(Boolean);
  return { target_devices: targets, devicesLabel: targets.join(",") };
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await req.json();
    const {
      pc_id = null,
      devices: devicesHint,
      script_name,
      local_path,
      remote_path,
      deploy_all = false,
    } = body;

    const { target_devices, devicesLabel } = await resolveTargetDevices(
      supabase,
      pc_id ?? null,
      devicesHint,
    );
    if (
      target_devices.length === 0 &&
      (deploy_all || script_name || local_path)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No target devices (pc_id required with online/busy devices, or pass devices list)",
        },
        { status: 400 },
      );
    }

    // deploy_all: 허용된 모든 스크립트 배포
    if (deploy_all) {
      const tasks = Object.entries(ALLOWED_SCRIPTS).map(([_, lPath]) => ({
        type: "youtube",
        task_type: "upload_file",
        status: "pending",
        pc_id: pc_id || null,
        payload: {
          devices: devicesLabel,
          local_path: lPath,
          remote_path: DEFAULT_REMOTE_DIR + lPath.split("/").pop(),
          is_media: "0",
        },
        target_devices: target_devices,
      }));

      const { data, error } = await supabase
        .from("tasks")
        .insert(tasks as any)
        .select();
      if (error)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 },
        );
      return NextResponse.json({
        success: true,
        deployed: Object.keys(ALLOWED_SCRIPTS),
        tasks: data,
      });
    }

    // 단일 스크립트 배포
    let resolvedLocalPath = local_path;
    if (script_name) {
      resolvedLocalPath = ALLOWED_SCRIPTS[script_name];
      if (!resolvedLocalPath) {
        return NextResponse.json(
          {
            success: false,
            error: `Unknown script: ${script_name}`,
            available: Object.keys(ALLOWED_SCRIPTS),
          },
          { status: 400 },
        );
      }
    }

    if (!resolvedLocalPath) {
      return NextResponse.json(
        {
          success: false,
          error: "script_name or local_path is required",
          available_scripts: Object.keys(ALLOWED_SCRIPTS),
        },
        { status: 400 },
      );
    }

    const fileName = resolvedLocalPath.split("/").pop();
    const resolvedRemotePath = remote_path || DEFAULT_REMOTE_DIR + fileName;

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        type: "youtube",
        task_type: "upload_file",
        status: "pending",
        pc_id: pc_id || null,
        payload: {
          devices: devicesLabel,
          local_path: resolvedLocalPath,
          remote_path: resolvedRemotePath,
          is_media: "0",
        },
        target_devices: target_devices,
      } as any)
      .select()
      .single();

    if (error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );

    return NextResponse.json({
      success: true,
      task: data,
      deployed: {
        local_path: resolvedLocalPath,
        remote_path: resolvedRemotePath,
        devices: devicesLabel,
        pc_id,
      },
    });
  } catch (err) {
    console.error("[youtube/deploy]", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Deploy failed",
      },
      { status: 500 },
    );
  }
}

// GET: 배포 가능한 스크립트 목록
export async function GET() {
  return NextResponse.json({
    available_scripts: Object.keys(ALLOWED_SCRIPTS),
    scripts: ALLOWED_SCRIPTS,
    default_remote_dir: DEFAULT_REMOTE_DIR,
  });
}
