from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import case, func, insert, select

from app.extensions import db
from app.models.ai_usage_event import AiUsageEvent


def _usage_from_response(resp: Any) -> tuple[int | None, int | None, int | None]:
    u = getattr(resp, "usage", None)
    if u is None:
        return None, None, None
    pt = getattr(u, "prompt_tokens", None)
    ct = getattr(u, "completion_tokens", None)
    tt = getattr(u, "total_tokens", None)
    try:
        return (
            int(pt) if pt is not None else None,
            int(ct) if ct is not None else None,
            int(tt) if tt is not None else None,
        )
    except (TypeError, ValueError):
        return None, None, None


def record_ai_usage_event(
    *,
    operation: str,
    model: str,
    success: bool,
    latency_ms: int | None,
    response: Any | None = None,
    error_summary: str | None = None,
    source: str | None = None,
    user_id: str | None = None,
) -> None:
    """Persist one usage row in its own transaction (never raises)."""
    pt = ct = tt = None
    if response is not None and success:
        pt, ct, tt = _usage_from_response(response)
    err = (error_summary or "").strip()
    if len(err) > 500:
        err = err[:500] + "…"
    try:
        tbl = AiUsageEvent.__table__
        with db.engine.begin() as conn:
            conn.execute(
                insert(tbl).values(
                    id=str(uuid.uuid4()),
                    created_at=datetime.utcnow(),
                    operation=(operation or "unknown")[:24],
                    source=(source or "")[:80],
                    model=(model or "")[:120],
                    prompt_tokens=pt,
                    completion_tokens=ct,
                    total_tokens=tt,
                    latency_ms=latency_ms,
                    success=bool(success),
                    error_summary=err or None,
                    user_id=(user_id or "").strip() or None,
                )
            )
    except Exception:
        pass


def _err_count():
    return func.sum(case((AiUsageEvent.success.is_(False), 1), else_=0))


def _bundle_row(row: tuple[Any, ...]) -> dict[str, Any]:
    cnt, pt, ct, tt, avg_lat, errs = row
    avg = float(avg_lat) if avg_lat is not None else None
    return {
        "requests": int(cnt or 0),
        "promptTokens": int(pt or 0),
        "completionTokens": int(ct or 0),
        "totalTokens": int(tt or 0),
        "avgLatencyMs": round(avg, 1) if avg is not None else None,
        "errors": int(errs or 0),
    }


def aggregate_ai_usage(
    *,
    start: datetime | None,
    end_exclusive: datetime | None,
) -> dict[str, Any]:
    """Single-window aggregates + breakdowns + daily series."""
    t = AiUsageEvent

    def wf(stmt):
        if start is not None:
            stmt = stmt.where(t.created_at >= start)
        if end_exclusive is not None:
            stmt = stmt.where(t.created_at < end_exclusive)
        return stmt

    totals_stmt = wf(
        select(
            func.count(t.id),
            func.coalesce(func.sum(t.prompt_tokens), 0),
            func.coalesce(func.sum(t.completion_tokens), 0),
            func.coalesce(func.sum(t.total_tokens), 0),
            func.avg(t.latency_ms),
            _err_count(),
        )
    )
    tr = db.session.execute(totals_stmt).one()
    totals = _bundle_row(tuple(tr))
    ok = totals["requests"] - totals["errors"]
    totals["successfulRequests"] = max(0, ok)
    totals["successRatePct"] = (
        round(100.0 * ok / totals["requests"], 2) if totals["requests"] else None
    )

    first_at = last_at = None
    if totals["requests"]:
        r1 = db.session.execute(wf(select(func.min(t.created_at)))).scalar()
        r2 = db.session.execute(wf(select(func.max(t.created_at)))).scalar()

        def _iso(x: datetime | None) -> str | None:
            if not x:
                return None
            if getattr(x, "tzinfo", None) is None:
                return x.replace(microsecond=0).isoformat() + "Z"
            return x.isoformat()

        first_at = _iso(r1)
        last_at = _iso(r2)

    def grouped(label_col, label_key: str, label_max: int):
        stmt = (
            select(
                label_col,
                func.count(t.id),
                func.coalesce(func.sum(t.prompt_tokens), 0),
                func.coalesce(func.sum(t.completion_tokens), 0),
                func.coalesce(func.sum(t.total_tokens), 0),
                func.avg(t.latency_ms),
                _err_count(),
            )
            .group_by(label_col)
            .order_by(func.count(t.id).desc())
        )
        rows = db.session.execute(wf(stmt)).all()
        out = []
        for key, *rest in rows:
            lbl = (key or "(unknown)")[:label_max]
            out.append({label_key: lbl, **_bundle_row(tuple(rest))})
        return out

    by_model = grouped(t.model, "model", 120)
    by_source = grouped(t.source, "source", 80)
    by_operation = grouped(t.operation, "operation", 24)

    day_col = func.date(t.created_at)
    daily_stmt = wf(
        select(
            day_col.label("d"),
            func.count(t.id),
            func.coalesce(func.sum(t.prompt_tokens), 0),
            func.coalesce(func.sum(t.completion_tokens), 0),
            func.coalesce(func.sum(t.total_tokens), 0),
            func.avg(t.latency_ms),
            _err_count(),
        ).group_by(day_col).order_by(day_col)
    )
    by_day: list[dict[str, Any]] = []
    for dval, *rest in db.session.execute(daily_stmt).all():
        day_str = str(dval) if dval is not None else ""
        by_day.append({"date": day_str, **_bundle_row(tuple(rest))})

    return {
        "totals": totals,
        "firstEventAt": first_at,
        "lastEventAt": last_at,
        "byModel": by_model,
        "bySource": by_source,
        "byOperation": by_operation,
        "byDay": by_day,
    }


