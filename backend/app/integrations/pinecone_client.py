"""Pinecone index handle for medical RAG (lazy init)."""

from __future__ import annotations

import sys
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.config import Config

_index: Any = None
_pinecone_unavailable_logged: bool = False
_pinecone_give_up: bool = False


def get_pinecone_index(cfg: "Config"):
    """Return Pinecone Index or None if not configured, import fails, or init fails.

    A broken env (e.g. legacy ``pinecone-client`` conflicting with ``pinecone`` on
    conda) must not 500 symptom chat — RAG is skipped and the analyst still runs.
    """
    global _index, _pinecone_unavailable_logged
    if not cfg.pinecone_api_key or not cfg.pinecone_index_name:
        return None
    if _index is not None:
        return _index
    try:
        from pinecone import Pinecone

        pc = Pinecone(api_key=cfg.pinecone_api_key)
        _index = pc.Index(cfg.pinecone_index_name)
        return _index
    except Exception as exc:
        _pinecone_give_up = True
        if not _pinecone_unavailable_logged:
            _pinecone_unavailable_logged = True
            print(
                "[MedAssist] Pinecone unavailable; medical RAG disabled for this process. "
                f"Reason: {exc!s}. "
                "Fix: `pip uninstall -y pinecone-client` then `pip install pinecone` "
                "(see backend/requirements.txt), or clear PINECONE_* if you do not use RAG.",
                file=sys.stderr,
                flush=True,
            )
        return None
