# MVP 최소 구현: API로 영상 업데이트·인젝션

대시보드 없이 **API → Supabase 인젝션 → 시청 명령 → 완료 반영**까지 동작하는 최소 경로를 정리한다.

---

## 1. 공식 최소 경로 (경로 A)

1. **채널/영상 준비**: DB에 `channels` 1건, `videos` 1건이 있어야 한다.  
   - 수동: SQL로 `channels`, `videos` insert  
   - 또는 기존 API: `POST /api/channels`, `POST /api/channels/[id]/videos`

2. **대기열 인젝션**: `POST /api/queue`로 `task_config`만 넘기면, 서버가 workflow snapshot을 채워 `task_queue`에 insert 한다.

3. **디스패치**:  
   - Vercel Cron이 1분마다 `GET /api/cron/dispatch-queue` 호출  
   - 또는 수동: 로그인 후 `POST /api/dispatch-queue`  
   - 또는 E2E: `GET /api/cron/dispatch-queue` + `Authorization: Bearer ${CRON_SECRET}`  
   → `runDispatchQueue()`가 대기열 1건을 `tasks` + `task_devices`로 디스패치.

4. **클라이언트**: Agent가 `claim_task_devices_for_pc`로 `task_devices`를 claim → Xiaowei로 시청 실행 → `complete_task_device`로 DB 반영.

---

## 2. POST /api/queue — 최소 body 스펙

**필수**: `task_config` (object).

**최소 예시** (서버가 `buildConfigFromWorkflow`로 snapshot·inputs 채움):

```json
{
  "task_config": {
    "videoId": "<videos.id 또는 YouTube video ID>",
    "channelId": "<channels.id (UUID)>",
    "video_url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "keyword": "<검색 키워드, 보통 videoId 또는 제목>"
  },
  "priority": 5,
  "source": "channel_auto"
}
```

**필드 설명**

| 필드 | 필수 | 설명 |
|------|------|------|
| `task_config` | ✅ | 객체. 아래 키 일부만 있어도 됨. |
| `task_config.videoId` | ✅* | `videos.id` 또는 YouTube video ID. 디스패치 시 `createBatchTask`가 `videos`에서 조회. |
| `task_config.channelId` | ✅* | `channels.id` (UUID). videoId·channelId 없으면 디스패치 시 해당 항목은 cancelled 됨. |
| `task_config.video_url` | 권장 | 재생 URL. 없으면 `videoId`로 `https://www.youtube.com/watch?v=${videoId}` 생성. |
| `task_config.keyword` | 선택 | 검색 키워드. 없으면 videoId 사용. |
| `task_config.inputs` | 선택 | 위와 동일한 키를 `inputs.videoId`, `inputs.channelId` 등으로 넘겨도 됨. |
| `priority` | 선택 | 숫자. 기본: source=manual 이면 8, 아니면 5. |
| `source` | 선택 | `"manual"` \| `"channel_auto"`. 기본 `"channel_auto"`. |

\* 동일 영상이 이미 queued면: source=channel_auto 이면 기존 항목을 manual로 업그레이드하고 200; source=manual 이면 409.

**이미 snapshot이 있는 task_config** (서버에서 채우지 않음):

- `task_config.snapshot.steps` 가 배열이고 length > 0 이면, 그대로 사용하고 `buildConfigFromWorkflow` 호출하지 않음.

**응답**

- 201: `{ "item": { ... } }`  
- 200: 기존 항목을 manual로 업그레이드한 경우  
- 409: 동일 영상이 이미 manual로 등록됨  
- 400: `task_config` 없음 또는 객체 아님  

---

## 3. 채널/영상이 없을 때

- **채널**: `POST /api/channels` (body에 YouTube 채널 핸들/URL 등) 또는 SQL insert.  
- **영상**: `POST /api/channels/[id]/videos` 또는 SQL로 `videos` insert (`id` = YouTube video ID, `channel_id`, `status: "active"` 등).  
- 그 다음 위와 같이 `POST /api/queue`로 `videoId`(videos.id), `channelId`(channels.id)를 넣어 대기열 인젝션.

이 조합으로 “API로 영상 컨텐츠 업데이트 + Supabase 인젝션”을 완결한다.