def recent_ai_usage_events(
    *,
    limit: int = 80,
    start: datetime | None = None,
    end_exclusive: datetime | None = None,
) -> list[dict[str, Any]]:
    q = AiUsageEvent.query
    if start is not None:
        q = q.filter(AiUsageEvent.created_at >= start)
    if end_exclusive is not None:
        q = q.filter(AiUsageEvent.created_at < end_exclusive)
    rows = q.order_by(AiUsageEvent.created_at.desc()).limit(min(max(limit, 1), 200)).all()
    out: list[dict[str, Any]] = []
    for r in rows:
        ca = r.created_at
        iso = (
            ca.replace(microsecond=0).isoformat() + "Z"
            if ca and getattr(ca, "tzinfo", None) is None
            else (ca.isoformat() if ca else "")
        )
        out.append(
            {
                "id": r.id,
                "createdAt": iso,
                "operation": r.operation,
                "source": r.source or "",
                "model": r.model or "",
                "promptTokens": r.prompt_tokens,
                "completionTokens": r.completion_tokens,
                "totalTokens": r.total_tokens,
                "latencyMs": r.latency_ms,
                "success": r.success,
                "errorSummary": r.error_summary or "",
                "userId": r.user_id or "",
            }
        )
    return out


def parse_range_dates(
    from_s: str | None, to_s: str | None
) -> tuple[datetime, datetime, date, date]:
    """
    Returns (start_dt inclusive naive UTC, end_exclusive, from_date, to_date) for the selected
    inclusive calendar range. Defaults to last 30 days when args missing/invalid.
    """
    today = datetime.utcnow().date()
    default_from = today - timedelta(days=29)
    from_d = default_from
    to_d = today
    if from_s:
        try:
            from_d = date.fromisoformat(from_s.strip()[:10])
        except ValueError:
            pass
    if to_s:
        try:
            to_d = date.fromisoformat(to_s.strip()[:10])
        except ValueError:
            pass
    if from_d > to_d:
        from_d, to_d = to_d, from_d
    start_dt = datetime.combine(from_d, time.min)
    end_exclusive = datetime.combine(to_d + timedelta(days=1), time.min)
    return start_dt, end_exclusive, from_d, to_d


def build_ai_logs_payload(from_q: str | None, to_q: str | None) -> dict[str, Any]:
    start_r, end_ex, from_d, to_d = parse_range_dates(from_q, to_q)
    lifetime = aggregate_ai_usage(start=None, end_exclusive=None)
    in_range = aggregate_ai_usage(start=start_r, end_exclusive=end_ex)
    return {
        "range": {
            "from": from_d.isoformat(),
            "to": to_d.isoformat(),
        },
        "lifetime": lifetime,
        "inRange": in_range,
        "recentEvents": recent_ai_usage_events(limit=80),
        "recentEventsInRange": recent_ai_usage_events(
            limit=80, start=start_r, end_exclusive=end_ex
        ),
    }
