import os
from dataclasses import dataclass
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


def _read_env_file_scalar(backend_root: Path, key: str) -> str:
    """Read a single KEY=value from backend/.env when os.environ was not populated (dotenv edge cases on Windows)."""
    for fname in (".env", "backend.env"):
        path = backend_root / fname
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8-sig", errors="replace")
        except OSError:
            try:
                text = path.read_text(encoding="utf-16-le", errors="replace")
            except OSError:
                continue
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.lower().startswith("export "):
                line = line[7:].strip()
            if "=" not in line:
                continue
            name, _, val = line.partition("=")
            if name.strip() != key:
                continue
            val = val.strip()
            if "#" in val and not (val.startswith('"') or val.startswith("'")):
                val = val.split("#", 1)[0].strip()
            if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
                val = val[1:-1]
            out = val.strip()
            if not out:
                continue
            return out
    return ""


def _env_first(*names: str, default: str = "") -> str:
    for name in names:
        v = os.environ.get(name, "").strip()
        if v:
            return v
    return default


_DAILY_RECORDING_MODES = frozenset({"cloud", "cloud-audio-only", "local", "raw-tracks"})


def _daily_enable_recording_from_env() -> str:
    """Daily `properties.enable_recording` value, or empty to leave Daily default (no recording)."""
    raw = (_env_first("DAILY_ENABLE_RECORDING") or "").strip().lower()
    if not raw or raw in ("0", "false", "no", "off", "disabled", "none"):
        return ""
    if raw in ("1", "true", "yes", "on"):
        return "cloud"
    if raw in _DAILY_RECORDING_MODES:
        return raw
    return ""


def _normalize_daily_api_key(raw: str) -> str:
    """Strip whitespace and accidental outer quotes (paste from Python `\"...\"` or Windows env UI)."""
    s = (raw or "").strip()
    for _ in range(3):
        if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
            s = s[1:-1].strip()
        else:
            break
    return s


