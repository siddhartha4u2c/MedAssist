# AI Medical Assistant & Patient Monitoring System — PRD

## 1. Product Overview

**Product Name:** MedAssist AI
**Version:** 1.0
**Type:** Full-stack Agentic AI Platform
**Domain:** Healthcare / Telemedicine / Patient Monitoring

MedAssist AI is a real-time, agentic AI-powered medical assistant platform designed for hospitals, telemedicine providers, and health startups. It combines symptom analysis, medical report interpretation, continuous patient monitoring, voice-based interaction, and intelligent alerting into a unified system. The platform leverages multiple specialized AI agents that collaborate autonomously to deliver accurate, context-aware medical insights to both patients and healthcare professionals.

---

## 2. Tech Stack

### 2.1 Frontend

| Layer              | Technology                              |
| ------------------ | --------------------------------------- |
| Framework          | Next.js 14+ (App Router)               |
| UI Library         | React 18+                              |
| Styling            | Tailwind CSS 3+                        |
| Component Library  | shadcn/ui + Radix UI primitives        |
| State Management   | Zustand + React Query (TanStack Query) |
| Forms              | React Hook Form + Zod validation       |
| Charts / Vitals    | Recharts + D3.js                       |
| Real-time          | Socket.IO Client                       |
| Voice UI           | Web Speech API + custom components     |
| Video Calls        | WebRTC via Daily.co SDK                |
| PDF Rendering      | react-pdf                              |
| Notifications      | react-hot-toast + Web Push API         |
| Auth UI            | NextAuth.js                            |
| Testing            | Jest + React Testing Library + Cypress |
| Internationalization | next-intl                            |

### 2.2 Backend

| Layer              | Technology                                    |
| ------------------ | --------------------------------------------- |
| Framework          | Python 3.11+ / Flask 3+                       |
| API Style          | RESTful + WebSocket (Flask-SocketIO)           |
| Task Queue         | Celery + Redis                                |
| Database (Primary) | PostgreSQL 16                                 |
| Database (Cache)   | Redis 7                                       |
| Database (Vector)  | Pinecone (for medical knowledge embeddings)   |
| Database (Time-series) | InfluxDB (for vitals/monitoring data)     |
| ORM                | SQLAlchemy 2.0                                |
| Migrations         | Alembic                                       |
| Auth               | Flask-JWT-Extended + OAuth2                   |
| File Storage       | AWS S3 / MinIO                                |
| Search             | Elasticsearch (medical records search)        |
| API Documentation  | Flasgger (Swagger/OpenAPI 3.0)                |
| Testing            | pytest + pytest-cov + Factory Boy             |
| HIPAA Logging      | structlog + audit trail middleware             |

### 2.3 AI / LLM Layer (OpenAI-compatible via EURI)

The stack uses the **OpenAI Python SDK** with `base_url` pointed at the EURI-compatible endpoint. Authentication uses **`EURI_API_KEY`** (not `OPENAI_API_KEY`). Model IDs remain configurable (`LLM_MODEL_PRIMARY`, `LLM_MODEL_FAST`, etc.) and must match what your EURI provider exposes.

| Capability              | Model / API                                |
| ------------------------ | ------------------------------------------ |
| Primary LLM             | GPT-4-class (medical reasoning)            |
| Fast Inference           | Smaller GPT model (triage, classification) |
| Speech-to-Text           | Whisper-compatible endpoint (if offered)  |
| Text-to-Speech           | TTS-compatible endpoint (if offered)        |
| Vision (Report Scanning) | Vision-capable chat model                  |
| Embeddings               | text-embedding-class model                  |
| Function Calling         | tool_use / function calling                 |
| Structured Outputs       | JSON mode / response_format                |
| Moderation               | Moderation endpoint (if offered)          |

**Minimal SDK usage (EURI):** set `EURI_API_KEY` and `EURI_BASE_URL` to match your provider. Example for **euron.one**:

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_EURI_API_KEY",
    base_url="https://api.euron.one/api/v1/euri",
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain AGI in 2 simple lines."},
    ],
    max_tokens=200,
    temperature=0.7,
)

