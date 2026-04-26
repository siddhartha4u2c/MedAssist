from __future__ import annotations

import os
import jwt
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import or_

from app.api.v1.patient_profile import _preview_text
from app.config import Config, effective_daily_api_key
from app.extensions import db
from app.integrations.videoco_client import is_video_provider_configured, provision_telemedicine_room
from app.models.appointment import Appointment
from app.models.doctor_busy_block import DoctorBusyBlock
from app.models.doctor_profile import DoctorProfile
from app.models.patient_profile import PatientProfile
from app.models.user import User
from app.services.appointment_mail import (
    send_appointment_booking_confirmations,
    send_appointment_cancellation_emails,
)
from app.utils.jwt_tokens import decode_access_token
from app.utils.user_access import portal_account_active, portal_directory_listable

bp = Blueprint("appointments_v1", __name__, url_prefix="/api/v1/appointments")


@bp.get("/ping")
def appointments_ping():
    """No auth — use to verify this Flask process has the appointments blueprint (GET /api/v1/appointments/ping)."""
    cfg = _cfg()
    backend_root = Path(current_app.root_path).resolve().parent
    dot_env = backend_root / ".env"
    dk_cfg = (cfg.daily_api_key or "").strip()
    dk_os = os.environ.get("DAILY_API_KEY", "").strip()
    dk_eff = effective_daily_api_key(cfg).strip()
    return jsonify(
        {
            "ok": True,
            "service": "appointments",
            "videoProviderConfigured": is_video_provider_configured(cfg),
            "videoEnvHint": {
                "backendRoot": str(backend_root),
                "dotEnvFileExists": dot_env.is_file(),
                "dailyKeyLengthInConfig": len(dk_cfg),
                "dailyKeyLengthInOsEnviron": len(dk_os),
                "dailyKeyLengthEffective": len(dk_eff),
                "dailyEnableRecording": cfg.daily_enable_recording or None,
            },
        }
    ), 200


_MODES = frozenset({"telemedicine", "in_person"})
_STATUSES_LIST = ("scheduled", "cancelled")


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


