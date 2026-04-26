from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect, text

db = SQLAlchemy()


def _ensure_user_profile_columns() -> None:
    """Add first_name / last_name to existing SQLite DBs (dev-friendly)."""
    if getattr(db.engine.dialect, "name", "") != "sqlite":
        return
    try:
        insp = inspect(db.engine)
        tables = insp.get_table_names()
        if "users" not in tables:
            return
        cols = {c["name"] for c in insp.get_columns("users")}
        with db.engine.begin() as conn:
            if "first_name" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE users ADD COLUMN first_name VARCHAR(100) NOT NULL DEFAULT ''"
                    )
                )
            if "last_name" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE users ADD COLUMN last_name VARCHAR(100) NOT NULL DEFAULT ''"
                    )
                )
    except Exception:
        pass


def _ensure_user_access_columns() -> None:
    """access_blocked + account_removed_at for admin user management (dev-friendly ALTER)."""
    try:
        insp = inspect(db.engine)
        tables = insp.get_table_names()
        if "users" not in tables:
            return
        cols = {c["name"] for c in insp.get_columns("users")}
        dialect = getattr(db.engine.dialect, "name", "") or ""
        stmts: list[str] = []
        if "access_blocked" not in cols:
            if dialect == "postgresql":
                stmts.append(
                    "ALTER TABLE users ADD COLUMN access_blocked BOOLEAN NOT NULL DEFAULT FALSE"
                )
            else:
                stmts.append(
                    "ALTER TABLE users ADD COLUMN access_blocked BOOLEAN NOT NULL DEFAULT 0"
                )
        if "account_removed_at" not in cols:
            stmts.append("ALTER TABLE users ADD COLUMN account_removed_at TIMESTAMP")
        if not stmts:
            return
        with db.engine.begin() as conn:
            for s in stmts:
                conn.execute(text(s))
    except Exception:
        pass


def _ensure_patient_profile_portal_columns() -> None:
    """Add assigned doctor + care plan columns on existing patient_profiles (dev-friendly)."""
    try:
        insp = inspect(db.engine)
        tables = insp.get_table_names()
        if "patient_profiles" not in tables:
            return
        cols = {c["name"] for c in insp.get_columns("patient_profiles")}
        stmts: list[str] = []
        if "assigned_doctor_user_id" not in cols:
            stmts.append(
                "ALTER TABLE patient_profiles ADD COLUMN assigned_doctor_user_id VARCHAR(36)"
            )
        if "care_plan_text" not in cols:
            stmts.append("ALTER TABLE patient_profiles ADD COLUMN care_plan_text TEXT")
        if not stmts:
            return
        with db.engine.begin() as conn:
            for s in stmts:
                conn.execute(text(s))
    except Exception:
        pass


def _ensure_patient_report_columns() -> None:
    """Add file + AI analysis columns on older patient_reports tables."""
    try:
        insp = inspect(db.engine)
        tables = insp.get_table_names()
        if "patient_reports" not in tables:
            return
        cols = {c["name"] for c in insp.get_columns("patient_reports")}
        dialect = getattr(db.engine.dialect, "name", "") or ""
        stmts: list[str] = []
        if "original_filename" not in cols:
            stmts.append("ALTER TABLE patient_reports ADD COLUMN original_filename VARCHAR(400)")
        if "stored_relative_path" not in cols:
            stmts.append("ALTER TABLE patient_reports ADD COLUMN stored_relative_path VARCHAR(500)")
        if "mime_type" not in cols:
            stmts.append("ALTER TABLE patient_reports ADD COLUMN mime_type VARCHAR(120)")
        if "file_size_bytes" not in cols:
            stmts.append("ALTER TABLE patient_reports ADD COLUMN file_size_bytes BIGINT")
        if "report_type" not in cols:
            stmts.append(
                "ALTER TABLE patient_reports ADD COLUMN report_type VARCHAR(40) NOT NULL DEFAULT 'other'"
            )
        if "ai_analysis_status" not in cols:
            stmts.append(
                "ALTER TABLE patient_reports ADD COLUMN ai_analysis_status VARCHAR(20) NOT NULL DEFAULT 'none'"
            )
        if "ai_analysis_json" not in cols:
            if dialect == "postgresql":
                stmts.append("ALTER TABLE patient_reports ADD COLUMN ai_analysis_json JSONB")
            else:
                stmts.append("ALTER TABLE patient_reports ADD COLUMN ai_analysis_json TEXT")
        if "ai_error" not in cols:
            stmts.append("ALTER TABLE patient_reports ADD COLUMN ai_error TEXT")
        if "analyzed_at" not in cols:
            stmts.append("ALTER TABLE patient_reports ADD COLUMN analyzed_at TIMESTAMP")
        if not stmts:
            return
        with db.engine.begin() as conn:
            for s in stmts:
                try:
                    conn.execute(text(s))
                except Exception:
                    pass
    except Exception:
        pass