print(response.choices[0].message.content)
```

MedAssist maps the same pattern in `backend/app/integrations/openai_client.py`, reading credentials from the environment instead of hard-coding them.

### 2.4 Infrastructure & DevOps

| Layer          | Technology                          |
| -------------- | ----------------------------------- |
| Containerization | Docker + Docker Compose           |
| Orchestration  | Kubernetes (EKS)                    |
| CI/CD          | GitHub Actions                      |
| Monitoring     | Prometheus + Grafana                |
| Log Management | ELK Stack (Elasticsearch, Logstash, Kibana) |
| API Gateway    | Kong / Nginx                        |
| CDN            | CloudFront                          |
| Secrets        | AWS Secrets Manager / HashiCorp Vault |
| IaC            | Terraform                           |

---

## 3. System Architecture

### 3.1 High-Level Architecture Diagram (Textual)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (Next.js)                          │
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │ Patient  │ │ Doctor   │ │ Admin    │ │ Voice    │ │ Monitoring   │ │
│  │ Portal   │ │ Dashboard│ │ Panel    │ │ Assistant│ │ Dashboard    │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘ │
│       │             │            │             │              │         │
│       └─────────────┴────────────┴─────────────┴──────────────┘         │
│                              │  WebSocket + REST                        │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    API Gateway       │
                    │  (Kong / Nginx)      │
                    └──────────┬──────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────┐
│                     BACKEND LAYER (Flask)                               │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ Auth        │  │ Patient API │  │ Monitoring  │  │ Reports API  │  │
│  │ Service     │  │ Service     │  │ Service     │  │ Service      │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └──────────────┘  │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ Appointment │  │ Notification│  │ Telemedicine│  │ Analytics    │  │
│  │ Service     │  │ Service     │  │ Service     │  │ Service      │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └──────────────┘  │
│                                                                         │
│                    ┌──────────────────────┐                             │
│                    │   WebSocket Server   │                             │
│                    │  (Flask-SocketIO)    │                             │
│                    └──────────────────────┘                             │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────┐
│                     AGENTIC AI LAYER                                    │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Agent Orchestrator                              │  │
│  │         (Routes tasks to specialized agents)                      │  │
│  └───────┬──────┬──────┬──────┬──────┬──────┬──────┬────────────────┘  │
│          │      │      │      │      │      │      │                    │
│   ┌──────▼┐ ┌──▼────┐ ┌▼─────┐ ┌───▼──┐ ┌─▼────┐ ┌▼──────┐ ┌──────┐ │
│   │Symptom│ │Report │ │Triage│ │Voice │ │Drug  │ │Monitor│ │Follow│ │
│   │Analyst│ │Reader │ │Agent │ │Agent │ │Inter.│ │Agent  │ │Up    │ │
│   │Agent  │ │Agent  │ │      │ │      │ │Agent │ │       │ │Agent │ │
│   └───────┘ └───────┘ └──────┘ └──────┘ └──────┘ └───────┘ └──────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │              Shared Context / Memory Store (Redis + Pinecone)     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────────┐
│                       DATA LAYER                                        │
│                                                                         │
│  ┌────────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐ │
│  │ PostgreSQL │ │ Redis    │ │ InfluxDB  │ │ Pinecone │ │ S3/MinIO  │ │
│  │ (Primary)  │ │ (Cache)  │ │ (Vitals)  │ │ (Vectors)│ │ (Files)   │ │
│  └────────────┘ └──────────┘ └───────────┘ └──────────┘ └───────────┘ │
│                                                                         │
│  ┌─────────────────────┐  ┌─────────────────────────────────────────┐  │
│  │ Elasticsearch       │  │ Celery + Redis (Task Queue)             │  │
│  │ (Full-text Search)  │  │                                         │  │
│  └─────────────────────┘  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Agentic Architecture — Agent Definitions

The system is built around **7 specialized AI agents** coordinated by a central **Agent Orchestrator**. Each agent operates autonomously with its own tools, memory, and decision-making capabilities.

#### Agent Orchestrator
- **Role:** Central router that receives all incoming requests, classifies intent, and dispatches to the appropriate specialist agent(s). Can invoke multiple agents in parallel for complex queries.
- **Model:** GPT-4o with function calling
- **Tools:** Agent registry, task router, context aggregator, response synthesizer
- **Memory:** Short-term conversation buffer (Redis), long-term patient context (Pinecone)

#### Agent 1: Symptom Analyst Agent
- **Role:** Conducts multi-turn symptom interviews, builds differential diagnosis lists, assigns urgency scores, and recommends next steps.
- **Model:** GPT-4o (for complex medical reasoning)
- **Tools:**
  - `search_medical_knowledge_base` — RAG over medical literature embeddings
  - `query_patient_history` — fetch past diagnoses, allergies, medications
  - `calculate_urgency_score` — rule-based + ML urgency scoring
  - `generate_differential_diagnosis` — structured output of possible conditions
  - `recommend_specialist` — maps symptoms to specialist type
- **Behavior:**
  - Asks follow-up questions to narrow down symptoms
  - Considers patient history, age, sex, pre-existing conditions
  - Outputs a ranked list of possible conditions with confidence scores
  - Flags emergency symptoms immediately (chest pain, breathing difficulty, etc.)
  - Generates structured JSON for downstream consumption

#### Agent 2: Medical Report Reader Agent
- **Role:** Ingests and interprets medical reports (lab results, imaging, pathology) using vision and text analysis.
- **Model:** GPT-4o Vision
- **Tools:**
  - `extract_text_from_image` — OCR for scanned reports
  - `parse_lab_values` — structured extraction of lab values with reference ranges
  - `identify_abnormalities` — flags out-of-range values
  - `explain_report_in_plain_language` — patient-friendly explanations
  - `correlate_with_history` — cross-references with patient's medical history
  - `generate_report_summary` — structured summary for doctor review
- **Behavior:**
  - Accepts PDF, image, or text-based reports
  - Extracts structured data (test name, value, unit, reference range, status)
  - Highlights critical/abnormal values with color-coded severity
  - Provides plain-language explanations for patients
  - Generates trend analysis when historical data is available
  - Suggests follow-up tests if needed

#### Agent 3: Triage Agent
- **Role:** Performs real-time emergency triage based on reported symptoms, vitals, and patient history. Assigns ESI (Emergency Severity Index) levels.
- **Model:** GPT-4o-mini (fast inference required)
- **Tools:**
  - `evaluate_esi_level` — Emergency Severity Index (1-5) calculation
  - `check_red_flags` — pattern matching against emergency symptom database
  - `route_to_emergency` — triggers emergency protocols
  - `assign_priority_queue` — places patient in appointment priority queue
  - `notify_on_call_physician` — sends urgent alerts
- **Behavior:**
  - Near-instant response (<2 seconds)
  - Conservative bias — errs on the side of higher urgency
  - Automatically escalates ESI Level 1-2 to emergency protocols
  - Integrates with hospital queue management systems
  - Logs all triage decisions for audit compliance

#### Agent 4: Voice Interaction Agent
- **Role:** Handles all voice-based interactions — converting speech to text, processing commands, and providing spoken responses.
- **Model:** Whisper API (STT) + GPT-4o (processing) + TTS API (speech output)
- **Tools:**
  - `transcribe_audio` — Whisper API real-time transcription
  - `detect_language` — multi-language detection
  - `synthesize_speech` — OpenAI TTS with configurable voice/speed
  - `extract_medical_entities` — NER for symptoms, medications, body parts
  - `manage_voice_session` — session state for multi-turn voice conversations
- **Behavior:**
  - Supports 50+ languages via Whisper
  - Real-time streaming transcription for live consultations
  - Medical terminology-aware transcription with custom vocabulary
  - Ambient listening mode for doctor-patient conversations (with consent)
  - Generates structured clinical notes from voice conversations
  - Adjustable speech rate and voice tone for accessibility

#### Agent 5: Drug Interaction Agent
- **Role:** Analyzes medication lists for interactions, contraindications, dosage verification, and allergy cross-references.
- **Model:** GPT-4o
- **Tools:**
  - `check_drug_interactions` — pairwise interaction analysis
  - `verify_dosage` — age/weight-appropriate dosage validation
  - `check_allergy_crossreference` — cross-references with patient allergy profile
  - `search_drug_database` — RAG over drug information embeddings
  - `suggest_alternatives` — recommends alternative medications
  - `generate_medication_schedule` — creates optimized dosing schedule
- **Behavior:**
  - Real-time interaction checking as medications are prescribed
  - Severity classification (mild, moderate, severe, contraindicated)
  - Considers patient-specific factors (renal function, liver function, pregnancy)
  - Alerts prescribing physician with evidence-based citations
  - Maintains up-to-date drug database via periodic embedding refresh

#### Agent 6: Patient Monitoring Agent
- **Role:** Continuously monitors incoming patient vitals from IoT devices, detects anomalies, predicts deterioration, and triggers alerts.
- **Model:** GPT-4o-mini (fast pattern recognition)
- **Tools:**
  - `ingest_vitals_stream` — processes real-time vitals data from InfluxDB
  - `detect_anomaly` — statistical + ML anomaly detection on vitals
  - `predict_deterioration` — early warning score calculation (NEWS2, MEWS)
  - `trigger_alert` — multi-channel alerting (push, SMS, pager, dashboard)
  - `generate_vitals_report` — periodic summary with trend analysis
  - `correlate_vitals_with_medications` — checks if vitals changes correlate with med schedule
- **Behavior:**
  - 24/7 continuous monitoring with configurable thresholds per patient
  - Adaptive baselines — learns each patient's normal ranges
  - Predictive alerts 30-60 minutes before potential deterioration
  - Integrates with bedside monitors, wearables, and IoT devices
  - Escalation chains — nurse → attending physician → specialist
  - Generates shift handoff reports automatically

#### Agent 7: Follow-Up & Care Plan Agent
- **Role:** Generates personalized care plans, schedules follow-ups, sends reminders, and tracks treatment adherence.
- **Model:** GPT-4o
- **Tools:**
  - `generate_care_plan` — personalized plan based on diagnosis and patient profile
  - `schedule_followup` — integrates with appointment system
  - `send_reminder` — multi-channel reminders (push, SMS, email)
  - `track_adherence` — monitors medication and appointment adherence
  - `adjust_care_plan` — dynamically adjusts based on progress
  - `generate_patient_education` — creates condition-specific educational content
- **Behavior:**
  - Creates evidence-based care plans with measurable goals
  - Adaptive scheduling based on patient response and adherence patterns
  - Sends personalized health tips and educational content
  - Tracks treatment milestones and alerts physicians on deviations
  - Supports chronic disease management programs
  - Generates progress reports for both patient and physician

---

## 4. Project Directory Structure

```
medassist-ai/
├── CLAUDE.md
├── docker-compose.yml
├── docker-compose.prod.yml
├── Makefile
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── cd-staging.yml
│       ├── cd-production.yml
│       └── security-scan.yml
│
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── .env.local.example
│   ├── public/
│   │   ├── icons/
│   │   ├── images/
│   │   └── sounds/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx                     # Root layout with providers
│   │   │   ├── page.tsx                       # Landing page
│   │   │   ├── globals.css
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   ├── forgot-password/page.tsx
│   │   │   │   └── verify-email/page.tsx
│   │   │   ├── (patient)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── dashboard/page.tsx         # Patient home dashboard
│   │   │   │   ├── symptoms/
│   │   │   │   │   ├── page.tsx               # Symptom checker main
│   │   │   │   │   ├── [sessionId]/page.tsx   # Active symptom session
│   │   │   │   │   └── history/page.tsx       # Past symptom checks
│   │   │   │   ├── reports/
│   │   │   │   │   ├── page.tsx               # All reports
│   │   │   │   │   ├── upload/page.tsx        # Upload new report
│   │   │   │   │   └── [reportId]/page.tsx    # Report detail + AI analysis
│   │   │   │   ├── medications/
│   │   │   │   │   ├── page.tsx               # Current medications
│   │   │   │   │   ├── interactions/page.tsx  # Drug interaction checker
│   │   │   │   │   └── schedule/page.tsx      # Medication schedule
│   │   │   │   ├── vitals/
│   │   │   │   │   ├── page.tsx               # Vitals dashboard
│   │   │   │   │   ├── history/page.tsx       # Historical vitals
│   │   │   │   │   └── devices/page.tsx       # Connected devices
│   │   │   │   ├── appointments/
│   │   │   │   │   ├── page.tsx               # Upcoming appointments
│   │   │   │   │   ├── book/page.tsx          # Book appointment
│   │   │   │   │   └── [appointmentId]/page.tsx
│   │   │   │   ├── telemedicine/
│   │   │   │   │   ├── page.tsx               # Telemedicine lobby
│   │   │   │   │   └── [sessionId]/page.tsx   # Active video call
│   │   │   │   ├── care-plan/
│   │   │   │   │   ├── page.tsx               # Active care plans
│   │   │   │   │   └── [planId]/page.tsx      # Care plan detail
│   │   │   │   ├── chat/
│   │   │   │   │   └── page.tsx               # AI chat assistant
│   │   │   │   ├── voice/
│   │   │   │   │   └── page.tsx               # Voice assistant
│   │   │   │   └── profile/
│   │   │   │       ├── page.tsx               # Patient profile
│   │   │   │       ├── medical-history/page.tsx
│   │   │   │       └── settings/page.tsx
│   │   │   ├── (doctor)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── dashboard/page.tsx         # Doctor home dashboard
│   │   │   │   ├── patients/
│   │   │   │   │   ├── page.tsx               # Patient list
│   │   │   │   │   └── [patientId]/
│   │   │   │   │       ├── page.tsx           # Patient overview
│   │   │   │   │       ├── vitals/page.tsx    # Patient vitals
│   │   │   │   │       ├── reports/page.tsx   # Patient reports
│   │   │   │   │       ├── medications/page.tsx
│   │   │   │   │       ├── notes/page.tsx     # Clinical notes
│   │   │   │   │       └── care-plan/page.tsx
│   │   │   │   ├── monitoring/
│   │   │   │   │   ├── page.tsx               # Real-time monitoring wall
│   │   │   │   │   └── alerts/page.tsx        # Active alerts
│   │   │   │   ├── prescriptions/
│   │   │   │   │   ├── page.tsx               # Prescription management
│   │   │   │   │   └── new/page.tsx           # New prescription + interaction check
│   │   │   │   ├── appointments/
│   │   │   │   │   └── page.tsx               # Doctor schedule
│   │   │   │   ├── telemedicine/
│   │   │   │   │   └── [sessionId]/page.tsx   # Video consultation room
│   │   │   │   ├── analytics/
│   │   │   │   │   └── page.tsx               # Clinical analytics
│   │   │   │   └── ai-assistant/
│   │   │   │       └── page.tsx               # Doctor's AI copilot
│   │   │   ├── (admin)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── dashboard/page.tsx         # Admin overview
│   │   │   │   ├── users/page.tsx             # User management
│   │   │   │   ├── roles/page.tsx             # Role & permission management
│   │   │   │   ├── audit-logs/page.tsx        # HIPAA audit trail
│   │   │   │   ├── system-health/page.tsx     # System monitoring
│   │   │   │   ├── ai-config/page.tsx         # AI agent configuration
│   │   │   │   └── settings/page.tsx          # Platform settings
│   │   │   └── api/
│   │   │       └── auth/
│   │   │           └── [...nextauth]/route.ts
│   │   ├── components/
│   │   │   ├── ui/                            # shadcn/ui components
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   ├── toast.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   └── ... (all shadcn primitives)
│   │   │   ├── layout/
│   │   │   │   ├── header.tsx
│   │   │   │   ├── sidebar.tsx
│   │   │   │   ├── footer.tsx
│   │   │   │   ├── mobile-nav.tsx
│   │   │   │   └── breadcrumbs.tsx
│   │   │   ├── auth/
│   │   │   │   ├── login-form.tsx
│   │   │   │   ├── register-form.tsx
│   │   │   │   └── protected-route.tsx
│   │   │   ├── chat/
│   │   │   │   ├── chat-window.tsx
│   │   │   │   ├── message-bubble.tsx
│   │   │   │   ├── typing-indicator.tsx
│   │   │   │   ├── chat-input.tsx
│   │   │   │   └── suggestion-chips.tsx
│   │   │   ├── voice/
│   │   │   │   ├── voice-recorder.tsx
│   │   │   │   ├── audio-visualizer.tsx
│   │   │   │   ├── voice-controls.tsx
│   │   │   │   └── transcript-display.tsx
│   │   │   ├── symptoms/
│   │   │   │   ├── body-map.tsx               # Interactive body diagram
│   │   │   │   ├── symptom-form.tsx
│   │   │   │   ├── severity-slider.tsx
│   │   │   │   ├── diagnosis-card.tsx
│   │   │   │   └── urgency-badge.tsx
│   │   │   ├── reports/
│   │   │   │   ├── report-uploader.tsx
│   │   │   │   ├── report-viewer.tsx
│   │   │   │   ├── lab-value-table.tsx
│   │   │   │   ├── abnormality-highlight.tsx
│   │   │   │   └── trend-chart.tsx
│   │   │   ├── vitals/
│   │   │   │   ├── vitals-grid.tsx
│   │   │   │   ├── heart-rate-chart.tsx
│   │   │   │   ├── blood-pressure-chart.tsx
│   │   │   │   ├── spo2-gauge.tsx
│   │   │   │   ├── temperature-chart.tsx
│   │   │   │   ├── vitals-alert-banner.tsx
│   │   │   │   └── real-time-monitor.tsx
│   │   │   ├── medications/
│   │   │   │   ├── medication-list.tsx
│   │   │   │   ├── interaction-alert.tsx
│   │   │   │   ├── dosage-calendar.tsx
│   │   │   │   └── prescription-form.tsx
│   │   │   ├── monitoring/
│   │   │   │   ├── patient-monitor-card.tsx
│   │   │   │   ├── alert-feed.tsx
│   │   │   │   ├── monitoring-wall.tsx
│   │   │   │   └── escalation-timeline.tsx
│   │   │   ├── telemedicine/
│   │   │   │   ├── video-call.tsx
│   │   │   │   ├── call-controls.tsx
│   │   │   │   ├── participant-grid.tsx
│   │   │   │   ├── screen-share.tsx
│   │   │   │   └── consultation-notes.tsx
│   │   │   ├── care-plan/
│   │   │   │   ├── care-plan-timeline.tsx
│   │   │   │   ├── goal-tracker.tsx
│   │   │   │   ├── adherence-chart.tsx
│   │   │   │   └── milestone-card.tsx
│   │   │   └── shared/
│   │   │       ├── loading-skeleton.tsx
│   │   │       ├── error-boundary.tsx
│   │   │       ├── empty-state.tsx
│   │   │       ├── confirmation-dialog.tsx
│   │   │       ├── search-bar.tsx
│   │   │       ├── pagination.tsx
│   │   │       ├── date-range-picker.tsx
│   │   │       └── file-upload.tsx
│   │   ├── hooks/
│   │   │   ├── use-auth.ts
│   │   │   ├── use-socket.ts
│   │   │   ├── use-voice-recorder.ts
│   │   │   ├── use-vitals-stream.ts
│   │   │   ├── use-chat.ts
│   │   │   ├── use-notifications.ts
│   │   │   ├── use-media-devices.ts
│   │   │   └── use-debounce.ts
│   │   ├── lib/
│   │   │   ├── api-client.ts                  # Axios instance with interceptors
│   │   │   ├── socket-client.ts               # Socket.IO client setup
│   │   │   ├── auth.ts                        # NextAuth config
│   │   │   ├── utils.ts                       # Utility functions
│   │   │   ├── constants.ts
│   │   │   └── validators.ts                  # Zod schemas
│   │   ├── stores/
│   │   │   ├── auth-store.ts
│   │   │   ├── chat-store.ts
│   │   │   ├── vitals-store.ts
│   │   │   ├── notification-store.ts
│   │   │   └── ui-store.ts
│   │   ├── types/
│   │   │   ├── patient.ts
│   │   │   ├── doctor.ts
│   │   │   ├── vitals.ts
│   │   │   ├── reports.ts
│   │   │   ├── medications.ts
│   │   │   ├── appointments.ts
│   │   │   ├── chat.ts
│   │   │   ├── monitoring.ts
│   │   │   └── api.ts
│   │   └── styles/
│   │       └── themes.ts
│   ├── __tests__/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── pages/
│   └── cypress/
│       ├── e2e/
│       ├── fixtures/
│       └── support/
│
├── backend/
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── .env.example
│   ├── wsgi.py                                # WSGI entry point
│   ├── celery_worker.py                       # Celery worker entry
│   ├── app/
│   │   ├── __init__.py                        # Flask app factory
│   │   ├── config.py                          # Environment-based configuration
│   │   ├── extensions.py                      # Flask extensions init
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py                        # User, Role, Permission models
│   │   │   ├── patient.py                     # Patient profile, medical history
│   │   │   ├── doctor.py                      # Doctor profile, specializations
│   │   │   ├── vitals.py                      # Vitals readings model
│   │   │   ├── report.py                      # Medical reports model
│   │   │   ├── medication.py                  # Medications, prescriptions
│   │   │   ├── appointment.py                 # Appointments model
│   │   │   ├── symptom_session.py             # Symptom check sessions
│   │   │   ├── care_plan.py                   # Care plans and goals
│   │   │   ├── notification.py                # Notification records
│   │   │   ├── audit_log.py                   # HIPAA audit log
│   │   │   ├── device.py                      # IoT device registry
│   │   │   ├── conversation.py                # Chat/voice conversation logs
│   │   │   └── alert.py                       # Monitoring alerts
│   │   ├── api/
│   │   │   ├── __init__.py                    # Blueprint registration
│   │   │   ├── v1/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── auth.py                    # /api/v1/auth/*
│   │   │   │   ├── patients.py                # /api/v1/patients/*
│   │   │   │   ├── doctors.py                 # /api/v1/doctors/*
│   │   │   │   ├── vitals.py                  # /api/v1/vitals/*
│   │   │   │   ├── reports.py                 # /api/v1/reports/*
│   │   │   │   ├── medications.py             # /api/v1/medications/*
│   │   │   │   ├── appointments.py            # /api/v1/appointments/*
│   │   │   │   ├── symptoms.py                # /api/v1/symptoms/*
│   │   │   │   ├── care_plans.py              # /api/v1/care-plans/*
│   │   │   │   ├── telemedicine.py            # /api/v1/telemedicine/*
│   │   │   │   ├── notifications.py           # /api/v1/notifications/*
│   │   │   │   ├── monitoring.py              # /api/v1/monitoring/*
│   │   │   │   ├── analytics.py               # /api/v1/analytics/*
│   │   │   │   ├── chat.py                    # /api/v1/chat/*
│   │   │   │   ├── voice.py                   # /api/v1/voice/*
│   │   │   │   ├── devices.py                 # /api/v1/devices/*
│   │   │   │   ├── admin.py                   # /api/v1/admin/*
│   │   │   │   └── health.py                  # /api/v1/health (healthcheck)
│   │   │   └── websocket/
│   │   │       ├── __init__.py
│   │   │       ├── vitals_stream.py           # Real-time vitals events
│   │   │       ├── chat_stream.py             # Streaming chat responses
│   │   │       ├── monitoring_events.py       # Alert & monitoring events
│   │   │       └── notification_stream.py     # Push notifications
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── auth_service.py
│   │   │   ├── patient_service.py
│   │   │   ├── doctor_service.py
│   │   │   ├── vitals_service.py
│   │   │   ├── report_service.py
│   │   │   ├── medication_service.py
│   │   │   ├── appointment_service.py
│   │   │   ├── symptom_service.py
│   │   │   ├── care_plan_service.py
│   │   │   ├── telemedicine_service.py
│   │   │   ├── notification_service.py
│   │   │   ├── monitoring_service.py
│   │   │   ├── analytics_service.py
│   │   │   ├── device_service.py
│   │   │   ├── file_storage_service.py        # S3/MinIO operations
│   │   │   ├── search_service.py              # Elasticsearch operations
│   │   │   └── audit_service.py               # HIPAA audit logging
│   │   ├── agents/
│   │   │   ├── __init__.py
│   │   │   ├── orchestrator.py                # Agent Orchestrator
│   │   │   ├── base_agent.py                  # Base agent class
│   │   │   ├── symptom_analyst.py             # Symptom Analyst Agent
│   │   │   ├── report_reader.py               # Medical Report Reader Agent
│   │   │   ├── triage_agent.py                # Triage Agent
│   │   │   ├── voice_agent.py                 # Voice Interaction Agent
│   │   │   ├── drug_interaction_agent.py      # Drug Interaction Agent
│   │   │   ├── monitoring_agent.py            # Patient Monitoring Agent
│   │   │   ├── followup_agent.py              # Follow-Up & Care Plan Agent
│   │   │   ├── tools/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── medical_kb.py              # Medical knowledge base tools
│   │   │   │   ├── patient_history.py         # Patient history query tools
│   │   │   │   ├── urgency_scoring.py         # Urgency calculation tools
│   │   │   │   ├── drug_database.py           # Drug interaction database tools
│   │   │   │   ├── vitals_analysis.py         # Vitals anomaly detection tools
│   │   │   │   ├── report_parsing.py          # Report extraction tools
│   │   │   │   ├── scheduling.py              # Appointment scheduling tools
│   │   │   │   └── notification_tools.py      # Alert & notification tools
│   │   │   ├── memory/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── context_manager.py         # Short-term context (Redis)
│   │   │   │   ├── knowledge_store.py         # Long-term knowledge (Pinecone)
│   │   │   │   └── patient_memory.py          # Per-patient memory management
│   │   │   └── prompts/
│   │   │       ├── __init__.py
│   │   │       ├── system_prompts.py          # System prompts for each agent
│   │   │       ├── symptom_prompts.py
│   │   │       ├── report_prompts.py
│   │   │       ├── triage_prompts.py
│   │   │       └── care_plan_prompts.py
│   │   ├── middleware/
│   │   │   ├── __init__.py
│   │   │   ├── auth_middleware.py             # JWT validation
│   │   │   ├── rate_limiter.py                # API rate limiting
│   │   │   ├── hipaa_audit.py                 # HIPAA compliance logging
│   │   │   ├── cors.py                        # CORS configuration
│   │   │   ├── request_logger.py              # Structured request logging
│   │   │   └── error_handler.py               # Global error handling
│   │   ├── utils/
│   │   │   ├── __init__.py
│   │   │   ├── encryption.py                  # PHI encryption utilities
│   │   │   ├── validators.py                  # Input validation
│   │   │   ├── formatters.py                  # Response formatting
│   │   │   ├── date_utils.py
│   │   │   ├── medical_constants.py           # ICD-10, LOINC codes, etc.
│   │   │   └── file_utils.py
│   │   ├── tasks/
│   │   │   ├── __init__.py
│   │   │   ├── monitoring_tasks.py            # Background vitals processing
│   │   │   ├── report_processing.py           # Async report analysis
│   │   │   ├── notification_tasks.py          # Async notification delivery
│   │   │   ├── embedding_tasks.py             # Knowledge base embedding updates
│   │   │   ├── analytics_tasks.py             # Periodic analytics computation
│   │   │   └── cleanup_tasks.py               # Data retention & cleanup
│   │   └── integrations/
│   │       ├── __init__.py
│   │       ├── openai_client.py               # OpenAI SDK + EURI_API_KEY / EURI_BASE_URL
│   │       ├── pinecone_client.py             # Pinecone vector DB client
│   │       ├── influxdb_client.py             # InfluxDB client
│   │       ├── elasticsearch_client.py        # Elasticsearch client
│   │       ├── s3_client.py                   # S3/MinIO client
│   │       ├── twilio_client.py               # SMS notifications
│   │       ├── sendgrid_client.py             # Email notifications
│   │       └── iot_gateway.py                 # IoT device gateway
│   ├── migrations/
│   │   └── versions/
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── factories/
│   │   │   ├── user_factory.py
│   │   │   ├── patient_factory.py
│   │   │   └── vitals_factory.py
│   │   ├── unit/
│   │   │   ├── test_agents/
│   │   │   ├── test_services/
│   │   │   └── test_utils/
│   │   ├── integration/
│   │   │   ├── test_api/
│   │   │   ├── test_websocket/
│   │   │   └── test_agents/
│   │   └── e2e/
│   │       └── test_workflows/
│   └── scripts/
│       ├── seed_db.py                         # Database seeding
│       ├── seed_knowledge_base.py             # Medical KB seeding
│       └── generate_test_data.py
│
├── infrastructure/
│   ├── terraform/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── modules/
│   │   │   ├── vpc/
│   │   │   ├── eks/
│   │   │   ├── rds/
│   │   │   ├── redis/
│   │   │   ├── s3/
│   │   │   └── monitoring/
│   │   └── environments/
│   │       ├── staging/
│   │       └── production/
│   ├── kubernetes/
│   │   ├── base/
│   │   │   ├── namespace.yaml
│   │   │   ├── frontend-deployment.yaml
│   │   │   ├── backend-deployment.yaml
│   │   │   ├── celery-deployment.yaml
│   │   │   ├── redis-deployment.yaml
│   │   │   └── ingress.yaml
│   │   └── overlays/
│   │       ├── staging/
│   │       └── production/
│   └── nginx/
│       └── nginx.conf
│
├── docs/
│   ├── api/
│   │   └── openapi.yaml
│   ├── architecture/
│   │   ├── system-design.md
│   │   ├── data-flow.md
│   │   └── agent-design.md
│   ├── deployment/
│   │   └── deployment-guide.md
│   ├── compliance/
│   │   ├── hipaa-checklist.md
│   │   └── data-retention-policy.md
│   └── runbooks/
│       ├── incident-response.md
│       └── on-call-guide.md
│
└── data/
    ├── medical_knowledge/                     # Medical knowledge base source files
    │   ├── icd10_codes.json
    │   ├── drug_interactions.json
    │   ├── lab_reference_ranges.json
    │   └── symptom_disease_mapping.json
    └── seed/
        ├── sample_patients.json
        └── sample_vitals.json
