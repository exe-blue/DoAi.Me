# API: WebSocket only (no HTTP)

HTTP API routes have been removed. All API is delivered **only via WebSocket (WS)**.

- **Success:** `code` = **10000**
- **Failure:** `code` = **10001**

See [docs/API_WS_ONLY.md](../../../../docs/API_WS_ONLY.md) and `src/lib/ws-api-response.ts`.
