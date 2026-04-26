from __future__ import annotations

import json
import re
import uuid as uuid_mod

import jwt
from datetime import datetime, timezone
from pathlib import Path

from flask import Blueprint, Response, current_app, jsonify, request, send_file

from app.services.medications_pdf import medication_row_to_pdf_bytes, medications_list_to_pdf_bytes

from app.config import Config
from app.extensions import db
from app.models.doctor_profile import DoctorProfile
from app.models.patient_doctor_link import PatientDoctorLink
from app.models.patient_profile import PatientProfile
from app.models.patient_report import PatientReport
from app.models.patient_vital_reading import PatientVitalReading
from app.models.assistant_care_plan import AssistantCarePlan
from app.models.user import User
from app.services.patient_report_analysis import (
    analysis_dict_to_pdf_bytes,
    run_ai_analysis,
    save_uploaded_file,
    upload_root,
)
from app.services.symptom_tracker_notifications import (
    notify_assigned_doctors_patient_report_uploaded,
)
from app.utils.jwt_tokens import decode_access_token
from app.utils.user_access import portal_account_active, portal_directory_listable

bp = Blueprint("patient_profile_v1", __name__, url_prefix="/api/v1/patient")


def _preview_text(val: str | None, max_len: int = 320) -> str | None:
    if not val or not str(val).strip():
        return None
    s = str(val).strip()
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


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


def _to_int(value: object) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(str(value))
    except ValueError:
        return None


def _to_float(value: object) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value))
    except ValueError:
        return None


def _assigned_doctors_for_profile(profile: PatientProfile) -> list[dict]:
    uid = profile.user_id
    out: list[dict] = []
    seen: set[str] = set()
    for link in (
        PatientDoctorLink.query.filter_by(patient_user_id=uid)
        .order_by(PatientDoctorLink.created_at.asc())
        .all()
    ):
        u = User.query.filter_by(id=link.doctor_user_id, role="doctor").first()
        if not u or not portal_directory_listable(u):
            continue
        if u.id in seen:
            continue
        name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
        out.append({"id": u.id, "displayName": name, "email": u.email or ""})
        seen.add(u.id)
    legacy = (getattr(profile, "assigned_doctor_user_id", None) or "").strip()
    if legacy and legacy not in seen:
        u = User.query.filter_by(id=legacy, role="doctor").first()
        if u and portal_directory_listable(u):
            name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
            out.insert(0, {"id": u.id, "displayName": name, "email": u.email or ""})
            seen.add(u.id)
    return out


def _profile_to_json(profile: PatientProfile) -> dict:
    doctors = _assigned_doctors_for_profile(profile)
    primary = doctors[0] if doctors else None
    return {
        "fullName": profile.full_name or "",
        "age": profile.age if profile.age is not None else "",
        "gender": profile.gender or "",
        "phone": profile.phone or "",
        "emergencyContact": profile.emergency_contact or "",
        "photoDataUrl": profile.photo_data_url or "",
        "heightCm": profile.height_cm if profile.height_cm is not None else "",
        "weightKg": profile.weight_kg if profile.weight_kg is not None else "",
        "bloodPressure": profile.blood_pressure or "",
        "heartRate": profile.heart_rate if profile.heart_rate is not None else "",
        "bloodGroup": profile.blood_group or "",
        "allergies": profile.allergies or "",
        "chronicConditions": profile.chronic_conditions or "",
        "currentMedications": profile.current_medications or "",
        "pastSurgeries": profile.past_surgeries or "",
        "medicalHistory": profile.medical_history or "",
        "smokingStatus": profile.smoking_status or "",
        "alcoholUse": profile.alcohol_use or "",
        "occupation": profile.occupation or "",
        "insuranceProvider": profile.insurance_provider or "",
        "insurancePolicyNo": profile.insurance_policy_no or "",
        "primaryDoctor": profile.primary_doctor or "",
        "carePlanText": getattr(profile, "care_plan_text", None) or "",
        "assignedDoctors": doctors,
        "assignedDoctor": primary,
    }


@bp.get("/profile")
def get_profile():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]
    assert user_id is not None

    profile = PatientProfile.query.filter_by(user_id=user_id).first()
    if not profile:
        return jsonify({"profile": None}), 200
    return jsonify({"profile": _profile_to_json(profile)}), 200


