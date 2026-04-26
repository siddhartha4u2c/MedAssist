from __future__ import annotations

import jwt
from flask import Blueprint, current_app, jsonify, request

from app.config import Config
from app.extensions import db
from app.models.assistant_care_plan import AssistantCarePlan
from app.integrations.dr7_client import dr7_medical_chat_completion
from app.integrations.openai_client import chat_completion
from app.models.assistant_memory_message import AssistantMemoryMessage
from app.models.patient_profile import PatientProfile
from app.models.user import User
from app.services.symptom_context import build_symptom_analyst_context
from app.utils.jwt_tokens import decode_access_token
from app.utils.user_access import portal_account_active

bp = Blueprint("assistant_chat_v1", __name__, url_prefix="/api/v1")

_MAX_MESSAGES = 30
_MAX_CONTENT = 12_000
_MEMORY_WINDOW = 24
_MAX_CARE_PLAN_TEXT = 12_000


def _cfg() -> Config:
    return current_app.config["MEDASSIST_CONFIG"]


def _claims() -> dict | None:
    auth = (request.headers.get("Authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        return decode_access_token(_cfg(), token)
    except jwt.PyJWTError:
        return None


def _sanitize_messages(raw: object) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    for item in raw[-_MAX_MESSAGES:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role not in ("user", "assistant"):
            continue
        content = item.get("content")
        if not isinstance(content, str):
            continue
        text = content.strip()
        if not text:
            continue
        out.append({"role": role, "content": text[:_MAX_CONTENT]})
    return out


def _assistant_system_prompt(locale: str, clinical_context: str) -> str:
    return (
        "You are MedAssist AI Assistant for patients. "
        "Provide comprehensive, structured, and empathetic medical guidance in plain language. "
        "You are NOT a replacement for a clinician and must avoid definitive diagnosis.\n\n"
        "Critical behavior:\n"
        "1) Always respond in the same language as the patient's latest message. "
        "If uncertain, use locale hint: "
        f"{locale}.\n"
        "2) Be more comprehensive than a quick symptom triage chat: include likely explanations, "
        "risk-aware reasoning, next-step options, self-care guidance, and warning signs.\n"
        "3) If emergency red flags are present (e.g. chest pain, severe breathing difficulty, "
        "stroke signs, severe bleeding, vomiting blood, confusion, loss of consciousness), "
        "clearly advise immediate emergency care.\n"
        "4) Default to INDIA clinical context unless the user explicitly asks for another country: "
        "use India-relevant care pathways, test names commonly used in India, and practical guidance "
        "for Indian settings.\n"
        "5) When discussing medicines, prefer GENERIC names and India-commonly used options; avoid "
        "US-only brand-centric recommendations. Never prescribe exact dosing as a substitute for a clinician.\n"
        "6) Medication safety with profile context: medicines listed in portal/profile are historical or on-record data, "
        "not guaranteed current use. Do NOT assume the patient is currently taking them. Ask one brief confirmation "
        "question before using any listed medicine as an active factor in your reasoning.\n"
        "7) If a specialist consult is needed, recommend suitable doctors from the provided portal doctor list "
        "by name and specialization. If no good match exists, recommend specialist type.\n"
        "8) Keep information actionable and organized with short sections/bullets.\n"
        "9) Do not ask for personally identifying data.\n\n"
        "Helpful response format:\n"
        "- Summary of what you understood\n"
        "- What this could mean (possibilities, not diagnosis)\n"
        "- What to do now (home care + safe monitoring)\n"
        "- When to seek urgent/emergency care\n"
        "- Clarifying questions (if needed)\n\n"
        "Emergency wording: if urgent in India, tell users to call local emergency services (e.g. 112) "
        "or go to the nearest emergency department immediately.\n\n"
        "Portal context (authoritative, may be incomplete):\n"
        f"{clinical_context or '(none)'}"
    )


def _care_plan_system_prompt(locale: str, clinical_context: str) -> str:
    return (
        "You create a practical post-session care plan for a patient after a medical assistant chat. "
        "Use plain language and respond in the same language as the patient's latest message (locale hint: "
        f"{locale}).\n\n"
        "Rules:\n"
        "1) Keep it safe and non-diagnostic. Mention emergency warning signs when relevant.\n"
        "2) Include these sections in order:\n"
        "   - CARE PLAN SUMMARY\n"
        "   - MEDICINES (only if potentially needed; use generic names and include 'confirm with clinician')\n"
        "   - FOOD / HYDRATION\n"
        "   - REST / ACTIVITY\n"
        "   - HOME MONITORING\n"
        "   - WHEN TO SEE A DOCTOR / EMERGENCY\n"
        "3) If profile meds exist, do not assume active use without confirmation.\n"
        "4) Prefer India-oriented pathways/tests and practical local guidance.\n"
        "5) Max 220 words unless high-risk symptoms require extra detail.\n\n"
        "Portal context:\n"
        f"{clinical_context or '(none)'}"
    )


def _latest_user_message(messages: list[dict[str, str]]) -> str:
    for m in reversed(messages):
        if m.get("role") == "user":
            text = str(m.get("content") or "").strip()
            if text:
                return text[:_MAX_CONTENT]
    return ""


def _load_assistant_memory(user_id: str, limit: int = _MEMORY_WINDOW) -> list[dict[str, str]]:
    rows = (
        AssistantMemoryMessage.query.filter_by(user_id=user_id)
        .order_by(AssistantMemoryMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    out: list[dict[str, str]] = []
    for row in reversed(rows):
        r = (row.role or "").strip().lower()
        c = (row.content or "").strip()
        if r not in ("user", "assistant") or not c:
            continue
        out.append({"role": r, "content": c[:_MAX_CONTENT]})
    return out


def _save_memory_pair(user_id: str, user_text: str, assistant_text: str) -> None:
    if not user_text.strip() or not assistant_text.strip():
        return
    db.session.add(
        AssistantMemoryMessage(user_id=user_id, role="user", content=user_text[:_MAX_CONTENT])
    )
    db.session.add(
        AssistantMemoryMessage(user_id=user_id, role="assistant", content=assistant_text[:_MAX_CONTENT])
    )
    db.session.commit()


def _generate_care_plan_text(
    cfg: Config,
    *,
    locale: str,
    user_id: str,
    model_messages: list[dict[str, str]],
    clinical_context: str,
) -> str:
    full = [
        {"role": "system", "content": _care_plan_system_prompt(locale, clinical_context)},
        *model_messages[-10:],
    ]
    if cfg.dr7_api_key:
        out = dr7_medical_chat_completion(
            cfg,
            messages=full,
            temperature=0.25,
            max_tokens=900,
            source="patient_ai_assistant_care_plan",
            user_id=user_id,
        )
    else:
        out = chat_completion(
            model=cfg.llm_model_primary,
            messages=full,
            temperature=0.25,
            max_tokens=900,
            source="patient_ai_assistant_care_plan",
            user_id=user_id,
        )
    return (out or "").strip()[:_MAX_CARE_PLAN_TEXT]


def _store_care_plan(user_id: str, care_plan_text: str) -> None:
    if not care_plan_text.strip():
        return
    db.session.add(
        AssistantCarePlan(
            user_id=user_id,
            plan_text=care_plan_text[:_MAX_CARE_PLAN_TEXT],
            source="patient_ai_assistant",
        )
    )
    profile = PatientProfile.query.filter_by(user_id=user_id).first()
    if profile:
        profile.care_plan_text = care_plan_text[:_MAX_CARE_PLAN_TEXT]
    db.session.commit()


@bp.post("/assistant/chat")
def patient_assistant_chat():
    claims = _claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    if str(claims.get("role") or "") != "patient":
        return jsonify({"error": "Forbidden", "code": "FORBIDDEN"}), 403
    user_id = str(claims.get("sub") or "").strip()
    if not user_id:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401
    u = User.query.filter_by(id=user_id).first()
    if not u or not portal_account_active(u):
        return (
            jsonify(
                {
                    "error": "This account is suspended or no longer active.",
                    "code": "account_inactive",
                }
            ),
            403,
        )

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"error": "Invalid request body.", "code": "BAD_REQUEST"}), 400
    messages = _sanitize_messages(body.get("messages"))
    if not messages:
        return jsonify({"error": "Field `messages` must be a non-empty array.", "code": "VALIDATION_ERROR"}), 400
    latest_user = _latest_user_message(messages)
    if not latest_user:
        return (
            jsonify({"error": "Last message must be from user with non-empty text.", "code": "VALIDATION_ERROR"}),
            400,
        )
    locale = str(body.get("locale", "en")).strip() or "en"

    cfg = _cfg()
    memory_messages = _load_assistant_memory(user_id, limit=_MEMORY_WINDOW)
    model_messages = [*memory_messages, {"role": "user", "content": latest_user}]
    clinical_context = build_symptom_analyst_context(
        cfg,
        patient_user_id=user_id,
        messages=model_messages,
        include_patient_data=True,
    )
    full = [{"role": "system", "content": _assistant_system_prompt(locale, clinical_context)}, *model_messages]
    try:
        if cfg.dr7_api_key:
            reply = dr7_medical_chat_completion(
                cfg,
                messages=full,
                temperature=0.35,
                max_tokens=3000,
                source="patient_ai_assistant",
                user_id=user_id,
            )
        else:
            reply = chat_completion(
                model=cfg.llm_model_primary,
                messages=full,
                temperature=0.35,
                max_tokens=3000,
                source="patient_ai_assistant",
                user_id=user_id,
            )
    except RuntimeError as e:
        return jsonify({"error": str(e), "code": "LLM_UNAVAILABLE"}), 503
    reply_text = (reply or "").strip()
    try:
        _save_memory_pair(user_id, latest_user, reply_text)
    except Exception:
        db.session.rollback()
    care_plan_text = ""
    try:
        care_plan_text = _generate_care_plan_text(
            cfg,
            locale=locale,
            user_id=user_id,
            model_messages=model_messages + [{"role": "assistant", "content": reply_text}],
            clinical_context=clinical_context,
        )
        _store_care_plan(user_id, care_plan_text)
    except Exception:
        db.session.rollback()
    return (
        jsonify(
            {
                "reply": reply_text,
                "agent": "patient_ai_assistant",
                "carePlan": care_plan_text,
            }
        ),
        200,
    )

