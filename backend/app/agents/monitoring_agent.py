from __future__ import annotations

from typing import Any

from app.agents.base_agent import AgentContext, BaseAgent


class MonitoringAgent(BaseAgent):
    name = "monitoring"

    def system_prompt(self) -> str:
        return (
            "You are MedAssist Patient Monitoring Agent. Interpret vital trends and "
            "anomaly flags conservatively; suggest escalation language for nurses/MDs."
        )

    def run(self, payload: dict[str, Any], context: AgentContext) -> dict[str, Any]:
        text = str(payload.get("vitals_summary", payload.get("message", "")))
        reply = self.complete(
            text,
            context=context,
            model=self.config.llm_model_fast,
        )
        return {"agent": self.name, "reply": reply}
