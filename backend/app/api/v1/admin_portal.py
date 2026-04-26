from __future__ import annotations

import jwt
from datetime import datetime

from flask import Blueprint, current_app, jsonify, request

from app.config import Config
from app.extensions import db
from app.models.doctor_profile import DoctorProfile
from app.models.patient_payment_request import PatientPaymentRequest
from app.models.patient_doctor_link import PatientDoctorLink
from app.models.patient_profile import PatientProfile
from app.models.user import User
from app.services.payment_request_mail import (
    notify_patient_payment_approved,
    notify_patient_payment_rejected,
)
from app.services.ai_usage_log import build_ai_logs_payload
from app.utils.jwt_tokens import decode_access_token
from app.utils.user_access import portal_directory_listable

bp = Blueprint("admin_portal_v1", __name__, url_prefix="/api/v1/admin")


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


def _require_admin(claims: dict | None) -> tuple[dict | None, tuple | None]:
    if claims is None:
        return None, (jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401)
    if str(claims.get("role") or "") != "admin":
        return None, (jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403)
    return claims, None


def _doctor_card(du: User) -> dict:
    dn = f"{du.first_name or ''} {du.last_name or ''}".strip() or (du.email or "")
    return {"userId": du.id, "displayName": dn, "email": (du.email or "")}


def _assigned_doctors_for_patient(patient_uid: str, prof: PatientProfile | None) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for link in (
        PatientDoctorLink.query.filter_by(patient_user_id=patient_uid)
        .order_by(PatientDoctorLink.created_at.asc())
        .all()
    ):
        du = User.query.filter_by(id=link.doctor_user_id, role="doctor").first()
        if not du or not du.is_verified or not portal_directory_listable(du):
            continue
        if du.id in seen:
            continue
        out.append(_doctor_card(du))
        seen.add(du.id)
    legacy = (getattr(prof, "assigned_doctor_user_id", None) or "").strip() if prof else ""
    if legacy and legacy not in seen:
        du = User.query.filter_by(id=legacy, role="doctor").first()
        if du and du.is_verified and portal_directory_listable(du):
            out.insert(0, _doctor_card(du))
            seen.add(du.id)
    return out


def _sync_primary_assigned_doctor(patient_uid: str) -> None:
    prof = PatientProfile.query.filter_by(user_id=patient_uid).first()
    if not prof:
        return
    first = (
        PatientDoctorLink.query.filter_by(patient_user_id=patient_uid)
        .order_by(PatientDoctorLink.created_at.asc())
        .first()
    )
    prof.assigned_doctor_user_id = first.doctor_user_id if first else None


@bp.get("/patients")
def admin_list_patients():
    claims, err = _require_admin(_claims())
    if err:
        return err[0], err[1]

    users = User.query.filter_by(role="patient", is_verified=True).order_by(User.email).all()
    users = [u for u in users if portal_directory_listable(u)]
    out: list[dict] = []
    for u in users:
        prof = PatientProfile.query.filter_by(user_id=u.id).first()
        doctors = _assigned_doctors_for_patient(u.id, prof)
        assign = doctors[0] if doctors else None
        disp = ""
        if prof and prof.full_name:
            disp = prof.full_name.strip()
        if not disp:
            disp = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
        out.append(
            {
                "userId": u.id,
                "email": u.email,
                "displayName": disp,
                "assignedDoctors": doctors,
                "assignedDoctor": assign,
                "isVerified": u.is_verified,
            }
        )
    return jsonify({"patients": out}), 200


@bp.get("/doctors")
def admin_list_doctors():
    claims, err = _require_admin(_claims())
    if err:
        return err[0], err[1]

    users = User.query.filter_by(role="doctor", is_verified=True).order_by(User.email).all()
    users = [u for u in users if portal_directory_listable(u)]
    out: list[dict] = []
    for u in users:
        dp = DoctorProfile.query.filter_by(user_id=u.id).first()
        dn = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
        out.append(
            {
                "userId": u.id,
                "email": u.email,
                "displayName": dn,
                "specialization": (dp.specialization if dp else "") or "",
            }
        )
    return jsonify({"doctors": out}), 200


