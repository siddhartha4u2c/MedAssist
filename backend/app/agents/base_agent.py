from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from app.config import Config
from app.integrations.openai_client import chat_completion


@dataclass
class AgentContext:
    """Per-request context passed into specialist agents."""

    patient_id: str | None
    locale: str
    clinical_context: str | None = None


class BaseAgent(ABC):
    """Specialist agent: uses OpenAI-compatible chat completions."""

    name: str

    def __init__(self, config: Config) -> None:
        self._config = config

    @property
    def config(self) -> Config:
        return self._config

    @abstractmethod
    def system_prompt(self) -> str:
        raise NotImplementedError

    def complete(
        self,
        user_message: str,
        *,
        context: AgentContext,
        model: str | None = None,
    ) -> str:
        cfg = self._config
        m = model or cfg.llm_model_primary
        return chat_completion(
            model=m,
            messages=[
                {"role": "system", "content": self.system_prompt()},
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
        """Multi-turn chat: `messages` are user/assistant turns (no system)."""
        cfg = self._config
        m = model or cfg.llm_model_primary
        system = self.system_prompt()
        locale = (context.locale or "en").strip() or "en"
        ctx_line = f"\n\nSession context: locale={locale}."
        if context.patient_id:
            ctx_line += " Opaque patient reference is available; do not ask for names or government IDs."
        full: list[dict[str, Any]] = [
            {"role": "system", "content": system + ctx_line},
            *messages,
        ]
        return chat_completion(model=m, messages=full, source=self.name)

    @abstractmethod
    def run(self, payload: dict[str, Any], context: AgentContext) -> dict[str, Any]:
        raise NotImplementedError
