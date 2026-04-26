"""Parse Symptom Analyst replies for structured JSON + rule-based fallbacks."""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.symptom_context import build_urgency_hint

_JSON_MARKER = "<<<MEDASSIST_SYMPTOM_JSON>>>"

_VALID_LEVELS = frozenset({"emergency", "very_urgent", "urgent", "soon", "routine"})
_GREETING_WORDS = frozenset(
    {
        "hi",
        "hello",
        "hey",
        "hola",
        "namaste",
        "good morning",
        "good afternoon",
        "good evening",
        "yo",
        "sup",
        "hii",
        "heyy",
    }
)
_SYMPTOM_HINT_WORDS = frozenset(
    {
        "pain",
        "fever",
        "cough",
        "cold",
        "vomit",
        "nausea",
        "headache",
        "dizzy",
        "dizziness",
        "breath",
        "bleed",
        "bleeding",
        "swelling",
        "rash",
        "infection",
        "injury",
        "burn",
        "chest",
        "stomach",
        "abdomen",
        "throat",
        "diarrhea",
        "constipation",
        "weakness",
        "fatigue",
    }
)


def _coerce_level(raw: object) -> str:
    if not isinstance(raw, str):
        return "routine"
    s = raw.strip().lower().replace(" ", "_").replace("-", "_")
    aliases = {
        "critical": "emergency",
        "immediate": "emergency",
        "life_threatening": "emergency",
        "severe": "very_urgent",
        "high": "urgent",
        "medium": "soon",
        "low": "routine",
        "non_urgent": "routine",
        "not_urgent": "routine",
    }
    s = aliases.get(s, s)
    if s in _VALID_LEVELS:
        return s
    if "emergency" in s or "911" in s or "er_now" in s:
        return "emergency"
    if "very" in s and "urgent" in s:
        return "very_urgent"
    if "urgent" in s:
        return "urgent"
    return "routine"


def _coerce_score(raw: object, level: str) -> int:
    if isinstance(raw, (int, float)) and not isinstance(raw, bool):
        v = int(round(float(raw)))
        return max(1, min(10, v))
    defaults = {"emergency": 10, "very_urgent": 9, "urgent": 7, "soon": 4, "routine": 2}
    return defaults.get(level, 3)


def _fallback_from_messages(messages: list[dict[str, Any]]) -> dict[str, Any]:
    hint = build_urgency_hint(messages)
    elevated = "elevated" in hint.lower() or "red-flag" in hint.lower()
    if elevated:
        return {
            "urgencyLevel": "very_urgent",
            "urgencyLabel": "Potentially serious symptoms — seek medical attention promptly",
            "urgencyScore": 9,
            "holisticSummary": "Rule-based scan flagged high-risk wording in your description. "
            "A clinician should evaluate you soon even if this chat could not load full AI JSON.",
            "suggestions": [
                "Contact your doctor or an urgent-care clinic today, or emergency services if symptoms are severe or worsening.",
                "If you have chest pain, trouble breathing, stroke symptoms, severe bleeding, or altered consciousness, call emergency services now.",
            ],
            "differentialIdeas": [],
            "seeDoctorWithin": "immediate",
            "source": "rule_fallback",
        }
    return {
        "urgencyLevel": "routine",
        "urgencyLabel": "No automated red-flag match in recent text",
        "urgencyScore": 3,
        "holisticSummary": "Continue the interview; use portal profile and vitals when available for context.",
        "suggestions": ["Answer follow-up questions from the assistant to refine next steps."],
        "differentialIdeas": [],
        "seeDoctorWithin": "routine",
        "source": "rule_fallback",
    }


def _is_non_clinical_opening(messages: list[dict[str, Any]]) -> bool:
    """Treat pure greeting/small-talk openers as non-urgent until symptoms are provided."""
    user_texts: list[str] = []
    for m in messages:
        if not isinstance(m, dict) or m.get("role") != "user":
            continue
        c = m.get("content")
        if isinstance(c, str) and c.strip():
            user_texts.append(c.strip().lower())
    if not user_texts:
        return False

    # If there is any symptom-like wording, do not suppress urgency.
    joined = " ".join(user_texts)
    if any(w in joined for w in _SYMPTOM_HINT_WORDS):
        return False

    # Greeting-only when all user entries are short and made of greeting words/punctuation.
    for text in user_texts:
        cleaned = re.sub(r"[^a-z\s]", " ", text).strip()
        if not cleaned:
            continue
        if len(cleaned) > 24:
            return False
        tokens = [t for t in cleaned.split() if t]
        if not tokens:
            continue
        token_phrase = " ".join(tokens)
        if token_phrase in _GREETING_WORDS:
            continue
        if not all(t in _GREETING_WORDS for t in tokens):
            return False
    return True