def _ensure_appointment_columns() -> None:
    """Add columns missing on older appointments tables (SQLite / dev)."""
    try:
        insp = inspect(db.engine)
        tables = insp.get_table_names()
        if "appointments" not in tables:
            return
        cols = {c["name"] for c in insp.get_columns("appointments")}
        stmts: list[str] = []
        if "video_join_url" not in cols:
            stmts.append("ALTER TABLE appointments ADD COLUMN video_join_url TEXT")
        if "cancellation_reason" not in cols:
            stmts.append("ALTER TABLE appointments ADD COLUMN cancellation_reason TEXT")
        if not stmts:
            return
        with db.engine.begin() as conn:
            for s in stmts:
                conn.execute(text(s))
    except Exception:
        pass


def _ensure_doctor_profile_columns() -> None:
    """Add academic / experience / achievements columns on existing DBs (dev-friendly)."""
    try:
        insp = inspect(db.engine)
        tables = insp.get_table_names()
        if "doctor_profiles" not in tables:
            return
        cols = {c["name"] for c in insp.get_columns("doctor_profiles")}
        stmts: list[str] = []
        if "academic_records" not in cols:
            stmts.append(
                "ALTER TABLE doctor_profiles ADD COLUMN academic_records TEXT"
            )
        if "professional_experience" not in cols:
            stmts.append(
                "ALTER TABLE doctor_profiles ADD COLUMN professional_experience TEXT"
            )
        if "achievements" not in cols:
            stmts.append("ALTER TABLE doctor_profiles ADD COLUMN achievements TEXT")
        if "photo_data_url" not in cols:
            stmts.append("ALTER TABLE doctor_profiles ADD COLUMN photo_data_url TEXT")
        if not stmts:
            return
        with db.engine.begin() as conn:
            for s in stmts:
                conn.execute(text(s))
    except Exception:
        pass


class Extensions:
    def init_app(self, app: Flask) -> None:
        db.init_app(app)
        with app.app_context():
            import app.models  # noqa: F401 — register models
            db.create_all()
            _ensure_user_profile_columns()
            _ensure_user_access_columns()
            _ensure_patient_profile_portal_columns()
            _ensure_doctor_profile_columns()
            _ensure_appointment_columns()
            _ensure_patient_report_columns()
            _migrate_legacy_patient_doctor_assignments()


def _migrate_legacy_patient_doctor_assignments() -> None:
    """Copy patient_profiles.assigned_doctor_user_id into patient_doctor_links once."""
    try:
        from app.models.patient_doctor_link import PatientDoctorLink
        from app.models.patient_profile import PatientProfile

        insp = inspect(db.engine)
        if "patient_doctor_links" not in insp.get_table_names():
            return
        rows = PatientProfile.query.filter(PatientProfile.assigned_doctor_user_id.isnot(None)).all()
        for pr in rows:
            aid = (pr.assigned_doctor_user_id or "").strip()
            if not aid:
                continue
            exists = PatientDoctorLink.query.filter_by(
                patient_user_id=pr.user_id, doctor_user_id=aid
            ).first()
            if exists:
                continue
            db.session.add(
                PatientDoctorLink(patient_user_id=pr.user_id, doctor_user_id=aid)
            )
        db.session.commit()
    except Exception:
        try:
            db.session.rollback()
        except Exception:
            pass


extensions = Extensions()
