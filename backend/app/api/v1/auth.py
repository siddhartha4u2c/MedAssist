from __future__ import annotations

import html
import secrets
from datetime import datetime, timedelta
from urllib.parse import quote

from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import BadRequest
from werkzeug.security import check_password_hash, generate_password_hash

from app.config import Config
from app.extensions import db
from app.models.user import User
from app.services.mail_service import send_email
from app.utils.email_normalize import normalize_email_address
from app.utils.jwt_tokens import issue_access_token

bp = Blueprint("auth_v1", __name__, url_prefix="/api/v1/auth")

# Patient/doctor registration: admin must approve/reject within this window; after that, pending accounts are auto-rejected.
APPROVAL_WINDOW_HOURS = 24
AUTO_REJECT_EMAIL_REASON = (
    "Your registration was not approved within 24 hours and has been automatically closed. "
    "No reason was cited for this rejection."
)
RESET_HOURS = 1
PASSWORD_MIN = 8
NAME_MAX = 100
REJECTION_REASON_MAX = 4000
ADMIN_APPROVAL_EMAIL = "medassisteuronhealthcare@gmail.com"
ADMIN_DEFAULT_PASSWORD = "Sidd@0376"


def _cfg() -> Config:
    return current_app.config["MEDASSIST_CONFIG"]


def _normalize_email(raw: str) -> str:
    return normalize_email_address(raw)


def _validate_password(pw: str) -> None:
    if len(pw) < PASSWORD_MIN:
        raise ValueError(f"Password must be at least {PASSWORD_MIN} characters.")


def _normalize_name(raw: str, *, label: str) -> str:
    s = (raw or "").strip()
    if not s:
        raise ValueError(f"{label} is required.")
    if len(s) > NAME_MAX:
        raise ValueError(f"{label} must be at most {NAME_MAX} characters.")
    return s


def _err(message: str, code: str, status: int = 400):
    return jsonify({"error": message, "code": code}), status


def _ensure_admin_user() -> None:
    """Ensure default admin account exists and is active."""
    admin = User.query.filter_by(email=ADMIN_APPROVAL_EMAIL).first()
    if admin:
        changed = False
        if admin.role != "admin":
            admin.role = "admin"
            changed = True
        if not admin.is_verified:
            admin.is_verified = True
            changed = True
        if changed:
            db.session.commit()
        return

    admin = User(
        email=ADMIN_APPROVAL_EMAIL,
        first_name="MedAssist",
        last_name="Admin",
        password_hash=generate_password_hash(ADMIN_DEFAULT_PASSWORD),
        role="admin",
        is_verified=True,
    )
    db.session.add(admin)
    db.session.commit()


def _send_admin_approval_email(
    cfg: Config, *, user_email: str, first_name: str, last_name: str, role: str, token: str
) -> None:
    base = cfg.frontend_public_url.rstrip("/")
    token_q = quote(token, safe="")
    approve_url = f"{base}/verify-email?token={token_q}"
    reject_url = f"{base}/reject-registration?token={token_q}"
    safe_approve_href = html.escape(approve_url, quote=True)
    safe_reject_href = html.escape(reject_url, quote=True)
    subject = "MedAssist account approval required"
    full_name = " ".join(p for p in (first_name.strip(), last_name.strip()) if p).strip()
    body = (
        f"A new MedAssist account is waiting for approval.\n\n"
        f"Name: {full_name}\n"
        f"Role: {role}\n"
        f"Email: {user_email}\n\n"
        f"Approve (activates the account):\n{approve_url}\n\n"
        f"Reject (opens a form to enter an optional reason; the applicant will be emailed):\n"
        f"{reject_url}\n\n"
        f"These links expire in {APPROVAL_WINDOW_HOURS} hours. If no decision is made in that time, "
        "the registration will be automatically rejected and the applicant will be notified by email.\n\n"
        "If you did not expect this request, you can ignore this email."
    )
    safe_full_name = html.escape(full_name)
    safe_role = html.escape(role)
    safe_email = html.escape(user_email)
    html_body = f"""
    <p>A new MedAssist account is waiting for approval.</p>
    <ul>
      <li><strong>Name:</strong> {safe_full_name}</li>
      <li><strong>Role:</strong> {safe_role}</li>
      <li><strong>Email:</strong> {safe_email}</li>
    </ul>
    <p><a href="{safe_approve_href}">Approve this account</a> — activates the account.</p>
    <p><a href="{safe_reject_href}">Reject this registration</a> — enter an optional reason; the applicant will be notified.</p>
    <p>These links expire in {APPROVAL_WINDOW_HOURS} hours. If no decision is made in that time, the registration will be
    automatically rejected and the applicant will be notified by email.</p>
    <p>If you did not expect this request, you can ignore this email.</p>
    """
    send_email(
        cfg,
        to_email=ADMIN_APPROVAL_EMAIL,
        subject=subject,
        body_text=body,
        body_html=html_body,
    )


