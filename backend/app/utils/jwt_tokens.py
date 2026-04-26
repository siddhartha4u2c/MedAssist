from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.config import Config


def issue_access_token(cfg: Config, user_id: str, email: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(hours=cfg.jwt_access_hours)
    payload: dict[str, Any] = {
        "sub": user_id,
        "email": email,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, cfg.jwt_secret, algorithm="HS256")


def decode_access_token(cfg: Config, token: str) -> dict[str, Any]:
    return jwt.decode(token, cfg.jwt_secret, algorithms=["HS256"])
