"""
youtube_task_api.py
POW WebSocket API ↔ YouTubeCommander 연동
FastAPI 서버에서 명령 오브젝트를 디바이스로 디스패치

사용 예:
    POST /api/youtube/command
    {
      "node_id": "node01",
      "devices": "all",
      "command": {
        "action": "like"
      }
    }

    POST /api/youtube/pipeline
    {
      "node_id": "node01",
      "devices": "group:PC01",
      "commands": [
        { "action": "skip_ad" },
        { "action": "like" },
        { "action": "comment", "params": { "text": "최고의 음악이에요!" } },
        { "action": "subscribe" }
      ]
    }
"""

import asyncio
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/youtube", tags=["youtube"])


# ============================================================
# 스키마 정의
# ============================================================

class YouTubeCommand(BaseModel):
    action: str
    params: Optional[Dict[str, Any]] = None
    fail_stop: Optional[bool] = False  # 실패 시 파이프라인 중단


class CommandRequest(BaseModel):
    node_id: str
    devices: str = "all"
    command: YouTubeCommand
    step_delay: Optional[int] = 500  # 파이프라인 스텝 간 딜레이(ms)


class PipelineRequest(BaseModel):
    node_id: str
    devices: str = "all"
    commands: List[YouTubeCommand]
    step_delay: Optional[int] = 500


class WarmupRequest(BaseModel):
    node_id: str
    devices: str = "all"
    mode: str = "home"  # home | sidebar | autoplay | hashtag
    count: int = 3
    watch_duration_min: int = 10000
    watch_duration_max: int = 30000


# ============================================================
# 지원 액션 레지스트리 (문서화 및 검증용)
# ============================================================

SUPPORTED_ACTIONS = {
    # 기본 제어
    "launch":          {"desc": "YouTube 앱 실행", "params": {"pkg": "str", "url": "str"}},
    "home":            {"desc": "홈 화면으로 이동"},
    "back":            {"desc": "뒤로 가기"},

    # 검색
    "search":          {"desc": "검색", "params": {"query": "str (required)"}},

    # 재생 제어
    "play":            {"desc": "재생"},
    "pause":           {"desc": "일시정지"},
    "toggle_play":     {"desc": "재생/일시정지 토글"},
    "seek":            {"desc": "탐색 슬라이더 이동", "params": {"percent": "int 0-100"}},
    "fullscreen":      {"desc": "전체화면", "params": {"enable": "bool"}},
    "caption":         {"desc": "자막 토글"},

    # 광고
    "skip_ad":         {"desc": "광고 건너뛰기", "params": {"maxWait": "int ms"}},
    "wait_ad":         {"desc": "광고 종료 대기", "params": {"checkInterval": "int ms"}},

    # 참여
    "like":            {"desc": "좋아요", "params": {"verify": "bool"}},
    "unlike":          {"desc": "좋아요 취소"},
    "dislike":         {"desc": "싫어요"},
    "subscribe":       {"desc": "구독", "params": {"notify": "bool"}},
    "unsubscribe":     {"desc": "구독 취소"},
    "share":           {"desc": "공유"},
    "save_to_playlist":{"desc": "재생목록 저장", "params": {"playlistName": "str"}},

    # 댓글
    "comment":         {"desc": "댓글 작성", "params": {"text": "str (required)", "verify": "bool"}},
    "comment_like":    {"desc": "댓글 좋아요", "params": {"index": "int"}},
    "comment_reply":   {"desc": "댓글 답글", "params": {"index": "int", "text": "str"}},
    "comment_sort":    {"desc": "댓글 정렬", "params": {"by": "인기|최신"}},

    # 워밍업
    "warmup":          {"desc": "아이디 예열", "params": {
        "mode": "home|sidebar|autoplay|hashtag",
        "count": "int",
        "watchDuration": "[min_ms, max_ms]"
    }},

    # 복합
    "full_engage":     {"desc": "완전 참여 시나리오", "params": {
        "watchMs": "int",
        "commentText": "str",
        "subscribe": "bool"
    }},

    # 상태
    "get_state":       {"desc": "현재 상태 조회"},
}


# ============================================================
# POW API 어댑터 (기존 WebSocket 클라이언트 재사용)
# ============================================================

class YouTubeTaskDispatcher:
    """YouTube Commander 명령을 POW API로 전달"""

    def __init__(self, pow_client):
        """
        pow_client: 기존 POW WebSocket 클라이언트 인스턴스
        (ac684a15 대화의 XiaoweiClient 재사용)
        """
        self.client = pow_client

    async def run_commander(
        self,
        node_id: str,
        devices: str,
        commander_call: str,  # JS 코드 문자열
    ) -> dict:
        """
        AutoX.js를 통해 YouTube Commander 실행
        """
        script = f"""
        const cmd = require('/sdcard/scripts/youtube_commander.js');
        const result = {commander_call};
        console.log(JSON.stringify(result));
        result;
        """
        return await self.client.run_autojs_script(
            node_id=node_id,
            devices=devices,
            script_path="/sdcard/scripts/youtube_commander.js",
            count=1,
            task_interval=[0, 0],
        )

    def _build_execute_call(self, command: YouTubeCommand) -> str:
        """Command 오브젝트를 JS execute() 호출로 변환"""
        cmd_obj = {"action": command.action}
        if command.params:
            cmd_obj["params"] = command.params
        return f"YouTubeCommander.execute({json.dumps(cmd_obj, ensure_ascii=False)})"

    def _build_pipeline_call(self, commands: List[YouTubeCommand], step_delay: int) -> str:
        """Pipeline 명령 배열을 JS pipeline() 호출로 변환"""
        cmds = []
        for cmd in commands:
            obj = {"action": cmd.action}
            if cmd.params:
                obj["params"] = cmd.params
            if cmd.fail_stop:
                obj["failStop"] = cmd.fail_stop
            cmds.append(obj)
        return f"YouTubeCommander.pipeline({json.dumps(cmds, ensure_ascii=False)}, {step_delay})"


