# Architecture

## Components

| Component | Path | Language | Role |
|---|---|---|---|
| Syslog server | `ingestion/syslog-server-go` | Go | Accepts RFC5424 UDP syslog, forwards to the ingestion API |
| Ingestion API | `ingestion/api-python` | Python (FastAPI) | `/ingest`, `/search`, `/incidents`, `/ai/*`, `/metrics`, hosts the AI SOC Agent |
| Normalizer | `parser/normalizer.py` | Python | Converts raw logs (Windows/Linux/firewall/custom) into the shared schema |
| Detection Engine | `detection-engine/` | Python | Loads `rules/` + `detection-engine/rules/`, evaluates single-event and threshold rules |
| Correlation Engine | `correlation-engine/` | Python | Chains alerts into incidents using ordered, time-windowed patterns; scores each with `correlation-engine/risk.py` |
| AI SOC Agent | `ingestion/api-python/ai_agent/` | Python | Generates RCA (Groq/OpenAI/Anthropic/Gemini LLM or deterministic template) |
| React UI | `frontend/react-ui` | React + Vite + Tailwind | Dashboard, Incidents, Alerts, Search, Logs, Rules |
| OpenSearch | Docker image | - | Storage + search for logs/alerts/incidents/RCA |

## Data flow

1. A log arrives via `POST /ingest` or UDP syslog (port 514).
2. `parser/normalizer.py` maps it to the shared schema:
   ```json
   {
     "timestamp": "ISO8601",
     "source": "windows|linux|firewall|app|network|custom",
     "host": "...", "user": "...", "ip": "...",
     "event_type": "login_failure|process_create|...",
     "severity": "low|medium|high|critical",
     "raw": {}
   }
   ```
3. The normalized log is indexed into OpenSearch's `logs` index.
4. The **Detection Engine** polls recent logs (cursor-based, no re-processing) every `DETECTION_INTERVAL` seconds, evaluates every loaded rule, and indexes matches into `alerts`.
5. The **Correlation Engine** polls recent alerts every `CORRELATION_INTERVAL` seconds, matches ordered patterns per host/user/IP, and upserts matches into `incidents` (deterministic `incident_id`, so overlapping polling windows don't create duplicates).
6. The **AI SOC Agent** (`POST /ai/rca/{incident_id}`) reads an incident document and produces a structured RCA, cached in the `ai_rca` index.
7. The **React UI** polls the API for stats/alerts/incidents and renders them; incident cards expose a "Generate AI RCA" action.

## OpenSearch indices

| Index | Written by | Purpose |
|---|---|---|
| `logs` | Ingestion API | Normalized raw events |
| `alerts` | Detection Engine | Individual rule matches |
| `incidents` | Correlation Engine | Correlated multi-alert incidents |
| `ai_rca` | AI SOC Agent | Cached RCA per incident |
| `saved_searches` | Ingestion API | User-saved advanced search queries |
| `response_actions` | Ingestion API | Simulated SOAR response actions (`POST /incidents/{id}/respond`) - never touches a real system |

## Why two rule directories?

`detection-engine/rules/` holds the original `DET-*` rules (kept for backward compatibility). `rules/` is the new categorized pack (`auth/`, `web/`, `endpoint/`, `cloud/`). Both are loaded by the same `DetectionEngine` - see [DETECTION_ENGINE.md](DETECTION_ENGINE.md).

## Docker Compose services

`docker-compose.yml` defines: `opensearch`, `opensearch-dashboards`, `ingestion-api`, `syslog-server`, `react-ui`, `detection-engine`, `correlation-engine`. There is no separate `ai-agent` container - the AI SOC Agent runs inside `ingestion-api` and is reached through its `/ai/*` endpoints.

## Two ways to run the detection/correlation loops

`DetectionEngine` and `CorrelationEngine` can run in either (or both, though not recommended) of two places:

1. **In-process, inside `ingestion-api`** - `main.py`'s `initialize_engines()` constructs both engines and, when `RUN_ENGINES_IN_API=true`, spawns their `run_detection_loop()` / `run_correlation_loop()` on daemon threads.
2. **Standalone containers** - the `detection-engine` and `correlation-engine` services each run their module's `if __name__ == "__main__"` block directly, polling the same OpenSearch indices on their own loop.

Both modes poll the *same* `logs`/`alerts` indices, so running both at once double-processes every event (duplicate alerts, redundant incident upserts). `docker-compose.yml` therefore sets `RUN_ENGINES_IN_API=false` on `ingestion-api`, since the standalone containers already cover the loops there.

The engine instances are still constructed in-process either way (`RUN_ENGINES_IN_API` only gates the background threads), because `GET /stats`, `GET /rules`, and the `POST /rules/create` hot-reload all call into the local `detection_engine`/`correlation_engine` objects directly.

A bare `uvicorn main:app` run with no standalone containers (e.g. local development outside Docker) should leave `RUN_ENGINES_IN_API` at its default (`true`, see `.env.example`) so detection and correlation still happen.