def _send_user_approved_email(cfg: Config, *, to_email: str, first_name: str) -> None:
    subject = "Your MedAssist account is now active"
    login_url = f"{cfg.frontend_public_url.rstrip('/')}/login"
    safe_login_href = html.escape(login_url, quote=True)
    body = (
        f"Hi {first_name},\n\n"
        "Your MedAssist account has been approved and is now active.\n"
        "You can now sign in with your email and password.\n"
        f"Sign in: {login_url}\n\n"
        "If this was not expected, please contact support."
    )
    safe_name = html.escape(first_name)
    html_body = f"""
    <p>Hi {safe_name},</p>
    <p>Your MedAssist account has been approved and is now active.</p>
    <p>You can now <a href="{safe_login_href}">sign in</a> with your email and password.</p>
    <p>If this was not expected, please contact support.</p>
    """
    send_email(cfg, to_email=to_email, subject=subject, body_text=body, body_html=html_body)


def _send_user_rejection_email(
    cfg: Config, *, to_email: str, first_name: str, reason: str
) -> None:
    subject = "MedAssist registration was not approved"
    register_url = f"{cfg.frontend_public_url.rstrip('/')}/register"
    safe_register_href = html.escape(register_url, quote=True)
    reason_text = reason.strip() if reason.strip() else "No reason was provided."
    safe_reason = html.escape(reason_text)
    safe_name = html.escape(first_name)
    body = (
        f"Hi {first_name},\n\n"
        "Your MedAssist registration was not approved. Your account request has been removed.\n\n"
        f"Reason:\n{reason_text}\n\n"
        f"You may register again if you wish: {register_url}\n\n"
        "If you have questions, please contact support."
    )
    html_body = f"""
    <p>Hi {safe_name},</p>
    <p>Your MedAssist registration was not approved. Your account request has been removed.</p>
    <p><strong>Reason:</strong></p>
    <p style="white-space:pre-wrap">{safe_reason}</p>
    <p>You may <a href="{safe_register_href}">register again</a> if you wish.</p>
    <p>If you have questions, please contact support.</p>
    """
    send_email(cfg, to_email=to_email, subject=subject, body_text=body, body_html=html_body)


def _maybe_auto_reject_patient_doctor(user: User) -> bool:
    """After APPROVAL_WINDOW_HOURS without admin approval, remove pending patient/doctor and email rejection."""
    if user.role not in ("patient", "doctor"):
        return False
    if user.is_verified:
        return False
    if not user.created_at:
        return False
    deadline = user.created_at + timedelta(hours=APPROVAL_WINDOW_HOURS)
    if datetime.utcnow() < deadline:
        return False

    cfg = _cfg()
    first_name = user.first_name or "there"
    email_addr = user.email
    uid = user.id
    try:
        _send_user_rejection_email(
            cfg,
            to_email=email_addr,
            first_name=first_name,
            reason=AUTO_REJECT_EMAIL_REASON,
        )
    except Exception:
        return False

    u = db.session.get(User, uid)
    if u is not None:
        db.session.delete(u)
        db.session.commit()
    return True


