"""
Pinecone-backed medical knowledge retrieval for Symptom Analyst (RAG).

Vectors in the index should be upserted with metadata containing at least one of:
`text`, `content`, or `chunk` for the passage body; optional `title`, `source`.
"""

from __future__ import annotations

from typing import Any

from app.config import Config
from app.integrations.openai_client import embedding_create
from app.integrations.pinecone_client import get_pinecone_index


def build_rag_query_text(messages: list[dict[str, Any]], *, max_chars: int = 2400) -> str:
    """Combine recent user utterances into a single retrieval query."""
    parts: list[str] = []
    for m in messages:
        if not isinstance(m, dict):
            continue
        if m.get("role") != "user":
            continue
        c = m.get("content")
        if isinstance(c, str) and c.strip():
            parts.append(c.strip())
    blob = " ".join(parts[-8:])
    return blob[:max_chars] if blob else ""


def search_medical_knowledge(cfg: Config, *, query_text: str) -> str:
    """
    Query Pinecone with an embedding of `query_text`.
    Returns a formatted block for the LLM, or empty string if RAG is skipped.
    """
    q = (query_text or "").strip()
    if not q:
        return ""
    if not cfg.pinecone_api_key:
        return ""

    index = get_pinecone_index(cfg)
    if index is None:
        return ""

    try:
        vec = embedding_create(
            model=cfg.llm_embedding_model,
            text=q,
            dimensions=cfg.pinecone_embedding_dimensions,
            source="medical_rag_query",
        )
    except Exception as e:
        return (
            "Medical knowledge retrieval (Pinecone): embedding step failed — "
            f"{e!s}. Check EURI_API_KEY, LLM_EMBEDDING_MODEL, and PINECONE_EMBEDDING_DIMENSIONS."
        )

    kwargs: dict[str, Any] = {
        "vector": vec,
        "top_k": max(1, min(cfg.rag_top_k, 50)),
        "include_metadata": True,
    }
    if cfg.pinecone_namespace:
        kwargs["namespace"] = cfg.pinecone_namespace

    try:
        res = index.query(**kwargs)
    except Exception as e:
        return f"Medical knowledge retrieval (Pinecone): query failed — {e!s}."

    matches = getattr(res, "matches", None) or []
    if not matches:
        return (
            "Medical knowledge retrieval (Pinecone): no matches for this conversation snippet. "
            "The index may be empty or embeddings may not match the index dimension/model."
        )

    lines = [
        "Medical knowledge base (Pinecone RAG — retrieved passages; verify clinically; not a diagnosis):"
    ]
    for i, m in enumerate(matches, 1):
        meta = getattr(m, "metadata", None) or {}
        if hasattr(meta, "get"):
            md = meta
        else:
            try:
                md = dict(meta)
            except Exception:
                md = {}
        text = (md.get("text") or md.get("content") or md.get("chunk") or "") if isinstance(
            md, dict
        ) else ""
        title = md.get("title") or md.get("source") if isinstance(md, dict) else ""
        score = getattr(m, "score", None)
        if not text and isinstance(md, dict):
            text = str(md)[:1200]
        line = f"{i}. "
        if title:
            line += f"[{title}] "
        if score is not None:
            try:
                line += f"(score={float(score):.4f}) "
            except (TypeError, ValueError):
                line += f"(score={score}) "
        line += (text or "(empty passage)").strip()[:1800]
        lines.append(line)
    return "\n".join(lines)
