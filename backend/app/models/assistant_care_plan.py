from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class AssistantCarePlan(db.Model):
    """Timestamped AI-generated care plans for patient assistant sessions."""

    __tablename__ = "assistant_care_plans"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_text = db.Column(db.Text, nullable=False)
    source = db.Column(db.String(40), nullable=False, default="patient_ai_assistant")
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

