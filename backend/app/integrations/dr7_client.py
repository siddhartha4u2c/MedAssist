"""DR7 medical chat integration (requests-based)."""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

import requests

if TYPE_CHECKING:
    from app.config import Config


def dr7_medical_chat_completion(
    cfg: "Config",
    *,
    messages: list[dict[str, Any]],
    temperature: float = 0.5,
    max_tokens: int | None = None,
    source: str | None = None,
    user_id: str | None = None,
) -> str:
    """
    Call DR7 medical endpoint and return assistant text.
    Falls back to RuntimeError for clear API errors.
    """
    if not cfg.dr7_api_key:
        raise RuntimeError("DR7 is not configured: set DR7_API_KEY in backend/.env.")

    headers = {
        "Authorization": f"Bearer {cfg.dr7_api_key}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": cfg.dr7_model,
        "messages": messages,
        "temperature": temperature,
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens

    t0 = time.perf_counter()
    try:
        resp = requests.post(cfg.dr7_api_url, headers=headers, json=payload, timeout=45)
    except requests.RequestException as e:
        raise RuntimeError(f"DR7 request failed: {e!s}") from e

    ms = int((time.perf_counter() - t0) * 1000)
    try:
        data = resp.json()
    except ValueError:
        data = None

    from app.services.ai_usage_log import record_ai_usage_event

    if resp.status_code != 200:
        err = ""
        if isinstance(data, dict):
            err = str(data.get("error") or data.get("message") or "").strip()
        err = err or (resp.text or "").strip()[:500] or f"HTTP {resp.status_code}"
        record_ai_usage_event(
            operation="dr7_chat",
            model=cfg.dr7_model,
            success=False,
            latency_ms=ms,
            response=None,
            error_summary=err,
            source=source,
            user_id=user_id,
        )
        raise RuntimeError(f"DR7 API error ({resp.status_code}): {err}")

    record_ai_usage_event(
        operation="dr7_chat",
        model=cfg.dr7_model,
        success=True,
        latency_ms=ms,
        response=data,
        source=source,
        user_id=user_id,
    )

    text = ""
    if isinstance(data, dict):
        choices = data.get("choices")
        if isinstance(choices, list) and choices:
            c0 = choices[0] if isinstance(choices[0], dict) else {}
            msg = c0.get("message") if isinstance(c0, dict) else {}
            if isinstance(msg, dict):
                text = str(msg.get("content") or "").strip()
            if not text and isinstance(c0, dict):
                text = str(c0.get("text") or "").strip()
        if not text:
            text = str(data.get("reply") or data.get("output") or "").strip()

    if not text:
        raise RuntimeError("DR7 API returned no assistant content.")
    return text

