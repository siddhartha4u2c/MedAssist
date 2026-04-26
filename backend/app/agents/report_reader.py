from __future__ import annotations

import json
import re
from typing import Any

from app.agents.base_agent import AgentContext, BaseAgent
from app.integrations.openai_client import chat_completion, chat_completion_with_images


class ReportReaderAgent(BaseAgent):
    """Agent 2 — Medical Report Reader: labs, imaging text, and vision for X-rays / scans (JPEG/PNG/PDF text)."""

    name = "report_reader"

    def system_prompt(self) -> str:
        return (
            "You are MedAssist Medical Report Reader (Agent 2). Interpret laboratory reports, "
            "clinical notes, radiology text, and diagnostic images (e.g. chest X-ray). "
            "Be precise, conservative, and clear. Never invent numeric values not visible in the input. "
            "Always include a brief disclaimer that this is informational and not a substitute for a clinician."
        )

    def run(self, payload: dict[str, Any], context: AgentContext) -> dict[str, Any]:
        text = str(payload.get("text", payload.get("message", "")))
        reply = self.complete(text, context=context)
        return {"agent": self.name, "reply": reply}

    def structured_analysis(
        self,
        *,
        title: str,
        report_type: str,
        extracted_text: str,
        image_parts: list[tuple[str, str]],
        locale: str,
    ) -> dict[str, Any]:
        """
        Return a dict matching the MedAssist analysis schema (also JSON-serializable for storage).
        image_parts: list of (mime_type, base64_without_prefix).
        """
        schema_hint = (
            "Respond with a single JSON object only (no markdown fences), using this shape:\n"
            '{"reportKind":"lab|imaging|radiology|pathology|mixed|unknown",'
            '"summaryForPatient":"plain language overview",'
            '"findingsNormal":["..."],'
            '"findingsAbnormalOrNotable":["..."],'
            '"extractedValues":[{"name":"","value":"","unit":"","referenceOrRange":"","flag":"normal|high|low|unknown"}],'
            '"imagingInterpretation":"for X-ray/CT/MRI or empty if not applicable",'
            '"recommendedActions":["..."],'
            '"urgency":"routine|soon|urgent",'
            '"disclaimer":"short non-diagnostic disclaimer"}\n'
        )
        user_text = (
            f"Report title: {title}\n"
            f"Declared type hint from uploader: {report_type}\n"
            f"Locale for patient-facing text: {locale}\n\n"
            f"Extracted document text (may be empty if only images were sent):\n"
            f"{extracted_text[:120_000]}\n\n"
            f"{schema_hint}"
        )

        if image_parts:
            content: list[dict[str, Any]] = [{"type": "text", "text": user_text}]
            for mime, b64 in image_parts[:6]:
                m = mime if "/" in mime else f"image/{mime}"
                url = f"data:{m};base64,{b64}"
                content.append({"type": "image_url", "image_url": {"url": url}})
            raw = chat_completion_with_images(
                model=self.config.llm_model_primary,
                messages=[
                    {"role": "system", "content": self.system_prompt()},
                    {"role": "user", "content": content},
                ],
                temperature=0.2,
                max_tokens=4096,
                source=self.name,
            )
        else:
            raw = chat_completion(
                model=self.config.llm_model_primary,
                messages=[
                    {"role": "system", "content": self.system_prompt()},
                    {"role": "user", "content": user_text},
                ],
                temperature=0.2,
                max_tokens=4096,
                source=self.name,
            )

        return self._parse_analysis_json(raw)

    @staticmethod
    def _parse_analysis_json(raw: str) -> dict[str, Any]:
        s = (raw or "").strip()
        fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", s, re.I)
        if fence:
            s = fence.group(1).strip()
        try:
            data = json.loads(s)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
        return {
            "reportKind": "unknown",
            "summaryForPatient": s[:4000] if s else "Analysis could not be structured as JSON.",
            "findingsNormal": [],
            "findingsAbnormalOrNotable": [],
            "extractedValues": [],
            "imagingInterpretation": "",
            "recommendedActions": ["Share this report with your clinician for interpretation."],
            "urgency": "routine",
            "disclaimer": "Automated analysis; not a medical diagnosis.",
            "_parseNote": "model_returned_non_json",
        }
