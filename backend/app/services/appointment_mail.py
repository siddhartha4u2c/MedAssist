from __future__ import annotations

import html
import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from app.models.appointment import Appointment
from app.models.user import User
from app.services.mail_service import send_email

if TYPE_CHECKING:
    from app.config import Config

log = logging.getLogger(__name__)
IST = timezone(timedelta(hours=5, minutes=30), name="IST")


def _name(u: User) -> str:
    n = f"{u.first_name or ''} {u.last_name or ''}".strip()
    return n or (u.email or "there")


def _to_ist(dt_utc_naive: datetime) -> datetime:
    """Stored appointment datetimes are UTC-naive; render all appointment mails in IST."""
    return dt_utc_naive.replace(tzinfo=timezone.utc).astimezone(IST)


def _fmt_window(a: Appointment) -> str:
    s_ist = _to_ist(a.starts_at)
    e_ist = _to_ist(a.ends_at)
    s = s_ist.strftime("%Y-%m-%d %H:%M IST")
    e = e_ist.strftime("%H:%M IST")
    return f"{s} – {e}"


def _fmt_when_long_ist(starts_at: datetime) -> str:
    """e.g. Monday, April 13, 2026 at 09:30 AM IST"""
    dt_ist = _to_ist(starts_at)
    wd = dt_ist.strftime("%A")
    mon = dt_ist.strftime("%B")
    y = dt_ist.year
    d = dt_ist.day
    h24 = dt_ist.hour
    h12 = h24 % 12
    if h12 == 0:
        h12 = 12
    ampm = "AM" if h24 < 12 else "PM"
    clock = f"{h12:02d}:{dt_ist.minute:02d} {ampm}"
    return f"{wd}, {mon} {d}, {y} at {clock} IST"


