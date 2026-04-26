from __future__ import annotations

import jwt
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import BytesIO

from flask import Blueprint, current_app, jsonify, request, send_file

from app.config import Config
from app.extensions import db
from app.models.patient_payment_request import PatientPaymentRequest
from app.models.user import User
from app.services.payment_proof_storage import payment_proof_root, save_payment_proof_file
from app.services.payment_request_mail import notify_admins_new_payment_request
from app.services.payment_request_receipt import payment_request_approved_receipt_pdf_bytes
from app.utils.jwt_tokens import decode_access_token

bp = Blueprint(
    "patient_payment_requests_v1",
    __name__,
    url_prefix="/api/v1/patient",
)

TREATMENT_TYPES = frozenset(
    {
        "consultation",
        "diagnosis",
        "medical_tests",
        "surgery",
        "others",
    }
)


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


def _require_patient_role(claims: dict) -> tuple[str | None, tuple | None]:
    if str(claims.get("role") or "") != "patient":
        return None, (jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403)
    user_id = str(claims.get("sub") or "")
    if not user_id:
        return None, (jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401)
    return user_id, None


def _parse_date(value: object) -> date | None:
    s = str(value or "").strip()
    if not s:
        return None
    head = s.split("T", 1)[0].strip()
    try:
        y, m, d = head.split("-", 2)
        return date(int(y), int(m), int(d))
    except (ValueError, TypeError):
        return None


def _patient_display_name(user: User | None) -> str:
    if not user:
        return "Patient"
    fn = (user.first_name or "").strip()
    ln = (user.last_name or "").strip()
    name = f"{fn} {ln}".strip()
    return name or (user.email or "Patient")


def _fmt_date_pdf(d: date | None) -> str:
    if not d:
        return "-"
    return d.isoformat()


def _fmt_dt_pdf(dt: datetime | None) -> str:
    if not dt:
        return ""
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.isoformat()