```

---

## 5. Database Schema (Core Models)

### 5.1 Users & Authentication

```sql
-- Users table (polymorphic — patients, doctors, admins)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'doctor', 'admin', 'nurse')),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Patient profiles
CREATE TABLE patient_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    date_of_birth DATE NOT NULL,
    gender VARCHAR(20),
    blood_type VARCHAR(5),
    height_cm DECIMAL(5,2),
    weight_kg DECIMAL(5,2),
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    insurance_provider VARCHAR(200),
    insurance_policy_number VARCHAR(100),
    primary_physician_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Doctor profiles
CREATE TABLE doctor_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    license_number VARCHAR(100) UNIQUE NOT NULL,
    specialization VARCHAR(200) NOT NULL,
    department VARCHAR(200),
    hospital_affiliation VARCHAR(300),
    years_of_experience INTEGER,
    consultation_fee DECIMAL(10,2),
    available_for_telemedicine BOOLEAN DEFAULT TRUE,
    bio TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 5.2 Medical Records

```sql
-- Medical history
CREATE TABLE medical_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    condition_name VARCHAR(300) NOT NULL,
    icd10_code VARCHAR(10),
    diagnosis_date DATE,
    status VARCHAR(20) CHECK (status IN ('active', 'resolved', 'chronic', 'in_remission')),
    notes TEXT,
    diagnosed_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Allergies
CREATE TABLE allergies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    allergen VARCHAR(200) NOT NULL,
    reaction_type VARCHAR(100),
    severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe', 'life_threatening')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Medications
CREATE TABLE medications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    prescribed_by UUID REFERENCES users(id),
    drug_name VARCHAR(300) NOT NULL,
    generic_name VARCHAR(300),
    dosage VARCHAR(100) NOT NULL,
    frequency VARCHAR(100) NOT NULL,
    route VARCHAR(50),
    start_date DATE NOT NULL,
    end_date DATE,
    status VARCHAR(20) CHECK (status IN ('active', 'completed', 'discontinued', 'on_hold')),
    reason TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Medical reports
CREATE TABLE medical_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES users(id),
    report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('lab', 'imaging', 'pathology', 'cardiology', 'radiology', 'other')),
    title VARCHAR(300) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(20),
    file_size_bytes BIGINT,
    report_date DATE,
    ordering_physician UUID REFERENCES users(id),
    ai_analysis_status VARCHAR(20) DEFAULT 'pending' CHECK (ai_analysis_status IN ('pending', 'processing', 'completed', 'failed')),
    ai_analysis JSONB,                          -- Structured AI analysis results
    ai_summary TEXT,                            -- Plain-language summary
    abnormalities JSONB,                        -- Flagged abnormal values
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Lab values (extracted from reports)
CREATE TABLE lab_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES medical_reports(id) ON DELETE CASCADE,
    patient_id UUID REFERENCES patient_profiles(id),
    test_name VARCHAR(200) NOT NULL,
    loinc_code VARCHAR(20),
    value DECIMAL(15,5),
    value_text VARCHAR(200),                    -- For non-numeric results
    unit VARCHAR(50),
    reference_range_low DECIMAL(15,5),
    reference_range_high DECIMAL(15,5),
    is_abnormal BOOLEAN DEFAULT FALSE,
    abnormality_severity VARCHAR(20),
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 5.3 Vitals & Monitoring

```sql
-- Vitals readings (summary in PostgreSQL; raw data in InfluxDB)
CREATE TABLE vitals_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id),
    heart_rate INTEGER,
    systolic_bp INTEGER,
    diastolic_bp INTEGER,
    spo2 DECIMAL(5,2),
    temperature DECIMAL(4,1),
    respiratory_rate INTEGER,
    blood_glucose DECIMAL(6,2),
    weight_kg DECIMAL(5,2),
    pain_level INTEGER CHECK (pain_level BETWEEN 0 AND 10),
    source VARCHAR(30) CHECK (source IN ('manual', 'device', 'wearable', 'bedside_monitor')),
    recorded_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- IoT devices
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id),
    device_type VARCHAR(50) NOT NULL,
    device_name VARCHAR(200),
    manufacturer VARCHAR(200),
    model VARCHAR(200),
    serial_number VARCHAR(200),
    firmware_version VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    last_sync_at TIMESTAMP,
    battery_level INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Monitoring alerts
