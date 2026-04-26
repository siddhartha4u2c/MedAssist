from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class PortalNotification(db.Model):
    """In-app notification for portal users (e.g. doctors when a patient uses symptom tracker)."""

    __tablename__ = "portal_notifications"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    recipient_user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    notification_type = db.Column(db.String(48), nullable=False, default="general", index=True)
    title = db.Column(db.String(400), nullable=False)
    body = db.Column(db.Text, nullable=True)
    patient_user_id = db.Column(db.String(36), nullable=True, index=True)
    read_at = db.Column(db.DateTime, nullable=True)
