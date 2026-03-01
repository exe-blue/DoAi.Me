/** Build query string from params. Skips null/undefined and empty strings. */
export function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    search.set(k, String(v));
  }
  const q = search.toString();
  return q ? `?${q}` : "";
}
