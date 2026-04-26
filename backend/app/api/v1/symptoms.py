from __future__ import annotations

import jwt
from flask import Blueprint, current_app, jsonify, request

from app.agents.base_agent import AgentContext
from app.agents.symptom_analyst import SymptomAnalystAgent
from app.config import Config
from app.integrations.openai_client import get_llm_client
from app.services.symptom_assessment import split_symptom_reply
from app.services.symptom_context import build_symptom_analyst_context
from app.services.symptom_tracker_notifications import (
    notify_assigned_doctors_symptom_tracker_message,
)
from app.utils.jwt_tokens import decode_access_token

bp = Blueprint("symptoms_v1", __name__, url_prefix="/api/v1")


def _cfg() -> Config:
    return current_app.config["MEDASSIST_CONFIG"]


@bp.get("/symptoms/info")
def symptom_tracker_info():
    """Public: confirms this is MedAssist Flask and whether the LLM client is configured."""
    cfg = _cfg()
    return jsonify(
        {
            "service": "medassist",
            "symptom_agent": SymptomAnalystAgent.name,
            "symptom_chat_method": "POST",
            "symptom_chat_path": "/api/v1/symptoms/chat",
            "llm_configured": get_llm_client() is not None,
            "rag_configured": bool(cfg.pinecone_api_key and cfg.pinecone_index_name),
            "llm_base_url": cfg.euri_base_url,
            "llm_model_primary": cfg.llm_model_primary,
            "hint": "If the browser shows NOT_FOUND from a gateway, set Next.js BACKEND_URL to this Flask server (e.g. http://127.0.0.1:5000), not to EURI_BASE_URL.",
        }
    ), 200


def _jwt_claims() -> dict | None:
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


@bp.get("/symptoms/chat")
def symptom_chat_probe():
    """JSON probe: wrong/old Flask on this port often returns HTML 404 for unknown paths."""
    return jsonify(
        {
            "ok": True,
            "service": "medassist",
            "path": "/api/v1/symptoms/chat",
            "chat_method": "POST",
            "hint": "POST with Authorization: Bearer <jwt> and JSON {\"messages\": [{\"role\": \"user\", \"content\": \"...\"}]}.",
        }
    ), 200


@bp.post("/symptoms/chat")
def symptom_chat():
    """Authenticated multi-turn chat with the Symptom Analyst agent."""
    claims = _jwt_claims()
    if claims is None:
        return jsonify({"error": "Unauthorized", "code": "UNAUTHORIZED"}), 401

    body = request.get_json(silent=True) or {}
    messages = body.get("messages")
    if not isinstance(messages, list) or not messages:
        return jsonify(
            {"error": "Field `messages` must be a non-empty array.", "code": "VALIDATION_ERROR"}
        ), 400

    locale = str(body.get("locale", "en")).strip() or "en"
    patient_id = body.get("patient_id")
    sub = claims.get("sub")
    role = str(claims.get("role") or "")
    sub_s = str(sub) if sub is not None else ""

    # Patients cannot spoof another user's id; always bind to JWT subject.
    if role == "patient":
        pid = sub_s or None
        include_patient = bool(sub_s)
    else:
        pid = str(patient_id) if patient_id is not None else (sub_s or None)
        include_patient = False

    cfg = _cfg()
    clinical = build_symptom_analyst_context(
        cfg,
        patient_user_id=sub_s if role == "patient" else None,
        messages=messages if isinstance(messages, list) else [],
        include_patient_data=include_patient,
    )
    agent = SymptomAnalystAgent(cfg)
    ctx = AgentContext(patient_id=pid, locale=locale, clinical_context=clinical)
    try:
        result = agent.run({"messages": messages}, ctx)
    except RuntimeError as e:
        return jsonify({"error": str(e), "code": "LLM_UNAVAILABLE"}), 503

    if result.get("error"):
        return jsonify({"error": result["error"], "code": "BAD_REQUEST"}), 400

    raw_reply = str(result.get("reply", "") or "")
    msg_list = messages if isinstance(messages, list) else []
    display_reply, assessment = split_symptom_reply(raw_reply, msg_list)

    if role == "patient" and sub_s:
        ul = assessment.get("urgencyLabel") if isinstance(assessment, dict) else None
        notify_assigned_doctors_symptom_tracker_message(
            sub_s,
            msg_list,
            urgency_label=str(ul).strip() if isinstance(ul, str) and ul.strip() else None,
        )

    return (
        jsonify(
            {
                "reply": display_reply,
                "assessment": assessment,
                "agent": agent.name,
            }
        ),
        200,
    )
