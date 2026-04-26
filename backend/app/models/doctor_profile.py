from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class DoctorProfile(db.Model):
    """Extended profile for users with role `doctor` (portal directory + symptom agent)."""

    __tablename__ = "doctor_profiles"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    specialization = db.Column(db.String(200), nullable=False, default="General practice")
    department = db.Column(db.String(200), nullable=True)
    hospital_affiliation = db.Column(db.String(300), nullable=True)
    years_experience = db.Column(db.Integer, nullable=True)
    consultation_fee = db.Column(db.Float, nullable=True)
    bio = db.Column(db.Text, nullable=True)
    available_for_telemedicine = db.Column(db.Boolean, default=True, nullable=False)

    academic_records = db.Column(db.Text, nullable=True)
    professional_experience = db.Column(db.Text, nullable=True)
    achievements = db.Column(db.Text, nullable=True)
    photo_data_url = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
