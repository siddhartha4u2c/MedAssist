from __future__ import annotations

import uuid
from datetime import datetime

from app.extensions import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    first_name = db.Column(db.String(100), nullable=False, default="")
    last_name = db.Column(db.String(100), nullable=False, default="")
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # patient | doctor | admin
    is_verified = db.Column(db.Boolean, default=False, nullable=False)

    email_verification_token = db.Column(db.String(128), nullable=True, index=True)
    email_verification_expires = db.Column(db.DateTime, nullable=True)

    password_reset_token = db.Column(db.String(128), nullable=True, index=True)
    password_reset_expires = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Admin user management: block sign-in without deleting history.
    access_blocked = db.Column(db.Boolean, default=False, nullable=False)
    # Profile removed from portal: cannot sign in, hidden from searches; User row kept for FK history.
    account_removed_at = db.Column(db.DateTime, nullable=True)