@bp.post("/register")
def register():
    try:
        data = request.get_json(force=True)
    except BadRequest:
        return _err(
            "The request could not be read. Please refresh the page and try again.",
            "INVALID_JSON",
            400,
        )
    if not isinstance(data, dict):
        return _err(
            "Invalid request format. Please use the registration form on this site.",
            "INVALID_BODY",
            400,
        )

    email_raw = data.get("email", "")
    password = data.get("password", "")
    password_confirm = data.get("password_confirm", data.get("confirm_password", ""))
    role = (data.get("role") or "").strip().lower()
    first_raw = data.get("first_name", "")
    last_raw = data.get("last_name", "")

    if role not in ("patient", "doctor"):
        return _err(
            "Please choose whether you are registering as a patient or a doctor.",
            "ROLE_INVALID",
            400,
        )

    try:
        email = _normalize_email(email_raw)
    except ValueError:
        return _err(
            "Please enter a proper email.",
            "EMAIL_INVALID",
            400,
        )

    first_name = ""
    last_name = ""
    if role == "doctor":
        try:
            first_name = _normalize_name(first_raw, label="First name")
        except ValueError as e:
            return _err(str(e), "FIRST_NAME_REQUIRED", 400)

        last_stripped = (last_raw or "").strip()
        if len(last_stripped) > NAME_MAX:
            return _err(
                f"Last name must be at most {NAME_MAX} characters.",
                "LAST_NAME_TOO_LONG",
                400,
            )
        last_name = last_stripped

    try:
        _validate_password(password)
    except ValueError:
        return _err(
            f"Your password must be at least {PASSWORD_MIN} characters long.",
            "PASSWORD_TOO_SHORT",
            400,
        )

    if password != password_confirm:
        return _err(
            "The password and confirmation fields do not match. Please re-enter them.",
            "PASSWORD_MISMATCH",
            400,
        )

    if User.query.filter_by(email=email).first():
        return _err(
            "User already registered. Sign in or use “Forgot password” if you forgot your password.",
            "USER_EXISTS",
            409,
        )

    cfg = _cfg()
    delivery = "console" if cfg.dev_skip_email else "smtp"
    next_steps: list[str]
    success_message: str
    user: User
    if role == "patient":
        # Patients self-register immediately (no admin approval or registration emails).
        user = User(
            email=email,
            first_name="",
            last_name="",
            password_hash=generate_password_hash(password),
            role=role,
            is_verified=True,
            email_verification_token=None,
            email_verification_expires=None,
        )
        db.session.add(user)
        db.session.commit()
        delivery = None
        success_message = "Registration complete. You can sign in now."
        next_steps = [
            "Your patient account is active immediately.",
            "Sign in with your email and password.",
        ]
    else:
        token = secrets.token_urlsafe(48)
        expires = datetime.utcnow() + timedelta(hours=APPROVAL_WINDOW_HOURS)
        user = User(
            email=email,
            first_name=first_name,
            last_name=last_name,
            password_hash=generate_password_hash(password),
            role=role,
            is_verified=False,
            email_verification_token=token,
            email_verification_expires=expires,
        )
        db.session.add(user)
        db.session.commit()

        try:
            _send_admin_approval_email(
                cfg,
                user_email=email,
                first_name=first_name,
                last_name=last_name,
                role=role,
                token=token,
            )
        except RuntimeError as e:
            db.session.delete(user)
            db.session.commit()
            return _err(
                str(e),
                "EMAIL_NOT_CONFIGURED",
                503,
            )
        except Exception:
            db.session.delete(user)
            db.session.commit()
            return _err(
                "We could not send the approval request email. Please try again in a few minutes, or contact support if the problem continues.",
                "EMAIL_SEND_FAILED",
                503,
            )

        next_steps = [
            "Your registration request has been sent for approval.",
            "An approval link was emailed to MedAssist admin (approve or reject within 24 hours).",
            "After admin approval, you will receive an email confirming your account is active.",
            "If no decision is made within 24 hours, your registration will be automatically rejected and you will be emailed (no reason will be cited).",
            "Then return here and sign in with your email and password.",
        ]
        success_message = "Your account request was submitted and is pending admin approval."
        if cfg.dev_skip_email:
            success_message = (
                "Your account request was submitted. In development mode the admin approval link is "
                "printed in the Flask server terminal (not emailed)."
            )
            next_steps = [
                "Development mode: no real email was sent. In the terminal where Flask is running, find the line starting with [DEV_SKIP_EMAIL] — it contains the admin approval link.",
                f"Use that link within {APPROVAL_WINDOW_HOURS} hours — it expires after that.",
                "After approval, the user can sign in with email and password.",
                "To receive real emails, set DEV_SKIP_EMAIL=false and configure SMTP in backend/.env, then restart Flask.",
            ]

    payload = {
        "success": True,
        "code": "REGISTRATION_COMPLETE",
        "message": success_message,
        "email": email,
        "next_steps": next_steps,
    }
    if role == "doctor":
        payload["email_delivery"] = delivery
    return jsonify(payload), 201


