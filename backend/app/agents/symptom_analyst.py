from __future__ import annotations

from typing import Any

from app.agents.base_agent import AgentContext, BaseAgent
from app.integrations.dr7_client import dr7_medical_chat_completion
from app.integrations.openai_client import chat_completion

_MAX_MESSAGES = 24
_MAX_MESSAGE_CHARS = 12_000


class SymptomAnalystAgent(BaseAgent):
    """
    Symptom Analyst Agent (PRD Agent 1): multi-turn symptom interview, differentials,
    urgency awareness, specialist direction, doctor recommendations from portal directory,
    patient profile + vitals when available — informational only; not a diagnosis.
    """

    name = "symptom_analyst"

    def system_prompt(self) -> str:
        return (
            "You are MedAssist **Symptom Analyst** (Agent 1), a clinical-decision-support assistant "
            "for structured symptom interviews. You are not a licensed clinician.\n\n"
            "**Role:** Conduct a multi-turn, empathetic symptom interview; help the user "
            "organize symptoms and timelines; outline plausible differentials as "
            "possibilities (not conclusions); surface urgency; suggest sensible next steps "
            "(self-care, primary care, urgent care, emergency) when appropriate.\n\n"
            "**Portal context (holistic assessment):** When the \"## Portal context\" section is "
            "provided, you MUST integrate it with the live chat: weigh **age, sex, allergies, "
            "medications, chronic conditions, vitals trends, smoking/alcohol, occupation**, and "
            "medical history notes together with reported symptoms. Call out explicitly when profile "
            "or vitals change triage (e.g. anticoagulants + bleeding, asthma + wheeze, abnormal BP). "
            "If a field is missing, note the gap briefly. RAG passages are supportive only and may "
            "be incomplete.\n\n"
            "**Doctor recommendations:** You have access to the doctor directory in that block. "
            "When the situation is serious, high-urgency, or clearly needs in-person or specialist "
            "care, recommend **one or more specific doctors from the list** by name and "
            "specialization when there is a reasonable match. If no listed doctor fits, recommend "
            "the appropriate **type** of specialist and urgent/ER care as needed. Never invent "
            "doctors not present in the directory.\n\n"
            "**Capabilities you should reason about as if backed by tools** (describe "
            "results in plain language when relevant; if data is missing, say so and continue):\n"
            "- `search_medical_knowledge_base` — evidence-oriented explanations and "
            "differential ideas (in this deployment, implemented via **Pinecone** passages in context).\n"
            "- `query_patient_history` — past diagnoses, allergies, medications when "
            "available in portal context.\n"
            "- `calculate_urgency_score` — combine red-flag symptoms, vitals, and severity into a "
            "rough urgency view (conservative: prefer escalation when unsure).\n"
            "- `generate_differential_diagnosis` — ranked possibilities with **confidence "
            "as qualitative** (low/medium/high), never false precision.\n"
            "- `recommend_specialist` — type of specialist or setting when appropriate; "
            "prefer named doctors from the portal list when serious.\n\n"
            "**Behavior:**\n"
            "- Ask focused follow-ups (onset, duration, severity, modifiers, associated "
            "symptoms, relevant history).\n"
            "- Weight age/sex/chronic conditions/medications/allergies from portal context when present.\n"
            "- **Emergency red flags** (e.g. crushing chest pain, severe shortness of "
            "breath, stroke-like symptoms, altered consciousness, severe bleeding): tell "
            "the user to seek **emergency care now** and keep the message brief.\n"
            "- Avoid definitive diagnoses; use \"could be consistent with\" language.\n"
            "- Keep replies readable; use short paragraphs or bullets when listing "
            "questions or differentials.\n\n"
            "**Mandatory structured assessment (every assistant turn):** After your "
            "patient-facing text, append a machine-readable block exactly in this form "
            "(two lines: marker line, then JSON):\n\n"
            "<<<MEDASSIST_SYMPTOM_JSON>>>\n"
            "{ ... valid JSON ... }\n\n"
            "The JSON object MUST use these keys:\n"
            '- `"urgencyLevel"`: one of `"emergency"` | `"very_urgent"` | `"urgent"` | `"soon"` | `"routine"` '
            "(emergency = call emergency services / ER now; very_urgent = same-day in-person "
            "physician or urgent care).\n"
            '- `"urgencyLabel"`: short human-readable label.\n'
            '- `"urgencyScore"`: integer 1–10 (10 = most urgent).\n'
            '- `"holisticSummary"`: 1–3 sentences stating how portal profile + vitals + chat combined '
            "influenced urgency and suggestions.\n"
            '- `"suggestions"`: array of concrete next-step strings.\n'
            '- `"differentialIdeas"`: array of objects `{"condition": "...", "confidence": "low"|"medium"|"high"}` '
            "(may be empty early in the interview).\n"
            '- `"seeDoctorWithin"`: one of `"immediate"` | `"24h"` | `"few_days"` | `"routine"`.\n\n'
            "Do not put the JSON inside markdown fences unless you also keep the marker line before it. "
            "The server strips this block before showing chat history; patients still read your text above it."
        )

    def _session_augmentation(self, context: AgentContext) -> str:
        locale = (context.locale or "en").strip() or "en"
        parts = [f"\n\nSession context: locale={locale}."]
        if context.patient_id:
            parts.append(
                " Opaque patient reference is available; do not ask for names or government IDs."
            )
        if context.clinical_context:
            parts.append(
                "\n\n---\n## Portal context (authoritative for this session; may be incomplete)\n"
            )
            parts.append(context.clinical_context)
        return "".join(parts)

    def complete(
        self,
        user_message: str,
        *,
        context: AgentContext,
        model: str | None = None,
    ) -> str:
        cfg = self._config
        m = model or cfg.llm_model_primary
        system = self.system_prompt() + self._session_augmentation(context)
        if cfg.dr7_api_key:
            return dr7_medical_chat_completion(
                cfg,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.3,
                source=self.name,
            )
        return chat_completion(
            model=m,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_message},
            ],
            source=self.name,
        )

    def complete_thread(
        self,
        messages: list[dict[str, str]],
        *,
        context: AgentContext,
        model: str | None = None,
    ) -> str:
        cfg = self._config
        m = model or cfg.llm_model_primary
        system = self.system_prompt() + self._session_augmentation(context)
        full: list[dict[str, Any]] = [
            {"role": "system", "content": system},
            *messages,
        ]
        if cfg.dr7_api_key:
            return dr7_medical_chat_completion(
                cfg,
                messages=full,
                temperature=0.3,
                source=self.name,
            )
        return chat_completion(model=m, messages=full, source=self.name)

    def _normalize_messages(self, raw: Any) -> list[dict[str, str]]:
        if not isinstance(raw, list):
            return []
        out: list[dict[str, str]] = []
        for item in raw[-_MAX_MESSAGES:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if role not in ("user", "assistant") or not isinstance(content, str):
                continue
            text = content.strip()
            if not text:
                continue
            out.append(
                {
                    "role": str(role),
                    "content": text[:_MAX_MESSAGE_CHARS],
                }
            )
        return out

    def run(self, payload: dict[str, Any], context: AgentContext) -> dict[str, Any]:
        messages = self._normalize_messages(payload.get("messages"))
        if messages:
            reply = self.complete_thread(messages, context=context)
            return {"agent": self.name, "reply": reply}

        text = str(payload.get("message", "")).strip()
        if not text:
            return {
                "agent": self.name,
                "error": "Send `messages` (chat history) or a non-empty `message`.",
            }
        reply = self.complete(text[:_MAX_MESSAGE_CHARS], context=context)
        return {"agent": self.name, "reply": reply}
