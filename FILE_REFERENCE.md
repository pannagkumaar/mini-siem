# Mini SIEM - File Directory and Purpose

## Project Root Files

### Configuration & Documentation
- **docker-compose.yml** - Service orchestration (OpenSearch, Dashboards, API, Syslog, React UI)
- **README.md** - User-facing project overview and quick start
- **QUICKSTART.md** - Step-by-step guide to run the system
- **IMPLEMENTATION.md** - Detailed technical implementation documentation
- **COMPLETION_SUMMARY.md** - Project completion status and statistics

### AI Agent Documentation
- **.github/copilot-instructions.md** - Comprehensive guidance for AI coding agents with architecture, patterns, and workflows

---

## Backend Services

### Syslog Server (Go)
```
ingestion/syslog-server-go/
├── main.go              (165 lines)
│   ├─ RFC5424 syslog parser
│   ├─ Log normalization to standard schema
│   ├─ HTTP forwarding to Ingestion API
│   ├─ Error handling and logging
│   └─ Graceful shutdown with signals
├── go.mod              Go module with go-syslog.v2 dependency
├── go.sum              Dependency lock file
└── Dockerfile          Multi-stage build (builder → alpine)
```

### Ingestion API (Python/FastAPI)
```
ingestion/api-python/
├── main.py             (230 lines)
│   ├─ FastAPI server on port 8000
│   ├─ OpenSearch client integration
│   ├─ Detection engine initialization
│   ├─ Correlation engine initialization
│   ├─ POST /ingest endpoint (single/batch logs)
│   ├─ GET /health endpoint
│   ├─ GET /stats endpoint
│   ├─ GET /rules endpoint
│   ├─ GET /incidents endpoint
│   └─ Background threads for engines
├── requirements.txt    Dependencies (fastapi, uvicorn, opensearch-py, pyyaml)
└── Dockerfile         Production image (python:3.11-slim)
```

### Database Initialization
```
scripts/
├── init-db.py         (79 lines)
│   ├─ Waits for OpenSearch availability (120s timeout)
│   ├─ Creates three indices: logs, alerts, incidents
│   ├─ Applies normalized schema mappings
│   └─ Error handling and retry logic
└── send-log.py        (40 lines - test log sender)
```

---

## Parsers & Engines

### Log Normalization
```
parser/
└── normalizer.py      (400+ lines)
    ├─ LogSource enum (windows, linux, firewall, app, custom)
    ├─ EventType enum (process_create, login_success, etc.)
    ├─ Severity enum (low, medium, high, critical)
    ├─ normalize_log() - auto-detect and normalize
    ├─ normalize_windows_event() - Windows Event Log parser
    ├─ normalize_linux_syslog() - Syslog parser
    ├─ normalize_firewall_log() - Firewall parser
    ├─ normalize_timestamp() - Multiple format support
    ├─ extract_ip_from_string() - IP extraction
    └─ validate_normalized_log() - Schema validation
```

### Detection Engine
```
detection-engine/
├── engine.py          (400+ lines)
│   ├─ DetectionRule class
│   │  ├─ evaluate() - condition matching with operators
│   │  └─ generate_alert() - alert document creation
│   ├─ DetectionEngine class
│   │  ├─ load_rules() - YAML rule loading
│   │  ├─ detect() - single log evaluation
│   │  ├─ process_recent_logs() - batch processing
│   │  ├─ run_detection_loop() - 10s polling
│   │  └─ get_rule_stats() - statistics
│   └─ Operators: exact match, contains, regex, in
│
└── rules/
    ├── DET-001-powershell.yaml     (Encoded PowerShell detection)
    ├── DET-002-failed-logins.yaml  (Failed login detection)
    └── DET-003-priv-esc.yaml       (Privilege escalation detection)
```

### Correlation Engine
```
correlation-engine/
└── correlator.py      (350+ lines)
    ├─ CorrelationPattern class
    ├─ CorrelationEngine class
    │  ├─ run_correlation_loop() - 30s polling
    │  ├─ correlate_recent_alerts() - pattern matching
    │  ├─ _check_pattern_on_alerts() - pattern evaluation
    │  ├─ get_incidents() - incident retrieval
    │  └─ get_stats() - pattern statistics
    └─ 3 Built-in Patterns
       ├─ CORR-001: Brute Force + Success + Escalation (CRITICAL)
       ├─ CORR-002: Multiple Failed Logins (HIGH)
       └─ CORR-003: Suspicious Process + Escalation (HIGH)
```

---

## Frontend (React + Vite)

### Configuration Files
```
frontend/react-ui/
├── package.json       (30 lines)
│   └─ Dependencies: react, axios, recharts, vite, tailwindcss
├── vite.config.js     (15 lines)
│   └─ Vite setup with API proxy configuration
├── tailwind.config.js (10 lines)
│   └─ Tailwind theming configuration
├── postcss.config.js  (8 lines)
│   └─ PostCSS pipeline setup
├── index.html         (12 lines)
│   └─ HTML entry point with root div
└── Dockerfile         (12 lines)
    └─ Multi-stage build (builder → serve)
```

