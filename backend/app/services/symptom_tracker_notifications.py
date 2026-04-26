from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any

from app.extensions import db
from app.models.patient_doctor_link import PatientDoctorLink
from app.models.patient_profile import PatientProfile
from app.models.portal_notification import PortalNotification
from app.models.user import User
from app.utils.user_access import portal_directory_listable


def _patient_display_name(patient: User, profile: PatientProfile | None) -> str:
    if profile and (profile.full_name or "").strip():
        return (profile.full_name or "").strip()
    name = f"{patient.first_name or ''} {patient.last_name or ''}".strip()
    return name or (patient.email or "Patient")


def _assigned_doctor_user_ids(patient_user_id: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for link in PatientDoctorLink.query.filter_by(patient_user_id=patient_user_id).all():
        did = (link.doctor_user_id or "").strip()
        if not did or did in seen:
            continue
        du = User.query.filter_by(id=did, role="doctor").first()
        if not du or not portal_directory_listable(du):
            continue
        out.append(did)
        seen.add(did)
    prof = PatientProfile.query.filter_by(user_id=patient_user_id).first()
    legacy = (getattr(prof, "assigned_doctor_user_id", None) or "").strip() if prof else ""
    if legacy and legacy not in seen:
        du = User.query.filter_by(id=legacy, role="doctor").first()
        if du and portal_directory_listable(du):
            out.insert(0, legacy)
            seen.add(legacy)
    return out


def _last_user_message_text(messages: list[Any]) -> str:
    for m in reversed(messages):
        if not isinstance(m, dict):
            continue
        role = str(m.get("role", "")).lower().strip()
        if role not in ("user", "patient"):
            continue
        content = m.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
    return ""


def _snippet(text: str, max_len: int = 320) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def notify_assigned_doctors_symptom_tracker_message(
    patient_user_id: str,
    messages: list[Any],
    *,
    urgency_label: str | None = None,
) -> None:
    """
    Create in-app notifications for each doctor assigned to this patient when they
    send a message in the symptom tracker. Never raises (failures are logged only).
    """
    try:
        patient = User.query.filter_by(id=patient_user_id, role="patient").first()
        if not patient:
            return
        raw = _last_user_message_text(messages)
        if not raw:
            return
        snippet = _snippet(raw)
        prof = PatientProfile.query.filter_by(user_id=patient_user_id).first()
        pname = _patient_display_name(patient, prof)
        doctor_ids = _assigned_doctor_user_ids(patient_user_id)
        if not doctor_ids:
            return

        title = f"Symptom tracker — {pname}"
        body_plain = "\n".join(
            [
                f"Patient {pname} sent a message in the symptom tracker.",
                "",
                f"What they wrote: {snippet}",
            ]
            + (
                [
                    "",
                    f"Assistant urgency hint (informational only): {str(urgency_label).strip()}",
                ]
                if urgency_label and str(urgency_label).strip()
                else []
            )
        )

        cutoff = datetime.utcnow() - timedelta(seconds=90)
        for did in doctor_ids:
            recent = PortalNotification.query.filter(
                PortalNotification.recipient_user_id == did,
                PortalNotification.notification_type == "symptom_tracker",
                PortalNotification.patient_user_id == patient_user_id,
                PortalNotification.created_at >= cutoff,
            ).first()
            if recent:
                continue
            db.session.add(
                PortalNotification(
                    recipient_user_id=did,
                    notification_type="symptom_tracker",
                    title=title,
                    body=body_plain,
                    patient_user_id=patient_user_id,
                )
            )
        db.session.commit()
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        try:
            from flask import current_app

            current_app.logger.warning("symptom_tracker notify doctors: %s", e)
        except Exception:
            pass


def notify_assigned_doctors_patient_report_uploaded(
    patient_user_id: str,
    *,
    report_id: str,
    report_title: str,
    report_type: str,
    original_filename: str = "",
    has_file_attachment: bool = True,
) -> None:
    """
    Notify each assigned doctor when a patient creates/uploads a medical report.
    Never raises.
    """
    try:
        patient = User.query.filter_by(id=patient_user_id, role="patient").first()
        if not patient:
            return
        prof = PatientProfile.query.filter_by(user_id=patient_user_id).first()
        pname = _patient_display_name(patient, prof)
        doctor_ids = _assigned_doctor_user_ids(patient_user_id)
        if not doctor_ids:
            return

        title = f"New report — {pname}"
        lines = [
            f"Patient {pname} added a medical report in the portal.",
            "",
            f"Title: {(report_title or 'Untitled').strip()[:300]}",
            f"Type: {(report_type or 'other').strip()[:40]}",
        ]
        if has_file_attachment and (original_filename or "").strip():
            lines.append(f"File: {original_filename.strip()[:400]}")
        elif not has_file_attachment:
            lines.append("Format: text entry (no file attachment).")
        lines.extend(["", f"Report ID: {report_id}"])
        body_plain = "\n".join(lines)

        for did in doctor_ids:
            db.session.add(
                PortalNotification(
                    recipient_user_id=did,
                    notification_type="patient_report",
                    title=title,
                    body=body_plain,
                    patient_user_id=patient_user_id,
                )
            )
        db.session.commit()
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass


def notify_patient_doctor_profile_update(
    patient_user_id: str,
    *,
    doctor_user_id: str,
    change_type: str,
    details: str = "",
) -> None:
    """
    Notify patient when their assigned doctor updates portal-managed profile data.
    Examples: medications or care plan updates.
    Never raises.
    """
    try:
        patient = User.query.filter_by(id=patient_user_id, role="patient").first()
        doctor = User.query.filter_by(id=doctor_user_id, role="doctor").first()
        if not patient or not doctor:
            return
        dname = f"{doctor.first_name or ''} {doctor.last_name or ''}".strip() or (doctor.email or "Your doctor")
        ctype = (change_type or "").strip().lower() or "profile"
        title_map = {
            "medications": "Medication list updated",
            "care_plan": "Care plan updated",
            "profile": "Profile updated",
        }
        title = title_map.get(ctype, "Profile updated")
        body_lines = [f"{dname} updated your {ctype.replace('_', ' ')} in MedAssist."]
        if details.strip():
            body_lines.extend(["", details.strip()[:500]])
        db.session.add(
            PortalNotification(
                recipient_user_id=patient_user_id,
                notification_type="doctor_profile_update",
                title=title,
                body="\n".join(body_lines),
                patient_user_id=patient_user_id,
            )
        )
        db.session.commit()
    except Exception as e:
        try:
            db.session.rollback()
        except Exception:
            pass
        try:
            from flask import current_app

            current_app.logger.warning("notify patient doctor profile update: %s", e)
        except Exception:
            pass
        try:
            from flask import current_app

            current_app.logger.warning("patient_report notify doctors: %s", e)
        except Exception:
            pass
