"""Portal visibility and login eligibility for patient/doctor accounts."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.user import User


def portal_account_active(u: "User") -> bool:
    """User may sign in and use the portal (patient/doctor/admin)."""
    if getattr(u, "account_removed_at", None) is not None:
        return False
    if bool(getattr(u, "access_blocked", False)):
        return False
    return True


def portal_directory_listable(u: "User") -> bool:
    """Show in doctor/patient directories, booking search, and admin assignment lists."""
    if not u.is_verified:
        return False
    if u.role not in ("patient", "doctor"):
        return False
    return portal_account_active(u)
