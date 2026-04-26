"""Patient medication list storage (PatientProfile.current_medications).

Used by the doctor API and can be called from in-process automation (e.g. AI agent tools).
Patients cannot edit this field via the patient profile API — it is preserved server-side.
"""

from __future__ import annotations

from app.extensions import db
from app.models.patient_profile import PatientProfile

MAX_MEDICATIONS_STORAGE_CHARS = 500_000


def apply_medications_to_profile(p: PatientProfile, current_medications: str | None) -> None:
    """Persist medications on an existing PatientProfile row (caller commits or uses this with flush)."""
    raw = (current_medications or "").strip()
    if len(raw) > MAX_MEDICATIONS_STORAGE_CHARS:
        raise ValueError("Medications data is too large.")
    p.current_medications = raw or None


def set_patient_medications(patient_user_id: str, current_medications: str | None) -> PatientProfile | None:
    """Persist the medications blob by patient user id. Returns None if no profile row."""
    p = PatientProfile.query.filter_by(user_id=patient_user_id).first()
    if not p:
        return None
    apply_medications_to_profile(p, current_medications)
    db.session.commit()
    return p