@bp.get("/resend-verification")
def resend_verification_get():
    """Opening this URL in a browser sends GET; the action requires POST."""
    return (
        jsonify(
            {
                "message": "Use POST with JSON body {\"email\": \"your@address\"}. "
                "In the app, use the Resend activation email button on the login page.",
                "code": "USE_POST",
            }
        ),
        200,
    )


@bp.post("/resend-verification")
def resend_verification():
    """Send a new admin approval link for a pending account (same generic message if unknown email)."""
    data = request.get_json(silent=True) or {}
    try:
        email = _normalize_email(data.get("email", ""))
    except ValueError:
        return jsonify({"error": "Invalid email format.", "code": "EMAIL_INVALID"}), 400

    generic_msg = "If that account exists and is pending approval, we sent a new approval link to admin."
    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"message": generic_msg}), 200
    if user.is_verified:
        return jsonify({"message": "That account is already active. You can sign in."}), 200

    if user.role not in ("patient", "doctor"):
        return jsonify({"message": generic_msg}), 200

    if _maybe_auto_reject_patient_doctor(user):
        return (
            jsonify(
                {
                    "message": (
                        "Your registration was not approved within 24 hours and has been removed. "
                        "Check your email for details."
                    ),
                    "code": "REGISTRATION_AUTO_REJECTED",
                }
            ),
            200,
        )

    token = secrets.token_urlsafe(48)
    expires = datetime.utcnow() + timedelta(hours=APPROVAL_WINDOW_HOURS)
    user.email_verification_token = token
    user.email_verification_expires = expires
    db.session.commit()

    cfg = _cfg()
    first_name = user.first_name or "there"
    last_name = user.last_name or ""
    try:
        _send_admin_approval_email(
            cfg,
            user_email=email,
            first_name=first_name,
            last_name=last_name,
            role=user.role,
            token=token,
        )
    except RuntimeError as e:
        return jsonify({"error": str(e), "code": "EMAIL_NOT_CONFIGURED"}), 503
    except Exception:
        return (
            jsonify(
                {
                    "error": "We could not send the approval request email. Please try again in a few minutes.",
                    "code": "EMAIL_SEND_FAILED",
                }
            ),
            503,
        )

    delivery = "console" if cfg.dev_skip_email else "smtp"
    return (
        jsonify(
            {
                "message": generic_msg,
                "email_delivery": delivery,
            }
        ),
        200,
    )


