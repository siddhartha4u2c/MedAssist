from __future__ import annotations

import jwt
from flask import Blueprint, current_app, jsonify, request

from app.config import Config
from app.extensions import db
from app.models.lead_capture import LeadEnquiry
from app.utils.jwt_tokens import decode_access_token

bp = Blueprint("admin_leads_v1", __name__, url_prefix="/api/v1/admin/leads")


def _cfg() -> Config:
    return current_app.config["MEDASSIST_CONFIG"]


def _claims() -> dict | None:
    auth = (request.headers.get("Authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        return decode_access_token(_cfg(), token)
    except jwt.PyJWTError:
        return None


def _require_admin(claims: dict) -> bool:
    return str(claims.get("role") or "") == "admin"


@bp.get("")
def list_leads():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    if not _require_admin(claims):
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403

    rows = LeadEnquiry.query.order_by(LeadEnquiry.created_at.desc()).limit(500).all()
    return jsonify(
        {
            "leads": [
                {
                    "id": r.id,
                    "name": r.name,
                    "mobile": r.mobile,
                    "email": r.email,
                    "createdAt": r.created_at.replace(tzinfo=None).isoformat() + "Z"
                    if r.created_at
                    else "",
                }
                for r in rows
            ]
        }
    ), 200


@bp.delete("/<lead_id>")
def delete_lead(lead_id: str):
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    if not _require_admin(claims):
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403

    lid = (lead_id or "").strip()
    if not lid:
        return jsonify({"error": "Invalid lead id", "code": "BAD_REQUEST"}), 400

    row = LeadEnquiry.query.get(lid)
    if row is None:
        return jsonify({"error": "Not found", "code": "NOT_FOUND"}), 404

    db.session.delete(row)
    db.session.commit()
    return jsonify({"message": "Deleted", "id": lid}), 200