@bp.put("/assignments")
def admin_set_assignment():
    claims, err = _require_admin(_claims())
    if err:
        return err[0], err[1]

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid request body."}), 400
    patient_uid = str(body.get("patientUserId", "")).strip()
    if not patient_uid:
        return jsonify({"error": "patientUserId is required."}), 400

    pu = User.query.filter_by(id=patient_uid, role="patient").first()
    if not pu:
        return jsonify({"error": "Patient user not found.", "code": "NOT_FOUND"}), 404
    if not portal_directory_listable(pu):
        return (
            jsonify(
                {
                    "error": "This patient account is blocked or removed from the portal.",
                    "code": "PATIENT_NOT_ASSIGNABLE",
                }
            ),
            400,
        )

    doc_raw = body.get("doctorUserId")
    doctor_uid = str(doc_raw or "").strip() if doc_raw is not None else ""
    action_in = body.get("action")
    if action_in is None or str(action_in).strip() == "":
        if not doctor_uid:
            PatientDoctorLink.query.filter_by(patient_user_id=patient_uid).delete(
                synchronize_session=False
            )
            prof = PatientProfile.query.filter_by(user_id=patient_uid).first()
            if prof:
                prof.assigned_doctor_user_id = None
            db.session.commit()
            return jsonify({"message": "All doctor links cleared.", "patientUserId": patient_uid}), 200
        action = "add"
    else:
        action = str(action_in).strip().lower()
        if action not in ("add", "remove"):
            return jsonify({"error": 'Use action "add" or "remove", or omit action to clear all links.'}), 400
        if not doctor_uid:
            return jsonify({"error": "doctorUserId is required for add or remove."}), 400

    du = User.query.filter_by(id=doctor_uid, role="doctor").first()
    if not du:
        return jsonify({"error": "Doctor user not found.", "code": "NOT_FOUND"}), 404
    if not portal_directory_listable(du):
        return (
            jsonify(
                {
                    "error": "This doctor account is blocked or removed from the portal.",
                    "code": "DOCTOR_NOT_ASSIGNABLE",
                }
            ),
            400,
        )

    if action == "add":
        exists = PatientDoctorLink.query.filter_by(
            patient_user_id=patient_uid, doctor_user_id=doctor_uid
        ).first()
        if not exists:
            db.session.add(
                PatientDoctorLink(patient_user_id=patient_uid, doctor_user_id=doctor_uid)
            )
        prof = PatientProfile.query.filter_by(user_id=patient_uid).first()
        if not prof:
            prof = PatientProfile(user_id=patient_uid, full_name="")
            db.session.add(prof)
        # Bulk add/delete does not flush; sync reads links and must see current rows.
        db.session.flush()
        _sync_primary_assigned_doctor(patient_uid)
        db.session.commit()
        prof2 = PatientProfile.query.filter_by(user_id=patient_uid).first()
        doctors = _assigned_doctors_for_patient(patient_uid, prof2)
        return (
            jsonify(
                {
                    "message": "Doctor linked to patient.",
                    "patientUserId": patient_uid,
                    "doctorUserId": doctor_uid,
                    "assignedDoctors": doctors,
                }
            ),
            200,
        )

    if action == "remove":
        PatientDoctorLink.query.filter_by(
            patient_user_id=patient_uid, doctor_user_id=doctor_uid
        ).delete(synchronize_session=False)
        db.session.flush()
        _sync_primary_assigned_doctor(patient_uid)
        db.session.commit()
        prof2 = PatientProfile.query.filter_by(user_id=patient_uid).first()
        doctors = _assigned_doctors_for_patient(patient_uid, prof2)
        return (
            jsonify(
                {
                    "message": "Doctor unlinked from patient.",
                    "patientUserId": patient_uid,
                    "doctorUserId": doctor_uid,
                    "assignedDoctors": doctors,
                }
            ),
            200,
        )

    return jsonify({"error": "Unsupported action."}), 400


