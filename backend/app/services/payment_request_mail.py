from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.models.patient_payment_request import PatientPaymentRequest
from app.models.user import User
from app.services.mail_service import send_email

if TYPE_CHECKING:
    from app.config import Config

log = logging.getLogger(__name__)


def _admin_recipient_emails() -> list[str]:
    rows = User.query.filter_by(role="admin", is_verified=True).all()
    out: list[str] = []
    for u in rows:
        e = (u.email or "").strip().lower()
        if e and e not in out:
            out.append(e)
    return out


def _patient_display(patient: User) -> str:
    n = f"{patient.first_name or ''} {patient.last_name or ''}".strip()
    return n or (patient.email or "Patient")


def notify_admins_new_payment_request(cfg: "Config", row: PatientPaymentRequest, patient: User) -> None:
    admins = _admin_recipient_emails()
    if not admins:
        log.warning("No verified admin emails — skipping payment request admin notification.")
        return
    pn = _patient_display(patient)
    subj = f"MedAssist: New payment request from {pn}"
    body = (
        f"A patient submitted a payment request.\n\n"
        f"Patient: {pn} ({patient.email})\n"
        f"Request ID: {row.id}\n"
        f"Amount: {row.amount}\n"
        f"Treatment: {row.treatment_type}\n"
        f"Payment mode: {row.payment_mode}\n"
        f"Payment date: {row.payment_on}\n"
        f"Valid until: {row.valid_until}\n"
        f"Proof attached: {'yes' if row.stored_relative_path else 'no'}\n\n"
        f"Open the admin dashboard to review and approve.\n"
    )
    for to in admins:
        try:
            send_email(cfg, to_email=to, subject=subj, body_text=body)
        except Exception as ex:  # noqa: BLE001
            log.exception("Failed to email admin %s about payment request: %s", to, ex)


def notify_patient_payment_rejected(cfg: "Config", row: PatientPaymentRequest, patient: User) -> None:
    to = (patient.email or "").strip()
    if not to:
        return
    subj = "MedAssist: Your payment request was not approved"
    body = (
        f"Hello {_patient_display(patient)},\n\n"
        f"Your payment request ({row.id[:8]}…) was not approved.\n\n"
        f"Amount: {row.amount}\n"
        f"Treatment: {row.treatment_type}\n"
        f"Payment mode: {row.payment_mode}\n\n"
        f"If you have questions, contact your care team or organisation administrator.\n"
        f"You can review the status under Billing details in your patient portal.\n"
    )
    try:
        send_email(cfg, to_email=to, subject=subj, body_text=body)
    except Exception as ex:  # noqa: BLE001
        log.exception("Failed to email patient about rejected payment request: %s", ex)


def notify_patient_payment_approved(cfg: "Config", row: PatientPaymentRequest, patient: User) -> None:
    to = (patient.email or "").strip()
    if not to:
        return
    subj = "MedAssist: Your payment request was approved"
    body = (
        f"Hello {_patient_display(patient)},\n\n"
        f"Your payment request ({row.id[:8]}…) has been approved.\n\n"
        f"Amount: {row.amount}\n"
        f"Treatment: {row.treatment_type}\n"
        f"Payment mode: {row.payment_mode}\n\n"
        f"You can review the status under Billing details in your patient portal.\n"
    )
    try:
        send_email(cfg, to_email=to, subject=subj, body_text=body)
    except Exception as ex:  # noqa: BLE001
        log.exception("Failed to email patient about approved payment request: %s", ex)
