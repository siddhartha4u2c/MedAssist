from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.extensions import db


class PatientVitalReading(db.Model):
    """Time-stamped vitals entries for a patient user (history)."""

    __tablename__ = "patient_vital_readings"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    bp_systolic = db.Column(db.Integer, nullable=True)
    bp_diastolic = db.Column(db.Integer, nullable=True)
    fasting_glucose_mg_dl = db.Column(db.Float, nullable=True)
    pp_glucose_mg_dl = db.Column(db.Float, nullable=True)
    heart_rate = db.Column(db.Integer, nullable=True)
    respiratory_rate = db.Column(db.Integer, nullable=True)
    spo2 = db.Column(db.Float, nullable=True)
    temperature_c = db.Column(db.Float, nullable=True)
    weight_kg = db.Column(db.Float, nullable=True)
    notes = db.Column(db.Text, nullable=True)

    recorded_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
