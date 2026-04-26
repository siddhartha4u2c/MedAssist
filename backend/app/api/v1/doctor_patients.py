from __future__ import annotations

import jwt
from flask import Blueprint, current_app, jsonify, request

from app.api.v1.patient_profile import _profile_to_json, _report_to_json
from app.config import Config
from app.extensions import db
from app.models.patient_doctor_link import PatientDoctorLink
from app.models.patient_profile import PatientProfile
from app.models.patient_report import PatientReport
from app.models.user import User
from app.utils.jwt_tokens import decode_access_token
from app.utils.user_access import portal_account_active, portal_directory_listable
from app.services.patient_medications_service import apply_medications_to_profile
from app.services.symptom_tracker_notifications import notify_patient_doctor_profile_update

bp = Blueprint("doctor_patients_v1", __name__, url_prefix="/api/v1/doctor")

_MAX_CARE_PLAN = 50_000
_MAX_MEDICATIONS = 500_000


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


def _require_doctor(claims: dict | None) -> tuple[str | None, tuple | None]:
    if claims is None:
        return None, (jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401)
    if str(claims.get("role") or "") != "doctor":
        return None, (jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403)
    uid = str(claims.get("sub") or "")
    if not uid:
        return None, (jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401)
    u = User.query.filter_by(id=uid).first()
    if not u or not portal_account_active(u):
        return None, (
            jsonify(
                {
                    "error": "This account is suspended or no longer active.",
                    "code": "account_inactive",
                }
            ),
            403,
        )
    return uid, None


def _must_assign(doctor_user_id: str, patient_user_id: str) -> PatientProfile | None:
    p = PatientProfile.query.filter_by(user_id=patient_user_id).first()
    if not p:
        return None
    if PatientDoctorLink.query.filter_by(
        patient_user_id=patient_user_id, doctor_user_id=doctor_user_id
    ).first():
        return p
    if (p.assigned_doctor_user_id or "") == doctor_user_id:
        return p
    return None


@bp.get("/my-patients")
def list_my_patients():
    claims = _claims()
    doc_id, err = _require_doctor(claims)
    if err:
        return err[0], err[1]
    assert doc_id is not None

    patient_ids: set[str] = set()
    for row in PatientDoctorLink.query.filter_by(doctor_user_id=doc_id).all():
        patient_ids.add(row.patient_user_id)
    for pr in PatientProfile.query.filter_by(assigned_doctor_user_id=doc_id).all():
        patient_ids.add(pr.user_id)

    out: list[dict] = []
    for pid in patient_ids:
        pr = PatientProfile.query.filter_by(user_id=pid).first()
        u = User.query.filter_by(id=pid).first()
        if not u or u.role != "patient" or not portal_directory_listable(u):
            continue
        name = ""
        if pr and (pr.full_name or "").strip():
            name = pr.full_name.strip()
        if not name:
            name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
        out.append(
            {
                "patientUserId": u.id,
                "displayName": name,
                "email": u.email,
                "updatedAt": pr.updated_at.isoformat() + "Z" if pr and pr.updated_at else "",
            }
        )
    out.sort(key=lambda x: x["displayName"].lower())
    return jsonify({"patients": out}), 200


@bp.get("/patients/<patient_user_id>")
def get_patient_summary(patient_user_id: str):
    claims = _claims()
    doc_id, err = _require_doctor(claims)
    if err:
        return err[0], err[1]
    assert doc_id is not None

    p = _must_assign(doc_id, patient_user_id)
    if not p:
        return jsonify({"error": "Patient not found or not assigned to you.", "code": "NOT_FOUND"}), 404

    u = User.query.filter_by(id=patient_user_id).first()
    if not u:
        return jsonify({"error": "Not found."}), 404
    name = (p.full_name or "").strip() or f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
    return (
        jsonify(
            {
                "patientUserId": u.id,
                "displayName": name,
                "email": u.email,
            }
        ),
        200,
    )


