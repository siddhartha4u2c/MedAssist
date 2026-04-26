import { NextRequest } from "next/server";
import { forwardToFlaskApi } from "@/lib/server/flask-proxy";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  return forwardToFlaskApi(req, "auth/reset-password");
}
