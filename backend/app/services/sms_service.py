"""Twilio SMS for OTP and notifications."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.config import Config


def _e164(cfg: "Config", digits: str) -> str:
    """digits: national or full digits without +; returns +E.164."""
    d = re.sub(r"\D", "", digits or "")
    cc = (cfg.sms_default_country_code or "91").strip() or "91"
    if len(d) == 10 and cc.isdigit():
        d = cc + d
    if not d:
        raise ValueError("Missing phone digits.")
    return f"+{d}"


def send_sms(cfg: "Config", *, to_digits_or_raw: str, body: str) -> None:
    """
    Send SMS via Twilio. `to_digits_or_raw` is normalized the same way as lead OTP keys.
    """
    if cfg.dev_skip_sms:
        to_e164 = _e164(cfg, to_digits_or_raw)
        print(f"[DEV_SKIP_SMS] To: {to_e164}\n{body}\n")
        return

    if not cfg.twilio_account_sid or not cfg.twilio_auth_token or not cfg.twilio_from_number:
        raise RuntimeError(
            "SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, "
            "TWILIO_PHONE_NUMBER (or TWILIO_FROM_NUMBER), or set DEV_SKIP_SMS=true for console-only."
        )

    to_e164 = _e164(cfg, to_digits_or_raw)

    from twilio.rest import Client

    client = Client(cfg.twilio_account_sid, cfg.twilio_auth_token)
    client.messages.create(
        body=body[:1600],
        from_=cfg.twilio_from_number.strip(),
        to=to_e164,
    )
