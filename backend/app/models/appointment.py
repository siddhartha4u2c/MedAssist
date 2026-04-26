from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class Appointment(db.Model):
    """Scheduled visit between a patient user and a doctor user (in person or telemedicine)."""

    __tablename__ = "appointments"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    doctor_user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    mode = db.Column(db.String(20), nullable=False)  # telemedicine | in_person
    starts_at = db.Column(db.DateTime, nullable=False, index=True)
    ends_at = db.Column(db.DateTime, nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="scheduled")  # scheduled | cancelled
    reason = db.Column(db.Text, nullable=True)
    cancellation_reason = db.Column(db.Text, nullable=True)
    video_room_id = db.Column(db.String(500), nullable=True)
    video_join_url = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