CREATE TABLE monitoring_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'emergency')),
    title VARCHAR(300) NOT NULL,
    description TEXT,
    vital_type VARCHAR(50),
    vital_value DECIMAL(15,5),
    threshold_breached VARCHAR(200),
    ai_assessment TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'escalated', 'false_alarm')),
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMP,
    escalation_level INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 5.4 Symptoms & Triage

```sql
-- Symptom check sessions
CREATE TABLE symptom_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
    initial_complaint TEXT NOT NULL,
    conversation_log JSONB,                     -- Full multi-turn conversation
    reported_symptoms JSONB,                    -- Structured symptom list
    differential_diagnosis JSONB,               -- AI-generated diagnosis list
    urgency_score INTEGER CHECK (urgency_score BETWEEN 1 AND 10),
    esi_level INTEGER CHECK (esi_level BETWEEN 1 AND 5),
    recommended_action VARCHAR(50),
    recommended_specialist VARCHAR(200),
    ai_confidence DECIMAL(4,3),
    reviewed_by UUID REFERENCES users(id),
    review_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);
```

### 5.5 Appointments & Telemedicine

```sql
-- Appointments
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctor_profiles(id) ON DELETE CASCADE,
    appointment_type VARCHAR(30) CHECK (appointment_type IN ('in_person', 'telemedicine', 'follow_up', 'emergency')),
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
    scheduled_at TIMESTAMP NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    reason TEXT,
    notes TEXT,
    priority INTEGER DEFAULT 3,
    symptom_session_id UUID REFERENCES symptom_sessions(id),
    telemedicine_room_id VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Telemedicine sessions
CREATE TABLE telemedicine_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
    room_id VARCHAR(200) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'ended')),
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_seconds INTEGER,
    recording_url TEXT,
    ai_transcription TEXT,
    ai_clinical_notes TEXT,                     -- AI-generated notes from conversation
    ai_summary TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 5.6 Care Plans

```sql
-- Care plans
CREATE TABLE care_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    title VARCHAR(300) NOT NULL,
    description TEXT,
    condition VARCHAR(300),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'discontinued')),
    start_date DATE NOT NULL,
    target_end_date DATE,
    actual_end_date DATE,
    ai_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Care plan goals
