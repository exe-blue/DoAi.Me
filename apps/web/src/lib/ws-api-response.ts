/**
 * API response standard: WebSocket only (no HTTP).
 * - Success: code 10000
 * - Failure: code 10001
 * Use these payloads for all WS API responses.
 * Xiaowei 응답 포맷과 동일 규격: docs/xiaowei_client.md §2.3 Response Envelope, §8.2 오류 코드.
 */
export const API_RESPONSE_CODE_SUCCESS = 10000;
export const API_RESPONSE_CODE_FAILURE = 10001;

export type WsSuccessPayload<T> = { code: typeof API_RESPONSE_CODE_SUCCESS; data: T };
export type WsListPayload<T> = {
  code: typeof API_RESPONSE_CODE_SUCCESS;
  data: T[];
  page: number;
  pageSize: number;
  total: number;
};
export type WsErrorPayload = {
  code: typeof API_RESPONSE_CODE_FAILURE;
  errorCode: string;
  message: string;
  details?: unknown;
};

export function wsOk<T>(data: T): WsSuccessPayload<T> {
  return { code: API_RESPONSE_CODE_SUCCESS, data };
}

export function wsOkList<T>(
  data: T[],
  opts: { page: number; pageSize: number; total: number }
): WsListPayload<T> {
  return {
    code: API_RESPONSE_CODE_SUCCESS,
    data,
    page: opts.page,
    pageSize: opts.pageSize,
    total: opts.total,
  };
}

export function wsErr(errorCode: string, message: string, details?: unknown): WsErrorPayload {
  return {
    code: API_RESPONSE_CODE_FAILURE,
    errorCode,
    message,
    ...(details != null && { details }),
  };
}

export function isWsSuccess(payload: { code: number }): payload is WsSuccessPayload<unknown> {
  return payload.code === API_RESPONSE_CODE_SUCCESS;
}

export function isWsFailure(payload: { code: number }): payload is WsErrorPayload {
  return payload.code === API_RESPONSE_CODE_FAILURE;
}
