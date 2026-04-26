import { NextRequest, NextResponse } from "next/server";

import { forwardToFlaskApi } from "@/lib/server/flask-proxy";

export const runtime = "nodejs";

/**
 * Explicit proxy for billing payment requests (more specific than `api/v1/[...path]`).
 * Ensures GET/POST /api/v1/patient/payment-requests always reach Flask (incl. multipart).
 */
export async function GET(req: NextRequest) {
  return forwardToFlaskApi(req, "patient/payment-requests");
}

export async function POST(req: NextRequest) {
  return forwardToFlaskApi(req, "patient/payment-requests");
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