CREATE TABLE care_plan_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_plan_id UUID REFERENCES care_plans(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    target_value VARCHAR(200),
    current_value VARCHAR(200),
    unit VARCHAR(50),
    status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('not_started', 'in_progress', 'achieved', 'missed')),
    target_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Care plan activities/tasks
CREATE TABLE care_plan_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    care_plan_id UUID REFERENCES care_plans(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    activity_type VARCHAR(50) CHECK (activity_type IN ('medication', 'exercise', 'diet', 'appointment', 'test', 'lifestyle', 'other')),
    frequency VARCHAR(100),
    time_of_day VARCHAR(50),
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 5.7 Conversations & Audit

```sql
-- Conversations (chat & voice)
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patient_profiles(id),
    user_id UUID REFERENCES users(id),
    conversation_type VARCHAR(20) CHECK (conversation_type IN ('chat', 'voice', 'symptom_check')),
    agent_type VARCHAR(50),
    messages JSONB,
    metadata JSONB,
    started_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- HIPAA audit log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(300) NOT NULL,
    body TEXT,
    data JSONB,
    channel VARCHAR(20) CHECK (channel IN ('push', 'sms', 'email', 'in_app')),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 6. API Endpoints (Complete)

### 6.1 Authentication

| Method | Endpoint                        | Description                    |
| ------ | ------------------------------- | ------------------------------ |
| POST   | `/api/v1/auth/register`         | Register new user              |
| POST   | `/api/v1/auth/login`            | Login, returns JWT             |
| POST   | `/api/v1/auth/logout`           | Invalidate token               |
| POST   | `/api/v1/auth/refresh`          | Refresh access token           |
| POST   | `/api/v1/auth/forgot-password`  | Send password reset email      |
| POST   | `/api/v1/auth/reset-password`   | Reset password with token      |
| POST   | `/api/v1/auth/verify-email`     | Verify email address           |
| POST   | `/api/v1/auth/mfa/enable`       | Enable MFA                     |
| POST   | `/api/v1/auth/mfa/verify`       | Verify MFA code                |
| GET    | `/api/v1/auth/me`               | Get current user profile       |

### 6.2 Patients

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/patients`                             | List patients (doctor/admin)      |
| GET    | `/api/v1/patients/:id`                         | Get patient details               |
| PUT    | `/api/v1/patients/:id`                         | Update patient profile            |
| GET    | `/api/v1/patients/:id/medical-history`         | Get medical history               |
| POST   | `/api/v1/patients/:id/medical-history`         | Add medical history entry         |
| GET    | `/api/v1/patients/:id/allergies`               | Get allergies                     |
| POST   | `/api/v1/patients/:id/allergies`               | Add allergy                       |
| GET    | `/api/v1/patients/:id/timeline`                | Get full patient timeline         |
| GET    | `/api/v1/patients/:id/summary`                 | AI-generated patient summary      |

### 6.3 Vitals

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/vitals/:patientId`                    | Get latest vitals                 |
| GET    | `/api/v1/vitals/:patientId/history`            | Get vitals history (time range)   |
| POST   | `/api/v1/vitals/:patientId`                    | Record new vitals reading         |
| GET    | `/api/v1/vitals/:patientId/trends`             | Get vitals trend analysis         |
| GET    | `/api/v1/vitals/:patientId/anomalies`          | Get detected anomalies            |
| POST   | `/api/v1/vitals/batch`                         | Batch upload vitals (IoT)         |

### 6.4 Medical Reports

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/reports/:patientId`                   | List patient reports              |
| POST   | `/api/v1/reports/:patientId/upload`            | Upload new report                 |
| GET    | `/api/v1/reports/:reportId`                    | Get report details + AI analysis  |
| POST   | `/api/v1/reports/:reportId/analyze`            | Trigger AI analysis               |
| GET    | `/api/v1/reports/:reportId/lab-values`         | Get extracted lab values          |
| GET    | `/api/v1/reports/:reportId/summary`            | Get AI-generated summary          |
| GET    | `/api/v1/reports/:patientId/compare`           | Compare reports over time         |
| DELETE | `/api/v1/reports/:reportId`                    | Delete report                     |

### 6.5 Symptoms & Triage

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| POST   | `/api/v1/symptoms/session`                     | Start new symptom check session   |
| POST   | `/api/v1/symptoms/session/:id/message`         | Send message in symptom session   |
| GET    | `/api/v1/symptoms/session/:id`                 | Get session details & diagnosis   |
| PUT    | `/api/v1/symptoms/session/:id/complete`        | Complete symptom session          |
| GET    | `/api/v1/symptoms/history/:patientId`          | Get past symptom sessions         |
| POST   | `/api/v1/symptoms/triage`                      | Quick triage assessment           |
| POST   | `/api/v1/symptoms/body-map`                    | Submit body map selections        |

### 6.6 Medications

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/medications/:patientId`               | List patient medications          |
| POST   | `/api/v1/medications/:patientId`               | Add medication / prescription     |
| PUT    | `/api/v1/medications/:medicationId`            | Update medication                 |
| DELETE | `/api/v1/medications/:medicationId`            | Discontinue medication            |
| POST   | `/api/v1/medications/interaction-check`        | Check drug interactions           |
| GET    | `/api/v1/medications/:patientId/schedule`      | Get medication schedule           |
| POST   | `/api/v1/medications/:medicationId/adherence`  | Log medication taken/missed       |
| GET    | `/api/v1/medications/search`                   | Search drug database              |

### 6.7 Appointments

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/appointments`                         | List appointments (filtered)      |
| POST   | `/api/v1/appointments`                         | Book new appointment              |
| GET    | `/api/v1/appointments/:id`                     | Get appointment details           |
| PUT    | `/api/v1/appointments/:id`                     | Update appointment                |
| PUT    | `/api/v1/appointments/:id/cancel`              | Cancel appointment                |
| GET    | `/api/v1/appointments/availability/:doctorId`  | Get doctor availability           |
| GET    | `/api/v1/appointments/upcoming/:patientId`     | Get upcoming appointments         |

### 6.8 Telemedicine

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| POST   | `/api/v1/telemedicine/session`                 | Create telemedicine session       |
| GET    | `/api/v1/telemedicine/session/:id`             | Get session details               |
| POST   | `/api/v1/telemedicine/session/:id/join`        | Join video session                |
| PUT    | `/api/v1/telemedicine/session/:id/end`         | End session                       |
| GET    | `/api/v1/telemedicine/session/:id/transcript`  | Get AI transcription              |
| GET    | `/api/v1/telemedicine/session/:id/notes`       | Get AI clinical notes             |

### 6.9 Care Plans

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/care-plans/:patientId`                | List patient care plans           |
| POST   | `/api/v1/care-plans/:patientId`                | Create care plan                  |
| GET    | `/api/v1/care-plans/:planId`                   | Get care plan details             |
| PUT    | `/api/v1/care-plans/:planId`                   | Update care plan                  |
| POST   | `/api/v1/care-plans/:planId/goals`             | Add goal to care plan             |
| PUT    | `/api/v1/care-plans/:planId/goals/:goalId`     | Update goal progress              |
| POST   | `/api/v1/care-plans/:patientId/generate`       | AI-generate care plan             |
| GET    | `/api/v1/care-plans/:planId/adherence`         | Get adherence report              |

### 6.10 Chat & Voice

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| POST   | `/api/v1/chat/message`                         | Send chat message to AI           |
| GET    | `/api/v1/chat/conversations`                   | List past conversations           |
| GET    | `/api/v1/chat/conversations/:id`               | Get conversation history          |
| POST   | `/api/v1/voice/transcribe`                     | Transcribe audio file             |
| POST   | `/api/v1/voice/synthesize`                     | Generate speech from text         |
| POST   | `/api/v1/voice/session/start`                  | Start voice session               |
| POST   | `/api/v1/voice/session/:id/audio`              | Send audio chunk in session       |
| PUT    | `/api/v1/voice/session/:id/end`                | End voice session                 |

### 6.11 Monitoring

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/monitoring/patients`                  | Get all monitored patients        |
| GET    | `/api/v1/monitoring/patients/:id/status`       | Get patient monitoring status     |
| GET    | `/api/v1/monitoring/alerts`                    | List active alerts                |
| PUT    | `/api/v1/monitoring/alerts/:id/acknowledge`    | Acknowledge alert                 |
| PUT    | `/api/v1/monitoring/alerts/:id/resolve`        | Resolve alert                     |
| PUT    | `/api/v1/monitoring/alerts/:id/escalate`       | Escalate alert                    |
| POST   | `/api/v1/monitoring/thresholds/:patientId`     | Set monitoring thresholds         |
| GET    | `/api/v1/monitoring/dashboard`                 | Get monitoring wall data          |

### 6.12 Devices

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/devices/:patientId`                   | List patient devices              |
| POST   | `/api/v1/devices/:patientId`                   | Register new device               |
| PUT    | `/api/v1/devices/:deviceId`                    | Update device                     |
| DELETE | `/api/v1/devices/:deviceId`                    | Remove device                     |
| POST   | `/api/v1/devices/:deviceId/data`               | Ingest device data                |

### 6.13 Notifications

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/notifications`                        | Get user notifications            |
| PUT    | `/api/v1/notifications/:id/read`               | Mark as read                      |
| PUT    | `/api/v1/notifications/read-all`               | Mark all as read                  |
| GET    | `/api/v1/notifications/preferences`            | Get notification preferences      |
| PUT    | `/api/v1/notifications/preferences`            | Update notification preferences   |

### 6.14 Analytics

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/analytics/patient/:id/overview`       | Patient health analytics          |
| GET    | `/api/v1/analytics/doctor/:id/overview`        | Doctor performance analytics      |
| GET    | `/api/v1/analytics/system/overview`            | System-wide analytics (admin)     |
| GET    | `/api/v1/analytics/ai/usage`                   | AI agent usage statistics         |
| GET    | `/api/v1/analytics/ai/accuracy`                | AI prediction accuracy metrics    |

### 6.15 Admin

| Method | Endpoint                                      | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/v1/admin/users`                          | List all users                    |
| PUT    | `/api/v1/admin/users/:id/role`                 | Change user role                  |
| PUT    | `/api/v1/admin/users/:id/activate`             | Activate/deactivate user          |
| GET    | `/api/v1/admin/audit-logs`                     | View audit logs                   |
| GET    | `/api/v1/admin/system-health`                  | System health dashboard           |
| PUT    | `/api/v1/admin/ai-config`                      | Update AI agent configuration     |

### 6.16 WebSocket Events

| Event                    | Direction     | Description                              |
| ------------------------ | ------------- | ---------------------------------------- |
| `vitals:update`          | Server → Client | Real-time vitals data push             |
| `vitals:alert`           | Server → Client | Vitals threshold breach alert          |
| `monitoring:alert`       | Server → Client | Monitoring alert notification          |
| `monitoring:status`      | Server → Client | Patient status change                  |
| `chat:message`           | Bidirectional | Chat message in/out                      |
| `chat:typing`            | Bidirectional | Typing indicator                         |
| `chat:stream`            | Server → Client | Streaming AI response tokens           |
| `voice:transcript`       | Server → Client | Real-time transcription                |
| `notification:new`       | Server → Client | New notification                       |
| `appointment:reminder`   | Server → Client | Appointment reminder                   |
| `telemedicine:signal`    | Bidirectional | WebRTC signaling                         |
| `device:status`          | Server → Client | Device connection status               |

---

## 7. Feature Specifications

### 7.1 Symptom Analysis & Triage (Patient-Facing)

**Flow:**
1. Patient initiates symptom check via chat, voice, or interactive body map
2. System routes to Symptom Analyst Agent via Orchestrator
3. Agent conducts multi-turn interview:
   - "What symptoms are you experiencing?"
   - "When did they start?"
   - "On a scale of 1-10, how severe?"
   - "Any associated symptoms?" (contextual follow-ups)
   - "Any relevant medical history?" (pre-filled from profile)
4. Agent builds symptom profile and queries medical knowledge base
5. Triage Agent assigns ESI level in parallel
6. Agent generates:
   - Ranked differential diagnosis with confidence scores
   - Urgency assessment (1-10 scale)
   - Recommended next steps (self-care / schedule appointment / urgent care / ER)
   - Specialist recommendation if needed
7. Results saved to symptom_sessions table
8. If ESI 1-2: immediate alert to on-call physician

**Body Map Feature:**
- Interactive SVG body diagram (front/back view)
- Patient taps affected areas
- Each area maps to anatomical region codes
- Supports pain type selection (sharp, dull, burning, throbbing)
- Supports duration and severity per region

### 7.2 Medical Report Understanding (Patient + Doctor)

**Flow:**
1. User uploads report (PDF, image, or structured data)
2. File stored in S3/MinIO with encryption
3. Report Reader Agent processes asynchronously (Celery task):
   - Vision model extracts text and structure from images/PDFs
   - Identifies report type (lab, imaging, pathology, etc.)
   - Extracts individual test values into structured data
   - Compares each value against reference ranges
   - Flags abnormalities with severity levels
4. Agent generates:
   - Structured data table (test, value, unit, range, status)
   - Plain-language summary for patient
   - Clinical summary for doctor
   - Trend analysis if historical data exists
   - Recommended follow-up tests
5. Results stored in medical_reports and lab_values tables
6. Real-time notification when analysis is complete
7. Interactive UI with color-coded abnormality highlighting

**Supported Report Types:**
- Complete Blood Count (CBC)
- Basic/Comprehensive Metabolic Panel (BMP/CMP)
- Lipid Panel
- Thyroid Function Tests
- Liver Function Tests
- Urinalysis
- HbA1c / Glucose
- X-Ray / CT / MRI reports (text interpretation)
- Pathology / Biopsy reports
- ECG/EKG reports
- Custom / Other

### 7.3 Real-Time Patient Monitoring

**Architecture:**
- IoT devices / wearables push data via MQTT → IoT Gateway → InfluxDB
- Monitoring Agent polls InfluxDB on configurable intervals (default: 30 seconds)
- Agent maintains per-patient adaptive baselines
- Anomaly detection via statistical methods (z-score, moving average) + LLM reasoning

**Vital Signs Monitored:**
- Heart Rate (HR)
- Blood Pressure (Systolic/Diastolic)
- Oxygen Saturation (SpO2)
- Body Temperature
- Respiratory Rate (RR)
- Blood Glucose
- Weight (daily trends)
- ECG waveform (if available)

**Alert Escalation Chain:**
1. **Level 1 — Info:** Minor deviation, logged for review
2. **Level 2 — Warning:** Moderate deviation, push notification to assigned nurse
3. **Level 3 — Critical:** Significant deviation, alert nurse + attending physician, dashboard alarm
4. **Level 4 — Emergency:** Life-threatening values, immediate pager alert to on-call physician, automatic ESI Level 1 triage

**Early Warning Scores:**
- NEWS2 (National Early Warning Score 2) — auto-calculated
- MEWS (Modified Early Warning Score) — auto-calculated
- Custom scoring per institution

**Monitoring Wall (Doctor Dashboard):**
- Grid view of all monitored patients
- Color-coded status (green/yellow/red)
- Real-time vitals sparklines
- Alert feed with acknowledgment buttons
- Drill-down to individual patient monitoring view

### 7.4 Voice-Based AI Assistant

**Capabilities:**
- Hands-free symptom reporting for patients
- Voice-controlled navigation for accessibility
- Real-time transcription of doctor-patient consultations
- Ambient clinical note generation
- Multi-language support (50+ languages via Whisper)
- Configurable voice (6 OpenAI TTS voices) and speed

**Voice Session Flow:**
1. User activates voice mode (button or wake word)
2. Audio streamed to backend via WebSocket
3. Whisper API transcribes in real-time
4. Transcript processed by Voice Agent
5. Response generated by appropriate specialist agent
6. Response synthesized to speech via TTS API
7. Audio streamed back to client

**Ambient Clinical Notes (Doctor Feature):**
1. Doctor enables ambient mode during consultation
2. System records conversation (with patient consent)
3. Real-time transcription displayed
4. After consultation, system generates:
   - Structured SOAP notes (Subjective, Objective, Assessment, Plan)
   - ICD-10 code suggestions
   - Medication mentions extracted
   - Follow-up action items
5. Doctor reviews and edits AI-generated notes
6. Final notes saved to patient record

### 7.5 Drug Interaction Checking

**Triggers:**
- When a new medication is prescribed (automatic check)
- When patient manually checks interactions
- When medication list changes

**Analysis Includes:**
- Drug-drug interactions (pairwise analysis of all active medications)
- Drug-allergy cross-reference
- Drug-condition contraindications
- Dosage verification (age, weight, renal/hepatic function)
- Duplicate therapy detection
- Food-drug interactions

**Output:**
- Severity classification per interaction (mild / moderate / severe / contraindicated)
- Clinical evidence and mechanism of action
- Alternative medication suggestions
- Optimized dosing schedule recommendation

### 7.6 Telemedicine Video Consultations

**Features:**
- HD video calls via WebRTC (Daily.co)
- Screen sharing for report review
- In-call AI assistant (sidebar)
- Real-time transcription overlay (optional)
- Waiting room with queue position
- Post-call AI-generated clinical notes
- Call recording (with consent)
- Multi-participant support (patient, doctor, specialist, interpreter)

### 7.7 Care Plan Management

**AI-Generated Care Plans:**
- Based on diagnosis, patient profile, and evidence-based guidelines
- Includes medication schedules, lifestyle recommendations, follow-up appointments
- Personalized goal setting with measurable targets
- Adaptive — adjusts based on adherence and progress data

**Adherence Tracking:**
- Medication taken/missed logging
- Appointment attendance tracking
- Goal progress measurement
- Automated reminders via push, SMS, email
- Weekly/monthly adherence reports
- Gamification elements (streaks, milestones)

### 7.8 Analytics & Insights

**Patient Analytics:**
- Health score trending
- Vitals trend visualization
- Medication adherence rates
- Appointment history
- Symptom frequency analysis

**Doctor Analytics:**
- Patient panel overview
- Consultation statistics
- AI-assisted diagnosis accuracy feedback
- Workload distribution

**Admin/System Analytics:**
- Platform usage metrics
- AI agent performance metrics (response time, accuracy, usage volume)
- System health monitoring
- HIPAA compliance dashboard
- Cost analysis (API usage, infrastructure)

---

## 8. Security & Compliance

### 8.1 HIPAA Compliance

- **Encryption at rest:** AES-256 for all PHI in PostgreSQL and S3
- **Encryption in transit:** TLS 1.3 for all API calls and WebSocket connections
- **Access control:** Role-Based Access Control (RBAC) with principle of least privilege
- **Audit logging:** Every PHI access logged with user, action, resource, timestamp, IP
- **Data retention:** Configurable retention policies with automated purging
- **BAA (Business Associate Agreement):** Required with all cloud providers
- **De-identification:** Patient data sent to OpenAI is de-identified (names, DOB, SSN stripped)
- **Session management:** JWT with short expiry (15 min access, 7 day refresh)
- **MFA:** Mandatory for healthcare providers, optional for patients

### 8.2 Data De-identification for LLM Calls

Before any patient data is sent to OpenAI APIs:
1. PII stripped (names, DOB, SSN, addresses, phone numbers)
2. Replaced with anonymized tokens
3. Response re-hydrated with original identifiers on the backend
4. All LLM call logs stored locally (never on OpenAI servers — API data not used for training)

### 8.3 Authentication & Authorization

- JWT-based authentication with access + refresh tokens
- OAuth2 integration for SSO (Google, Microsoft for enterprise)
- Role-based permissions: Patient, Doctor, Nurse, Admin, Super Admin
- Resource-level authorization (patients can only access their own data)
- API rate limiting per user role
- Brute force protection with account lockout

---

## 9. Non-Functional Requirements

| Requirement         | Target                                      |
| ------------------- | ------------------------------------------- |
| API Response Time   | < 200ms (p95) for standard endpoints        |
| AI Response Time    | < 3s for chat, < 5s for report analysis     |
| Triage Response     | < 2s for emergency triage                   |
| Uptime              | 99.9% availability                          |
| Concurrent Users    | 10,000+ simultaneous connections            |
| Data Retention      | 7 years (HIPAA minimum)                     |
| Backup              | Daily automated backups, 30-day retention   |
| Recovery            | RPO: 1 hour, RTO: 4 hours                  |
| Scalability         | Horizontal scaling via Kubernetes           |
| Browser Support     | Chrome, Firefox, Safari, Edge (latest 2)    |
| Mobile              | Responsive design, PWA support              |
| Accessibility       | WCAG 2.1 AA compliance                      |
| Localization        | English (default), Spanish, French, Hindi, Mandarin |

---

## 10. Environment Variables

```env
# Flask
FLASK_APP=wsgi.py
FLASK_ENV=development
SECRET_KEY=
JWT_SECRET_KEY=

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/medassist
REDIS_URL=redis://localhost:6379/0
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=
INFLUXDB_ORG=medassist
INFLUXDB_BUCKET=vitals

# LLM (OpenAI-compatible — EURI)
EURI_API_KEY=
EURI_BASE_URL=https://api.euron.one/api/v1/euri
LLM_MODEL_PRIMARY=gpt-4o
LLM_MODEL_FAST=gpt-4o-mini
LLM_EMBEDDING_MODEL=text-embedding-3-large

# Pinecone
PINECONE_API_KEY=
PINECONE_ENVIRONMENT=
PINECONE_INDEX_NAME=medical-knowledge

# Elasticsearch
ELASTICSEARCH_URL=http://localhost:9200

# S3 / MinIO
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BUCKET_NAME=medassist-reports
S3_ENDPOINT_URL=                    # For MinIO in dev

# Twilio (SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# SendGrid (Email)
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=

# Daily.co (Video)
DAILY_API_KEY=
DAILY_DOMAIN=

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2

# Frontend (Next.js)
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:5000
NEXT_PUBLIC_DAILY_DOMAIN=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Encryption
PHI_ENCRYPTION_KEY=                 # AES-256 key for PHI encryption
```

---

## 11. Development Workflow

### 11.1 Getting Started

```bash
# Clone repository
git clone <repo-url> medassist-ai
cd medassist-ai

# Start infrastructure services
docker-compose up -d postgres redis influxdb elasticsearch minio

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate        # or venv\Scripts\activate on Windows
pip install -r requirements.txt
pip install -r requirements-dev.txt
flask db upgrade                # Run migrations
python scripts/seed_db.py       # Seed database
python scripts/seed_knowledge_base.py  # Seed medical knowledge
flask run --port 5000

# Start Celery worker (separate terminal)
celery -A celery_worker.celery worker --loglevel=info

# Frontend setup (separate terminal)
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

### 11.2 Docker Development

```bash
# Full stack with Docker Compose
docker-compose up --build

# Services available at:
# Frontend:      http://localhost:3000
# Backend API:   http://localhost:5000
# Swagger Docs:  http://localhost:5000/apidocs
# MinIO Console: http://localhost:9001
# Grafana:       http://localhost:3001
# Kibana:        http://localhost:5601
```

### 11.3 Testing

```bash
# Backend tests
cd backend
pytest                           # All tests
pytest tests/unit/               # Unit tests
pytest tests/integration/        # Integration tests
pytest --cov=app                 # Coverage report

# Frontend tests
cd frontend
npm run test                     # Jest unit tests
npm run test:e2e                 # Cypress E2E tests
npm run lint                     # ESLint
npm run type-check               # TypeScript check
```

---

## 12. Milestones & Implementation Phases

### Phase 1 — Foundation (Weeks 1-4)
- Project scaffolding (Next.js + Flask)
- Database schema and migrations
- Authentication system (JWT + RBAC)
- Basic patient and doctor profiles
- UI shell (layout, navigation, auth pages)
- Docker Compose setup

### Phase 2 — Core AI Features (Weeks 5-10)
- Agent Orchestrator framework
- Symptom Analyst Agent with multi-turn chat
- Medical Report Reader Agent with vision
- Drug Interaction Agent
- Chat UI with streaming responses
- Report upload and analysis flow

### Phase 3 — Monitoring & Real-Time (Weeks 11-16)
- IoT device integration and vitals ingestion
- InfluxDB time-series pipeline
- Patient Monitoring Agent with anomaly detection
- Real-time monitoring wall (WebSocket)
- Alert system with escalation chains
- Triage Agent with ESI scoring

### Phase 4 — Voice & Telemedicine (Weeks 17-22)
- Voice Agent (Whisper STT + TTS)
- Voice-based symptom reporting
- Ambient clinical note generation
- Telemedicine video calls (Daily.co WebRTC)
- In-call AI assistant
- Post-call note generation

### Phase 5 — Care Plans & Analytics (Weeks 23-26)
- Follow-Up & Care Plan Agent
- AI-generated care plans
- Adherence tracking and reminders
- Patient and doctor analytics dashboards
- System analytics for admins

### Phase 6 — Polish & Compliance (Weeks 27-30)
- HIPAA compliance audit and hardening
- Data de-identification pipeline
- Full audit logging
- Performance optimization
- Accessibility (WCAG 2.1 AA)
- Internationalization
- Load testing and scalability validation
- Security penetration testing
- Documentation and runbooks

---

## 13. Coding Conventions

### Frontend (TypeScript/React)
- Use functional components with hooks exclusively
- Use TypeScript strict mode
- Use Tailwind utility classes; avoid custom CSS
- Colocate component tests with components
- Use React Query for all server state
- Use Zustand for client state
- Use Zod schemas for all API response validation
- File naming: `kebab-case.tsx` for components, `camelCase.ts` for utilities

### Backend (Python/Flask)
- Follow PEP 8 style guide
- Use type hints on all function signatures
- Use dataclasses or Pydantic models for request/response schemas
- Service layer pattern — controllers call services, services call models
- All database queries through SQLAlchemy ORM (no raw SQL)
- Use Celery for any operation > 500ms
- Log all errors with structlog
- File naming: `snake_case.py`

### Git
- Branch naming: `feature/`, `fix/`, `chore/`
- Commit messages: conventional commits format
- PR required for all merges to main
- CI must pass before merge
