"""
Upsert a few sample vectors into Pinecone for testing Symptom Analyst RAG.

Usage (from backend/):
  .\\.venv\\Scripts\\python.exe scripts/seed_pinecone_sample.py

Requires: PINECONE_API_KEY, PINECONE_INDEX_NAME (or default quickstart), EURI_API_KEY,
and embedding dimensions compatible with the index (set PINECONE_EMBEDDING_DIMENSIONS if needed).
"""

from __future__ import annotations

import os
import sys

_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from dotenv import load_dotenv

load_dotenv(os.path.join(_BACKEND, ".env"))
load_dotenv()

from app.config import Config
from app.integrations.openai_client import embedding_create, init_llm_client


def main() -> None:
    cfg = Config.from_env()
    init_llm_client(cfg)
    if not cfg.pinecone_api_key:
        print("Set PINECONE_API_KEY in backend/.env")
        sys.exit(1)
    if not cfg.euri_api_key:
        print("Set EURI_API_KEY for embeddings.")
        sys.exit(1)

    from pinecone import Pinecone

    pc = Pinecone(api_key=cfg.pinecone_api_key)
    index = pc.Index(cfg.pinecone_index_name)

    samples: list[tuple[str, str, str]] = [
        (
            "med-sample-angina-1",
            "Angina and acute coronary syndrome",
            "Chest pressure or tightness with exertion can suggest angina. Severe, crushing, or "
            "persistent chest pain with shortness of breath, sweating, or radiation to arm/jaw "
            "warrants emergency evaluation.",
        ),
        (
            "med-sample-sob-1",
            "Dyspnea red flags",
            "Sudden severe shortness of breath, inability to speak full sentences, or hypoxia "
            "are urgent findings; consider pulmonary embolism, pneumothorax, heart failure, and "
            "other emergencies.",
        ),
    ]

    vectors = []
    for vid, title, text in samples:
        vec = embedding_create(
            model=cfg.llm_embedding_model,
            text=text,
            dimensions=cfg.pinecone_embedding_dimensions,
        )
        vectors.append(
            {
                "id": vid,
                "values": vec,
                "metadata": {"title": title, "text": text},
            }
        )

    ns = cfg.pinecone_namespace or None
    if ns:
        index.upsert(vectors=vectors, namespace=ns)
    else:
        index.upsert(vectors=vectors)
    print(f"Upserted {len(vectors)} vectors into index {cfg.pinecone_index_name!r}.")


if __name__ == "__main__":
    main()
