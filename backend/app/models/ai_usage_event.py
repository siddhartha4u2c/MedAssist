from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class AiUsageEvent(db.Model):
    """One row per LLM / embedding API call for admin analytics."""

    __tablename__ = "ai_usage_events"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    operation = db.Column(db.String(24), nullable=False, index=True)
    # chat | chat_vision | embedding
    source = db.Column(db.String(80), nullable=False, default="", index=True)
    model = db.Column(db.String(120), nullable=False, default="", index=True)

    prompt_tokens = db.Column(db.Integer, nullable=True)
    completion_tokens = db.Column(db.Integer, nullable=True)
    total_tokens = db.Column(db.Integer, nullable=True)

    latency_ms = db.Column(db.Integer, nullable=True)
    success = db.Column(db.Boolean, nullable=False, default=True, index=True)
    error_summary = db.Column(db.String(512), nullable=True)

    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
