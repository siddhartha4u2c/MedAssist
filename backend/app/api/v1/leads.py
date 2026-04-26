from __future__ import annotations

import html
import json

from flask import current_app, jsonify, request

from app.api.v1.auth import ADMIN_APPROVAL_EMAIL
from app.config import Config
from app.extensions import db
from app.models.lead_capture import LeadEnquiry
from app.services.mail_service import send_email

# Routes are registered on the Flask app in create_app() (see app/__init__.py).

LEADS_API_VERSION = 3
LEADS_MODE = "simple_form"
LEADS_BACKEND_MARKER = "simple_v1"

NAME_MAX = 200
EMAIL_MAX = 255
PHONE_MAX = 40


def _leads_json(body: dict, status: int = 200):
    merged = dict(body)
    merged["leadsBackend"] = LEADS_BACKEND_MARKER
    return jsonify(merged), status


def _read_json_body() -> dict:
    """Parse JSON from raw bytes only (avoids Werkzeug get_json/get_data stream ordering bugs)."""
    raw = request.get_data(cache=True)
    if not raw:
        return {}
    try:
        parsed = json.loads(raw.decode("utf-8-sig"))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def submit_lead():
    """Save lead (name, email, phone) and notify admin. No format validation beyond non-empty + length caps."""
    cfg: Config = current_app.config["MEDASSIST_CONFIG"]
    data = _read_json_body()
    if not isinstance(data, dict):
        return _leads_json({"error": "Invalid request body.", "code": "BAD_REQUEST"}, 400)

    name = str(data.get("name", "")).strip()
    if not name or len(name) > NAME_MAX:
        return _leads_json({"error": "Please enter your name.", "code": "INVALID_NAME"}, 400)

    email = str(data.get("email", "")).strip()[:EMAIL_MAX]
    if not email:
        return _leads_json({"error": "Please enter your email.", "code": "INVALID_EMAIL"}, 400)

    phone_raw = data.get("phone") or data.get("mobile") or data.get("phone_number") or ""
    mobile = str(phone_raw).strip()[:PHONE_MAX]
    if not mobile:
        return _leads_json({"error": "Please enter your phone number.", "code": "INVALID_PHONE"}, 400)

    enquiry = LeadEnquiry(name=name, mobile=mobile, email=email)
    db.session.add(enquiry)
    db.session.commit()

    admin_to = ADMIN_APPROVAL_EMAIL
    subj = f"New lead enquiry: {name}"
    body_t = (
        f"New lead (login popup)\n\n"
        f"Name: {name}\n"
        f"Phone: {mobile}\n"
        f"Email: {email}\n"
        f"Submitted (UTC): {enquiry.created_at.isoformat()}Z\n"
    )
    body_h = (
        f"<h2>New lead enquiry</h2><p>Submitted via login page.</p>"
        f"<ul><li><strong>Name:</strong> {html.escape(name)}</li>"
        f"<li><strong>Phone:</strong> {html.escape(mobile)}</li>"
        f"<li><strong>Email:</strong> {html.escape(email)}</li></ul>"
        f"<p><small>Submitted (UTC): {enquiry.created_at.isoformat()}Z</small></p>"
    )
    try:
        send_email(cfg, to_email=admin_to, subject=subj, body_text=body_t, body_html=body_h)
    except Exception:
        pass

    return _leads_json({"message": "Thank you. We will connect with you soon.", "id": enquiry.id}, 201)