@bp.post("/reject-registration")
def reject_registration():
    """Admin rejects a pending patient/doctor registration; applicant is emailed and the row is removed."""
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    reason = (data.get("reason") or "").strip()
    if not token:
        return jsonify({"error": "Missing token."}), 400
    if len(reason) > REJECTION_REASON_MAX:
        return _err(
            f"Reason must be at most {REJECTION_REASON_MAX} characters.",
            "REASON_TOO_LONG",
            400,
        )

    user = User.query.filter_by(email_verification_token=token).first()
    if not user:
        return (
            jsonify(
                {
                    "error": (
                        "This rejection link is no longer valid. It may have already been used "
                        "(rejection removes the pending registration), the applicant may have "
                        "registered again with a new link, or the token may not match any pending request."
                    ),
                    "code": "REJECT_LINK_INVALID",
                }
            ),
            400,
        )

    if user.role not in ("patient", "doctor"):
        return jsonify({"error": "This account type cannot be rejected here."}), 400

    if user.is_verified:
        return jsonify({"error": "This account is already active and cannot be rejected."}), 400

    if user.email_verification_expires and user.email_verification_expires < datetime.utcnow():
        return jsonify({"error": "This link has expired."}), 400

    first_name = user.first_name or "there"
    email_addr = user.email
    cfg = _cfg()
    try:
        _send_user_rejection_email(
            cfg, to_email=email_addr, first_name=first_name, reason=reason
        )
    except RuntimeError as e:
        return jsonify({"error": str(e), "code": "EMAIL_NOT_CONFIGURED"}), 503
    except Exception as e:
        return (
            jsonify(
                {
                    "error": f"Could not send rejection email: {e!s}",
                    "code": "EMAIL_SEND_FAILED",
                }
            ),
            503,
        )

    db.session.delete(user)
    db.session.commit()
    return (
        jsonify(
            {
                "message": "Registration rejected and the applicant has been notified.",
            }
        ),
        200,
    )


def _verify_email_with_token(token: str):
    """Admin approval endpoint: clicking token activates the account."""
    if not token:
        return jsonify({"error": "Missing token."}), 400

    user = User.query.filter_by(email_verification_token=token).first()
    if not user:
        return jsonify({"error": "Invalid or expired activation link."}), 400

    if user.is_verified:
        return (
            jsonify(
                {"message": "This account is already active. The user can sign in now."}
            ),
            200,
        )

    if user.email_verification_expires and user.email_verification_expires < datetime.utcnow():
        if user.role in ("patient", "doctor") and not user.is_verified:
            if _maybe_auto_reject_patient_doctor(user):
                return (
                    jsonify(
                        {
                            "message": (
                                "This approval link has expired. Your registration was not approved in time "
                                "and has been closed. Check your email for details."
                            ),
                            "code": "REGISTRATION_AUTO_REJECTED",
                        }
                    ),
                    200,
                )
        return (
            jsonify(
                {
                    "error": (
                        "Approval link has expired. If your account is still pending, try the resend option "
                        "on the login page or register again."
                    )
                }
            ),
            400,
        )

    user.is_verified = True
    user.email_verification_expires = None
    db.session.commit()

    cfg = _cfg()
    try:
        _send_user_approved_email(
            cfg,
            to_email=user.email,
            first_name=user.first_name or "there",
        )
    except Exception:
        # Keep approval successful even if notification email fails.
        pass

    return jsonify({"message": "Account approved and activated successfully."}), 200


@bp.post("/verify-email")
def verify_email():
    """Accept token in JSON body or query string."""
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or request.args.get("token") or "").strip()
    body, code = _verify_email_with_token(token)
    return body, code


