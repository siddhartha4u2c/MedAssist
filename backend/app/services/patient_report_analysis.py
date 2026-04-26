from __future__ import annotations

import base64
import io
import re
import uuid
from pathlib import Path
from typing import Any

from PIL import Image
from werkzeug.utils import secure_filename

from app.agents.report_reader import ReportReaderAgent
from app.config import Config
from app.models.patient_report import PatientReport

ALLOWED_MIME = frozenset(
    {
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/pjpeg",
    }
)
ALLOWED_EXT = frozenset({".pdf", ".jpeg", ".jpg", ".png"})
MAX_UPLOAD_BYTES = 15 * 1024 * 1024


def upload_root(cfg: Config) -> Path:
    raw = (cfg.patient_reports_upload_dir or "").strip()
    p = Path(raw)
    if not p.is_absolute():
        p = Path(__file__).resolve().parent.parent.parent / raw
    p.mkdir(parents=True, exist_ok=True)
    return p


def ext_from_filename(name: str) -> str:
    n = (name or "").rsplit(".", 1)
    if len(n) < 2:
        return ""
    return ("." + n[-1]).lower()


def normalize_mime(mime: str, filename: str) -> str:
    m = (mime or "").split(";")[0].strip().lower()
    if m in ("image/jpg", "image/pjpeg"):
        return "image/jpeg"
    if m in ("application/octet-stream", "binary/octet-stream", ""):
        ex = ext_from_filename(filename)
        if ex == ".pdf":
            return "application/pdf"
        if ex in (".jpg", ".jpeg"):
            return "image/jpeg"
        if ex == ".png":
            return "image/png"
    if m in ALLOWED_MIME:
        return m
    ex = ext_from_filename(filename)
    if ex == ".pdf":
        return "application/pdf"
    if ex in (".jpg", ".jpeg"):
        return "image/jpeg"
    if ex == ".png":
        return "image/png"
    return m


def validate_upload(filename: str, mime: str, size: int) -> tuple[str | None, str]:
    if size <= 0 or size > MAX_UPLOAD_BYTES:
        return None, "File must be between 1 byte and 15 MB."
    ex = ext_from_filename(filename)
    if ex not in ALLOWED_EXT:
        return None, "Allowed types: PDF, JPEG, JPG, PNG."
    m = normalize_mime(mime, filename)
    if m not in ALLOWED_MIME:
        return None, "Allowed types: PDF, JPEG, JPG, PNG."
    return m, ""


def _safe_segment(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", s)[:120] or "file"


def save_uploaded_file(cfg: Config, patient_user_id: str, storage: Any) -> tuple[str, str, str, int]:
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
    uid = str(uuid.uuid4())
    safe = _safe_segment(orig.rsplit(".", 1)[0] if "." in orig else orig)
    rel = f"{patient_user_id}/{uid}_{safe}{ext}"
    dest = upload_root(cfg) / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return rel, orig, mime_final, size


def extract_pdf_text(path: Path, max_pages: int = 30) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""
    try:
        reader = PdfReader(str(path))
        parts: list[str] = []
        for i, page in enumerate(reader.pages[:max_pages]):
            t = page.extract_text()
            if t:
                parts.append(t.strip())
        return "\n\n".join(parts).strip()
    except Exception:
        return ""


def image_to_jpeg_b64(path: Path, max_dim: int = 1600, quality: int = 85) -> list[tuple[str, str]]:
    im = Image.open(path)
    im = im.convert("RGB")
    w, h = im.size
    if max(w, h) > max_dim:
        im.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality, optimize=True)
    b64 = base64.standard_b64encode(buf.getvalue()).decode("ascii")
    return [("image/jpeg", b64)]


def build_extraction(cfg: Config, row: PatientReport) -> tuple[str, list[tuple[str, str]]]:
    if not row.stored_relative_path:
        return "", []
    path = upload_root(cfg) / row.stored_relative_path
    if not path.is_file():
        return "", []
    mime = (row.mime_type or "").lower()
    if mime == "application/pdf":
        text = extract_pdf_text(path)
        return text, []
    if mime.startswith("image/"):
        return "", image_to_jpeg_b64(path)
    return "", []


