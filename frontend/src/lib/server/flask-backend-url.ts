/**
 * Flask origin for the Next.js server proxy (no trailing slash).
 * Strips a mistaken `/api/v1` suffix so we never request `.../api/v1/api/v1/...` (NOT_FOUND).
 */
export function getFlaskBackendOrigin(): string {
  let b = (process.env.BACKEND_URL || "http://127.0.0.1:5001").trim().replace(/\/$/, "");
  b = b.replace(/\/api\/v1\/?$/i, "");
  return b.replace(/\/$/, "");
}
