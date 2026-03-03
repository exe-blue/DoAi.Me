# API: WebSocket only (no HTTP)

- **HTTP는 사용하지 않습니다.** 모든 API는 WebSocket(WS)을 통해서만 전달됩니다.
- **Xiaowei WS API** 요청/응답 포맷·코드 정의: [docs/xiaowei_client.md](xiaowei_client.md) §2 Connection, §5 API Reference, §8 Appendix.
- **Response code (응답 코드)**  
  - **10000** = 성공 (success)  
  - **10001** = 실패 (failure)

## 응답 형식 (WS 메시지 body)

- **성공**  
  `{ "code": 10000, "data": T }`  
  리스트: `{ "code": 10000, "data": T[], "page", "pageSize", "total" }`

- **실패**  
  `{ "code": 10001, "errorCode": string, "message": string, "details"?: unknown }`

클라이언트는 `code === 10000`이면 성공, `code === 10001`이면 실패로 처리합니다.

## 구현

- 상수/타입/페이로드: `apps/web/src/lib/ws-api-response.ts`
- HTTP API 라우트(`app/api/*`)는 제거됨. 모든 요청/응답은 WS로만 처리.