def run_ai_analysis(cfg: Config, row: PatientReport) -> None:
    """Mutates row (status, ai_analysis_json, ai_error, analyzed_at). Caller commits."""
    from datetime import datetime

    row.ai_analysis_status = "processing"
    row.ai_error = None
    try:
        text, images = build_extraction(cfg, row)
        if (row.mime_type or "").lower() == "application/pdf" and len(text.strip()) < 80:
            text = (
                text
                + "\n\n[SYSTEM NOTE: Very little text was extracted from this PDF. "
                "It may be a scanned document or X-ray. For detailed automated imaging review, "
                "upload the image as JPEG or PNG if possible.]"
            )
        agent = ReportReaderAgent(cfg)
        analysis = agent.structured_analysis(
            title=row.title,
            report_type=row.report_type or "other",
            extracted_text=text,
            image_parts=images,
            locale="en",
        )
        row.ai_analysis_json = analysis
        row.ai_analysis_status = "completed"
        row.analyzed_at = datetime.utcnow()
    except RuntimeError as e:
        row.ai_analysis_status = "failed"
        row.ai_error = str(e)[:4000]
        row.analyzed_at = datetime.utcnow()
    except Exception as e:
        row.ai_analysis_status = "failed"
        row.ai_error = str(e)[:4000]
        row.analyzed_at = datetime.utcnow()


def _ascii_for_pdf(s: str, cap: int = 8000) -> str:
    t = (s or "").replace("\r\n", "\n").replace("\r", "\n")
    out: list[str] = []
    for ch in t[:cap]:
        o = ord(ch)
        if ch in "\n\t":
            out.append(ch)
        elif 32 <= o < 127:
            out.append(ch)
        elif ch in ".,;:!?()-/%+":
            out.append(ch)
        else:
            out.append(" ")
    return "".join(out)


def analysis_dict_to_pdf_bytes(title: str, data: dict[str, Any]) -> bytes:
    """Build a minimal ASCII-safe PDF. fpdf2 can raise on empty multi_cell bodies; keep inputs defensive."""
    from fpdf import FPDF

    class Doc(FPDF):
        pass

    pdf = Doc()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(14, 14, 14)
    pdf.add_page()

    def write_block(text: str, *, h: float) -> None:
        """fpdf2 leaves ``x`` at the end of the last wrapped line; always start from the left margin."""
        t = _ascii_for_pdf(text, 12_000).strip()
        if not t:
            return
        pdf.set_x(pdf.l_margin)
        # w=0: span from current x to the right margin (full text width).
        pdf.multi_cell(0, h, t)

    pdf.set_font("Helvetica", "B", 13)
    write_block("MedAssist - Medical report analysis", h=7)
    pdf.ln(2)
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", size=10)
    write_block(f"Report title: {title or '(untitled)'}", h=5)
    pdf.ln(3)
    pdf.set_x(pdf.l_margin)

    def section(heading: str, body: str) -> None:
        body_t = _ascii_for_pdf(str(body or ""), 12_000).strip()
        pdf.set_font("Helvetica", "B", 11)
        write_block(heading, h=5)
        pdf.set_font("Helvetica", size=10)
        if body_t:
            write_block(body_t, h=5)
        pdf.ln(2)
        pdf.set_x(pdf.l_margin)

    section(
        "Summary (patient-facing)",
        str(data.get("summaryForPatient") or data.get("summary_for_patient") or ""),
    )
    normals = data.get("findingsNormal") or data.get("findings_normal")
    if isinstance(normals, list) and normals:
        section(
            "Within normal / reassuring",
            "\n".join(f"- {_ascii_for_pdf(str(x), 2000)}" for x in normals if x is not None and str(x).strip()),
        )
    abn = data.get("findingsAbnormalOrNotable") or data.get("findings_abnormal")
    if isinstance(abn, list) and abn:
        section(
            "Notable or abnormal findings",
            "\n".join(f"- {_ascii_for_pdf(str(x), 2000)}" for x in abn if x is not None and str(x).strip()),
        )
    ev = data.get("extractedValues") or data.get("extracted_values")
    if isinstance(ev, list) and ev:
        lines = []
        for item in ev:
            if not isinstance(item, dict):
                continue
            parts = []
            for k in ("name", "value", "unit", "referenceOrRange", "flag"):
                v = item.get(k)
                if v is None:
                    continue
                parts.append(f"{k}: {_ascii_for_pdf(str(v), 500)}")
            if parts:
                lines.append(" - " + ", ".join(parts))
        if lines:
            section("Values mentioned in the document", "\n".join(lines))
    img = str(data.get("imagingInterpretation") or data.get("imaging_interpretation") or "")
    if img.strip():
        section("Imaging / X-ray interpretation", img)
    rec = data.get("recommendedActions") or data.get("recommended_actions")
    if isinstance(rec, list) and rec:
        section(
            "Recommended actions",
            "\n".join(
                f"- {_ascii_for_pdf(str(x), 2000)}"
                for x in rec
                if x is not None and str(x).strip()
            ),
        )
    urg = str(data.get("urgency") or "")
    if urg.strip():
        section("Suggested urgency", urg)
    disc = str(data.get("disclaimer") or "")
    if disc.strip():
        section("Disclaimer", disc)

    out = pdf.output(dest="S")
    if isinstance(out, str):
        return out.encode("latin-1", errors="replace")
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    return bytes(str(out), "latin-1", errors="replace")
