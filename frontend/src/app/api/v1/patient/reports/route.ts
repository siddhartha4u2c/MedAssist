import { NextRequest, NextResponse } from "next/server";

import { forwardToFlaskApi } from "@/lib/server/flask-proxy";

export const runtime = "nodejs";

/**
 * Explicit proxy for patient reports list/create (same pattern as patient/vitals).
 * Avoids relying only on the catch-all `[...path]` matcher for this path.
 */
export async function GET(req: NextRequest) {
  return forwardToFlaskApi(req, "patient/reports");
}

export async function POST(req: NextRequest) {
  return forwardToFlaskApi(req, "patient/reports");
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Lead-OTP-Channel",
      "Access-Control-Max-Age": "86400",
    },
  });
}