def _parse_iso_dt(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    s = str(value).strip()
    if not s:
        return None
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _batch_display_names(user_ids: Iterable[str]) -> dict[str, str]:
    """Map user id → display label for lists (batched queries)."""
    ids = list({x for x in user_ids if x})
    if not ids:
        return {}
    users = {u.id: u for u in User.query.filter(User.id.in_(ids)).all()}
    patient_ids = [uid for uid, u in users.items() if u.role == "patient"]
    profiles: dict[str, PatientProfile] = {}
    if patient_ids:
        for pr in PatientProfile.query.filter(PatientProfile.user_id.in_(patient_ids)).all():
            profiles[pr.user_id] = pr
    out: dict[str, str] = {}
    for uid in ids:
        u = users.get(uid)
        if not u:
            out[uid] = uid[:8] + "…"
            continue
        if u.role == "patient":
            prof = profiles.get(uid)
            fn = (prof.full_name or "").strip() if prof else ""
            out[uid] = fn or (f"{u.first_name or ''} {u.last_name or ''}".strip() or (u.email or uid))
        else:
            out[uid] = f"{u.first_name or ''} {u.last_name or ''}".strip() or (u.email or uid)
    return out


def _appt_json(a: Appointment, participant_names: dict[str, str] | None = None) -> dict[str, Any]:
    join = getattr(a, "video_join_url", None) or None
    names = participant_names
    if names is None:
        names = _batch_display_names((a.patient_user_id, a.doctor_user_id))
    return {
        "id": a.id,
        "patientUserId": a.patient_user_id,
        "doctorUserId": a.doctor_user_id,
        "patientDisplayName": names.get(a.patient_user_id, ""),
        "doctorDisplayName": names.get(a.doctor_user_id, ""),
        "mode": a.mode,
        "startsAt": a.starts_at.isoformat() + "Z",
        "endsAt": a.ends_at.isoformat() + "Z",
        "status": a.status,
        "reason": a.reason or "",
        "cancellationReason": (getattr(a, "cancellation_reason", None) or "") or "",
        "videoRoomId": a.video_room_id or None,
        "videoJoinUrl": join,
    }


def _verified_user(uid: str, role: str) -> User | None:
    u = User.query.filter_by(id=uid, role=role, is_verified=True).first()
    if not u or not portal_directory_listable(u):
        return None
    return u


def _require_active_portal_user(claims: dict) -> tuple[User | None, tuple | None]:
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
    return u, None


def _overlap_scheduled(
    user_ids: list[str], start: datetime, end: datetime, exclude_appt_id: str | None = None
) -> Appointment | None:
    """Any scheduled appointment involving user_ids that overlaps [start, end)."""
    if not user_ids or start >= end:
        return None
    q = Appointment.query.filter(
        Appointment.status == "scheduled",
        or_(
            Appointment.patient_user_id.in_(user_ids),
            Appointment.doctor_user_id.in_(user_ids),
        ),
        Appointment.starts_at < end,
        Appointment.ends_at > start,
    )
    if exclude_appt_id:
        q = q.filter(Appointment.id != exclude_appt_id)
    return q.first()


def _overlap_doctor_unavailable(
    doctor_user_id: str, start: datetime, end: datetime, exclude_block_id: str | None = None
) -> DoctorBusyBlock | None:
    """Doctor-only busy blocks (no appointment row)."""
    if not doctor_user_id or start >= end:
        return None
    q = DoctorBusyBlock.query.filter(
        DoctorBusyBlock.doctor_user_id == doctor_user_id,
        DoctorBusyBlock.starts_at < end,
        DoctorBusyBlock.ends_at > start,
    )
    if exclude_block_id:
        q = q.filter(DoctorBusyBlock.id != exclude_block_id)
    return q.first()


def _doctor_busy_block_public(b: DoctorBusyBlock) -> dict[str, Any]:
    return {
        "id": b.id,
        "doctorUserId": b.doctor_user_id,
        "startsAt": b.starts_at.isoformat() + "Z",
        "endsAt": b.ends_at.isoformat() + "Z",
        "note": (b.note or "") or "",
    }


def _doctor_directory_fragment(u: User, dp: DoctorProfile | None, bio_max: int = 400) -> dict[str, Any]:
    name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
    bio = None
    if dp and dp.bio:
        bio = dp.bio if len(dp.bio) <= bio_max else dp.bio[: bio_max - 1] + "…"
    ar = getattr(dp, "academic_records", None) if dp else None
    pe = getattr(dp, "professional_experience", None) if dp else None
    ach = getattr(dp, "achievements", None) if dp else None
    photo = ""
    if dp and getattr(dp, "photo_data_url", None):
        raw = (dp.photo_data_url or "").strip()
        if raw and len(raw) <= 200_000:
            photo = raw
    return {
        "userId": u.id,
        "displayName": name,
        "email": u.email,
        "specialization": (dp.specialization if dp else None) or "Specialization not specified",
        "department": dp.department if dp else None,
        "hospitalAffiliation": dp.hospital_affiliation if dp else None,
        "yearsExperience": dp.years_experience if dp else None,
        "availableForTelemedicine": dp.available_for_telemedicine if dp else True,
        "bio": bio,
        "academicRecords": _preview_text(ar),
        "professionalExperience": _preview_text(pe),
        "achievements": _preview_text(ach),
        "photoDataUrl": photo or None,
    }


def _doctor_full_profile(u: User, dp: DoctorProfile | None) -> dict[str, Any]:
    name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
    base = _doctor_directory_fragment(u, dp, bio_max=100_000)
    base["bio"] = (dp.bio if dp else None) or None
    base["academicRecords"] = (dp.academic_records if dp else None) or None
    base["professionalExperience"] = (dp.professional_experience if dp else None) or None
    base["achievements"] = (dp.achievements if dp else None) or None
    base["consultationFee"] = dp.consultation_fee if dp else None
    return base


@bp.get("/directory-search")
def directory_search():
    """Patient: verified doctors only. Doctor: verified patients + verified doctors (for scheduling)."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    role = str(claims.get("role") or "")
    q = (request.args.get("q") or "").strip().lower()

    if role == "patient":
        _, err = _require_active_portal_user(claims)
        if err:
            return err[0], err[1]
        doctors = (
            User.query.filter_by(role="doctor", is_verified=True)
            .order_by(User.last_name, User.first_name)
            .all()
        )
        out: list[dict] = []
        for u in doctors:
            if not portal_directory_listable(u):
                continue
            dp = DoctorProfile.query.filter_by(user_id=u.id).first()
            # Appointment directory should only show doctors open for telemedicine.
            if dp and dp.available_for_telemedicine is False:
                continue
            if q:
                blob = f"{u.email} {u.first_name} {u.last_name}".lower()
                if dp:
                    for part in (
                        dp.specialization,
                        dp.department,
                        dp.hospital_affiliation,
                        dp.bio,
                    ):
                        if part:
                            blob += " " + str(part).lower()
                tokens = [t for t in q.split() if t]
                if tokens:
                    if not all(tok in blob for tok in tokens):
                        continue
                elif q not in blob:
                    continue
            out.append(_doctor_directory_fragment(u, dp))
        return jsonify({"doctors": out, "patients": []}), 200

    if role == "doctor":
        _, err = _require_active_portal_user(claims)
        if err:
            return err[0], err[1]
        doc_uid = str(claims.get("sub") or "")
        patients_out: list[dict] = []
        p_users = User.query.filter_by(role="patient", is_verified=True).order_by(User.email).all()
        for u in p_users:
            if not portal_directory_listable(u):
                continue
            if q:
                blob = f"{u.email} {u.first_name} {u.last_name}".lower()
                prof = PatientProfile.query.filter_by(user_id=u.id).first()
                if prof and prof.full_name:
                    blob += " " + prof.full_name.lower()
                if q not in blob:
                    continue
            prof = PatientProfile.query.filter_by(user_id=u.id).first()
            dn = (prof.full_name.strip() if prof and prof.full_name else "") or (
                f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
            )
            patients_out.append(
                {"userId": u.id, "displayName": dn, "email": u.email, "role": "patient"}
            )
        doctors_out: list[dict] = []
        d_users = (
            User.query.filter_by(role="doctor", is_verified=True)
            .filter(User.id != doc_uid)
            .order_by(User.last_name, User.first_name)
            .all()
        )
        for u in d_users:
            if not portal_directory_listable(u):
                continue
            dp = DoctorProfile.query.filter_by(user_id=u.id).first()
            if dp and dp.available_for_telemedicine is False:
                continue
            if q:
                blob = f"{u.email} {u.first_name} {u.last_name}".lower()
                if dp:
                    for part in (dp.specialization, dp.department, dp.hospital_affiliation):
                        if part:
                            blob += " " + str(part).lower()
                tokens = [t for t in q.split() if t]
                if tokens:
                    if not all(tok in blob for tok in tokens):
                        continue
                elif q not in blob:
                    continue
            dn = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
            doctors_out.append(
                {
                    "userId": u.id,
                    "displayName": dn,
                    "email": u.email,
                    "role": "doctor",
                    "specialization": (dp.specialization if dp else "") or "",
                }
            )
        return jsonify({"patients": patients_out, "doctors": doctors_out}), 200

    return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403


@bp.get("/doctor/<doctor_user_id>/profile")
def patient_doctor_profile(doctor_user_id: str):
    """Patient-only: directory (default) vs full portal profile for booking context."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    if str(claims.get("role") or "") != "patient":
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    _, err = _require_active_portal_user(claims)
    if err:
        return err[0], err[1]
    u = _verified_user(doctor_user_id, "doctor")
    if not u:
        return jsonify({"error": "Doctor not found.", "code": "NOT_FOUND"}), 404
    dp = DoctorProfile.query.filter_by(user_id=u.id).first()
    detail = (request.args.get("detail") or "directory").strip().lower()
    if detail == "full":
        return jsonify({"profile": _doctor_full_profile(u, dp)}), 200
    return jsonify({"profile": _doctor_directory_fragment(u, dp)}), 200


@bp.get("/busy")
def busy_for_users():
    """Busy intervals for calendar. Patient: only doctor userIds allowed. Doctor: patient or doctor userIds."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    role = str(claims.get("role") or "")
    if role not in ("patient", "doctor"):
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    _, err = _require_active_portal_user(claims)
    if err:
        return err[0], err[1]
    caller = str(claims.get("sub") or "")
    raw_ids = (request.args.get("userIds") or "").strip()
    user_ids = [x.strip() for x in raw_ids.split(",") if x.strip()] if raw_ids else []
    start = _parse_iso_dt(request.args.get("from") or "")
    end = _parse_iso_dt(request.args.get("to") or "")
    if start is None or end is None or start >= end:
        return jsonify({"error": "Invalid or missing from/to ISO datetimes."}), 400

    # Empty userIds = only the signed-in user's appointments (calendar without a counterparty selected).
    allowed: set[str] = {caller}
    for uid in user_ids:
        if uid == caller:
            continue
        if role == "patient":
            if _verified_user(uid, "doctor"):
                allowed.add(uid)
            else:
                return jsonify({"error": "Patients may only load busy times for verified doctors.", "code": "FORBIDDEN"}), 403
        else:
            if _verified_user(uid, "patient") or _verified_user(uid, "doctor"):
                allowed.add(uid)
            else:
                return jsonify({"error": "Invalid user id for busy lookup.", "code": "FORBIDDEN"}), 403

    target_ids = list(allowed)
    rows = (
        Appointment.query.filter(
            Appointment.status == "scheduled",
            or_(
                Appointment.patient_user_id.in_(target_ids),
                Appointment.doctor_user_id.in_(target_ids),
            ),
            Appointment.starts_at < end,
            Appointment.ends_at > start,
        )
        .order_by(Appointment.starts_at)
        .all()
    )
    by_user: dict[str, list[dict]] = {uid: [] for uid in target_ids}
    for a in rows:
        block = {
            "startsAt": a.starts_at.isoformat() + "Z",
            "endsAt": a.ends_at.isoformat() + "Z",
            "appointmentId": a.id,
            "mode": a.mode,
        }
        if a.patient_user_id in by_user:
            by_user[a.patient_user_id].append(block)
        if a.doctor_user_id in by_user:
            if a.doctor_user_id != a.patient_user_id:
                by_user[a.doctor_user_id].append(block)

    doctor_ids = [r.id for r in User.query.filter(User.id.in_(target_ids), User.role == "doctor").all()]
    for doc_id in doctor_ids:
        for b in (
            DoctorBusyBlock.query.filter(
                DoctorBusyBlock.doctor_user_id == doc_id,
                DoctorBusyBlock.starts_at < end,
                DoctorBusyBlock.ends_at > start,
            )
            .order_by(DoctorBusyBlock.starts_at)
            .all()
        ):
            by_user.setdefault(doc_id, []).append(
                {
                    "startsAt": b.starts_at.isoformat() + "Z",
                    "endsAt": b.ends_at.isoformat() + "Z",
                    "appointmentId": None,
                    "mode": "unavailable",
                    "unavailableBlockId": b.id,
                }
            )
    return jsonify({"busyByUserId": by_user, "from": start.isoformat() + "Z", "to": end.isoformat() + "Z"}), 200


@bp.get("/unavailable-blocks")
def list_my_unavailable_blocks():
    """Doctor: list own unavailable / busy blocks in a time range."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    if str(claims.get("role") or "") != "doctor":
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    _, err = _require_active_portal_user(claims)
    if err:
        return err[0], err[1]
    uid = str(claims.get("sub") or "")
    start = _parse_iso_dt(request.args.get("from") or "")
    end = _parse_iso_dt(request.args.get("to") or "")
    if start is None or end is None or start >= end:
        return jsonify({"error": "Invalid or missing from/to ISO datetimes."}), 400
    rows = (
        DoctorBusyBlock.query.filter(
            DoctorBusyBlock.doctor_user_id == uid,
            DoctorBusyBlock.starts_at < end,
            DoctorBusyBlock.ends_at > start,
        )
        .order_by(DoctorBusyBlock.starts_at)
        .all()
    )
    return jsonify({"blocks": [_doctor_busy_block_public(b) for b in rows]}), 200


@bp.post("/unavailable-blocks")
def create_my_unavailable_block():
    """Doctor: mark a time range as unavailable (blocks patient booking into that window)."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    if str(claims.get("role") or "") != "doctor":
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    _, err = _require_active_portal_user(claims)
    if err:
        return err[0], err[1]
    caller = str(claims.get("sub") or "")
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid JSON body."}), 400
    start = _parse_iso_dt(body.get("startsAt"))
    end = _parse_iso_dt(body.get("endsAt"))
    if start is None or end is None or start >= end:
        return jsonify({"error": "Invalid startsAt / endsAt."}), 400
    if end - start < timedelta(minutes=15):
        return jsonify({"error": "Minimum block length is 15 minutes."}), 400
    if end - start > timedelta(hours=24):
        return jsonify({"error": "Maximum block length is 24 hours per entry (add multiple for longer)."}), 400
    note = str(body.get("note") or "").strip()[:500] or None

    if _overlap_scheduled([caller], start, end):
        return (
            jsonify(
                {
                    "error": "That time overlaps an existing appointment on your calendar.",
                    "code": "SLOT_UNAVAILABLE",
                }
            ),
            409,
        )
    if _overlap_doctor_unavailable(caller, start, end):
        return (
            jsonify(
                {
                    "error": "That time overlaps another unavailable block.",
                    "code": "SLOT_UNAVAILABLE",
                }
            ),
            409,
        )

    b = DoctorBusyBlock(doctor_user_id=caller, starts_at=start, ends_at=end, note=note)
    db.session.add(b)
    db.session.commit()
    return jsonify({"block": _doctor_busy_block_public(b)}), 201


@bp.delete("/unavailable-blocks/<block_id>")
def delete_my_unavailable_block(block_id: str):
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    if str(claims.get("role") or "") != "doctor":
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    _, err = _require_active_portal_user(claims)
    if err:
        return err[0], err[1]
    caller = str(claims.get("sub") or "")
    b = DoctorBusyBlock.query.filter_by(id=block_id).first()
    if not b or b.doctor_user_id != caller:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404
    db.session.delete(b)
    db.session.commit()
    return jsonify({"deleted": True}), 200


@bp.get("/mine")
def list_my_appointments():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    role = str(claims.get("role") or "")
    if role not in ("patient", "doctor"):
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    _, err = _require_active_portal_user(claims)
    if err:
        return err[0], err[1]
    uid = str(claims.get("sub") or "")
    start = _parse_iso_dt(request.args.get("from") or "")
    end = _parse_iso_dt(request.args.get("to") or "")
    if start is None or end is None:
        return jsonify({"error": "from and to ISO datetimes are required."}), 400
    st_raw = (request.args.get("status") or "scheduled").strip().lower()
    if st_raw in ("all", "any", "both"):
        status_filter: str | None = None
    elif st_raw in _STATUSES_LIST:
        status_filter = st_raw
    else:
        status_filter = "scheduled"
    q = Appointment.query.filter(
        or_(Appointment.patient_user_id == uid, Appointment.doctor_user_id == uid),
        Appointment.starts_at < end,
        Appointment.ends_at > start,
    )
    if status_filter:
        q = q.filter(Appointment.status == status_filter)
    q = q.order_by(Appointment.starts_at)
    rows = q.all()

    # Best-effort: create Daily rooms for telemedicine rows missing a join URL when the provider is configured.
    # (The UI also POSTs /provision-video; this covers refresh-only flows so GET /mine is not a dead end.)
    cfg = _cfg()
    if is_video_provider_configured(cfg):
        max_auto = 5
        n_done = 0
        touched = False
        for a in rows:
            if n_done >= max_auto:
                break
            if (a.status or "") != "scheduled":
                continue
            if (a.mode or "") != "telemedicine":
                continue
            if (getattr(a, "video_join_url", None) or "").strip():
                continue
            res = provision_telemedicine_room(
                cfg, a.id, "MedAssist telemedicine", ends_at_utc_naive=a.ends_at
            )
            if res.room_id:
                a.video_room_id = res.room_id[:500]
                touched = True
            if res.join_url:
                a.video_join_url = res.join_url
                touched = True
            if res.error:
                current_app.logger.warning(
                    "[appointments/mine] Daily provision for %s: %s", a.id, res.error
                )
            n_done += 1
        if touched:
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                current_app.logger.warning("[appointments/mine] commit after video provision: %s", e)

    name_ids = {uid for a in rows for uid in (a.patient_user_id, a.doctor_user_id)}
    names = _batch_display_names(name_ids)
    return jsonify({"appointments": [_appt_json(a, names) for a in rows]}), 200


@bp.get("/<appointment_id>")
def get_appointment(appointment_id: str):
    """Patient or doctor: fetch one appointment (e.g. in-app telemedicine join page)."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    role = str(claims.get("role") or "")
    if role not in ("patient", "doctor"):
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    _, err = _require_active_portal_user(claims)
    if err:
        return err[0], err[1]
    uid = str(claims.get("sub") or "")
    a = Appointment.query.filter_by(id=appointment_id).first()
    if not a:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404
    if a.patient_user_id != uid and a.doctor_user_id != uid:
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    names = _batch_display_names({a.patient_user_id, a.doctor_user_id})
    return jsonify({"appointment": _appt_json(a, names)}), 200


@bp.post("")
def create_appointment():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    role = str(claims.get("role") or "")
    if role not in ("patient", "doctor"):
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    _, err = _require_active_portal_user(claims)
    if err:
        return err[0], err[1]
    caller = str(claims.get("sub") or "")
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid JSON body."}), 400

    mode = str(body.get("mode") or "").strip().lower()
    if mode not in _MODES:
        return jsonify({"error": "mode must be telemedicine or in_person."}), 400
    start = _parse_iso_dt(body.get("startsAt"))
    end = _parse_iso_dt(body.get("endsAt"))
    if start is None or end is None or start >= end:
        return jsonify({"error": "Invalid startsAt / endsAt."}), 400
    if end - start < timedelta(minutes=15):
        return jsonify({"error": "Minimum appointment length is 15 minutes."}), 400
    if end - start > timedelta(hours=8):
        return jsonify({"error": "Maximum appointment length is 8 hours."}), 400

    now_utc = datetime.utcnow()
    if start < now_utc - timedelta(minutes=1):
        return (
            jsonify(
                {
                    "error": "Appointment start cannot be in the past.",
                    "code": "PAST_START",
                }
            ),
            400,
        )

    reason = str(body.get("reason") or "").strip()[:2000] or None

    patient_uid: str
    doctor_uid: str

    if role == "patient":
        patient_uid = caller
        doctor_uid = str(body.get("doctorUserId") or "").strip()
        if not doctor_uid:
            return jsonify({"error": "doctorUserId is required."}), 400
        du = _verified_user(doctor_uid, "doctor")
        if not du:
            return jsonify({"error": "Doctor not found or not verified."}), 404
        if mode == "telemedicine":
            dp = DoctorProfile.query.filter_by(user_id=doctor_uid).first()
            if dp and dp.available_for_telemedicine is False:
                return jsonify({"error": "This doctor is not available for telemedicine."}), 400
    else:
        doctor_uid = caller
        patient_uid = str(body.get("patientUserId") or "").strip()
        if not patient_uid:
            return jsonify({"error": "patientUserId is required."}), 400
        pu = _verified_user(patient_uid, "patient")
        if not pu:
            return jsonify({"error": "Patient not found or not verified."}), 404

    if patient_uid == doctor_uid:
        return jsonify({"error": "Invalid participant pair."}), 400

    clash = _overlap_scheduled([patient_uid, doctor_uid], start, end)
    if clash:
        return (
            jsonify(
                {
                    "error": "That time overlaps an existing appointment for the patient or doctor.",
                    "code": "SLOT_UNAVAILABLE",
                }
            ),
            409,
        )
    if _overlap_doctor_unavailable(doctor_uid, start, end):
        return (
            jsonify(
                {
                    "error": "That time overlaps a period the doctor marked as unavailable.",
                    "code": "SLOT_UNAVAILABLE",
                }
            ),
            409,
        )

    appt = Appointment(
        patient_user_id=patient_uid,
        doctor_user_id=doctor_uid,
        mode=mode,
        starts_at=start,
        ends_at=end,
        status="scheduled",
        reason=reason,
        video_room_id=None,
        video_join_url=None,
    )
    db.session.add(appt)
    db.session.flush()

    video_warning: str | None = None
    if mode == "telemedicine":
        title = "MedAssist telemedicine"
        res = provision_telemedicine_room(_cfg(), appt.id, title, ends_at_utc_naive=end)
        if res.room_id:
            appt.video_room_id = res.room_id[:500]
        if res.join_url:
            appt.video_join_url = res.join_url
        if res.error:
            video_warning = res.error
            current_app.logger.warning("[Video.co] appointment %s: %s", appt.id, res.error)
    db.session.commit()

    patient_row = User.query.filter_by(id=patient_uid).first()
    doctor_row = User.query.filter_by(id=doctor_uid).first()
    if patient_row and doctor_row:
        try:
            send_appointment_booking_confirmations(_cfg(), appt, patient_row, doctor_row)
        except Exception as e:
            current_app.logger.warning("Appointment confirmation emails (unexpected): %s", e)

    payload: dict[str, Any] = {"appointment": _appt_json(appt)}
    if mode == "telemedicine" and not appt.video_join_url:
        payload["videoProvisioningWarning"] = (
            video_warning
            or "Telemedicine visit was saved, but no video room URL was returned. Check Flask logs for Daily.co errors."
        )
    return jsonify(payload), 201


@bp.post("/<appointment_id>/provision-video")
def provision_video_for_appointment(appointment_id: str):
    """Create a Daily / video room for an existing telemedicine visit that has no join URL yet."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    role = str(claims.get("role") or "")
    if role not in ("patient", "doctor"):
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    _, err = _require_active_portal_user(claims)
    if err:
        return err[0], err[1]
    uid = str(claims.get("sub") or "")
    a = Appointment.query.filter_by(id=appointment_id).first()
    if not a:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404
    if a.patient_user_id != uid and a.doctor_user_id != uid:
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    if a.status != "scheduled":
        return jsonify({"error": "Appointment is not active.", "code": "INVALID_STATE"}), 400
    if a.mode != "telemedicine":
        return jsonify({"error": "Video links apply only to telemedicine appointments.", "code": "INVALID_MODE"}), 400
    if (getattr(a, "video_join_url", None) or "").strip():
        return jsonify({"appointment": _appt_json(a), "message": "Video link already set."}), 200

    cfg = _cfg()
    if not is_video_provider_configured(cfg):
        return (
            jsonify(
                {
                    "error": "Video provider is not configured. Set DAILY_API_KEY in backend/.env or VIDEOCO_*.",
                    "code": "NO_VIDEO_PROVIDER",
                }
            ),
            400,
        )

    title = "MedAssist telemedicine"
    res = provision_telemedicine_room(cfg, a.id, title, ends_at_utc_naive=a.ends_at)
    if res.room_id:
        a.video_room_id = res.room_id[:500]
    if res.join_url:
        a.video_join_url = res.join_url
    db.session.commit()

    payload: dict[str, Any] = {"appointment": _appt_json(a)}
    if res.error and not a.video_join_url:
        payload["videoProvisioningWarning"] = res.error
    elif not a.video_join_url:
        payload["videoProvisioningWarning"] = (
            "Room was requested but no join URL was returned. Check Daily.co dashboard and server logs."
        )
    return jsonify(payload), 200


@bp.post("/<appointment_id>/cancel")
def cancel_appointment(appointment_id: str):
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    role = str(claims.get("role") or "")
    if role not in ("patient", "doctor"):
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    _, err = _require_active_portal_user(claims)
    if err:
        return err[0], err[1]
    uid = str(claims.get("sub") or "")
    body = request.get_json(silent=True) or {}
    cancel_reason: str | None = None
    if isinstance(body, dict) and ("cancellationReason" in body or "reason" in body):
        raw = body.get("cancellationReason", body.get("reason"))
        cancel_reason = str(raw or "").strip()[:2000] or None

    a = Appointment.query.filter_by(id=appointment_id).first()
    if not a:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404
    if a.patient_user_id != uid and a.doctor_user_id != uid:
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    if a.status != "scheduled":
        return jsonify({"error": "Appointment is not active.", "code": "INVALID_STATE"}), 400
    a.status = "cancelled"
    a.cancellation_reason = cancel_reason
    db.session.commit()

    patient_row = User.query.filter_by(id=a.patient_user_id).first()
    doctor_row = User.query.filter_by(id=a.doctor_user_id).first()
    canceller = User.query.filter_by(id=uid).first()
    if patient_row and doctor_row and canceller:
        try:
            send_appointment_cancellation_emails(
                _cfg(), a, patient_row, doctor_row, canceller, cancel_reason
            )
        except Exception as e:
            current_app.logger.warning("Cancellation notification email: %s", e)

    return jsonify({"appointment": _appt_json(a)}), 200
