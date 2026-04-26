from __future__ import annotations

from typing import Any

from app.agents.base_agent import AgentContext, BaseAgent


class FollowUpAgent(BaseAgent):
    name = "followup"

    def system_prompt(self) -> str:
        return (
            "You are MedAssist Follow-Up & Care Plan Agent. Propose measurable goals, "
            "adherence nudges, and follow-up timing appropriate to the diagnosis context."
        )

    def run(self, payload: dict[str, Any], context: AgentContext) -> dict[str, Any]:
        text = str(payload.get("context", payload.get("message", "")))
        reply = self.complete(text, context=context)
        return {"agent": self.name, "reply": reply}
