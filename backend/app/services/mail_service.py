from __future__ import annotations

import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.config import Config


def send_email(
    cfg: "Config",
    *,
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> None:
    if cfg.dev_skip_email:
        print(
            f"[DEV_SKIP_EMAIL] To: {to_email}\nSubject: {subject}\n\n{body_text}\n"
        )
        return

    if not cfg.smtp_host or not cfg.mail_from:
        raise RuntimeError(
            "Email is not configured. Set SMTP_HOST (or MAIL_HOST), SMTP_FROM_EMAIL "
            "(or MAIL_FROM), and credentials, or set DEV_SKIP_EMAIL=true for console-only."
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = cfg.mail_from
    msg["To"] = to_email
    msg["Reply-To"] = cfg.mail_from
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8"))

    ctx = ssl.create_default_context()
    recipients = [to_email]

    def _send_on(server: smtplib.SMTP) -> None:
        refused = server.sendmail(cfg.mail_from, recipients, msg.as_string())
        if refused:
            raise RuntimeError(
                f"SMTP server refused recipient(s): {refused!r}. "
                "Check SMTP_FROM_EMAIL matches the authenticated account (e.g. Gmail)."
            )

    if cfg.smtp_use_ssl:
        with smtplib.SMTP_SSL(
            cfg.smtp_host, cfg.smtp_port, context=ctx, timeout=30
        ) as server:
            if cfg.smtp_user and cfg.smtp_password:
                server.login(cfg.smtp_user, cfg.smtp_password)
            _send_on(server)
        return

    with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=30) as server:
        if cfg.smtp_use_tls:
            server.starttls(context=ctx)
        if cfg.smtp_user and cfg.smtp_password:
            server.login(cfg.smtp_user, cfg.smtp_password)
        _send_on(server)
