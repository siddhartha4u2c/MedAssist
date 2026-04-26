from __future__ import annotations

from typing import Any

from app.agents.base_agent import AgentContext, BaseAgent


class TriageAgent(BaseAgent):
    name = "triage"

    def system_prompt(self) -> str:
        return (
            "You are MedAssist Triage. Be fast and conservative. Estimate ESI 1-5 style "
            "urgency in text only; escalate obvious emergencies. Keep answers very short."
        )

    def run(self, payload: dict[str, Any], context: AgentContext) -> dict[str, Any]:
        text = str(payload.get("message", ""))
        reply = self.complete(
            text,
            context=context,
            model=self.config.llm_model_fast,
        )
        return {"agent": self.name, "reply": reply}
