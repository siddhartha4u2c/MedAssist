from __future__ import annotations

from typing import Any

from app.agents.base_agent import AgentContext, BaseAgent


class DrugInteractionAgent(BaseAgent):
    name = "drug_interaction"

    def system_prompt(self) -> str:
        return (
            "You are MedAssist Drug Interaction Agent. Review medication lists for "
            "interactions and allergies. Classify severity; cite that this is informational "
            "only and a pharmacist/clinician must verify."
        )

    def run(self, payload: dict[str, Any], context: AgentContext) -> dict[str, Any]:
        text = str(payload.get("medications", payload.get("message", "")))
        reply = self.complete(text, context=context)
        return {"agent": self.name, "reply": reply}
