from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class LeadOtp(db.Model):
    """Short-lived OTP for lead capture: normalized email or `sms:<digits>` (DB column legacy name `email`)."""

    __tablename__ = "lead_otps"

    identity_key = db.Column("email", db.String(255), primary_key=True)
    code_hash = db.Column(db.String(128), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class LeadEnquiry(db.Model):
    """Verified prospect enquiry sent to admin."""

    __tablename__ = "lead_enquiries"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(200), nullable=False)
    mobile = db.Column(db.String(40), nullable=False)
    email = db.Column(db.String(255), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
