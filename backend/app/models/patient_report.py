from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class PatientReport(db.Model):
    """Patient-uploaded report file + optional text summary + AI analysis (Report Reader agent)."""

    __tablename__ = "patient_reports"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_user_id = db.Column(
        db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = db.Column(db.String(300), nullable=False)
    summary = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # File attachment (optional for legacy text-only rows)
    original_filename = db.Column(db.String(400), nullable=True)
    stored_relative_path = db.Column(db.String(500), nullable=True)
    mime_type = db.Column(db.String(120), nullable=True)
    file_size_bytes = db.Column(db.BigInteger, nullable=True)
    report_type = db.Column(
        db.String(40), nullable=False, default="other"
    )  # lab, imaging, radiology, pathology, other

    ai_analysis_status = db.Column(
        db.String(20), nullable=False, default="none"
    )  # none, pending, processing, completed, failed
    ai_analysis_json = db.Column(db.JSON, nullable=True)
    ai_error = db.Column(db.Text, nullable=True)
    analyzed_at = db.Column(db.DateTime, nullable=True)