def _normalize_parsed(
    data: dict[str, Any], messages: list[dict[str, Any]], *, from_model: bool
) -> dict[str, Any]:
    fb = _fallback_from_messages(messages)
    level = _coerce_level(data.get("urgencyLevel", fb["urgencyLevel"]))
    score = _coerce_score(data.get("urgencyScore"), level)
    fb_level = fb["urgencyLevel"]
    fb_score = int(fb["urgencyScore"])
    # Conservative: never downgrade below rule-based red-flag escalation.
    order = {"routine": 1, "soon": 2, "urgent": 3, "very_urgent": 4, "emergency": 5}
    if order.get(level, 1) < order.get(fb_level, 1):
        level = fb_level
    if score < fb_score:
        score = fb_score

    suggestions = data.get("suggestions")
    if not isinstance(suggestions, list):
        suggestions = fb["suggestions"]
    else:
        suggestions = [str(x).strip() for x in suggestions if str(x).strip()]
        if not suggestions:
            suggestions = fb["suggestions"]

    diffs = data.get("differentialIdeas")
    if not isinstance(diffs, list):
        diffs = []

    holistic = data.get("holisticSummary")
    if not isinstance(holistic, str) or not holistic.strip():
        holistic = fb["holisticSummary"]

    see = data.get("seeDoctorWithin")
    if not isinstance(see, str) or not see.strip():
        see = fb["seeDoctorWithin"]
    see = see.strip().lower()

    label = data.get("urgencyLabel")
    if not isinstance(label, str) or not label.strip():
        label = fb["urgencyLabel"]

    out: dict[str, Any] = {
        "urgencyLevel": level,
        "urgencyLabel": label.strip()[:500],
        "urgencyScore": score,
        "holisticSummary": holistic.strip()[:4000],
        "suggestions": suggestions[:20],
        "differentialIdeas": diffs[:15],
        "seeDoctorWithin": see[:80],
        "source": "model_json" if from_model and data else "rule_fallback",
    }
    if _is_non_clinical_opening(messages):
        out.update(
            {
                "urgencyLevel": "routine",
                "urgencyLabel": "No symptoms detected yet — please describe what you are feeling.",
                "urgencyScore": 2,
                "seeDoctorWithin": "routine",
                "source": "smalltalk_guard",
            }
        )
        out["suggestions"] = [
            "Share your symptoms, when they started, and severity (1-10).",
            "If there is severe pain, trouble breathing, heavy bleeding, or stroke signs, seek emergency care now.",
        ]
    return out


def split_symptom_reply(raw: str, messages: list[dict[str, Any]]) -> tuple[str, dict[str, Any]]:
    """Return (patient_visible_reply, assessment_dict)."""
    text = raw or ""
    if _JSON_MARKER in text:
        head, tail = text.split(_JSON_MARKER, 1)
        display = head.rstrip()
        blob = tail.strip()
        blob = re.sub(r"^```(?:json)?\s*", "", blob, flags=re.IGNORECASE)
        blob = re.sub(r"\s*```\s*$", "", blob)
        try:
            data = json.loads(blob)
            if isinstance(data, dict):
                vis = display.strip()
                if not vis:
                    vis = "Review the guidance above and the structured assessment below."
                return vis, _normalize_parsed(data, messages, from_model=True)
        except json.JSONDecodeError:
            pass
        vis = display.strip() or (raw or "").strip()
        return vis, _normalize_parsed({}, messages, from_model=False)

    # Optional: trailing ```json ... ``` without marker
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```\s*$", text.strip(), re.IGNORECASE)
    if fence:
        try:
            data = json.loads(fence.group(1).strip())
            if isinstance(data, dict) and (
                "urgencyLevel" in data or "urgencyScore" in data or "suggestions" in data
            ):
                display = text[: fence.start()].rstrip()
                vis = display.strip()
                if not vis:
                    vis = "Review the guidance above and the structured assessment below."
                return vis, _normalize_parsed(data, messages, from_model=True)
        except json.JSONDecodeError:
            pass

    return text.strip(), _normalize_parsed({}, messages, from_model=False)