@bp.get("/care-plans")
def list_assistant_care_plans():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]
    assert user_id is not None

    rows = (
        AssistantCarePlan.query.filter_by(user_id=user_id)
        .order_by(AssistantCarePlan.created_at.desc())
        .limit(100)
        .all()
    )
    return (
        jsonify(
            {
                "carePlans": [
                    {
                        "id": r.id,
                        "planText": r.plan_text or "",
                        "source": r.source or "patient_ai_assistant",
                        "createdAt": _dt_iso(r.created_at),
                    }
                    for r in rows
                ]
            }
        ),
        200,
    )


@bp.get("/medications/pdf")
def download_medications_pdf():
    """Patient-only: full list PDF, or one row via ?rowId=<structured row id>."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]
    assert user_id is not None

    profile = PatientProfile.query.filter_by(user_id=user_id).first()
    raw = (profile.current_medications or "") if profile else ""
    display_name = ""
    if profile and (profile.full_name or "").strip():
        display_name = profile.full_name.strip()
    else:
        u = User.query.filter_by(id=user_id).first()
        if u:
            display_name = f"{u.first_name or ''} {u.last_name or ''}".strip() or (u.email or "")

    row_id = (request.args.get("rowId") or "").strip()
    filename = "medassist-medications.pdf"
    try:
        if row_id:
            if not raw.strip().startswith("{"):
                return (
                    jsonify(
                        {
                            "error": "Single-medication PDF is only available for structured lists.",
                            "code": "UNSUPPORTED",
                        }
                    ),
                    400,
                )
            try:
                j = json.loads(raw)
            except json.JSONDecodeError:
                return jsonify({"error": "Invalid medications data.", "code": "BAD_REQUEST"}), 400
            if j.get("v") != 1 or not isinstance(j.get("rows"), list):
                return jsonify({"error": "Invalid medications data.", "code": "BAD_REQUEST"}), 400
            row = next(
                (r for r in j["rows"] if isinstance(r, dict) and str(r.get("id") or "") == row_id),
                None,
            )
            if not row:
                return jsonify({"error": "Medication row not found.", "code": "NOT_FOUND"}), 404
            pdf_bytes = medication_row_to_pdf_bytes(display_name, row)
            med_slug = re.sub(
                r"[^\w\-]+",
                "-",
                str(row.get("medicineName") or row.get("medicine") or "medication").strip()[:48],
            ).strip("-") or "medication"
            filename = f"medassist-med-{med_slug}.pdf"
        else:
            pdf_bytes = medications_list_to_pdf_bytes(display_name, raw)
    except Exception:
        current_app.logger.exception("medications pdf")
        return jsonify({"error": "Could not build PDF."}), 500

    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@bp.put("/profile")
def save_profile():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]
    assert user_id is not None

    user = User.query.filter_by(id=user_id).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid request body."}), 400

    profile = PatientProfile.query.filter_by(user_id=user_id).first()
    preserved_medications = profile.current_medications if profile else None
    if not profile:
        profile = PatientProfile(user_id=user_id)
        db.session.add(profile)
        preserved_medications = None

    profile.full_name = str(body.get("fullName", "")).strip()
    profile.age = _to_int(body.get("age"))
    profile.gender = str(body.get("gender", "")).strip() or None
    profile.phone = str(body.get("phone", "")).strip() or None
    profile.emergency_contact = str(body.get("emergencyContact", "")).strip() or None
    profile.photo_data_url = str(body.get("photoDataUrl", "")).strip() or None
    profile.height_cm = _to_float(body.get("heightCm"))
    profile.weight_kg = _to_float(body.get("weightKg"))
    profile.blood_pressure = str(body.get("bloodPressure", "")).strip() or None
    profile.heart_rate = _to_int(body.get("heartRate"))
    profile.blood_group = str(body.get("bloodGroup", "")).strip() or None
    profile.allergies = str(body.get("allergies", "")).strip() or None
    profile.chronic_conditions = str(body.get("chronicConditions", "")).strip() or None
    # Patients cannot edit medications here — only assigned doctors (or server-side automation).
    profile.current_medications = preserved_medications
    profile.past_surgeries = str(body.get("pastSurgeries", "")).strip() or None
    profile.medical_history = str(body.get("medicalHistory", "")).strip() or None
    profile.smoking_status = str(body.get("smokingStatus", "")).strip() or None
    profile.alcohol_use = str(body.get("alcoholUse", "")).strip() or None
    profile.occupation = str(body.get("occupation", "")).strip() or None
    profile.insurance_provider = str(body.get("insuranceProvider", "")).strip() or None
    profile.insurance_policy_no = str(body.get("insurancePolicyNo", "")).strip() or None
    profile.primary_doctor = str(body.get("primaryDoctor", "")).strip() or None

    db.session.commit()
    return jsonify({"message": "Profile saved.", "profile": _profile_to_json(profile)}), 200


def _reading_to_json(r: PatientVitalReading) -> dict:
    ra = r.recorded_at
    if ra is not None and ra.tzinfo is None:
        ra_iso = ra.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    else:
        ra_iso = ra.isoformat() if ra else ""
    return {
        "id": r.id,
        "bpSystolic": r.bp_systolic,
        "bpDiastolic": r.bp_diastolic,
        "fastingGlucoseMgDl": r.fasting_glucose_mg_dl,
        "ppGlucoseMgDl": r.pp_glucose_mg_dl,
        "heartRate": r.heart_rate,
        "respiratoryRate": r.respiratory_rate,
        "spo2": r.spo2,
        "temperatureC": r.temperature_c,
        "weightKg": r.weight_kg,
        "notes": r.notes or "",
        "recordedAt": ra_iso,
    }


def _require_patient_role(claims: dict) -> tuple[str | None, tuple | None]:
    if str(claims.get("role") or "") != "patient":
        return None, (jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403)
    user_id = str(claims.get("sub") or "")
    if not user_id:
        return None, (jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401)
    u = User.query.filter_by(id=user_id).first()
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
    return user_id, None


def list_vitals():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    rows = (
        PatientVitalReading.query.filter_by(user_id=user_id)
        .order_by(PatientVitalReading.recorded_at.desc())
        .all()
    )
    return jsonify({"readings": [_reading_to_json(r) for r in rows]}), 200


def create_vital():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid request body."}), 400

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    r = PatientVitalReading(
        user_id=user_id,
        bp_systolic=_to_int(body.get("bpSystolic")),
        bp_diastolic=_to_int(body.get("bpDiastolic")),
        fasting_glucose_mg_dl=_to_float(body.get("fastingGlucoseMgDl")),
        pp_glucose_mg_dl=_to_float(body.get("ppGlucoseMgDl")),
        heart_rate=_to_int(body.get("heartRate")),
        respiratory_rate=_to_int(body.get("respiratoryRate")),
        spo2=_to_float(body.get("spo2")),
        temperature_c=_to_float(body.get("temperatureC")),
        weight_kg=_to_float(body.get("weightKg")),
        notes=str(body.get("notes", "")).strip() or None,
        recorded_at=now,
    )
    db.session.add(r)
    db.session.commit()
    return jsonify({"reading": _reading_to_json(r)}), 201


def _dt_iso(ra: datetime | None) -> str:
    if ra is None:
        return ""
    if ra.tzinfo is None:
        ra = ra.replace(tzinfo=timezone.utc)
    return ra.isoformat().replace("+00:00", "Z")


def _report_to_json(r: PatientReport, *, include_analysis: bool = False) -> dict:
    ra_iso = _dt_iso(r.created_at)
    snippet = ""
    if isinstance(r.ai_analysis_json, dict):
        sp = str(r.ai_analysis_json.get("summaryForPatient") or "")
        if sp:
            snippet = sp[:400] + ("…" if len(sp) > 400 else "")
    out: dict = {
        "id": r.id,
        "title": r.title,
        "summary": r.summary or "",
        "createdAt": ra_iso,
        "hasAttachment": bool(getattr(r, "stored_relative_path", None)),
        "originalFilename": getattr(r, "original_filename", None) or "",
        "mimeType": getattr(r, "mime_type", None) or "",
        "reportType": getattr(r, "report_type", None) or "other",
        "aiAnalysisStatus": getattr(r, "ai_analysis_status", None) or "none",
        "analyzedAt": _dt_iso(getattr(r, "analyzed_at", None)),
        "analysisSnippet": snippet,
        "aiError": (getattr(r, "ai_error", None) or "")[:500],
    }
    if include_analysis:
        out["aiAnalysis"] = r.ai_analysis_json
    return out


def _owned_report(user_id: str, report_id: uuid_mod.UUID | str) -> PatientReport | None:
    rid = str(report_id)
    return PatientReport.query.filter_by(id=rid, patient_user_id=user_id).first()


def _safe_report_path(cfg: Config, row: PatientReport) -> Path | None:
    rel = getattr(row, "stored_relative_path", None) or ""
    if not rel or ".." in rel.replace("\\", "/"):
        return None
    root = upload_root(cfg).resolve()
    try:
        p = (root / rel).resolve()
        p.relative_to(root)
    except (ValueError, OSError):
        return None
    return p if p.is_file() else None


_MAX_REPORT_BODY = 10_000
_ALLOWED_REPORT_TYPES = frozenset({"lab", "imaging", "radiology", "pathology", "other"})


@bp.get("/reports/healthz")
def patient_reports_healthz():
    """No auth. If this returns JSON, this process has the patient reports routes (not a stray server)."""
    return jsonify(
        {
            "ok": True,
            "service": "medassist",
            "patientReportsList": "GET /api/v1/patient/reports",
            "patientReportsUpload": "POST /api/v1/patient/reports/upload",
            "patientReportDelete": "DELETE /api/v1/patient/reports/<id>",
            "patientReportDeleteAnalysis": "DELETE /api/v1/patient/reports/<id>/analysis",
            "note": "List/detail require Authorization: Bearer (patient). HTML 404 here means wrong process on this port.",
        }
    ), 200


@bp.post("/reports/upload")
def upload_my_report_file():
    """Multipart: file (PDF/JPEG/PNG), title (optional), reportType, notes (optional). Runs Agent 2 analysis."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    f = request.files.get("file")
    if not f or not getattr(f, "filename", None):
        return jsonify({"error": "Missing file field.", "code": "MISSING_FILE"}), 400

    title = (request.form.get("title") or "").strip()[:300]
    report_type = (request.form.get("reportType") or "other").strip().lower()
    if report_type not in _ALLOWED_REPORT_TYPES:
        report_type = "other"
    notes = (request.form.get("notes") or "").strip()[:_MAX_REPORT_BODY] or None

    cfg = _cfg()
    try:
        rel, orig, mime, size = save_uploaded_file(cfg, user_id, f)
    except ValueError as e:
        return jsonify({"error": str(e), "code": "INVALID_UPLOAD"}), 400

    row = PatientReport(
        patient_user_id=user_id,
        title=title or (orig[:300] if orig else "Uploaded report"),
        summary=notes,
        report_type=report_type,
        original_filename=orig,
        stored_relative_path=rel,
        mime_type=mime,
        file_size_bytes=size,
        ai_analysis_status="pending",
    )
    db.session.add(row)
    db.session.commit()

    notify_assigned_doctors_patient_report_uploaded(
        user_id,
        report_id=str(row.id),
        report_title=row.title or "",
        report_type=row.report_type or "other",
        original_filename=orig or "",
        has_file_attachment=True,
    )

    run_ai_analysis(cfg, row)
    db.session.commit()
    return jsonify({"report": _report_to_json(row, include_analysis=True)}), 201


