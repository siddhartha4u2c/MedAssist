from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class AssistantMemoryMessage(db.Model):
    """Persistent AI assistant memory per patient user."""

    __tablename__ = "assistant_memory_messages"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(
        db.String(36),
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = db.Column(db.String(20), nullable=False, index=True)  # "user" | "assistant"
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