def _payment_request_admin_json(row: PatientPaymentRequest) -> dict:
    pu = User.query.filter_by(id=row.patient_user_id).first()
    disp = ""
    if pu:
        disp = f"{pu.first_name or ''} {pu.last_name or ''}".strip() or (pu.email or "")
    po = row.payment_on.isoformat() if row.payment_on else ""
    vu = row.valid_until.isoformat() if row.valid_until else ""
    ra = row.reviewed_at
    ra_iso = ""
    if ra is not None:
        ra_iso = (
            ra.replace(tzinfo=None).isoformat() + "Z"
            if ra.tzinfo is None
            else ra.isoformat()
        )
    return {
        "id": row.id,
        "patientUserId": row.patient_user_id,
        "patientDisplayName": disp,
        "patientEmail": (pu.email if pu else "") or "",
        "amount": str(row.amount),
        "treatmentType": row.treatment_type,
        "paymentMode": row.payment_mode,
        "paymentOn": po,
        "validUntil": vu,
        "status": row.status,
        "hasProof": bool(row.stored_relative_path),
        "originalFilename": row.original_filename or "",
        "createdAt": row.created_at.isoformat() + "Z" if row.created_at else "",
        "reviewedAt": ra_iso,
    }


@bp.get("/payment-requests")
def admin_list_payment_requests():
    claims, err = _require_admin(_claims())
    if err:
        return err[0], err[1]

    pending_n = PatientPaymentRequest.query.filter_by(status="pending").count()
    rows = (
        PatientPaymentRequest.query.order_by(PatientPaymentRequest.created_at.desc())
        .limit(200)
        .all()
    )
    return (
        jsonify(
            {
                "requests": [_payment_request_admin_json(r) for r in rows],
                "pendingCount": pending_n,
            }
        ),
        200,
    )


@bp.put("/payment-requests/<request_id>/approve")
def admin_approve_payment_request(request_id: str):
    claims, err = _require_admin(_claims())
    if err:
        return err[0], err[1]

    rid = (request_id or "").strip()
    row = PatientPaymentRequest.query.filter_by(id=rid).first()
    if not row:
        return jsonify({"error": "Payment request not found.", "code": "NOT_FOUND"}), 404
    if row.status != "pending":
        return (
            jsonify(
                {
                    "error": f"This request is already {row.status}.",
                    "code": "INVALID_STATE",
                }
            ),
            400,
        )

    admin_uid = str(claims.get("sub") or "")
    row.status = "approved"
    row.reviewed_at = datetime.utcnow()
    row.reviewed_by_user_id = admin_uid or None
    db.session.commit()

    patient = User.query.filter_by(id=row.patient_user_id).first()
    if patient:
        try:
            notify_patient_payment_approved(current_app.config["MEDASSIST_CONFIG"], row, patient)
        except Exception:
            current_app.logger.exception("notify_patient_payment_approved failed")

    return (
        jsonify(
            {
                "message": "Payment request approved.",
                "request": _payment_request_admin_json(row),
            }
        ),
        200,
    )


@bp.put("/payment-requests/<request_id>/reject")
def admin_reject_payment_request(request_id: str):
    claims, err = _require_admin(_claims())
    if err:
        return err[0], err[1]

    rid = (request_id or "").strip()
    row = PatientPaymentRequest.query.filter_by(id=rid).first()
    if not row:
        return jsonify({"error": "Payment request not found.", "code": "NOT_FOUND"}), 404
    if row.status != "pending":
        return (
            jsonify(
                {
                    "error": f"This request is already {row.status}.",
                    "code": "INVALID_STATE",
                }
            ),
            400,
        )

    admin_uid = str(claims.get("sub") or "")
    row.status = "rejected"
    row.reviewed_at = datetime.utcnow()
    row.reviewed_by_user_id = admin_uid or None
    db.session.commit()

    patient = User.query.filter_by(id=row.patient_user_id).first()
    if patient:
        try:
            notify_patient_payment_rejected(current_app.config["MEDASSIST_CONFIG"], row, patient)
        except Exception:
            current_app.logger.exception("notify_patient_payment_rejected failed")

    return (
        jsonify(
            {
                "message": "Payment request rejected.",
                "request": _payment_request_admin_json(row),
            }
        ),
        200,
    )


def _removed_at_iso(u: User) -> str:
    ra = getattr(u, "account_removed_at", None)
    if not ra:
        return ""
    if getattr(ra, "tzinfo", None) is None:
        return ra.replace(microsecond=0).isoformat() + "Z"
    return ra.isoformat()


