from __future__ import annotations

import jwt
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request

from app.config import Config
from app.extensions import db
from app.models.portal_notification import PortalNotification
from app.utils.jwt_tokens import decode_access_token

bp = Blueprint("notifications_v1", __name__, url_prefix="/api/v1")


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


def _row_json(n: PortalNotification) -> dict:
    ca = n.created_at
    ca_iso = ""
    if ca is not None:
        ca_iso = (
            ca.replace(tzinfo=None).isoformat() + "Z"
            if ca.tzinfo is None
            else ca.isoformat()
        )
    ra = n.read_at
    ra_iso = ""
    if ra is not None:
        ra_iso = (
            ra.replace(tzinfo=None).isoformat() + "Z"
            if ra.tzinfo is None
            else ra.isoformat()
        )
    return {
        "id": n.id,
        "type": n.notification_type,
        "title": n.title,
        "body": n.body or "",
        "patientUserId": n.patient_user_id or "",
        "read": ra is not None,
        "readAt": ra_iso,
        "createdAt": ca_iso,
    }


@bp.get("/notifications")
def list_notifications():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    uid = str(claims.get("sub") or "").strip()
    if not uid:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401

    rows = (
        PortalNotification.query.filter_by(recipient_user_id=uid)
        .order_by(PortalNotification.created_at.desc())
        .limit(80)
        .all()
    )
    return jsonify({"notifications": [_row_json(r) for r in rows]}), 200


@bp.put("/notifications/<notif_id>/read")
def mark_notification_read(notif_id: str):
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    uid = str(claims.get("sub") or "").strip()
    if not uid:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401

    nid = (notif_id or "").strip()
    n = PortalNotification.query.filter_by(id=nid, recipient_user_id=uid).first()
    if not n:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404
    if n.read_at is None:
        n.read_at = datetime.utcnow()
        db.session.commit()
    return jsonify({"notification": _row_json(n)}), 200