@bp.get("/patients/<patient_user_id>/profile-view")
def get_patient_profile_for_doctor(patient_user_id: str):
    claims = _claims()
    doc_id, err = _require_doctor(claims)
    if err:
        return err[0], err[1]
    assert doc_id is not None

    p = _must_assign(doc_id, patient_user_id)
    if not p:
        return jsonify({"error": "Patient not found or not assigned to you.", "code": "NOT_FOUND"}), 404

    return jsonify({"profile": _profile_to_json(p)}), 200


@bp.get("/patients/<patient_user_id>/medications-view")
def get_patient_medications_for_doctor(patient_user_id: str):
    claims = _claims()
    doc_id, err = _require_doctor(claims)
    if err:
        return err[0], err[1]
    assert doc_id is not None

    p = _must_assign(doc_id, patient_user_id)
    if not p:
        return jsonify({"error": "Patient not found or not assigned to you.", "code": "NOT_FOUND"}), 404

    return jsonify({"currentMedications": p.current_medications or ""}), 200


@bp.put("/patients/<patient_user_id>/medications")
def save_patient_medications_for_doctor(patient_user_id: str):
    claims = _claims()
    doc_id, err = _require_doctor(claims)
    if err:
        return err[0], err[1]
    assert doc_id is not None

    p = _must_assign(doc_id, patient_user_id)
    if not p:
        return jsonify({"error": "Patient not found or not assigned to you.", "code": "NOT_FOUND"}), 404

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid request body."}), 400
    raw = str(body.get("currentMedications", ""))[:_MAX_MEDICATIONS]
    try:
        apply_medications_to_profile(p, raw)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    db.session.commit()
    notify_patient_doctor_profile_update(
        patient_user_id=patient_user_id,
        doctor_user_id=doc_id,
        change_type="medications",
        details="Your medication records were updated by your doctor.",
    )
    return jsonify({"message": "Medications saved.", "currentMedications": p.current_medications or ""}), 200


@bp.get("/patients/<patient_user_id>/reports-view")
def get_patient_reports_for_doctor(patient_user_id: str):
    claims = _claims()
    doc_id, err = _require_doctor(claims)
    if err:
        return err[0], err[1]
    assert doc_id is not None

    if not _must_assign(doc_id, patient_user_id):
        return jsonify({"error": "Patient not found or not assigned to you.", "code": "NOT_FOUND"}), 404

    rows = (
        PatientReport.query.filter_by(patient_user_id=patient_user_id)
        .order_by(PatientReport.created_at.desc())
        .all()
    )
    return jsonify({"reports": [_report_to_json(r) for r in rows]}), 200


@bp.get("/patients/<patient_user_id>/care-plan")
def get_patient_care_plan_for_doctor(patient_user_id: str):
    claims = _claims()
    doc_id, err = _require_doctor(claims)
    if err:
        return err[0], err[1]
    assert doc_id is not None

    p = _must_assign(doc_id, patient_user_id)
    if not p:
        return jsonify({"error": "Patient not found or not assigned to you.", "code": "NOT_FOUND"}), 404

    return jsonify({"carePlanText": getattr(p, "care_plan_text", None) or ""}), 200


@bp.put("/patients/<patient_user_id>/care-plan")
def save_patient_care_plan_for_doctor(patient_user_id: str):
    claims = _claims()
    doc_id, err = _require_doctor(claims)
    if err:
        return err[0], err[1]
    assert doc_id is not None

    p = _must_assign(doc_id, patient_user_id)
    if not p:
        return jsonify({"error": "Patient not found or not assigned to you.", "code": "NOT_FOUND"}), 404

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid request body."}), 400
    raw = str(body.get("carePlanText", ""))[:_MAX_CARE_PLAN]
    p.care_plan_text = raw.strip() or None
    db.session.commit()
    notify_patient_doctor_profile_update(
        patient_user_id=patient_user_id,
        doctor_user_id=doc_id,
        change_type="care_plan",
        details="Your care plan was updated by your doctor.",
    )
    return jsonify({"message": "Care plan saved.", "carePlanText": getattr(p, "care_plan_text", None) or ""}), 200
