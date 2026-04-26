"""Telemedicine room provisioning.

**Daily.co (recommended)** — set `DAILY_API_KEY` (Dashboard → Developers). We `POST /v1/rooms` with
`Authorization: Bearer <key>` and JSON including `properties.enable_chat` / `enable_screenshare` (and `exp` when
configured). Optional `properties.enable_recording` from `DAILY_ENABLE_RECORDING` (`cloud`, `cloud-audio-only`,
`local`, `raw-tracks`; see Daily create-room docs). The created room’s `url` field is the join link. Optional:
`DAILY_API_BASE_URL` (default `https://api.daily.co/v1`), `DAILY_ROOM_EXP_BUFFER_SEC`, `DAILY_CREATE_ROOM_JSON`
(merges into the body; nested `properties` deep-merges).

**Other providers** — if `DAILY_API_KEY` is unset, set both `VIDEOCO_API_KEY` and `VIDEOCO_API_BASE_URL` for the
generic POST flow (see `VIDEOCO_CREATE_ROOM_PATH`, etc.).
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.config import Config, effective_daily_api_key

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class VideoCoProvisionResult:
    room_id: str | None
    join_url: str | None
    error: str | None


def _timeout(cfg: Config) -> int:
    return max(5, cfg.videoco_request_timeout_sec)


def _daily_exp_unix(cfg: Config, ends_at_naive: datetime | None) -> int | None:
    """Unix time when Daily may delete the room. Never in the past (Daily rejects invalid exp)."""
    if ends_at_naive is None:
        return None
    if os.environ.get("DAILY_SKIP_ROOM_EXP", "").strip().lower() in ("1", "true", "yes"):
        return None
    dt = ends_at_naive.replace(tzinfo=timezone.utc)
    exp = int(dt.timestamp()) + max(0, cfg.daily_room_exp_buffer_sec)
    floor = int(datetime.now(timezone.utc).timestamp()) + 300
    return max(exp, floor)


def _daily_enabled(cfg: Config) -> bool:
    return bool(effective_daily_api_key(cfg).strip())


def _provision_daily_co(
    cfg: Config,
    appointment_id: str,
    title: str,
    ends_at_naive: datetime | None,
) -> VideoCoProvisionResult:
    """POST https://api.daily.co/v1/rooms — https://docs.daily.co/reference/rest-api/rooms/create-room"""
    base = cfg.daily_api_base_url.rstrip("/")
    url = f"{base}/rooms"
    exp = _daily_exp_unix(cfg, ends_at_naive)

    safe_id = "".join(c for c in appointment_id.lower() if c.isalnum() or c == "-")[:48]
    if not safe_id:
        safe_id = secrets.token_hex(8)

    for attempt in range(4):
        if attempt == 0:
            room_name = f"medassist-{safe_id}"
        else:
            room_name = f"medassist-{safe_id}-{secrets.token_hex(4)}"

        # Same shape as Daily's REST examples: Authorization + JSON body; `url` in response is the meeting link.
        # https://docs.daily.co/reference/rest-api/rooms/create-room
        props: dict[str, Any] = {
            "enable_chat": True,
            "enable_screenshare": True,
        }
        rec = (getattr(cfg, "daily_enable_recording", None) or "").strip()
        if rec:
            props["enable_recording"] = rec
        if exp is not None:
            props["exp"] = exp

        body: dict[str, Any] = {
            "name": room_name,
            "privacy": "public",
            "properties": props,
        }

        extra = os.environ.get("DAILY_CREATE_ROOM_JSON", "").strip()
        if extra:
            try:
                merged = json.loads(extra)
                if isinstance(merged, dict):
                    extra_props = merged.pop("properties", None)
                    body.update(merged)
                    if isinstance(extra_props, dict):
                        body.setdefault("properties", {}).update(extra_props)
            except json.JSONDecodeError:
                log.warning("[Daily.co] DAILY_CREATE_ROOM_JSON is not valid JSON; ignored.")

        api_key = effective_daily_api_key(cfg)
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        raw = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(url, data=raw, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=_timeout(cfg)) as resp:
                text = resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")[:800]
            if e.code == 409 and attempt < 3:
                log.info("[Daily.co] room name conflict %s, retrying…", room_name)
                continue
            msg = f"HTTP {e.code}: {err_body or e.reason}"
            log.warning("[Daily.co] %s", msg)
            return VideoCoProvisionResult(None, None, msg)
        except OSError as e:
            log.warning("[Daily.co] request failed: %s", e)
            return VideoCoProvisionResult(None, None, str(e))

        try:
            payload = json.loads(text) if text else {}
        except json.JSONDecodeError:
            return VideoCoProvisionResult(None, None, "Invalid JSON from Daily.co")

        if not isinstance(payload, dict):
            return VideoCoProvisionResult(None, None, "Unexpected Daily.co response")

        join_url = str(payload.get("url") or payload.get("room_url") or "").strip() or None
        conf = payload.get("config")
        if not join_url and isinstance(conf, dict):
            join_url = str(conf.get("url") or "").strip() or None
        room_id = str(payload.get("name") or payload.get("id") or "").strip() or None
        if join_url:
            return VideoCoProvisionResult(room_id, join_url, None)
        return VideoCoProvisionResult(None, None, "Daily.co response missing url")

    return VideoCoProvisionResult(None, None, "Could not allocate a unique Daily.co room name")


