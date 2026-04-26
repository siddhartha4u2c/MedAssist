import { NextRequest, NextResponse } from "next/server";

import { getFlaskBackendOrigin } from "@/lib/server/flask-backend-url";
import { forwardToFlaskApi } from "@/lib/server/flask-proxy";

export const runtime = "nodejs";

/** BACKEND_URL must be Flask, never the EURI host (wrong host → NOT_FOUND JSON). */
function assertBackendIsFlask(backend: string): NextResponse | null {
  const b = backend.toLowerCase();
  if (b.includes("euron.one") || b.includes("/euri") || b.includes("openai.com")) {
    return NextResponse.json(
      {
        error:
          "BACKEND_URL must be your MedAssist Flask server (e.g. http://127.0.0.1:5001), not the EURI URL. Set EURI_BASE_URL in backend/.env for the LLM.",
        code: "MISCONFIGURED_BACKEND_URL",
      },
      { status: 502 }
    );
  }
  return null;
}

/** Same path segment Flask uses: /api/v1/<rest> */
const PROXY_PREFIX = "/api/v1/";

function resolveSubpath(req: NextRequest, paramsPath: string[] | string | undefined): string {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith(PROXY_PREFIX)) {
    const tail = pathname.slice(PROXY_PREFIX.length).replace(/\/+$/, "");
    if (tail) return tail;
  }
  if (Array.isArray(paramsPath) && paramsPath.length) return paramsPath.join("/");
  if (typeof paramsPath === "string" && paramsPath) {
    return paramsPath
      .split("/")
      .filter(Boolean)
      .join("/");
  }
  return "";
}

async function proxy(req: NextRequest, paramsPath: string[] | string | undefined) {
  const backend = getFlaskBackendOrigin();
  const mis = assertBackendIsFlask(backend);
  if (mis) return mis;

  const subpath = resolveSubpath(req, paramsPath);
  if (!subpath) {
    return NextResponse.json(
      {
        error: "Bad proxy path (expected /api/v1/... , e.g. /api/v1/symptoms/chat). Restart Next.js after updating the proxy route.",
        code: "BAD_PROXY_PATH",
      },
      { status: 502 }
    );
  }

  return forwardToFlaskApi(req, subpath);
}

type Ctx = { params: { path?: string[] | string } };

export async function GET(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  return proxy(req, ctx.params.path);
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
