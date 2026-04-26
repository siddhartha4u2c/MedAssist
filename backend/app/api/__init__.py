from flask import Flask


def register_blueprints(app: Flask) -> None:
    from app.api.v1 import agents as agents_v1
    from app.api.v1 import auth as auth_v1
    from app.api.v1 import admin_leads as admin_leads_v1
    from app.api.v1 import health as health_v1
    from app.api.v1 import patient_profile as patient_profile_v1
    from app.api.v1 import doctor_profile as doctor_profile_v1
    from app.api.v1 import doctor_patients as doctor_patients_v1
    from app.api.v1 import admin_portal as admin_portal_v1
    from app.api.v1 import patient_payment_requests as patient_payment_requests_v1
    from app.api.v1 import appointments as appointments_v1
    from app.api.v1 import assistant_chat as assistant_chat_v1
    from app.api.v1 import symptoms as symptoms_v1
    from app.api.v1 import notifications as notifications_v1

    app.register_blueprint(health_v1.bp)
    app.register_blueprint(admin_leads_v1.bp)
    app.register_blueprint(admin_portal_v1.bp)
    app.register_blueprint(agents_v1.bp)
    # Register before other /api/v1 blueprints so /appointments/* is never shadowed.
    app.register_blueprint(appointments_v1.bp)
    app.register_blueprint(assistant_chat_v1.bp)
    app.register_blueprint(symptoms_v1.bp)
    app.register_blueprint(notifications_v1.bp)
    app.register_blueprint(patient_profile_v1.bp)
    app.register_blueprint(patient_payment_requests_v1.bp)
    app.register_blueprint(doctor_profile_v1.bp)
    app.register_blueprint(doctor_patients_v1.bp)
    app.register_blueprint(auth_v1.bp)
