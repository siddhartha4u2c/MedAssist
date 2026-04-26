/** @type {import('next').NextConfig} */
// Avoid a global /api/v1 rewrite: it can bypass Next route handlers and use a stale BACKEND_URL.
// Proxying uses app/api/v1/[...path]/route.ts and auth routes with BACKEND_URL at request time.
const nextConfig = {
  reactStrictMode: true,
  // Keep identifier updated to force fresh frontend deployment when needed.
};

export default nextConfig;
