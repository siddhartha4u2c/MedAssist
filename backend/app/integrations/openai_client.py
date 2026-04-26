"""EURI-backed chat via the OpenAI Python SDK (no OPENAI_API_KEY).

Configure with **EURI_API_KEY** and a base URL (**EURI_BASE_URL**, or **BASE_URL** /
**LLM_BASE_URL** as fallbacks — see ``app.config.Config``).

Equivalent to:

    from openai import OpenAI

    client = OpenAI(
        api_key="YOUR_EURI_API_KEY",
        base_url="https://api.euron.one/api/v1/euri",
    )

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[...],
        max_tokens=200,
        temperature=0.7,
    )
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

from openai import APIStatusError, OpenAI

if TYPE_CHECKING:
    from app.config import Config

_client: OpenAI | None = None


def init_llm_client(cfg: "Config") -> None:
    global _client
    if not cfg.euri_api_key:
        _client = None
        return
    base = (cfg.euri_base_url or "").strip().rstrip("/") or "https://api.euron.one/api/v1/euri"
    _client = OpenAI(api_key=cfg.euri_api_key, base_url=base)


def get_llm_client() -> OpenAI | None:
    return _client


def chat_completion(
    *,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float = 0.3,
    max_tokens: int | None = 2048,
    source: str | None = None,
    user_id: str | None = None,
) -> str:
    client = get_llm_client()
    if client is None:
        raise RuntimeError(
            "LLM client not configured: set EURI_API_KEY and EURI_BASE_URL "
            "(or BASE_URL / LLM_BASE_URL for the same EURI-compatible endpoint)."
        )
    t0 = time.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except APIStatusError as e:
        from app.services.ai_usage_log import record_ai_usage_event

        ms = int((time.perf_counter() - t0) * 1000)
        record_ai_usage_event(
            operation="chat",
            model=model,
            success=False,
            latency_ms=ms,
            response=None,
            error_summary=f"HTTP {e.status_code}: {e!s}",
            source=source,
            user_id=user_id,
        )
        raise RuntimeError(
            f"LLM provider returned {e.status_code}: {str(e)}. "
            "Check EURI_BASE_URL matches your provider (e.g. https://api.euron.one/api/v1/euri) "
            "and LLM_MODEL_PRIMARY is a model that provider exposes."
        ) from e
    ms = int((time.perf_counter() - t0) * 1000)
    from app.services.ai_usage_log import record_ai_usage_event

    record_ai_usage_event(
        operation="chat",
        model=model,
        success=True,
        latency_ms=ms,
        response=resp,
        source=source,
        user_id=user_id,
    )
    choice = resp.choices[0]
    content = choice.message.content
    if not content:
        return ""
    return content


def chat_completion_with_images(
    *,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float = 0.25,
    max_tokens: int | None = 4096,
    source: str | None = None,
    user_id: str | None = None,
) -> str:
    """Vision-capable chat: user message parts may include image_url (data URLs allowed)."""
    client = get_llm_client()
    if client is None:
        raise RuntimeError(
            "LLM client not configured: set EURI_API_KEY and EURI_BASE_URL "
            "(or BASE_URL / LLM_BASE_URL for the same EURI-compatible endpoint)."
        )
    t0 = time.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except APIStatusError as e:
        from app.services.ai_usage_log import record_ai_usage_event

        ms = int((time.perf_counter() - t0) * 1000)
        record_ai_usage_event(
            operation="chat_vision",
            model=model,
            success=False,
            latency_ms=ms,
            response=None,
            error_summary=f"HTTP {e.status_code}: {e!s}",
            source=source,
            user_id=user_id,
        )
        raise RuntimeError(
            f"LLM provider returned {e.status_code}: {str(e)}. "
            "Check that the model supports vision for imaging / X-ray uploads."
        ) from e
    ms = int((time.perf_counter() - t0) * 1000)
    from app.services.ai_usage_log import record_ai_usage_event

    record_ai_usage_event(
        operation="chat_vision",
        model=model,
        success=True,
        latency_ms=ms,
        response=resp,
        source=source,
        user_id=user_id,
    )
    choice = resp.choices[0]
    content = choice.message.content
    if not content:
        return ""
    return content


def embedding_create(
    *,
    model: str,
    text: str,
    dimensions: int | None = None,
    source: str | None = None,
    user_id: str | None = None,
) -> list[float]:
    """Single-text embedding for Pinecone RAG (same EURI / OpenAI-compatible client)."""
    client = get_llm_client()
    if client is None:
        raise RuntimeError(
            "LLM client not configured: embeddings require EURI_API_KEY and base URL."
        )
    params: dict[str, Any] = {"model": model, "input": text}
    if dimensions is not None:
        params["dimensions"] = dimensions
    t0 = time.perf_counter()
    try:
        resp = client.embeddings.create(**params)
    except APIStatusError as e:
        from app.services.ai_usage_log import record_ai_usage_event

        ms = int((time.perf_counter() - t0) * 1000)
        record_ai_usage_event(
            operation="embedding",
            model=model,
            success=False,
            latency_ms=ms,
            response=None,
            error_summary=f"HTTP {e.status_code}: {e!s}",
            source=source,
            user_id=user_id,
        )
        raise RuntimeError(
            f"Embedding API returned {e.status_code}: {e!s}. "
            "Check LLM_EMBEDDING_MODEL and PINECONE_EMBEDDING_DIMENSIONS match your index."
        ) from e
    ms = int((time.perf_counter() - t0) * 1000)
    from app.services.ai_usage_log import record_ai_usage_event

    record_ai_usage_event(
        operation="embedding",
        model=model,
        success=True,
        latency_ms=ms,
        response=resp,
        source=source,
        user_id=user_id,
    )
    data = resp.data
    if not data:
        raise RuntimeError("Embedding API returned no vectors.")
    return list(data[0].embedding)
