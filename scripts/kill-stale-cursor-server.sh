#!/usr/bin/env bash
# 종료 대상: 구 Cursor 서버만 (PID 4544, 포트 42769)
# 나머지(현재 Cursor, SonarLint, CUPS, DNS)는 건드리지 않음.

set -e
STALE_PID=4544
if kill -0 "$STALE_PID" 2>/dev/null; then
  echo "구 Cursor 서버 종료 중: PID $STALE_PID (포트 42769)"
  sudo kill "$STALE_PID" && echo "종료됨." || echo "실패 (sudo 필요)."
else
  echo "PID $STALE_PID 는 이미 없습니다."
fi