def _row_to_json(row: PatientPaymentRequest) -> dict:
    po = row.payment_on.isoformat() if row.payment_on else ""
    vu = row.valid_until.isoformat() if row.valid_until else ""
    ra = row.reviewed_at
    ra_iso = ""
    if ra is not None:
        ra_iso = ra.replace(tzinfo=None).isoformat() + "Z" if ra.tzinfo is None else ra.isoformat()
    return {
        "id": row.id,
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


def _form_or_json() -> dict[str, str]:
    """Normalize multipart form or JSON body to string fields."""
    ct = (request.content_type or "").lower()
    if "multipart/form-data" in ct:
        return {
            "amount": (request.form.get("amount") or "").strip(),
            "treatmentType": (request.form.get("treatmentType") or request.form.get("treatment") or "").strip(),
            "paymentMode": (request.form.get("paymentMode") or "").strip(),
            "paymentDate": (request.form.get("paymentDate") or request.form.get("paymentOn") or "").strip(),
            "validTill": (request.form.get("validTill") or request.form.get("validUntil") or "").strip(),
        }
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return {}
    return {
        "amount": str(body.get("amount", "")).strip(),
        "treatmentType": str(
            body.get("treatmentType") or body.get("treatment", "")
        ).strip(),
        "paymentMode": str(body.get("paymentMode", "")).strip(),
        "paymentDate": str(
            body.get("paymentDate") or body.get("paymentOn", "")
        ).strip(),
        "validTill": str(body.get("validTill") or body.get("validUntil", "")).strip(),
    }


@bp.get("/payment-requests")
def list_payment_requests():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    rows = (
        PatientPaymentRequest.query.filter_by(patient_user_id=user_id)
        .order_by(PatientPaymentRequest.created_at.desc())
        .all()
    )
    return jsonify({"requests": [_row_to_json(r) for r in rows]}), 200


@bp.post("/payment-requests")
def create_payment_request():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    fields = _form_or_json()
    try:
        amt = Decimal(fields["amount"])
    except (InvalidOperation, KeyError):
        return jsonify({"error": "Invalid amount."}), 400
    if amt <= 0:
        return jsonify({"error": "Amount must be greater than zero."}), 400

    treatment = (
        fields["treatmentType"].lower().replace("-", "_").replace(" ", "_")
    )
    if treatment not in TREATMENT_TYPES:
        return (
            jsonify(
                {
                    "error": "Invalid treatment type. Choose consultation, diagnosis, "
                    "medical_tests, surgery, or others."
                }
            ),
            400,
        )

    mode = fields["paymentMode"].strip()
    if not mode or len(mode) > 120:
        return jsonify({"error": "Payment mode is required (max 120 characters)."}), 400

    payment_on = _parse_date(fields["paymentDate"])
    valid_until = _parse_date(fields["validTill"])
    if not payment_on or not valid_until:
        return jsonify({"error": "paymentDate and validTill must be valid dates (YYYY-MM-DD)."}), 400
    if valid_until < payment_on:
        return jsonify({"error": "Valid until must be on or after payment date."}), 400

    proof = None
    if request.files:
        proof = request.files.get("proof") or request.files.get("attachment")
    rel = None
    orig_fn = None
    mime = None
    fsize = None
    if proof and proof.filename:
        try:
            cfg = _cfg()
            rel, orig_fn, mime, fsize = save_payment_proof_file(cfg, user_id, proof)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    row = PatientPaymentRequest(
        patient_user_id=user_id,
        amount=amt,
        treatment_type=treatment,
        payment_mode=mode,
        payment_on=payment_on,
        valid_until=valid_until,
        status="pending",
        original_filename=orig_fn,
        stored_relative_path=rel,
        mime_type=mime,
        file_size_bytes=fsize,
    )
    db.session.add(row)
    db.session.commit()

    patient = User.query.filter_by(id=user_id).first()
    if patient:
        try:
            notify_admins_new_payment_request(_cfg(), row, patient)
        except Exception:
            current_app.logger.exception("notify_admins_new_payment_request failed")

    return jsonify({"request": _row_to_json(row), "message": "Payment request submitted."}), 201


@bp.get("/payment-requests/<request_id>/proof")
def download_proof(request_id: str):
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401

    rid = (request_id or "").strip()
    if not rid:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404

    row = PatientPaymentRequest.query.filter_by(id=rid).first()
    if not row or not row.stored_relative_path:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404

    role = str(claims.get("role") or "")
    uid = str(claims.get("sub") or "")
    if role == "patient":
        if uid != row.patient_user_id:
            return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    elif role == "admin":
        pass
    else:
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403

    cfg = _cfg()
    root = payment_proof_root(cfg).resolve()
    try:
        full = (root / row.stored_relative_path).resolve()
        full.relative_to(root)
    except ValueError:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404

    if not full.is_file():
        return jsonify({"error": "File missing.", "code": "NOT_FOUND"}), 404

    dl = row.original_filename or "payment-proof"
    return send_file(
        str(full),
        mimetype=row.mime_type or "application/octet-stream",
        as_attachment=True,
        download_name=dl,
    )


@bp.get("/payment-requests/<request_id>/receipt.pdf")
def download_receipt_pdf(request_id: str):
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    user_id, err = _require_patient_role(claims)
    if err:
        return err[0], err[1]

    rid = (request_id or "").strip()
    if not rid:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404

    row = PatientPaymentRequest.query.filter_by(id=rid, patient_user_id=user_id).first()
    if not row:
        return jsonify({"error": "Not found.", "code": "NOT_FOUND"}), 404
    if row.status != "approved":
        return (
            jsonify(
                {
                    "error": "Receipt is only available for approved requests.",
                    "code": "NOT_APPROVED",
                }
            ),
            403,
        )

    patient = User.query.filter_by(id=user_id).first()
    display = _patient_display_name(patient)
    pdf_bytes = payment_request_approved_receipt_pdf_bytes(
        patient_display=display,
        amount=str(row.amount),
        treatment_type=row.treatment_type,
        payment_mode=row.payment_mode,
        payment_on=_fmt_date_pdf(row.payment_on),
        valid_until=_fmt_date_pdf(row.valid_until),
        created_at=_fmt_dt_pdf(row.created_at),
        reviewed_at=_fmt_dt_pdf(row.reviewed_at) if row.reviewed_at else "",
        request_id=row.id,
    )
    bio = BytesIO(pdf_bytes)
    bio.seek(0)
    return send_file(
        bio,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"medassist-payment-receipt-{rid[:8]}.pdf",
    )
