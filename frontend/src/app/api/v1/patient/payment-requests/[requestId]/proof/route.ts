import { NextRequest } from "next/server";

import { forwardToFlaskApi } from "@/lib/server/flask-proxy";

export const runtime = "nodejs";

type Ctx = { params: { requestId: string } };

export async function GET(req: NextRequest, ctx: Ctx) {
  const id = encodeURIComponent(ctx.params.requestId || "");
  return forwardToFlaskApi(req, `patient/payment-requests/${id}/proof`);
}