def _videoco_generic_enabled(cfg: Config) -> bool:
    return bool(cfg.videoco_api_key and cfg.videoco_api_base_url)


def _extract_room_and_url(payload: Any) -> tuple[str | None, str | None]:
    if not isinstance(payload, dict):
        return None, None
    join_url = (
        payload.get("joinUrl")
        or payload.get("join_url")
        or payload.get("url")
        or payload.get("roomUrl")
        or payload.get("meetingUrl")
    )
    room_id = payload.get("roomId") or payload.get("room_id") or payload.get("id")
    nested = payload.get("data")
    if isinstance(nested, dict):
        join_url = join_url or nested.get("joinUrl") or nested.get("url")
        room_id = room_id or nested.get("id") or nested.get("roomId")
    room = str(room_id).strip() if room_id else None
    url = str(join_url).strip() if join_url else None
    return (room or None, url or None)


def _provision_generic_videoco(
    cfg: Config, appointment_id: str, title: str
) -> VideoCoProvisionResult:
    path = cfg.videoco_create_room_path
    if not path.startswith("/"):
        path = "/" + path
    url = f"{cfg.videoco_api_base_url}{path}"

    body: dict[str, Any] = {
        "externalId": appointment_id,
        "name": f"medassist-{appointment_id[:8]}",
        "title": title[:200],
    }
    extra = os.environ.get("VIDEOCO_CREATE_BODY_JSON", "").strip()
    if extra:
        try:
            merged = json.loads(extra)
            if isinstance(merged, dict):
                body.update(merged)
        except json.JSONDecodeError:
            log.warning("[Video] VIDEOCO_CREATE_BODY_JSON is not valid JSON; ignored.")

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    key_header = os.environ.get("VIDEOCO_API_KEY_HEADER_NAME", "").strip()
    if key_header:
        headers[key_header] = cfg.videoco_api_key
    else:
        headers["Authorization"] = f"Bearer {cfg.videoco_api_key}"

    raw = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=raw, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=_timeout(cfg)) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:500]
        msg = f"HTTP {e.code}: {err_body or e.reason}"
        log.warning("[Video] %s", msg)
        return VideoCoProvisionResult(None, None, msg)
    except OSError as e:
        log.warning("[Video] request failed: %s", e)
        return VideoCoProvisionResult(None, None, str(e))

    try:
        payload = json.loads(text) if text else {}
    except json.JSONDecodeError:
        return VideoCoProvisionResult(None, None, "Invalid JSON from video provider")

    room_id, join_url = _extract_room_and_url(payload)
    if not join_url and not room_id:
        return VideoCoProvisionResult(None, None, "Video provider response missing room id / join URL")
    return VideoCoProvisionResult(room_id, join_url, None)


def is_video_provider_configured(cfg: Config) -> bool:
    """True if Daily.co or the generic VIDEOCO_* provider can create rooms."""
    return _daily_enabled(cfg) or _videoco_generic_enabled(cfg)


def provision_telemedicine_room(
    cfg: Config,
    appointment_id: str,
    title: str,
    *,
    ends_at_utc_naive: datetime | None = None,
) -> VideoCoProvisionResult:
    """Create a Daily.co room when `DAILY_API_KEY` is set; otherwise optional generic Video API."""
    if _daily_enabled(cfg):
        return _provision_daily_co(cfg, appointment_id, title, ends_at_utc_naive)
    if _videoco_generic_enabled(cfg):
        return _provision_generic_videoco(cfg, appointment_id, title)
    return VideoCoProvisionResult(
        None,
        None,
        "Video provider not configured. Set DAILY_API_KEY in backend/.env (Daily.co dashboard → Developers) "
        "or set VIDEOCO_API_BASE_URL and VIDEOCO_API_KEY, then restart Flask.",
    )
