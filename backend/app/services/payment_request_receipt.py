"""PDF receipt for approved patient payment requests (fpdf2, ASCII-safe)."""

from __future__ import annotations

from app.services.patient_report_analysis import _ascii_for_pdf

_TREATMENT_LABELS: dict[str, str] = {
    "consultation": "Consultation",
    "diagnosis": "Diagnosis",
    "medical_tests": "Medical tests",
    "surgery": "Surgery",
    "others": "Others",
}


def payment_request_approved_receipt_pdf_bytes(
    *,
    patient_display: str,
    amount: str,
    treatment_type: str,
    payment_mode: str,
    payment_on: str,
    valid_until: str,
    created_at: str,
    reviewed_at: str,
    request_id: str,
) -> bytes:
    from fpdf import FPDF

    class Doc(FPDF):
        pass

    pdf = Doc()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.set_margins(14, 14, 14)
    pdf.add_page()

    def write_block(text: str, *, h: float, bold: bool = False) -> None:
        t = _ascii_for_pdf(text, 8000).strip()
        if not t:
            return
        pdf.set_x(pdf.l_margin)
        if bold:
            pdf.set_font("Helvetica", "B", 11)
        else:
            pdf.set_font("Helvetica", size=10)
        pdf.multi_cell(0, h, t)

    pdf.set_font("Helvetica", "B", 14)
    write_block("MedAssist - payment approval receipt", h=7, bold=True)
    pdf.ln(3)
    pdf.set_font("Helvetica", size=9)
    write_block(
        "This document summarizes an approved payment request in the MedAssist portal. "
        "It is not a tax invoice unless separately issued by your provider.",
        h=4,
    )
    pdf.ln(4)

    tkey = (treatment_type or "").strip().lower().replace("-", "_")
    tlabel = _TREATMENT_LABELS.get(tkey, treatment_type or "-")
    dash = "-"
    lines = [
        f"Patient: {patient_display or dash}",
        f"Request ID: {request_id or dash}",
        "Status: Approved",
        "",
        f"Amount: {amount or dash}",
        f"Treatment: {tlabel}",
        f"Payment mode: {payment_mode or dash}",
        f"Payment date: {payment_on or dash}",
        f"Valid until: {valid_until or dash}",
        f"Submitted: {created_at or dash}",
    ]
    if (reviewed_at or "").strip():
        lines.append(f"Reviewed: {reviewed_at}")
    body = "\n".join(lines)
    pdf.set_font("Helvetica", size=10)
    write_block(body, h=5)

    out = pdf.output(dest="S")
    if isinstance(out, str):
        return out.encode("latin-1", errors="replace")
    if isinstance(out, (bytes, bytearray)):
        return bytes(out)
    return bytes(str(out), "latin-1", errors="replace")
