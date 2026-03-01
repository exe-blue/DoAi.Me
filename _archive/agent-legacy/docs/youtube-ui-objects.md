# YouTube Android App UI 오브젝트 레퍼런스

## 자동화에서 사용하는 핵심 요소

### 검색
| 요소 | resource-id | content-desc |
|---|---|---|
| 검색 아이콘 | `com.google.android.youtube:id/menu_item_1` | `"검색"` |
| 검색 입력창 | `com.google.android.youtube:id/search_edit_text` | - |
| 음성 검색 | `com.google.android.youtube:id/mic_button` | `"음성으로 검색"` |

### 플레이어
| 요소 | resource-id | content-desc |
|---|---|---|
| 플레이어 컨테이너 | `com.google.android.youtube:id/player_fragment_container` | `"YouTube 동영상 플레이어"` |
| 재생/일시정지 | `com.google.android.youtube:id/player_control_play_pause_replay_button` | `"재생"` 또는 `"일시중지"` |
| 탐색 슬라이더 | `com.google.android.youtube:id/time_bar` | `"탐색 슬라이더"` |
| 전체화면 | `com.google.android.youtube:id/fullscreen_button` | `"전체 화면"` |

### 광고
| 요소 | resource-id | content-desc |
|---|---|---|
| 광고 건너뛰기 | `com.google.android.youtube:id/skip_ad_button` | `"건너뛰기"` |
| 광고 카운터 | `com.google.android.youtube:id/ad_progress_text` | `"스폰서"` |

### 상호작용
| 요소 | resource-id | content-desc |
|---|---|---|
| 영상 제목 | `com.google.android.youtube:id/video_title` | (제목 텍스트) |
| 채널명 | `com.google.android.youtube:id/channel_name` | - |
| 좋아요 | `com.google.android.youtube:id/like_button` | - |
| 싫어요 | `com.google.android.youtube:id/dislike_button` | - |
| 구독 | `com.google.android.youtube:id/subscribe_button` | `"구독"` |

## _findAndTap 사용법

```javascript
// resource-id로 찾기
await this._findAndTap(serial, { resourceId: 'com.google.android.youtube:id/skip_ad_button' });

// content-desc로 찾기
await this._findAndTap(serial, { contentDesc: '건너뛰기' });

// text로 찾기
await this._findAndTap(serial, { textContains: '검색' });
```

## 주의사항
- resource-id는 YouTube 앱 버전에 따라 변경될 수 있음
- content-desc 폴백을 항상 준비할 것
- uiautomator dump는 1~3초 소요 → 빈번한 호출 주의
- 광고 건너뛰기 버튼은 광고 재생 중에만 DOM에 존재
