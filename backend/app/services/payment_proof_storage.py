from __future__ import annotations

import re
import uuid as uuid_mod
from pathlib import Path
from typing import Any

from werkzeug.utils import secure_filename

from app.config import Config
from app.services.patient_report_analysis import (
    ext_from_filename,
    normalize_mime,
    validate_upload,
)

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


def payment_proof_root(cfg: Config) -> Path:
    raw = (cfg.payment_proofs_upload_dir or "").strip()
    p = Path(raw) if raw else (_BACKEND_DIR / "instance" / "payment_proof_uploads")
    if not p.is_absolute():
        p = _BACKEND_DIR / p
    p.mkdir(parents=True, exist_ok=True)
    return p


def _safe_segment(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", s)[:120] or "file"


def save_payment_proof_file(cfg: Config, patient_user_id: str, storage: Any) -> tuple[str, str, str, int]:
    """Returns (relative_path, original_filename, mime, size)."""
    raw_name = getattr(storage, "filename", None) or "upload"
    orig = secure_filename(raw_name) or "upload"
    data = storage.read()
    size = len(data)
    mime = normalize_mime(getattr(storage, "mimetype", "") or "", orig)
    mime_final, err = validate_upload(orig, mime, size)
    if err or not mime_final:
        raise ValueError(err or "Invalid upload.")
    ext = ext_from_filename(orig)
    uid = str(uuid_mod.uuid4())
    safe = _safe_segment(orig.rsplit(".", 1)[0] if "." in orig else orig)
    rel = f"{patient_user_id}/{uid}_{safe}{ext}"
    dest = payment_proof_root(cfg) / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return rel, orig, mime_final, size
