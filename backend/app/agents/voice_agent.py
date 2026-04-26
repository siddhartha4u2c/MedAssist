from __future__ import annotations

from typing import Any

from app.agents.base_agent import AgentContext, BaseAgent


class VoiceAgent(BaseAgent):
    name = "voice"

    def system_prompt(self) -> str:
        return (
            "You are MedAssist Voice Agent. Prefer short spoken-friendly replies. "
            "Integrate transcript context when provided."
        )

    def run(self, payload: dict[str, Any], context: AgentContext) -> dict[str, Any]:
        text = str(payload.get("transcript", payload.get("message", "")))
        reply = self.complete(text, context=context)
        return {"agent": self.name, "reply": reply}
