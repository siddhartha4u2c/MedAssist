from __future__ import annotations

from typing import Any

from app.agents.base_agent import AgentContext
from app.agents.drug_interaction_agent import DrugInteractionAgent
from app.agents.followup_agent import FollowUpAgent
from app.agents.monitoring_agent import MonitoringAgent
from app.agents.report_reader import ReportReaderAgent
from app.agents.symptom_analyst import SymptomAnalystAgent
from app.agents.triage_agent import TriageAgent
from app.agents.voice_agent import VoiceAgent
from app.config import Config


class AgentOrchestrator:
    """Routes intents to specialist agents (PRD Agent Orchestrator skeleton)."""

    def __init__(self, config: Config) -> None:
        self._config = config
        self._agents: dict[str, Any] = {
            "symptom": SymptomAnalystAgent(config),
            "report": ReportReaderAgent(config),
            "triage": TriageAgent(config),
            "voice": VoiceAgent(config),
            "drug": DrugInteractionAgent(config),
            "monitoring": MonitoringAgent(config),
            "followup": FollowUpAgent(config),
        }

    def route(self, intent: str) -> Any:
        key = (intent or "symptom").lower().strip()
        if key not in self._agents:
            key = "symptom"
        return self._agents[key]

    def dispatch(
        self,
        intent: str,
        payload: dict[str, Any],
        *,
        patient_id: str | None = None,
        locale: str = "en",
    ) -> dict[str, Any]:
        agent = self.route(intent)
        ctx = AgentContext(patient_id=patient_id, locale=locale)
        return agent.run(payload, ctx)
