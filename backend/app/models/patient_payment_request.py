from __future__ import annotations

import uuid
from datetime import date, datetime

from app.extensions import db


class PatientPaymentRequest(db.Model):
    """Patient-submitted billing / payment request pending admin approval."""

    __tablename__ = "patient_payment_requests"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    treatment_type = db.Column(db.String(40), nullable=False)
    payment_mode = db.Column(db.String(120), nullable=False)
    payment_on = db.Column(db.Date, nullable=False)
    valid_until = db.Column(db.Date, nullable=False)

    status = db.Column(
        db.String(20), nullable=False, default="pending"
    )  # pending, approved, rejected

    original_filename = db.Column(db.String(400), nullable=True)
    stored_relative_path = db.Column(db.String(500), nullable=True)
    mime_type = db.Column(db.String(120), nullable=True)
    file_size_bytes = db.Column(db.BigInteger, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    reviewed_by_user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
