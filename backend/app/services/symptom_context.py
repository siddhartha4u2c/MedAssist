"""
Assemble portal context for Symptom Analyst Agent (patient profile, vitals, Pinecone RAG, doctors, urgency hint).
"""

from __future__ import annotations

from typing import Any

from app.config import Config
from app.models.doctor_profile import DoctorProfile
from app.models.patient_profile import PatientProfile
from app.models.patient_vital_reading import PatientVitalReading
from app.models.user import User
from app.utils.user_access import portal_directory_listable

# Conservative keyword scan — LLM still does primary reasoning.
_RED_FLAG_PHRASES = (
    "chest pain",
    "crushing pain",
    "can't breathe",
    "cannot breathe",
    "shortness of breath",
    "difficulty breathing",
    "stroke",
    "facial droop",
    "slurred speech",
    "unconscious",
    "passed out",
    "severe bleeding",
    "coughing blood",
    "vomiting blood",
    "vomited blood",
    "blood vomit",
    "bloody vomit",
    "blood in vomit",
    "hematemesis",
    "suicidal",
    "kill myself",
    "worst headache",
    "anaphylaxis",
    "allergic reaction",
    "cannot swallow",
)


def _user_text_from_messages(messages: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        if m.get("role") != "user":
            continue
        c = m.get("content")
        if isinstance(c, str) and c.strip():
            parts.append(c.lower())
    return " ".join(parts)


def build_urgency_hint(messages: list[dict[str, Any]]) -> str:
    blob = _user_text_from_messages(messages)
    if not blob.strip():
        return "Urgency hint: insufficient user text for automated keyword scan."
    hits = [p for p in _RED_FLAG_PHRASES if p in blob]
    if hits:
        return (
            "Urgency hint (rule-based): **elevated** — red-flag phrases detected in the conversation: "
            + ", ".join(f'"{h}"' for h in hits[:8])
            + ". Prefer emergency/urgent-care messaging when clinically appropriate."
        )
    return "Urgency hint (rule-based): no red-flag phrase match in recent user text (still assess clinically)."


def build_patient_profile_block(user_id: str) -> str:
    p = PatientProfile.query.filter_by(user_id=user_id).first()
    if not p:
        return "Patient profile: not completed in the portal."

    lines = [
        "Patient profile (from portal — use for holistic risk and medication/allergy context):",
        f"- Name on file: {p.full_name or '(not set)'}",
        f"- Age: {p.age if p.age is not None else '(not set)'}",
        f"- Gender: {p.gender or '(not set)'}",
        f"- Height (cm): {p.height_cm if p.height_cm is not None else '(not set)'}",
        f"- Weight (kg): {p.weight_kg if p.weight_kg is not None else '(not set)'}",
        f"- Blood pressure (self-reported): {p.blood_pressure or '(not set)'}",
        f"- Resting heart rate (self-reported): {p.heart_rate if p.heart_rate is not None else '(not set)'}",
        f"- Blood group: {p.blood_group or '(not set)'}",
        f"- Allergies: {p.allergies or '(none listed)'}",
        f"- Chronic conditions: {p.chronic_conditions or '(none listed)'}",
        f"- Current medications: {p.current_medications or '(none listed)'}",
        f"- Past surgeries: {(p.past_surgeries or '')[:800] or '(none)'}",
        f"- Medical history notes: {(p.medical_history or '')[:1200] or '(none)'}",
        f"- Smoking: {p.smoking_status or '(not set)'} | Alcohol: {p.alcohol_use or '(not set)'}",
        f"- Occupation: {p.occupation or '(not set)'}",
        f"- Emergency contact: {p.emergency_contact or '(not set)'}",
        f"- Primary care doctor (free text): {p.primary_doctor or '(not set)'}",
    ]
    return "\n".join(lines)


def build_recent_vitals_block(user_id: str, limit: int = 8) -> str:
    rows = (
        PatientVitalReading.query.filter_by(user_id=user_id)
        .order_by(PatientVitalReading.recorded_at.desc())
        .limit(limit)
        .all()
    )
    if not rows:
        return "Recent vitals: no readings stored in the portal."

    lines = ["Recent vitals (newest first; from portal):"]
    for r in rows:
        ra = r.recorded_at.isoformat() if r.recorded_at else ""
        parts = [
            f"recorded_at={ra}",
            f"BP {r.bp_systolic}/{r.bp_diastolic}" if r.bp_systolic or r.bp_diastolic else None,
            f"HR {r.heart_rate}" if r.heart_rate is not None else None,
            f"SpO2 {r.spo2}%" if r.spo2 is not None else None,
            f"Temp C {r.temperature_c}" if r.temperature_c is not None else None,
            f"RR {r.respiratory_rate}" if r.respiratory_rate is not None else None,
            f"glucose fast/pp {r.fasting_glucose_mg_dl}/{r.pp_glucose_mg_dl}"
            if r.fasting_glucose_mg_dl is not None or r.pp_glucose_mg_dl is not None
            else None,
            f"weight_kg {r.weight_kg}" if r.weight_kg is not None else None,
        ]
        line = "; ".join(x for x in parts if x)
        if r.notes:
            line += f" notes={r.notes[:200]}"
        lines.append(f"- {line}")
    return "\n".join(lines)


def build_doctor_directory_block() -> str:
    doctors = (
        User.query.filter_by(role="doctor", is_verified=True)
        .order_by(User.last_name, User.first_name)
        .all()
    )
    if not doctors:
        return "Verified doctors in this portal: none listed yet."

    lines = [
        "Verified doctors available in this portal (recommend by name + specialization when appropriate):"
    ]
    any_listed = False
    for u in doctors:
        if not portal_directory_listable(u):
            continue
        any_listed = True
        dp = DoctorProfile.query.filter_by(user_id=u.id).first()
        name = f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email
        spec = dp.specialization if dp else "Specialization not specified"
        dept = dp.department if dp else None
        hosp = dp.hospital_affiliation if dp else None
        yrs = dp.years_experience if dp else None
        tele = dp.available_for_telemedicine if dp else True
        extra = f"- {name} | specialization: {spec}"
        if dept:
            extra += f" | department: {dept}"
        if hosp:
            extra += f" | affiliation: {hosp}"
        if yrs is not None:
            extra += f" | experience (years): {yrs}"
        ach = (getattr(dp, "achievements", None) or "").strip() if dp else ""
        if ach:
            extra += f" | achievements (brief): {ach[:140].strip()}"
        extra += f" | telemedicine: {'yes' if tele else 'no'}"
        lines.append(extra)
    if not any_listed:
        return (
            "Verified doctors in this portal: none currently listable for booking "
            "(accounts may be inactive). Recommend appropriate specialist type and care setting only."
        )
    lines.append(
        "When the presentation is serious or urgent (or rule-based urgency is elevated), "
        "name a suitable doctor from this list if one matches the needed specialty; "
        "otherwise recommend the appropriate specialist type and urgent/ER care as needed."
    )
    return "\n".join(lines)


def build_symptom_analyst_context(
    cfg: Config,
    *,
    patient_user_id: str | None,
    messages: list[dict[str, Any]],
    include_patient_data: bool,
) -> str:
    from app.services.medical_rag import build_rag_query_text, search_medical_knowledge

    rag_query = build_rag_query_text(messages)
    rag_block = search_medical_knowledge(cfg, query_text=rag_query)

    blocks: list[str] = []
    if include_patient_data and patient_user_id:
        blocks.append(build_patient_profile_block(patient_user_id))
        blocks.append(build_recent_vitals_block(patient_user_id))
    if rag_block:
        blocks.append(rag_block)
    blocks.append(build_doctor_directory_block())
    blocks.append(build_urgency_hint(messages))
    return "\n\n".join(blocks)
