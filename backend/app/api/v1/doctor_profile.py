from __future__ import annotations

import jwt
from flask import Blueprint, current_app, jsonify, request

from app.config import Config
from app.extensions import db
from app.models.doctor_profile import DoctorProfile
from app.models.user import User
from app.utils.jwt_tokens import decode_access_token
from app.utils.user_access import portal_account_active

bp = Blueprint("doctor_profile_v1", __name__, url_prefix="/api/v1/doctor")

# Guard against oversized pasted text (per free-text field).
_MAX_PROFILE_TEXT = 20_000
# Base64 data URLs for profile photos (~5 MB file → ~7 MB string); cap defensively.
_MAX_PHOTO_DATA_URL_LEN = 10 * 1024 * 1024


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


def _to_float(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value))
    except ValueError:
        return None


def _to_int(value: object) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(str(value))
    except ValueError:
        return None


def _opt_long_text(raw: object) -> str:
    s = str(raw or "").strip()
    if not s:
        return ""
    return s[:_MAX_PROFILE_TEXT]


def _profile_to_json(dp: DoctorProfile, user: User) -> dict:
    return {
        "displayName": f"{user.first_name or ''} {user.last_name or ''}".strip() or user.email,
        "email": user.email,
        "specialization": dp.specialization or "",
        "department": dp.department or "",
        "hospitalAffiliation": dp.hospital_affiliation or "",
        "yearsExperience": dp.years_experience if dp.years_experience is not None else "",
        "consultationFee": dp.consultation_fee if dp.consultation_fee is not None else "",
        "bio": dp.bio or "",
        "academicRecords": getattr(dp, "academic_records", None) or "",
        "professionalExperience": getattr(dp, "professional_experience", None) or "",
        "achievements": getattr(dp, "achievements", None) or "",
        "availableForTelemedicine": dp.available_for_telemedicine,
    }


@bp.get("/profile")
def get_doctor_profile():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    if str(claims.get("role") or "") != "doctor":
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403

    user_id = str(claims.get("sub") or "")
    user = User.query.filter_by(id=user_id).first()
    if not user:
        return jsonify({"error": "User not found."}), 404
    if not portal_account_active(user):
        return (
            jsonify(
                {
                    "error": "This account is suspended or no longer active.",
                    "code": "account_inactive",
                }
            ),
            403,
        )

    dp = DoctorProfile.query.filter_by(user_id=user_id).first()
    if not dp:
        return jsonify({"profile": None}), 200
    return jsonify({"profile": _profile_to_json(dp, user)}), 200


@bp.put("/profile")
def save_doctor_profile():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    if str(claims.get("role") or "") != "doctor":
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403

    user_id = str(claims.get("sub") or "")
    user = User.query.filter_by(id=user_id).first()
    if not user:
        return jsonify({"error": "User not found."}), 404
    if not portal_account_active(user):
        return (
            jsonify(
                {
                    "error": "This account is suspended or no longer active.",
                    "code": "account_inactive",
                }
            ),
            403,
        )

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid request body."}), 400

    dp = DoctorProfile.query.filter_by(user_id=user_id).first()
    if not dp:
        dp = DoctorProfile(user_id=user_id)
        db.session.add(dp)

    dp.specialization = str(body.get("specialization", dp.specialization or "")).strip() or "General practice"
    dp.department = str(body.get("department", "")).strip() or None
    dp.hospital_affiliation = str(body.get("hospitalAffiliation", "")).strip() or None
    dp.years_experience = _to_int(body.get("yearsExperience"))
    dp.consultation_fee = _to_float(body.get("consultationFee"))
    dp.bio = _opt_long_text(body.get("bio")) or None
    br = _opt_long_text(body.get("academicRecords"))
    dp.academic_records = br or None
    pe = _opt_long_text(body.get("professionalExperience"))
    dp.professional_experience = pe or None
    ach = _opt_long_text(body.get("achievements"))
    dp.achievements = ach or None
    if "availableForTelemedicine" in body:
        dp.available_for_telemedicine = bool(body.get("availableForTelemedicine"))

    if "photoDataUrl" in body:
        ph = str(body.get("photoDataUrl", "")).strip()
        if len(ph) > _MAX_PHOTO_DATA_URL_LEN:
            return (
                jsonify(
                    {
                        "error": "Photo is too large. Use an image under about 5 MB.",
                        "code": "PHOTO_TOO_LARGE",
                    }
                ),
                400,
            )
        dp.photo_data_url = ph or None

    db.session.commit()
    return jsonify({"message": "Profile saved.", "profile": _profile_to_json(dp, user)}), 200
