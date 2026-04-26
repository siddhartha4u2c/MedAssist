"""Shared email normalization for API layers — avoids email_validator user-facing messages."""

from __future__ import annotations

import re

_EMAIL_RE = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r"(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$"
)


def normalize_email_address(raw: str) -> str:
    """
    Normalize and validate email for login/register/leads.
    Raises ValueError with short codes/messages only (never third-party validator text).
    """
    s = (raw or "").strip()
    if not s:
        raise ValueError("empty")
    if len(s) > 254:
        raise ValueError("Invalid email format.")
    if not _EMAIL_RE.match(s):
        raise ValueError("Invalid email format.")
    return s.lower()
