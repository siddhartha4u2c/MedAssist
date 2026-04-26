"""PDF export for patient medication list (fpdf2, ASCII-safe)."""

from __future__ import annotations

import json
from typing import Any

from app.services.patient_report_analysis import _ascii_for_pdf


def medications_list_to_pdf_bytes(patient_display_name: str, raw_medications: str) -> bytes:
    """Build a simple PDF of the medication list (structured JSON v1 or legacy plain text)."""
    from fpdf import FPDF

    class Doc(FPDF):
        pass

    pdf = Doc()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(14, 14, 14)
    pdf.add_page()

    def write_block(text: str, *, h: float) -> None:
        t = _ascii_for_pdf(text, 24_000).strip()
        if not t:
            return
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, h, t)

    pdf.set_font("Helvetica", "B", 13)
    write_block("MedAssist — Current medications", h=7)
    pdf.ln(1)
    pdf.set_font("Helvetica", size=10)
    name = _ascii_for_pdf(patient_display_name or "Patient", 500).strip() or "Patient"
    write_block(f"Patient: {name}", h=5)
    pdf.ln(2)

    raw = (raw_medications or "").strip()
    if not raw:
        pdf.set_font("Helvetica", size=10)
        write_block("No medications on file.", h=5)
        out = pdf.output(dest="S")
        if isinstance(out, str):
            return out.encode("latin-1", errors="replace")
        return bytes(out)

    rows: list[dict[str, Any]] | None = None
    if raw.startswith("{"):
        try:
            j = json.loads(raw)
            if j.get("v") == 1 and isinstance(j.get("rows"), list):
                rows = j["rows"]
        except json.JSONDecodeError:
            rows = None

    pdf.set_font("Helvetica", size=10)
    if rows is not None:
        if not rows:
            write_block("Medication list is empty.", h=5)
            out = pdf.output(dest="S")
            if isinstance(out, str):
                return out.encode("latin-1", errors="replace")
            return bytes(out)
        for idx, r in enumerate(rows):
            if not isinstance(r, dict):
                continue
            med = str(r.get("medicineName") or r.get("medicine") or "").strip() or "(unnamed)"
            parts = [
                f"Medication {idx + 1}: {_ascii_for_pdf(med, 500)}",
                f"  Date: {_ascii_for_pdf(str(r.get('date') or ''), 80)}",
                f"  Doctor: {_ascii_for_pdf(str(r.get('doctorName') or ''), 200)}",
                f"  Form: {_ascii_for_pdf(str(r.get('form') or ''), 80)}",
                f"  Frequency: {_ascii_for_pdf(str(r.get('frequency') or ''), 300)}",
                f"  Notes: {_ascii_for_pdf(str(r.get('notes') or ''), 2000)}",
            ]
            write_block("\n".join(parts), h=5)
            pdf.ln(1)
    else:
        write_block(_ascii_for_pdf(raw, 48_000), h=5)

    out = pdf.output(dest="S")
    if isinstance(out, str):
        return out.encode("latin-1", errors="replace")
    return bytes(out)


def medication_row_to_pdf_bytes(patient_display_name: str, row: dict[str, Any]) -> bytes:
    """PDF for one structured medication row (patient-facing export)."""
    from fpdf import FPDF

    class Doc(FPDF):
        pass

    pdf = Doc()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(14, 14, 14)
    pdf.add_page()

    def write_block(text: str, *, h: float) -> None:
        t = _ascii_for_pdf(text, 24_000).strip()
        if not t:
            return
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, h, t)

    pdf.set_font("Helvetica", "B", 13)
    write_block("MedAssist — Medication record", h=7)
    pdf.ln(1)
    pdf.set_font("Helvetica", size=10)
    name = _ascii_for_pdf(patient_display_name or "Patient", 500).strip() or "Patient"
    write_block(f"Patient: {name}", h=5)
    pdf.ln(2)

    med = str(row.get("medicineName") or row.get("medicine") or "").strip() or "(unnamed)"
    parts = [
        f"Medicine: {_ascii_for_pdf(med, 500)}",
        f"Date: {_ascii_for_pdf(str(row.get('date') or ''), 80)}",
        f"Prescriber / doctor on file: {_ascii_for_pdf(str(row.get('doctorName') or ''), 200)}",
        f"Form: {_ascii_for_pdf(str(row.get('form') or ''), 80)}",
        f"Frequency: {_ascii_for_pdf(str(row.get('frequency') or ''), 300)}",
        f"Notes: {_ascii_for_pdf(str(row.get('notes') or ''), 2000)}",
    ]
    pdf.set_font("Helvetica", size=10)
    write_block("\n".join(parts), h=5)

    out = pdf.output(dest="S")
    if isinstance(out, str):
        return out.encode("latin-1", errors="replace")
    return bytes(out)
