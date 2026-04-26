import { NextRequest, NextResponse } from "next/server";

import { getFlaskBackendOrigin } from "@/lib/server/flask-backend-url";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

function copyUpstreamHeaders(upstream: Response, res: NextResponse) {
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    res.headers.set(key, value);
  });
}

/** Turn Flask HTML error pages into JSON so the UI does not show raw <!doctype ...>. */
export function wrapFlaskUpstreamResponse(
  upstream: Response,
  buf: ArrayBuffer,
  targetUrl: string,
  backendOrigin?: string
): NextResponse {
  const ct = (upstream.headers.get("content-type") || "").toLowerCase();
  const head = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 160)).trimStart();
  const headLo = head.toLowerCase();
  const looksJson =
    ct.includes("application/json") || headLo.startsWith("{") || headLo.startsWith("[");

  const looksHtml =
    upstream.status >= 400 &&
    !looksJson &&
    (ct.includes("text/html") ||
      headLo.startsWith("<!doctype") ||
      headLo.startsWith("<html"));

  if (looksHtml) {
    const preview = head.replace(/\s+/g, " ").slice(0, 120);
    const medAssist = (upstream.headers.get("x-medassist-backend") || "").trim();
    const origin = (backendOrigin || "").replace(/\/$/, "");
    const verify = origin
      ? ` From the same machine, run: curl -s "${origin}/api/v1/symptoms/info" — you should see JSON with "service":"medassist" and response header X-MedAssist-Backend: 1. If you get HTML or no X-MedAssist-Backend, nothing on that URL is this MedAssist app (wrong BACKEND_URL in Next .env.local, or another program bound to the port).`
      : "";
    const notMedAssist =
      !medAssist && upstream.status === 404
        ? " Upstream did not send X-MedAssist-Backend — the process on this port is probably not MedAssist Flask (or an old build without the symptoms blueprint)."
        : "";
    return NextResponse.json(
      {
        error:
          "The Flask backend returned an HTML error page (usually 404). Stop duplicate Flask " +
          "processes on this port, then start a single server from MedAssist/backend: " +
          "flask --app wsgi:app run --host 127.0.0.1 --port 5001. " +
          `Request was: ${targetUrl}.${notMedAssist}${verify}`,
        code: "FLASK_HTML_ERROR",
        upstreamStatus: upstream.status,
        upstreamContentType: upstream.headers.get("content-type") || "",
        bodyPreview: preview,
        backendOrigin: origin || undefined,
        xMedAssistBackend: medAssist || undefined,
      },
      { status: 502 }
    );
  }

  const res = new NextResponse(buf, {
    status: upstream.status,
    statusText: upstream.statusText,
  });
  copyUpstreamHeaders(upstream, res);
  return res;
}

/**
 * Proxy to MedAssist Flask: `BACKEND_URL` + `/api/v1/` + suffix (e.g. `auth/forgot-password`).
 */
export async function forwardToFlaskApi(req: NextRequest, suffix: string): Promise<NextResponse> {
  const backend = getFlaskBackendOrigin();
  const clean = suffix.replace(/^\/+/, "");
  const target = new URL(`${backend}/api/v1/${clean}`);
  target.search = req.nextUrl.search;

  const hasBody = !["GET", "HEAD"].includes(req.method);
  const ctIn = (req.headers.get("content-type") || "").toLowerCase();
  // Read the body once via arrayBuffer (reliable in App Router); decode UTF-8 for JSON/text.
  let bodyToSend: BodyInit | undefined;
  if (hasBody) {
    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0) {
      bodyToSend = undefined;
    } else if (ctIn.includes("multipart/") || ctIn.includes("application/octet-stream")) {
      bodyToSend = buf;
    } else {
      bodyToSend = new TextDecoder("utf-8").decode(buf);
    }
  }

  const headers = new Headers();
  for (const name of [
    "content-type",
    "authorization",
    "accept",
    "accept-language",
    "x-lead-otp-channel",
  ]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  // Flask only parses JSON when Content-Type is application/json; some clients omit it.
  if (bodyToSend && !headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: bodyToSend,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        error: `Next.js could not reach Flask at ${getFlaskBackendOrigin()}: ${msg}. Start Flask (flask --app wsgi:app run --host 127.0.0.1 --port 5001).`,
        code: "BACKEND_UNREACHABLE",
      },
      { status: 502 }
    );
  }

  const buf = await upstream.arrayBuffer();
  return wrapFlaskUpstreamResponse(upstream, buf, target.toString(), backend);
}