@bp.get("/reports/<uuid:report_id>/file")
def download_my_report_original(report_id: uuid_mod.UUID):
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    row = _owned_report(user_id, report_id)
    if not row:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404
    p = _safe_report_path(_cfg(), row)
    if not p:
        return jsonify({"error": "No file for this report.", "code": "NO_FILE"}), 404
    dl = row.original_filename or p.name
    return send_file(
        p,
        as_attachment=True,
        download_name=dl,
        mimetype=row.mime_type or "application/octet-stream",
    )


@bp.get("/reports/<uuid:report_id>/analysis.pdf")
def download_my_report_analysis_pdf(report_id: uuid_mod.UUID):
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    row = _owned_report(user_id, report_id)
    if not row:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404
    if row.ai_analysis_status != "completed" or not isinstance(row.ai_analysis_json, dict):
        return jsonify(
            {"error": "Analysis not available yet.", "code": "ANALYSIS_NOT_READY"}
        ), 409
    try:
        buf = analysis_dict_to_pdf_bytes(row.title or "", row.ai_analysis_json)
    except Exception as e:
        return jsonify(
            {
                "error": "Could not generate analysis PDF.",
                "code": "ANALYSIS_PDF_FAILED",
                "detail": str(e)[:800],
            }
        ), 500
    rid = str(report_id)
    fname = f"medassist-analysis-{rid[:8]}.pdf"
    return Response(
        buf,
        mimetype="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@bp.delete("/reports/<uuid:report_id>/analysis")
def delete_my_report_analysis(report_id: uuid_mod.UUID):
    """Remove stored AI analysis only; keeps title, summary, and uploaded file."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    row = _owned_report(user_id, report_id)
    if not row:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404

    row.ai_analysis_json = None
    row.ai_analysis_status = "none"
    row.ai_error = None
    row.analyzed_at = None
    db.session.commit()
    return jsonify({"report": _report_to_json(row, include_analysis=True)}), 200


@bp.delete("/reports/<uuid:report_id>")
def delete_my_report(report_id: uuid_mod.UUID):
    """Delete the report row and remove the uploaded file from disk if present."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    row = _owned_report(user_id, report_id)
    if not row:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404

    cfg = _cfg()
    p = _safe_report_path(cfg, row)
    if p:
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass

    db.session.delete(row)
    db.session.commit()
    return jsonify({"ok": True, "deletedId": str(report_id)}), 200


@bp.get("/reports/<uuid:report_id>")
def get_my_report_detail(report_id: uuid_mod.UUID):
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    row = _owned_report(user_id, report_id)
    if not row:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404
    return jsonify({"report": _report_to_json(row, include_analysis=True)}), 200


def list_my_reports():
    """GET /api/v1/patient/reports — registered on the Flask app in ``create_app`` (with POST)."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    rows = (
        PatientReport.query.filter_by(patient_user_id=user_id)
        .order_by(PatientReport.created_at.desc())
        .all()
    )
    return jsonify({"reports": [_report_to_json(r) for r in rows]}), 200


def create_my_report():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid request body."}), 400
    title = str(body.get("title", "")).strip()[:300]
    if not title:
        return jsonify({"error": "Title is required.", "code": "INVALID_TITLE"}), 400
    summary = str(body.get("summary", "")).strip()[:_MAX_REPORT_BODY] or None

    row = PatientReport(patient_user_id=user_id, title=title, summary=summary)
    db.session.add(row)
    db.session.commit()

    notify_assigned_doctors_patient_report_uploaded(
        user_id,
        report_id=str(row.id),
        report_title=row.title or "",
        report_type=getattr(row, "report_type", None) or "other",
        original_filename=(row.original_filename or "") if row.original_filename else "",
        has_file_attachment=bool(getattr(row, "stored_relative_path", None)),
    )
    return jsonify({"report": _report_to_json(row)}), 201


@bp.get("/doctors")
def list_verified_doctors():
    """Directory of verified doctors (for patient UI; same source as Symptom Analyst)."""
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    if str(claims.get("role") or "") != "patient":
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403

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
        name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
        ar = getattr(dp, "academic_records", None) if dp else None
        pe = getattr(dp, "professional_experience", None) if dp else None
        ach = getattr(dp, "achievements", None) if dp else None
        photo = ""
        if dp and getattr(dp, "photo_data_url", None):
            raw = (dp.photo_data_url or "").strip()
            if raw and len(raw) <= 200_000:
                photo = raw
        out.append(
            {
                "id": u.id,
                "displayName": name,
                "email": u.email,
                "specialization": (dp.specialization if dp else None) or "Specialization not specified",
                "department": dp.department if dp else None,
                "hospitalAffiliation": dp.hospital_affiliation if dp else None,
                "yearsExperience": dp.years_experience if dp else None,
                "availableForTelemedicine": dp.available_for_telemedicine if dp else True,
                "bio": (dp.bio[:400] + "...") if dp and dp.bio and len(dp.bio) > 400 else (dp.bio if dp else None),
                "academicRecords": _preview_text(ar),
                "professionalExperience": _preview_text(pe),
                "achievements": _preview_text(ach),
                "photoDataUrl": photo or None,
            }
        )
    return jsonify({"doctors": out}), 200
