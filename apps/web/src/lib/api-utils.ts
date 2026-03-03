/**
 * API: WebSocket only (no HTTP). See docs/API_WS_ONLY.md.
 * - Success: code 10000
 * - Failure: code 10001
 * Re-exports from ws-api-response. parseListParams for WS handler use.
 */
import { wsErr, type WsErrorPayload } from "./ws-api-response";
export {
  API_RESPONSE_CODE_SUCCESS,
  API_RESPONSE_CODE_FAILURE,
  wsOk as ok,
  wsOkList as okList,
  wsErr as err,
  isWsSuccess,
  isWsFailure,
} from "./ws-api-response";
export type { WsSuccessPayload, WsListPayload, WsErrorPayload } from "./ws-api-response";

/** Build error payload from unknown exception (code 10001). */
export function errFrom(e: unknown, fallbackErrorCode = "INTERNAL_ERROR"): WsErrorPayload {
  let message: string;
  if (e instanceof Error) {
    message = e.message;
  } else if (e != null && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    message = (e as { message: string }).message;
  } else {
    const s = String(e);
    message = s === "[object Object]" ? "오류가 발생했습니다" : s;
  }
  return wsErr(fallbackErrorCode, message);
}

/** Parse common query params (page, pageSize, sortBy, sortOrder, q). */
export function parseListParams(searchParams: URLSearchParams): {
  page: number;
  pageSize: number;
  sortBy: string | null;
  sortOrder: "asc" | "desc";
  q: string | null;
} {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));
  const sortBy = searchParams.get("sortBy") || null;
  const order = searchParams.get("sortOrder")?.toLowerCase();
  const sortOrder = order === "asc" || order === "desc" ? order : "desc";
  const q = searchParams.get("q")?.trim() || null;
  return { page, pageSize, sortBy, sortOrder, q };
}
