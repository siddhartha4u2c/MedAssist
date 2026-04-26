from flask import Blueprint, current_app, jsonify

from app.config import Config
from app.integrations.openai_client import get_llm_client

bp = Blueprint("health_v1", __name__, url_prefix="/api/v1")


@bp.get("/leads-ping")
def leads_ping_mirror() -> tuple[dict, int]:
    """Backup check if `/api/v1/leads/ping` 404s (nested path); this uses the health blueprint only."""
    return (jsonify({"ok": True, "service": "leads", "path": "/api/v1/leads-ping"}), 200)


@bp.get("/health")
def health() -> tuple[dict, int]:
    cfg: Config = current_app.config["MEDASSIST_CONFIG"]
    client_ok = get_llm_client() is not None
    return (
        jsonify(
            {
                "status": "ok",
                "llm_configured": client_ok,
                "llm_base_url": cfg.euri_base_url,
            }
        ),
        200,
    )