@bp.get("/verify-email")
def verify_email_get():
    """Optional GET for clients that only follow links with GET (e.g. some previews)."""
    token = (request.args.get("token") or "").strip()
    body, code = _verify_email_with_token(token)
    return body, code


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    password = data.get("password", "")
    requested_role = (data.get("role") or "").strip().lower()

    try:
        email = _normalize_email(data.get("email", ""))
    except ValueError:
        return jsonify({"error": "Invalid email format.", "code": "EMAIL_INVALID"}), 400

    _ensure_admin_user()
    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid email or password."}), 401

    if requested_role and requested_role in ("patient", "doctor", "admin"):
        if user.role != requested_role:
            return jsonify({"error": "Selected role does not match this account."}), 403

    if getattr(user, "account_removed_at", None) is not None:
        return (
            jsonify(
                {
                    "error": "This account is no longer active.",
                    "code": "account_removed",
                }
            ),
            403,
        )

    if bool(getattr(user, "access_blocked", False)):
        return (
            jsonify(
                {
                    "error": "Access to this account has been suspended.",
                    "code": "access_blocked",
                }
            ),
            403,
        )

    if not user.is_verified:
        if _maybe_auto_reject_patient_doctor(user):
            return (
                jsonify(
                    {
                        "error": (
                            "Your registration was not approved within 24 hours and has been removed. "
                            "Check your email for details."
                        ),
                        "code": "registration_auto_rejected",
                    }
                ),
                403,
            )
        db.session.refresh(user)

    if not user.is_verified:
        return (
            jsonify(
                {
                    "error": "Account pending approval. An admin must approve your registration before you can sign in.",
                    "code": "account_pending_approval",
                }
            ),
            403,
        )

    cfg = _cfg()
    access = issue_access_token(cfg, user.id, user.email, user.role)
    return (
        jsonify(
            {
                "access_token": access,
                "token_type": "Bearer",
                "user": {
                    "id": user.id,
                    "email": user.email,
                    "first_name": user.first_name or "",
                    "last_name": user.last_name or "",
                    "role": user.role,
                },
            }
        ),
        200,
    )


@bp.post("/forgot-password")
def forgot_password():
    data = request.get_json(silent=True) or {}
    try:
        email = _normalize_email(data.get("email", ""))
    except ValueError:
        return jsonify({"error": "Invalid email format.", "code": "EMAIL_INVALID"}), 400

    _ensure_admin_user()
    user = User.query.filter_by(email=email).first()
    generic = {
        "message": "If that email is registered, we sent password reset instructions."
    }

    if not user or not user.is_verified:
        return jsonify(generic), 200

    token = secrets.token_urlsafe(48)
    user.password_reset_token = token
    user.password_reset_expires = datetime.utcnow() + timedelta(hours=RESET_HOURS)
    db.session.commit()

    cfg = _cfg()
    link = f"{cfg.frontend_public_url}/reset-password?token={token}"
    subject = "Reset your MedAssist password"
    body = (
        f"We received a password reset request.\n\n"
        f"Open this link within {RESET_HOURS} hour(s) to choose a new password:\n\n"
        f"{link}\n\n"
        f"If you did not request this, ignore this email."
    )
    html = f"""
    <p>We received a password reset request.</p>
    <p><a href="{link}">Reset your password</a> (link valid for {RESET_HOURS} hour).</p>
    <p>If you did not request this, ignore this email.</p>
    """

    try:
        send_email(cfg, to_email=email, subject=subject, body_text=body, body_html=html)
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": f"Could not send email: {e!s}"}), 503

    return jsonify(generic), 200


@bp.post("/reset-password")
def reset_password():
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    password = data.get("password", "")
    password_confirm = data.get("password_confirm", data.get("confirm_password", ""))

    if not token:
        return jsonify({"error": "Missing token."}), 400

    try:
        _validate_password(password)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    if password != password_confirm:
        return jsonify({"error": "Password and confirmation do not match."}), 400

    user = User.query.filter_by(password_reset_token=token).first()
    if not user:
        return jsonify({"error": "Invalid or expired reset link."}), 400

    if user.password_reset_expires and user.password_reset_expires < datetime.utcnow():
        return jsonify({"error": "Reset link has expired. Request a new one."}), 400

    user.password_hash = generate_password_hash(password)
    user.password_reset_token = None
    user.password_reset_expires = None
    db.session.commit()

    return jsonify({"message": "Password updated. You can sign in with your new password."}), 200
