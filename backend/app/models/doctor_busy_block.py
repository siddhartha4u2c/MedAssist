"""Doctor-marked busy / unavailable intervals (no patient involved)."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class DoctorBusyBlock(db.Model):
    __tablename__ = "doctor_busy_blocks"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    doctor_user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    starts_at = db.Column(db.DateTime, nullable=False, index=True)
    ends_at = db.Column(db.DateTime, nullable=False, index=True)
    note = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
