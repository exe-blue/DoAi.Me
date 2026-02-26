# YouTube Commander 배포 → 실행 플로우

## Agent 쪽 설정 (agent/.env)

스크립트 경로를 **절대 경로**로 두면, 실행 디렉터리와 관계없이 500대 PC 모두 동일하게 동작한다.

```bash
# Linux 미니PC
SCRIPTS_DIR=/home/agent/scripts

# Windows 미니PC
SCRIPTS_DIR=C:\agent\scripts
```

`local_path`는 항상 `SCRIPTS_DIR` + 파일명으로 해석된다.

---

## 배포 → 실행 전체 플로우 테스트 순서

### 1. 배포 요청

```http
POST /api/youtube/deploy
Content-Type: application/json

{
  "deploy_all": true,
  "devices": "all",
  "pc_id": "<해당 PC의 UUID 또는 null(전체)>"
}
```

- Agent 로그에서 `mkdir -p /sdcard/scripts` 및 `uploadFile` 호출 확인.

### 2. 디바이스에 파일 존재 확인

```bash
adb shell ls /sdcard/scripts/
```

- `youtube_commander.js`, `youtube_commander_run.js` 있는지 확인.

### 3. 명령 실행으로 배포 검증

```http
POST /api/youtube/command
Content-Type: application/json

{
  "command": { "action": "get_state" },
  "devices": "all",
  "pc_id": "<해당 PC의 UUID 또는 null>"
}
```

- 정상 응답이면 배포 + Commander 실행 경로까지 완료된 상태.

### 4. (선택) 배포 후 바로 실행

```http
POST /api/youtube/deploy
{ "deploy_all": true, "devices": "all" }

POST /api/youtube/command
{ "command": { "action": "launch", "params": { "fromScratch": true } }, "devices": "all" }
```

또는 프로젝트 루트에서:

```bash
node scripts/youtube-deploy-and-launch.js
```