def _user_mgmt_json(u: User) -> dict:
    prof = PatientProfile.query.filter_by(user_id=u.id).first()
    dp = DoctorProfile.query.filter_by(user_id=u.id).first()
    if u.role == "patient":
        disp = (
            ((prof.full_name or "").strip() if prof else "")
            or f"{u.first_name or ''} {u.last_name or ''}".strip()
            or u.email
        )
    else:
        disp = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
    rem = getattr(u, "account_removed_at", None) is not None
    has_prof = bool(prof) if u.role == "patient" else bool(dp)
    return {
        "userId": u.id,
        "email": u.email,
        "role": u.role,
        "displayName": disp,
        "isVerified": u.is_verified,
        "accessBlocked": bool(getattr(u, "access_blocked", False)),
        "accountRemoved": rem,
        "removedAt": _removed_at_iso(u) if rem else "",
        "hasProfile": has_prof,
    }


def _admin_ai_logs_response():
    claims, err = _require_admin(_claims())
    if err:
        return err[0], err[1]
    from_q = (request.args.get("from") or "").strip() or None
    to_q = (request.args.get("to") or "").strip() or None
    payload = build_ai_logs_payload(from_q, to_q)
    return jsonify(payload), 200


@bp.get("/ai-logs")
@bp.get("/ai_logs")
def admin_ai_logs():
    """Hyphen path is canonical; underscore alias avoids rare proxy/path issues."""
    return _admin_ai_logs_response()


@bp.get("/users")
@bp.get("/managed-users")
def admin_list_users():
    claims, err = _require_admin(_claims())
    if err:
        return err[0], err[1]

    rows = (
        User.query.filter(User.role.in_(("patient", "doctor")))
        .order_by(User.role, User.email)
        .all()
    )
    return jsonify({"users": [_user_mgmt_json(u) for u in rows]}), 200


@bp.put("/users/<user_id>/blocked")
@bp.put("/managed-users/<user_id>/blocked")
def admin_set_user_blocked(user_id: str):
    claims, err = _require_admin(_claims())
    if err:
        return err[0], err[1]

    uid = (user_id or "").strip()
    target = User.query.filter_by(id=uid).first()
    if not target or target.role not in ("patient", "doctor"):
        return jsonify({"error": "User not found.", "code": "NOT_FOUND"}), 404

    if getattr(target, "account_removed_at", None) is not None:
        return (
            jsonify(
                {
                    "error": "Cannot change suspension for a removed account.",
                    "code": "ACCOUNT_REMOVED",
                }
            ),
            400,
        )

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid request body."}), 400
    blocked = body.get("blocked")
    if not isinstance(blocked, bool):
        return jsonify({"error": "Body must include boolean \"blocked\"."}), 400

    target.access_blocked = blocked
    db.session.commit()
    return jsonify({"user": _user_mgmt_json(target)}), 200


@bp.post("/users/<user_id>/remove-profile")
@bp.post("/managed-users/<user_id>/remove-profile")
def admin_remove_user_profile(user_id: str):
    claims, err = _require_admin(_claims())
    if err:
        return err[0], err[1]

    uid = (user_id or "").strip()
    target = User.query.filter_by(id=uid).first()
    if not target or target.role not in ("patient", "doctor"):
        return jsonify({"error": "User not found.", "code": "NOT_FOUND"}), 404

    if getattr(target, "account_removed_at", None) is not None:
        return (
            jsonify(
                {
                    "message": "Profile already removed.",
                    "user": _user_mgmt_json(target),
                }
            ),
            200,
        )

    target.account_removed_at = datetime.utcnow()
    target.access_blocked = True

    if target.role == "patient":
        PatientDoctorLink.query.filter_by(patient_user_id=target.id).delete(
            synchronize_session=False
        )
        prof = PatientProfile.query.filter_by(user_id=target.id).first()
        if prof:
            db.session.delete(prof)
    else:
        PatientDoctorLink.query.filter_by(doctor_user_id=target.id).delete(
            synchronize_session=False
        )
        PatientProfile.query.filter_by(assigned_doctor_user_id=target.id).update(
            {"assigned_doctor_user_id": None},
            synchronize_session=False,
        )
        dp = DoctorProfile.query.filter_by(user_id=target.id).first()
        if dp:
            db.session.delete(dp)

    db.session.commit()
    return (
        jsonify(
            {
                "message": "Portal profile removed. The account cannot sign in; past records are kept.",
                "user": _user_mgmt_json(target),
            }
        ),
        200,
    )
