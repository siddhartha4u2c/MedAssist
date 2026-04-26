from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, Response, current_app, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import InternalServerError, MethodNotAllowed, NotFound

from app.config import Config
from app.extensions import extensions
from app.integrations.openai_client import init_llm_client

_BACKEND_DIR = Path(__file__).resolve().parent.parent


def create_app() -> Flask:
    # Load secrets from backend/.env (primary). Also backend/backend.env if present — some setups use that name.
    # override=True: if DAILY_API_KEY (etc.) exists in the OS env as empty/wrong, the project file still wins.
    load_dotenv(_BACKEND_DIR / ".env", override=True)
    load_dotenv(_BACKEND_DIR / "backend.env", override=True)
    load_dotenv()
    app = Flask(__name__)
    cfg = Config.from_env()
    app.config.from_mapping(
        SECRET_KEY=cfg.secret_key,
        MEDASSIST_CONFIG=cfg,
        SQLALCHEMY_DATABASE_URI=cfg.database_url,
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
    )

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": "*",
                "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization", "X-Lead-OTP-Channel"],
            }
        },
    )

    init_llm_client(cfg)
    extensions.init_app(app)

    from app.api import register_blueprints

    register_blueprints(app)

    from app.api.v1 import leads as _leads

    @app.post("/api/v1/leads/submit_lead")
    @app.post("/api/v1/leads/submit")
    def _app_leads_submit():
        return _leads.submit_lead()

    @app.before_request
    def _log_api_requests() -> None:
        """If this never prints when you open a URL in the browser, the request is not reaching this process."""
        if request.path.startswith("/api"):
            print(
                f"[MedAssist REQ] {request.method} {request.path} from {request.remote_addr}",
                file=sys.stderr,
                flush=True,
            )

    @app.after_request
    def _medassist_headers(response):
        # Avoid stale JSON in browsers when iterating on API shape (e.g. /api/v1/leads/ping).
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"
        response.headers["X-MedAssist-Backend"] = "1"
        response.headers["X-MedAssist-Pid"] = str(os.getpid())
        try:
            response.headers["X-MedAssist-Vitals-Reg"] = str(
                current_app.config.get("MEDASSIST_HAS_PATIENT_VITALS_ROUTE", "?")
            )
        except RuntimeError:
            pass
        if request.path.startswith("/api/v1/leads"):
            try:
                lv = getattr(_leads, "LEADS_API_VERSION", 0)
                lm = getattr(_leads, "LEADS_MODE", "unknown")
                response.headers["X-MedAssist-Leads-Api"] = str(lv)
                response.headers["X-MedAssist-Leads-Mode"] = str(lm)
            except Exception:
                response.headers["X-MedAssist-Leads-Mode"] = "unknown"
        return response

    # Always register this path on the app (not only via blueprint).
    @app.get("/api/v1/leads/ping")
    def _leads_ping_app() -> tuple:
        payload = {
            "ok": True,
            "service": "leads",
            "pid": os.getpid(),
            "python": sys.executable,
            "leadsApiVersion": getattr(_leads, "LEADS_API_VERSION", 0),
            "leadsMode": getattr(_leads, "LEADS_MODE", "unknown"),
            "leadsBackend": getattr(_leads, "LEADS_BACKEND_MARKER", "unknown"),
        }
        # If the Flask window never prints this line when you refresh /leads/ping, the request is not this process.
        print(
            "[MedAssist] GET /api/v1/leads/ping - "
            f"leadsApiVersion={payload['leadsApiVersion']} "
            f"leadsMode={payload['leadsMode']} "
            f"leadsBackend={payload['leadsBackend']} pid={payload['pid']}",
            file=sys.stderr,
            flush=True,
        )
        return jsonify(payload), 200

    @app.get("/api/v1/leads/meta.txt")
    def _leads_meta_txt() -> tuple:
        """Plain text so browsers/extensions cannot reuse a stale JSON /ping body. Check this if ping looks truncated."""
        ts = datetime.now(timezone.utc).isoformat()
        body = (
            "MedAssist leads meta (plain text)\n"
            f"utc={ts}\n"
            f"pid={os.getpid()}\n"
            f"python={sys.executable}\n"
            f"leadsApiVersion={getattr(_leads, 'LEADS_API_VERSION', 0)}\n"
            f"leadsMode={getattr(_leads, 'LEADS_MODE', 'unknown')}\n"
            f"leadsBackend={getattr(_leads, 'LEADS_BACKEND_MARKER', 'unknown')}\n"
        )
        r = Response(body, mimetype="text/plain; charset=utf-8")
        r.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        return r, 200

    @app.get("/")
    def _root_ping() -> tuple:
        """Open http://127.0.0.1:5001/ — if you do not see JSON, this is not this Flask app."""
        return (
            jsonify(
                {
                    "service": "medassist-flask",
                    "ok": True,
                    "pid": os.getpid(),
                    "hint": "Try GET /api/v1/leads/ping",
                }
            ),
            200,
        )

    # Register last: app-level patient vitals/reports + JSON NotFound (avoids any rule-order surprises).
    from app.api.v1 import patient_profile as _pp

    @app.route("/api/v1/patient/vitals", methods=["GET", "POST", "OPTIONS"])
    def _patient_vitals_app():
        if request.method == "OPTIONS":
            return "", 204
        if request.method == "GET":
            return _pp.list_vitals()
        return _pp.create_vital()

    @app.route("/api/v1/patient/reports", methods=["GET", "POST", "OPTIONS"])
    def _patient_reports_root_app():
        if request.method == "OPTIONS":
            return "", 204
        if request.method == "GET":
            return _pp.list_my_reports()
        return _pp.create_my_report()

    @app.errorhandler(NotFound)
    def _json_not_found_for_api(exc: NotFound):
        """Next.js proxy treats HTML 4xx as FLASK_HTML_ERROR; keep /api/* responses JSON."""
        try:
            path = request.path or ""
        except RuntimeError:
            path = ""
        if path.startswith("/api/"):
            return (
                jsonify(
                    {
                        "error": "Not found",
                        "path": path,
                        "code": "NOT_FOUND",
                        "hint": "Unknown API path. Confirm Flask is MedAssist (GET /api/v1/patient/reports/healthz).",
                    }
                ),
                404,
            )
        try:
            return exc.get_response(request.environ)
        except Exception:
            return exc.get_response()

    @app.errorhandler(MethodNotAllowed)
    def _json_method_not_allowed_for_api(exc: MethodNotAllowed):
        """Werkzeug returns HTML 405 by default; Next proxy treats that as FLASK_HTML_ERROR."""
        try:
            path = request.path or ""
        except RuntimeError:
            path = ""
        if path.startswith("/api/"):
            allowed = sorted(getattr(exc, "valid_methods", None) or [])
            return (
                jsonify(
                    {
                        "error": "Method not allowed",
                        "path": path,
                        "method": request.method,
                        "allowed_methods": allowed,
                        "code": "METHOD_NOT_ALLOWED",
                        "hint": "Use an allowed HTTP method for this path (e.g. POST for /api/v1/symptoms/chat).",
                    }
                ),
                405,
            )
        try:
            return exc.get_response(request.environ)
        except Exception:
            return exc.get_response()

    @app.errorhandler(InternalServerError)
    def _json_internal_error_for_api(exc: InternalServerError):
        """Avoid HTML debug trace pages on /api/* so the Next.js proxy can surface JSON."""
        try:
            path = request.path or ""
        except RuntimeError:
            path = ""
        if path.startswith("/api/"):
            return (
                jsonify(
                    {
                        "error": "Internal server error",
                        "path": path,
                        "code": "INTERNAL_SERVER_ERROR",
                        "hint": "Check Flask logs for the original exception.",
                    }
                ),
                500,
            )
        try:
            return exc.get_response(request.environ)
        except Exception:
            return exc.get_response()

    app.config["MEDASSIST_HAS_PATIENT_VITALS_ROUTE"] = (
        "1"
        if any(
            getattr(r, "rule", None) == "/api/v1/patient/vitals" for r in app.url_map.iter_rules()
        )
        else "0"
    )

    # Startup diagnostics after all routes exist (app-level patient/vitals was missing from earlier logs).
    try:
        import app as app_pkg

        from app.integrations.videoco_client import is_video_provider_configured

        lead_rules = sorted(
            r.rule for r in app.url_map.iter_rules() if "lead" in (r.rule or "").lower()
        )
        patient_rules = sorted(
            r.rule
            for r in app.url_map.iter_rules()
            if (r.rule or "").startswith("/api/v1/patient")
        )
        appt_rules = sorted(
            r.rule for r in app.url_map.iter_rules() if "/appointments" in (r.rule or "")
        )
        symptom_rules = sorted(
            r.rule for r in app.url_map.iter_rules() if "symptom" in (r.rule or "").lower()
        )
        print(
            f"[MedAssist] Python: {sys.executable}\n"
            f"[MedAssist] app package: {getattr(app_pkg, '__file__', '?')}\n"
            f"[MedAssist] Video provider configured (Daily or VIDEOCO): {is_video_provider_configured(cfg)}\n"
            f"[MedAssist] URL rules (leads): {lead_rules}\n"
            f"[MedAssist] URL rules (patient): {patient_rules}\n"
            f"[MedAssist] URL rules (appointments): {appt_rules}\n"
            f"[MedAssist] URL rules (symptoms): {symptom_rules}\n"
            f"[MedAssist] X-MedAssist-Vitals-Reg cache: {app.config.get('MEDASSIST_HAS_PATIENT_VITALS_ROUTE', '?')}",
            file=sys.stderr,
        )
    except Exception:
        pass

    return app