# ============================================================
# API 엔드포인트
# ============================================================

@router.get("/actions")
async def list_actions():
    """지원하는 모든 액션 목록 반환"""
    return {"actions": SUPPORTED_ACTIONS}


@router.post("/command")
async def execute_command(req: CommandRequest):
    """
    단일 YouTube 명령 실행
    
    예시:
    {
        "node_id": "node01",
        "devices": "all",
        "command": { "action": "like" }
    }
    """
    if req.command.action not in SUPPORTED_ACTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown action: {req.command.action}. Available: {list(SUPPORTED_ACTIONS.keys())}"
        )

    # AutoX.js 인라인 스크립트로 실행
    cmd_json = json.dumps({
        "action": req.command.action,
        "params": req.command.params or {}
    }, ensure_ascii=False)

    autojs_script = f"""
var YouTubeCommander = require('/sdcard/scripts/youtube_commander.js');
var result = YouTubeCommander.execute({cmd_json});
console.log('[RESULT]' + JSON.stringify(result));
"""

    # 실제 배포 시 pow_client.adb_shell() 또는 autojsCreate()로 전달
    return {
        "success": True,
        "node_id": req.node_id,
        "devices": req.devices,
        "command": req.command.dict(),
        "autojs_script": autojs_script,  # 디버그용
    }


@router.post("/pipeline")
async def execute_pipeline(req: PipelineRequest):
    """
    YouTube 명령 파이프라인 실행 (순서대로)
    
    예시:
    {
        "node_id": "node01",
        "devices": "group:PC01",
        "commands": [
            { "action": "skip_ad" },
            { "action": "like" },
            { "action": "comment", "params": { "text": "좋아요!" } },
            { "action": "subscribe" }
        ]
    }
    """
    unknown = [cmd.action for cmd in req.commands if cmd.action not in SUPPORTED_ACTIONS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown actions: {unknown}")

    cmds_json = json.dumps([
        {
            "action": cmd.action,
            "params": cmd.params or {},
            "failStop": cmd.fail_stop
        }
        for cmd in req.commands
    ], ensure_ascii=False)

    autojs_script = f"""
var YouTubeCommander = require('/sdcard/scripts/youtube_commander.js');
var result = YouTubeCommander.pipeline({cmds_json}, {req.step_delay});
console.log('[PIPELINE_RESULT]' + JSON.stringify(result));
"""

    return {
        "success": True,
        "node_id": req.node_id,
        "devices": req.devices,
        "command_count": len(req.commands),
        "autojs_script": autojs_script,
    }


@router.post("/warmup")
async def warmup(req: WarmupRequest):
    """
    아이디 예열 (워밍업) 전용 엔드포인트
    
    mode:
      - home: 홈 피드에서 랜덤 영상 시청
      - sidebar: 현재 영상 우측 연관 영상 탐색
      - autoplay: 자동재생 ON + 방치
      - hashtag: 해시태그 클릭 탐색
    """
    cmd_json = json.dumps({
        "action": "warmup",
        "params": {
            "mode": req.mode,
            "count": req.count,
            "watchDuration": [req.watch_duration_min, req.watch_duration_max]
        }
    }, ensure_ascii=False)

    autojs_script = f"""
var YouTubeCommander = require('/sdcard/scripts/youtube_commander.js');
var result = YouTubeCommander.execute({cmd_json});
console.log('[WARMUP_RESULT]' + JSON.stringify(result));
"""

    return {
        "success": True,
        "node_id": req.node_id,
        "devices": req.devices,
        "warmup_config": {
            "mode": req.mode,
            "count": req.count,
            "watch_duration": [req.watch_duration_min, req.watch_duration_max]
        },
        "autojs_script": autojs_script,
    }


@router.post("/full-engage")
async def full_engage(
    node_id: str,
    devices: str = "all",
    watch_ms: int = 20000,
    comment_text: Optional[str] = None,
    subscribe: bool = False,
):
    """완전 참여 시나리오: 광고처리 → 시청 → 좋아요 → 댓글 → 구독"""
    return await execute_pipeline(PipelineRequest(
        node_id=node_id,
        devices=devices,
        commands=[
            YouTubeCommand(action="wait_ad"),
            YouTubeCommand(action="like"),
            *(
                [YouTubeCommand(action="comment", params={"text": comment_text})]
                if comment_text else []
            ),
            *(
                [YouTubeCommand(action="subscribe")]
                if subscribe else []
            ),
        ]
    ))
