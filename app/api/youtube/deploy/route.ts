/**
 * app/api/youtube/deploy/route.ts
 *
 * 스크립트 파일을 디바이스로 배포하는 엔드포인트.
 * tasks에 upload_file 태스크를 넣으면 Agent가 Xiaowei uploadFile로 Node PC 로컬 파일을 디바이스 /sdcard/... 에 전송.
 *
 * POST /api/youtube/deploy
 * {
 *   "pc_id": "uuid or null",                 // 특정 PC or null(전체)
 *   "devices": "all",
 *   "local_path": "./scripts/youtube_commander.js",   // Node PC 기준 경로 (상대경로는 Agent cwd 기준)
 *   "remote_path": "/sdcard/scripts/youtube_commander.js"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// 배포 가능한 스크립트 목록 (보안: 허용된 파일만 배포 가능)
const ALLOWED_SCRIPTS: Record<string, string> = {
  'youtube_commander':     './scripts/youtube_commander.js',
  'youtube_commander_run': './scripts/youtube_commander_run.js',
};

const DEFAULT_REMOTE_DIR = '/sdcard/scripts/';

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const {
      pc_id = null,
      devices = "all",
      script_name,
      local_path,
      remote_path,
      deploy_all = false,
    } = body;

    // deploy_all: 허용된 모든 스크립트 배포
    if (deploy_all) {
      const tasks = Object.entries(ALLOWED_SCRIPTS).map(([_, lPath]) => ({
        type: "youtube",
        task_type: "upload_file",
        status: "pending",
        pc_id: pc_id || null,
        payload: {
          devices,
          local_path: lPath,
          remote_path: DEFAULT_REMOTE_DIR + lPath.split("/").pop(),
          is_media: "0",
        },
      }));

      const { data, error } = await supabase.from("tasks").insert(tasks as any).select();
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, deployed: Object.keys(ALLOWED_SCRIPTS), tasks: data });
    }

    // 단일 스크립트 배포
    let resolvedLocalPath = local_path;
    if (script_name) {
      resolvedLocalPath = ALLOWED_SCRIPTS[script_name];
      if (!resolvedLocalPath) {
        return NextResponse.json(
          { success: false, error: `Unknown script: ${script_name}`, available: Object.keys(ALLOWED_SCRIPTS) },
          { status: 400 }
        );
      }
    }

    if (!resolvedLocalPath) {
      return NextResponse.json(
        { success: false, error: "script_name or local_path is required", available_scripts: Object.keys(ALLOWED_SCRIPTS) },
        { status: 400 }
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
          devices,
          local_path: resolvedLocalPath,
          remote_path: resolvedRemotePath,
          is_media: "0",
        },
      } as any)
      .select()
      .single();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      task: data,
      deployed: {
        local_path: resolvedLocalPath,
        remote_path: resolvedRemotePath,
        devices,
        pc_id,
      },
    });
  } catch (err) {
    console.error("[youtube/deploy]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Deploy failed" },
      { status: 500 }
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
