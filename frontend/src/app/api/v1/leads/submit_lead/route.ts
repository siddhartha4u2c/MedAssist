import { NextRequest, NextResponse } from "next/server";

import { forwardToFlaskApi } from "@/lib/server/flask-proxy";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return forwardToFlaskApi(req, "leads/submit_lead");
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
