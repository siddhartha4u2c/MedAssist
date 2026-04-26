from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class PatientProfile(db.Model):
    __tablename__ = "patient_profiles"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    full_name = db.Column(db.String(200), nullable=False, default="")
    age = db.Column(db.Integer, nullable=True)
    gender = db.Column(db.String(50), nullable=True)
    phone = db.Column(db.String(50), nullable=True)
    emergency_contact = db.Column(db.String(200), nullable=True)
    photo_data_url = db.Column(db.Text, nullable=True)
    height_cm = db.Column(db.Float, nullable=True)
    weight_kg = db.Column(db.Float, nullable=True)
    blood_pressure = db.Column(db.String(30), nullable=True)
    heart_rate = db.Column(db.Integer, nullable=True)
    blood_group = db.Column(db.String(10), nullable=True)
    allergies = db.Column(db.Text, nullable=True)
    chronic_conditions = db.Column(db.Text, nullable=True)
    current_medications = db.Column(db.Text, nullable=True)
    past_surgeries = db.Column(db.Text, nullable=True)
    medical_history = db.Column(db.Text, nullable=True)
    smoking_status = db.Column(db.String(50), nullable=True)
    alcohol_use = db.Column(db.String(50), nullable=True)
    occupation = db.Column(db.String(150), nullable=True)
    insurance_provider = db.Column(db.String(200), nullable=True)
    insurance_policy_no = db.Column(db.String(120), nullable=True)
    primary_doctor = db.Column(db.String(200), nullable=True)
    assigned_doctor_user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    care_plan_text = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