def _appt_duration_minutes(appt: Appointment) -> int:
    secs = int((appt.ends_at - appt.starts_at).total_seconds())
    if secs <= 0:
        return 0
    return max(1, secs // 60)


def _duration_phrase(mins: int) -> str:
    if mins == 1:
        return "1 minute"
    return f"{mins} minutes"


def _type_label(mode: str) -> str:
    return "Telemedicine" if mode == "telemedicine" else "In Person"


def _provider_line_doctor(doctor: User) -> str:
    """Display name for the clinician row in patient-facing mail."""
    n = _name(doctor)
    if not n:
        return "Your care team"
    low = n.lower()
    if low.startswith("dr.") or low.startswith("dr "):
        return n
    if (doctor.role or "").strip().lower() == "doctor":
        return f"Dr. {n}"
    return n


def _core_details_plain(
    *,
    role_line_key: str,
    role_line_value: str,
    when_line: str,
    type_line: str,
    duration_line: str,
) -> str:
    return (
        "Your appointment is confirmed.\n\n"
        f"{role_line_key}: {role_line_value}\n"
        f"When: {when_line}\n"
        f"Type: {type_line}\n"
        f"Duration: {duration_line}\n"
    )


def _core_details_html(
    *,
    role_line_key: str,
    role_line_value: str,
    when_line: str,
    type_line: str,
    duration_line: str,
) -> str:
    rk = html.escape(role_line_key, quote=False)
    rv = html.escape(role_line_value, quote=False)
    w = html.escape(when_line, quote=False)
    t = html.escape(type_line, quote=False)
    du = html.escape(duration_line, quote=False)
    return (
        "<p>Your appointment is confirmed.</p>"
        f"<p style=\"margin:12px 0 0 0;\"><strong>{rk}:</strong> {rv}<br/>"
        f"<strong>When:</strong> {w}<br/>"
        f"<strong>Type:</strong> {t}<br/>"
        f"<strong>Duration:</strong> {du}</p>"
    )


def send_appointment_booking_confirmations(
    cfg: "Config", appt: Appointment, patient: User, doctor: User
) -> None:
    """Notify patient and doctor when any visit (telemedicine or in person) is scheduled."""
    when_line = _fmt_when_long_ist(appt.starts_at)
    type_line = _type_label(appt.mode or "")
    duration_line = _duration_phrase(_appt_duration_minutes(appt))
    reason_line = (appt.reason or "").strip()
    reason_block = f"\nReason / notes: {reason_line}\n" if reason_line else ""

    vid = ""
    if (appt.mode or "") == "telemedicine":
        vid = (getattr(appt, "video_join_url", None) or "").strip()
    video_block_pt = ""
    video_block_dr = ""
    if (appt.mode or "") == "telemedicine":
        video_block_pt = (
            f"\nJoin link (when available): {vid}\n" if vid else "\nA video join link will be sent when your clinic enables it.\n"
        )
        video_block_dr = (
            f"\nJoin link (when available): {vid}\n" if vid else "\nA video join link will appear in the portal when configured.\n"
        )

    pt_name = _name(patient)
    dr_name = _name(doctor)
    provider_disp = _provider_line_doctor(doctor)
    appt_id_esc = html.escape(appt.id, quote=False)

    core_plain_pt = _core_details_plain(
        role_line_key="Provider",
        role_line_value=provider_disp,
        when_line=when_line,
        type_line=type_line,
        duration_line=duration_line,
    )
    core_html_pt = _core_details_html(
        role_line_key="Provider",
        role_line_value=provider_disp,
        when_line=when_line,
        type_line=type_line,
        duration_line=duration_line,
    )

    core_plain_dr = _core_details_plain(
        role_line_key="Patient",
        role_line_value=pt_name,
        when_line=when_line,
        type_line=type_line,
        duration_line=duration_line,
    )
    core_html_dr = _core_details_html(
        role_line_key="Patient",
        role_line_value=pt_name,
        when_line=when_line,
        type_line=type_line,
        duration_line=duration_line,
    )

    subj_pt = "Your appointment is confirmed — MedAssist"
    text_pt = (
        f"Hello {pt_name},\n\n"
        f"{core_plain_pt}\n"
        f"Appointment ID: {appt.id}\n"
        f"{reason_block}"
        f"{video_block_pt}"
        "If you did not book this, contact support immediately.\n\n"
        "— MedAssist\n"
    )
    html_pt = (
        f"<p>Hello {html.escape(pt_name)},</p>"
        f"{core_html_pt}"
        f"<p><strong>Appointment ID:</strong> {appt_id_esc}</p>"
    )
    if reason_line:
        html_pt += f"<p><strong>Reason / notes:</strong> {html.escape(reason_line)}</p>"
    if vid:
        html_pt += f'<p><a href="{html.escape(vid, quote=True)}">Join video visit</a></p>'
    html_pt += "<p>— MedAssist</p>"

    subj_dr = "Appointment confirmed — MedAssist"
    text_dr = (
        f"Hello {dr_name},\n\n"
        f"{core_plain_dr}\n"
        f"Appointment ID: {appt.id}\n"
        f"{reason_block}"
        f"{video_block_dr}"
        "— MedAssist\n"
    )
    html_dr = (
        f"<p>Hello {html.escape(dr_name)},</p>"
        f"{core_html_dr}"
        f"<p><strong>Appointment ID:</strong> {appt_id_esc}</p>"
    )
    if reason_line:
        html_dr += f"<p><strong>Reason / notes:</strong> {html.escape(reason_line)}</p>"
    if vid:
        html_dr += f'<p><a href="{html.escape(vid, quote=True)}">Join video visit</a></p>'
    html_dr += (
        f"<p style=\"font-size:13px;color:#64748b;\">{html.escape(patient.email or '')}</p>"
        "<p>— MedAssist</p>"
    )

    for to_email, subj, text, h in (
        (patient.email, subj_pt, text_pt, html_pt),
        (doctor.email, subj_dr, text_dr, html_dr),
    ):
        em = (to_email or "").strip()
        if not em:
            log.warning("Appointment confirmation skipped: missing recipient email.")
            continue
        try:
            send_email(cfg, to_email=em, subject=subj, body_text=text, body_html=h)
        except Exception as e:
            log.warning("Appointment confirmation email to %s failed: %s", em, e)


def send_appointment_cancellation_emails(
    cfg: "Config",
    appt: Appointment,
    patient: User,
    doctor: User,
    cancelled_by: User,
    cancellation_reason: str | None,
) -> None:
    """Notify patient and doctor when an appointment is cancelled."""
    window = _fmt_window(appt)
    mode_label = "Telemedicine" if appt.mode == "telemedicine" else "In person"
    appt_id_esc = html.escape(appt.id, quote=False)
    reason_txt = (cancellation_reason or "").strip()
    reason_plain = f"\nCancellation reason: {reason_txt}\n" if reason_txt else ""
    reason_html = (
        f"<p><strong>Cancellation reason:</strong> {html.escape(reason_txt)}</p>" if reason_txt else ""
    )

    pt_name = _name(patient)
    dr_name = _name(doctor)

    # --- Patient email ---
    if cancelled_by.id == patient.id:
        intro_pt = f"You cancelled your {mode_label.lower()} appointment with {dr_name}."
    elif cancelled_by.id == doctor.id:
        intro_pt = f"{dr_name} cancelled your {mode_label.lower()} appointment."
    else:
        intro_pt = f"Your {mode_label.lower()} appointment with {dr_name} was cancelled."

    subj_pt = "Appointment cancelled — MedAssist"
    text_pt = (
        f"Hello {pt_name},\n\n"
        f"{intro_pt}\n\n"
        f"Time was: {window}\n"
        f"Appointment ID: {appt.id}\n"
        f"{reason_plain}\n"
        "— MedAssist\n"
    )
    html_pt = (
        f"<p>Hello {html.escape(pt_name)},</p>"
        f"<p>{html.escape(intro_pt)}</p>"
        f"<p><strong>Scheduled time was:</strong> {html.escape(window)}<br/>"
        f"<strong>Appointment ID:</strong> {appt_id_esc}</p>"
        f"{reason_html}"
        "<p>— MedAssist</p>"
    )

    # --- Doctor email ---
    if cancelled_by.id == doctor.id:
        intro_dr = f"You cancelled your {mode_label.lower()} appointment with patient {pt_name}."
    elif cancelled_by.id == patient.id:
        intro_dr = f"{pt_name} cancelled the {mode_label.lower()} appointment with you."
    else:
        intro_dr = f"The {mode_label.lower()} appointment with {pt_name} was cancelled."

    subj_dr = "Appointment cancelled — MedAssist"
    text_dr = (
        f"Hello {dr_name},\n\n"
        f"{intro_dr}\n\n"
        f"Time was: {window}\n"
        f"Appointment ID: {appt.id}\n"
        f"{reason_plain}\n"
        "— MedAssist\n"
    )
    html_dr = (
        f"<p>Hello {html.escape(dr_name)},</p>"
        f"<p>{html.escape(intro_dr)}</p>"
        f"<p><strong>Scheduled time was:</strong> {html.escape(window)}<br/>"
        f"<strong>Appointment ID:</strong> {appt_id_esc}</p>"
        f"{reason_html}"
        "<p>— MedAssist</p>"
    )

    for to_email, subj, text, h in (
        (patient.email, subj_pt, text_pt, html_pt),
        (doctor.email, subj_dr, text_dr, html_dr),
    ):
        em = (to_email or "").strip()
        if not em:
            log.warning("Cancellation email skipped: missing recipient email.")
            continue
        try:
            send_email(cfg, to_email=em, subject=subj, body_text=text, body_html=h)
        except Exception as e:
            log.warning("Cancellation email to %s failed: %s", em, e)
