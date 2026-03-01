/**
 * @doai/api-client — fetch wrapper and shared API types.
 * Re-export shared types for convenience; extend with API-specific types as needed.
 */

export type { FetchOptions, ApiResponse } from "./fetch-wrapper";

export { createApiClient, get, post } from "./fetch-wrapper";

// Re-export shared for consumers that need DTOs with API calls
export * from "@doai/shared";
