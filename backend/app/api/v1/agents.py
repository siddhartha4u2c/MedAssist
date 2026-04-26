from flask import Blueprint, current_app, jsonify, request

from app.agents import AgentOrchestrator
from app.config import Config

bp = Blueprint("agents_v1", __name__, url_prefix="/api/v1")


@bp.post("/agents/dispatch")
def dispatch() -> tuple[dict, int]:
    """
    Body JSON: { "intent": "symptom|report|triage|voice|drug|monitoring|followup",
                  "payload": { ... agent-specific fields ... },
                  "patient_id": optional, "locale": optional }
    """
    body = request.get_json(silent=True) or {}
    intent = str(body.get("intent", "symptom"))
    payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
    patient_id = body.get("patient_id")
    locale = str(body.get("locale", "en"))

    cfg: Config = current_app.config["MEDASSIST_CONFIG"]
    orch = AgentOrchestrator(cfg)
    try:
        result = orch.dispatch(
            intent,
            payload,
            patient_id=str(patient_id) if patient_id is not None else None,
            locale=locale,
        )
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    return jsonify(result), 200
