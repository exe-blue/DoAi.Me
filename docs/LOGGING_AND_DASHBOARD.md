# 로그 수집 및 대시보드 연동

## 1. 로그가 어디서 어떻게 수집되는지

### 에이전트 측 (수집)

| 경로 | 설명 |
|------|------|
| **Supabase `execution_logs`** | `agent/core/supabase-sync.js`의 `insertExecutionLog()`가 실행 시점·완료·실패 등을 버퍼에 쌓고, 주기적으로 `_flushLogBuffer()`로 **execution_logs** 테이블에 INSERT. |
| **로컬 파일** | 같은 flush 시 `farm_logs/YYYY-MM-DD.log`에 append (에이전트 프로세스 cwd 기준). |
| **Realtime** | INSERT 후 `broadcast_to_channel` RPC로 `room:task:<execution_id>:logs`에 batch 이벤트 전송 (실시간 구독용). |

로그가 쌓이는 조건: **task 실행 경로**에서 `insertExecutionLog()`가 호출될 때.  
DeviceOrchestrator → `runTaskDevice()` 경로에서 호출되면 execution_logs에 기록됨.

### 대시보드 측 (표시)

| 화면 | 데이터 소스 | 비고 |
|------|-------------|------|
| **Operations** (Online devices, Last heartbeat, Alerts) | `getWorkers()` → **GET /api/workers**, `getDevices()` → **GET /api/devices**, `getDashboardMetricsSnapshot()` → **GET /api/dashboard/metrics** | 이 API들이 없으면 항상 0/—/No alerts. |
| **Events / Logs** | `getLogs()` → **GET /api/logs** | 이 API가 없으면 "No logs."만 표시. |

즉, **로그 수집(에이전트 → execution_logs)은 구현되어 있지만**,  
**대시보드가 그 로그를 보려면 GET /api/logs 가 필요**하고,  
Operations 숫자들을 보려면 /api/workers, /api/devices, /api/dashboard/* 가 필요함.

## 2. 현재 상태 요약

- **에이전트**: `execution_logs` INSERT + 로컬 `farm_logs/*.log` → **동작 중** (호출 경로가 있으면 기록됨).
- **웹**: Events/Logs는 **GET /api/logs** 를 호출하는데, 이 라우트가 없으면 응답이 빈 배열이 되어 "로그가 안 나온다"가 됨.
- **Operations**: /api/workers, /api/devices, /api/dashboard/metrics 가 없어서 Online devices 0, Last heartbeat —, Alerts 없음.

## 3. Grafana 등 외부 도구를 쓰는 경우

- **이미 수집된 데이터만 보고 싶다면**: Supabase를 Grafana 데이터 소스로 연결해 `execution_logs` (및 workers, devices 등)를 쿼리하면 됨.
- **에이전트 로컬 파일 로그까지 보고 싶다면**: 각 PC의 `farm_logs/*.log`를 수집하는 에이전트(Promtail 등) + Loki + Grafana 구성을 별도로 도입할 수 있음. 이 경우 “대시보드용 API 복구”와는 별개로, 로그 수집/저장 파이프라인을 하나 더 만드는 작업이 필요함.

**정리**:  
- 지금 “로그가 안 나온다”는 **대시보드용 API(/api/logs 등)가 없어서**인 부분이 큼.  
- **GET /api/logs** 를 구현해 Supabase `execution_logs`를 조회해 주면 Events/Logs 화면에 메시지가 나옴.  
- Grafana는 “대시보드 API를 안 쓰고” Supabase/파일 로그를 직접 보고 싶을 때 선택하면 됨.