### Source Code
```
src/
├── main.jsx           (8 lines)
│   └─ React 18 mount point
├── App.jsx            (70 lines)
│   ├─ Main application component
│   ├─ Sidebar navigation
│   ├─ Page routing logic
│   └─ Header and footer
├── index.css          (30 lines)
│   ├─ Tailwind directives
│   └─ Custom component styles (.card, .btn-*, .metric*)
└── api.js             (40 lines)
    ├─ Axios client configuration
    ├─ checkHealth()
    ├─ getStats()
    ├─ getRules()
    ├─ getIncidents()
    ├─ ingestLog()
    └─ ingestLogs()

components/
├── Dashboard.jsx      (90 lines)
│   ├─ Metrics grid (logs, alerts, incidents)
│   ├─ Detection engine stats
│   ├─ Correlation engine overview
│   ├─ Auto-refresh (5 seconds)
│   └─ Error handling
├── Incidents.jsx      (100 lines)
│   ├─ Incidents list with severity colors
│   ├─ Time range filter (1h, 6h, 24h, 7d)
│   ├─ Incident details (pattern, host, user, alerts)
│   ├─ Status tracking
│   └─ Auto-refresh (10 seconds)
└── Rules.jsx          (95 lines)
    ├─ Total rules count
    ├─ Severity breakdown metrics
    ├─ Rules list with details
    ├─ Severity color-coding
    └─ Auto-refresh (30 seconds)
```

---

## Summary by Technology

### Go (Backend - Ingestion)
- **Files**: 2 (main.go, go.mod)
- **Lines**: ~180
- **Purpose**: RFC5424 syslog parsing and API forwarding

### Python (Backend - API & Engines)
- **Files**: 4 (main.py, normalizer.py, engine.py, correlator.py, init-db.py)
- **Lines**: ~1,200
- **Purpose**: FastAPI server, log parsing, detection, correlation

### JavaScript/JSX (Frontend)
- **Files**: 8 (main.jsx, App.jsx, api.js, index.css, + 3 components, + HTML)
- **Lines**: ~600
- **Purpose**: React web UI with real-time dashboards

### YAML (Rules)
- **Files**: 3 detection rules
- **Lines**: ~60
- **Purpose**: Security event detection patterns

### Configuration
- **Files**: 10 (docker-compose, dockerfile, vite, tailwind, postcss, package.json, go.mod, requirements)
- **Lines**: ~200
- **Purpose**: Service and build configuration

### Documentation
- **Files**: 5 (README, QUICKSTART, IMPLEMENTATION, COMPLETION, copilot-instructions)
- **Lines**: ~2,000
- **Purpose**: User and developer guidance

---

## Data Flow Through Files

### 1. Log Ingestion Flow
```
syslog-server-go/main.go (receives on :514/udp)
    ↓
Calls normalizer.py:normalize_log()
    ↓
HTTP POST to api-python/main.py (/ingest)
    ↓
api-python/main.py:ingest_log()
    ↓
OpenSearch indexing (logs index)
```

### 2. Detection Flow
```
api-python/main.py (startup)
    ↓
Initializes detection-engine/engine.py
    ↓
engine.py:load_rules() - reads from rules/*.yaml
    ↓
engine.py:run_detection_loop() (every 10s)
    ↓
Queries OpenSearch (logs index)
    ↓
engine.py:detect() - evaluates rules
    ↓
engine.py:generate_alert() - creates alerts
    ↓
OpenSearch indexing (alerts index)
```

### 3. Correlation Flow
```
api-python/main.py (startup)
    ↓
Initializes correlation-engine/correlator.py
    ↓
correlator.py:run_correlation_loop() (every 30s)
    ↓
Queries OpenSearch (alerts index)
    ↓
correlator.py:_check_pattern_on_alerts()
    ↓
Pattern matching and grouping
    ↓
correlator.py:generate_incident() (if pattern matches)
    ↓
OpenSearch indexing (incidents index)
```

### 4. Web UI Flow
```
frontend/react-ui/index.html
    ↓
src/main.jsx → React mount
    ↓
src/App.jsx → Main component
    ↓
components/Dashboard.jsx (5s polling via api.js)
    ↓
api.js:getStats() → HTTP GET :8000/stats
    ↓
api-python/main.py:get_stats()
    ↓
Queries OpenSearch (all indices)
    ↓
Returns to React → Component renders
```

---

## File Dependencies

### Circular Dependency Prevention
- ✓ No circular imports
- ✓ Modular architecture
- ✓ Clear separation of concerns

### Critical Paths
1. **syslog-server → api → normalization → opensearch**
2. **detection-engine → opensearch → react-ui**
3. **correlation-engine → opensearch → react-ui**

### Extension Points
- Add rules to `detection-engine/rules/*.yaml`
- Add parsers to `parser/normalizer.py`
- Add patterns to `correlation-engine/correlator.py`
- Add pages to `frontend/react-ui/src/components/`
- Add APIs to `ingestion/api-python/main.py`

---

## Deployment Checklist

- [x] Docker Compose configuration
- [x] Multi-stage builds for all services
- [x] Environment variable configuration
- [x] Service health checks
- [x] Dependency order (depends_on)
- [x] Network configuration (siem-net)
- [x] Volume configuration (opensearch-data)
- [x] Port exposure (514, 3000, 5601, 8000, 9200)

---

## Total Project Statistics

| Metric | Value |
|--------|-------|
| Total Files | 35 |
| Python Code | ~1,200 lines |
| Go Code | ~180 lines |
| JavaScript/JSX | ~600 lines |
| YAML (Rules) | ~60 lines |
| Configuration | ~200 lines |
| Documentation | ~2,000 lines |
| **Total Code** | **~4,240 lines** |

---

## Quick File Lookup

| What I Need | Where To Find It |
|-------------|------------------|
| How to start | README.md or QUICKSTART.md |
| Architecture overview | .github/copilot-instructions.md |
| Implementation details | IMPLEMENTATION.md |
| Log parsing logic | parser/normalizer.py |
| Detection rules | detection-engine/rules/*.yaml |
| Correlation patterns | correlation-engine/correlator.py |
| Web UI components | frontend/react-ui/src/components/ |
| API endpoints | ingestion/api-python/main.py |
| Syslog forwarding | ingestion/syslog-server-go/main.go |
| Service config | docker-compose.yml |
| Database schema | scripts/init-db.py |
