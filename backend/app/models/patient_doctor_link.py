from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class PatientDoctorLink(db.Model):
    """Many-to-many: a patient may be linked to multiple portal doctors."""

    __tablename__ = "patient_doctor_links"
    __table_args__ = (
        db.UniqueConstraint(
            "patient_user_id", "doctor_user_id", name="uq_patient_doctor_link"
        ),
    )

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    doctor_user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