@dataclass(frozen=True)
class Config:
    secret_key: str
    euri_api_key: str
    euri_base_url: str
    llm_model_primary: str
    llm_model_fast: str
    llm_embedding_model: str
    # DR7 medical chat API (used for symptom tracker + patient AI assistant when configured)
    dr7_api_key: str
    dr7_api_url: str
    dr7_model: str
    # Auth & DB
    database_url: str
    jwt_secret: str
    jwt_access_hours: int
    frontend_public_url: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    smtp_use_tls: bool
    smtp_use_ssl: bool
    mail_from: str
    dev_skip_email: bool
    # Pinecone RAG (symptom / medical knowledge)
    pinecone_api_key: str
    pinecone_index_name: str
    pinecone_namespace: str
    pinecone_embedding_dimensions: int | None
    rag_top_k: int
    # Twilio SMS (lead OTP, etc.)
    twilio_account_sid: str
    twilio_auth_token: str
    twilio_from_number: str
    dev_skip_sms: bool
    sms_default_country_code: str
    # Daily.co telemedicine — optional; set DAILY_API_KEY to create rooms on booking.
    daily_api_key: str
    daily_api_base_url: str
    daily_room_exp_buffer_sec: int
    # Daily room `enable_recording`: "", or "cloud" | "cloud-audio-only" | "local" | "raw-tracks"
    daily_enable_recording: str
    # Generic Video provider (fallback if Daily is not configured)
    videoco_api_key: str
    videoco_api_base_url: str
    videoco_create_room_path: str
    videoco_request_timeout_sec: int
    # Patient report files (PDF / images) — stored under this directory (absolute or relative to backend root).
    patient_reports_upload_dir: str
    # Payment proof uploads (screenshot / PDF) for billing payment requests.
    payment_proofs_upload_dir: str

    @classmethod
    def from_env(cls) -> "Config":
        raw_base = _env_first(
            "EURI_BASE_URL",
            "LLM_BASE_URL",
            "BASE_URL",
        )
        base = raw_base.strip().rstrip("/")
        db_default = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "instance",
            "medassist_dev.sqlite",
        )
        os.makedirs(os.path.dirname(db_default), exist_ok=True)
        database_url = os.environ.get(
            "DATABASE_URL",
            f"sqlite:///{db_default}",
        ).strip()
        jwt_secret = os.environ.get("JWT_SECRET_KEY", "").strip() or os.environ.get(
            "SECRET_KEY", "dev"
        )
        _daily_key = _normalize_daily_api_key(
            _env_first("DAILY_API_KEY", "DAILY_API_SECRET")
            or _read_env_file_scalar(_BACKEND_ROOT, "DAILY_API_KEY")
            or _read_env_file_scalar(_BACKEND_ROOT, "DAILY_API_SECRET")
        )
        if _daily_key and not (os.environ.get("DAILY_API_KEY") or "").strip():
            os.environ["DAILY_API_KEY"] = _daily_key
        return cls(
            secret_key=os.environ.get("SECRET_KEY", "dev"),
            euri_api_key=_env_first("EURI_API_KEY"),
            euri_base_url=base or "https://api.euron.one/api/v1/euri",
            llm_model_primary=os.environ.get("LLM_MODEL_PRIMARY", "gpt-4o"),
            llm_model_fast=os.environ.get("LLM_MODEL_FAST", "gpt-4o-mini"),
            llm_embedding_model=os.environ.get(
                "LLM_EMBEDDING_MODEL", "text-embedding-3-large"
            ),
            dr7_api_key=_env_first("DR7_API_KEY"),
            dr7_api_url=(
                _env_first("DR7_API_URL").rstrip("/")
                or "https://dr7.ai/api/v1/medical/chat/completions"
            ),
            dr7_model=os.environ.get("DR7_MODEL", "medgemma-27b-it").strip()
            or "medgemma-27b-it",
            database_url=database_url,
            jwt_secret=jwt_secret,
            jwt_access_hours=int(os.environ.get("JWT_ACCESS_HOURS", "24")),
            frontend_public_url=os.environ.get(
                "FRONTEND_PUBLIC_URL", "http://localhost:3000"
            ).rstrip("/"),
            smtp_host=_env_first(
                "SMTP_HOST", "MAIL_HOST", "EMAIL_HOST", "SMTP_SERVER"
            ),
            smtp_port=int(
                _env_first("SMTP_PORT", "MAIL_PORT", default="587") or "587"
            ),
            smtp_user=_env_first(
                "SMTP_USERNAME", "SMTP_USER", "MAIL_USERNAME", "EMAIL_USER"
            ),
            smtp_password=_env_first(
                "SMTP_PASSWORD", "MAIL_PASSWORD", "EMAIL_PASSWORD"
            ),
            smtp_use_tls=_env_first("SMTP_USE_TLS", "MAIL_USE_TLS", default="true").lower()
            in ("1", "true", "yes"),
            smtp_use_ssl=_env_first("SMTP_USE_SSL", "MAIL_USE_SSL", default="").lower()
            in ("1", "true", "yes"),
            mail_from=_env_first(
                "SMTP_FROM_EMAIL", "MAIL_FROM", "SMTP_FROM", "EMAIL_FROM"
            ).rstrip(">"),
            dev_skip_email=os.environ.get("DEV_SKIP_EMAIL", "").lower()
            in ("1", "true", "yes"),
            pinecone_api_key=_env_first("PINECONE_API_KEY"),
            pinecone_index_name=os.environ.get("PINECONE_INDEX_NAME", "quickstart").strip()
            or "quickstart",
            pinecone_namespace=os.environ.get("PINECONE_NAMESPACE", "").strip(),
            pinecone_embedding_dimensions=(
                int(os.environ["PINECONE_EMBEDDING_DIMENSIONS"])
                if os.environ.get("PINECONE_EMBEDDING_DIMENSIONS", "").strip().isdigit()
                else None
            ),
            rag_top_k=int(os.environ.get("RAG_TOP_K", "5") or "5"),
            twilio_account_sid=_env_first("TWILIO_ACCOUNT_SID"),
            twilio_auth_token=_env_first("TWILIO_AUTH_TOKEN"),
            twilio_from_number=_env_first("TWILIO_PHONE_NUMBER", "TWILIO_FROM_NUMBER"),
            dev_skip_sms=os.environ.get("DEV_SKIP_SMS", "").lower()
            in ("1", "true", "yes"),
            sms_default_country_code=os.environ.get("SMS_DEFAULT_COUNTRY_CODE", "91").strip()
            or "91",
            daily_api_key=_daily_key,
            daily_api_base_url=(
                _env_first("DAILY_API_BASE_URL").rstrip("/") or "https://api.daily.co/v1"
            ),
            daily_room_exp_buffer_sec=int(
                os.environ.get("DAILY_ROOM_EXP_BUFFER_SEC", "3600") or "3600"
            ),
            daily_enable_recording=_daily_enable_recording_from_env(),
            videoco_api_key=_env_first("VIDEOCO_API_KEY"),
            videoco_api_base_url=_env_first(
                "VIDEOCO_API_BASE_URL", "VIDEOCO_BASE_URL"
            ).rstrip("/"),
            videoco_create_room_path=(
                os.environ.get("VIDEOCO_CREATE_ROOM_PATH", "/rooms").strip() or "/rooms"
            ),
            videoco_request_timeout_sec=int(
                os.environ.get("VIDEOCO_REQUEST_TIMEOUT_SEC", "20") or "20"
            ),
            patient_reports_upload_dir=(
                os.environ.get("PATIENT_REPORTS_UPLOAD_DIR", "").strip()
                or str(_BACKEND_ROOT / "instance" / "patient_report_uploads")
            ),
            payment_proofs_upload_dir=(
                os.environ.get("PAYMENT_PROOFS_UPLOAD_DIR", "").strip()
                or str(_BACKEND_ROOT / "instance" / "payment_proof_uploads")
            ),
        )


def effective_daily_api_key(cfg: Config) -> str:
    """Resolve Daily API key for the current process (handles stale MEDASSIST_CONFIG vs live env / .env)."""
    k = _normalize_daily_api_key(cfg.daily_api_key or "")
    if k:
        return k
    k = _normalize_daily_api_key(_env_first("DAILY_API_KEY", "DAILY_API_SECRET"))
    if k:
        return k
    return _normalize_daily_api_key(
        _read_env_file_scalar(_BACKEND_ROOT, "DAILY_API_KEY")
        or _read_env_file_scalar(_BACKEND_ROOT, "DAILY_API_SECRET")
    )
