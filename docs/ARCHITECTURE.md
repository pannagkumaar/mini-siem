# Architecture

## Components

| Component | Path | Language | Role |
|---|---|---|---|
| Syslog server | `ingestion/syslog-server-go` | Go | Accepts RFC5424 UDP syslog, forwards to the ingestion API |
| Ingestion API | `ingestion/api-python` | Python (FastAPI) | `/ingest`, `/search`, `/incidents`, `/ai/*`, hosts the AI SOC Agent |
| Normalizer | `parser/normalizer.py` | Python | Converts raw logs (Windows/Linux/firewall/custom) into the shared schema |
| Detection Engine | `detection-engine/` | Python | Loads `rules/` + `detection-engine/rules/`, evaluates single-event and threshold rules |
| Correlation Engine | `correlation-engine/` | Python | Chains alerts into incidents using ordered, time-windowed patterns |
| AI SOC Agent | `ingestion/api-python/ai_agent/` | Python | Generates RCA (Groq LLM or deterministic template) |
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

## Why two rule directories?

`detection-engine/rules/` holds the original `DET-*` rules (kept for backward compatibility). `rules/` is the new categorized pack (`auth/`, `web/`, `endpoint/`, `cloud/`). Both are loaded by the same `DetectionEngine` - see [DETECTION_ENGINE.md](DETECTION_ENGINE.md).

## Docker Compose services

`docker-compose.yml` defines: `opensearch`, `opensearch-dashboards`, `ingestion-api`, `syslog-server`, `react-ui`, `detection-engine`, `correlation-engine`. There is no separate `ai-agent` container - the AI SOC Agent runs inside `ingestion-api` and is reached through its `/ai/*` endpoints.
