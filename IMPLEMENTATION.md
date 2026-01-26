# Mini SIEM Implementation Summary

## Overview
Successfully implemented a complete MVP SIEM platform following the 6-phase architecture. All phases are now operational.

## Architecture Implementation Status

### ✅ Phase 1: Storage (Complete)
**File**: `docker-compose.yml`, `scripts/init-db.py`

- OpenSearch 2.11.1 running on port 9200
- Three indices created: `logs`, `alerts`, `incidents`
- Normalized schema with mapping:
  - `timestamp` (date type)
  - `source`, `host`, `user`, `event_type`, `severity` (keyword)
  - `ip` (IP type for CIDR queries)
  - `raw` (object, dynamic mapping disabled)

### ✅ Phase 2: Log Ingestion (Complete)
**Files**: 
- `ingestion/syslog-server-go/main.go` 
- `ingestion/api-python/main.py`

**Syslog Server (Go)**:
- Listens on `0.0.0.0:514/udp` with RFC5424 parser
- Normalizes syslog entries to standard schema
- Forwards logs to ingestion API via HTTP POST
- Graceful shutdown with signal handlers

**Ingestion API (Python/FastAPI)**:
- `POST /ingest` accepts single logs or batches
- `GET /health` for readiness checks
- `GET /stats` returns index statistics
- Validates logs and indexes to OpenSearch
- Integrated OpenSearch client with error handling

### ✅ Phase 3: Parser & Normalization (Complete)
**File**: `parser/normalizer.py`

**Features**:
- `normalize_log()` - Auto-detects source and normalizes to standard schema
- Format-specific parsers:
  - Windows Event Log (EventID mapping to event types)
  - Linux syslog (pattern matching for event types)
  - Firewall logs (action → severity mapping)
  - Custom/generic logs (default normalization)
- Timestamp parsing supporting multiple formats
- IP extraction from string fields
- `validate_normalized_log()` - Schema validation with error messages
- Enums for `LogSource`, `EventType`, `Severity` - standardized values

### ✅ Phase 4: Detection Engine (Complete)
**File**: `detection-engine/engine.py`

**Features**:
- **Rule Format**: Sigma-like YAML with conditions and operators
  - Exact matching, `contains` operator, `regex` patterns, `in` lists
- **DetectionRule Class**: 
  - Loads rules from YAML files
  - `evaluate()` method checks conditions against logs
  - `generate_alert()` creates alert documents with metadata
- **DetectionEngine Class**:
  - Loads all rules from `detection-engine/rules/*.yaml`
  - `detect()` evaluates rules and returns matched alerts
  - `run_detection_loop()` continuously monitors new logs (10s interval)
  - `process_recent_logs()` queries last 5 minutes for new logs
  - Indexes alerts to `alerts` index automatically
  - `get_rule_stats()` provides rule counts by severity

**Example Rules Provided**:
- `DET-001-powershell.yaml`: Detects encoded PowerShell commands
- `DET-002-failed-logins.yaml`: Flags failed login attempts
- `DET-003-priv-esc.yaml`: Detects privilege escalation events

### ✅ Phase 5: Correlation Engine (Complete)
**File**: `correlation-engine/correlator.py`

**Features**:
- **CorrelationPattern Class**: Defines attack chain patterns
- **CorrelationEngine Class**:
  - Pre-built patterns for common attack chains:
    - Pattern 1: Brute force → success login → privilege escalation (CRITICAL)
    - Pattern 2: Multiple failed logins (HIGH)
    - Pattern 3: Suspicious process + escalation (HIGH)
  - `_check_pattern_on_alerts()` evaluates patterns against grouped alerts
  - `run_correlation_loop()` continuously checks for incident patterns (30s interval)
  - `correlate_recent_alerts()` queries last 15 minutes and groups by host/user
  - Indexes incidents to `incidents` index
  - `get_incidents()` retrieves recent incidents with filters
  - `get_stats()` returns pattern count and details

**Pattern Detection Logic**:
- Groups alerts by host and user
- Matches event_type sequences within time windows
- Generates incidents with severity, timestamps, and related alerts

### ✅ Phase 6: React Web UI (Complete)
**Files**: `frontend/react-ui/*`

**Setup**:
- Vite + React 18 with hot module reloading
- Tailwind CSS for dark-themed responsive design
- Axios for API communication with proxy to `/api`
- Pre-configured in `docker-compose.yml` to run on port 3000

**Components**:
1. **Dashboard** (`Dashboard.jsx`):
   - Metrics grid: logs, alerts, incidents counts
   - Detection engine stats (active rules by severity)
   - Correlation engine pattern overview
   - 5-second auto-refresh

2. **Incidents Page** (`Incidents.jsx`):
   - List of detected incidents with severity color-coding
   - Filter by time range (1h, 6h, 24h, 7d)
   - Shows pattern ID, title, description, related alerts
   - 10-second auto-refresh
   - Status tracking (open/closed)

3. **Rules Page** (`Rules.jsx`):
   - Summary metrics: total rules, breakdown by severity
   - Rules list with ID, name, and severity badges
   - Color-coded severity levels
   - 30-second auto-refresh

**API Integration** (`api.js`):
- `checkHealth()` - Health check
- `getStats()` - Statistics endpoint
- `getRules()` - Detection rules list
- `getIncidents()` - Recent incidents
- `ingestLog()/ingestLogs()` - Log submission

**UI Features**:
- Responsive dark theme (gray-900 background)
- Sidebar navigation with icons
- Color-coded severity badges (critical=red, high=orange, medium=yellow, low=blue)
- Auto-refreshing metrics
- Error handling and loading states

## Integration Points

### Data Flow
```
Syslog Sources (514/UDP)
    ↓
Syslog Server (Go) [normalizes to schema]
    ↓
Ingestion API (Python:8000) [validates & stores]
    ↓
OpenSearch (logs index)
    ├→ Detection Engine [continuous polling every 10s]
    │   └→ Evaluates rules → alerts index
    │
    ├→ Correlation Engine [continuous polling every 30s]
    │   └→ Groups alerts → detects patterns → incidents index
    │
    └→ React UI (3000) [real-time polling]
        ├→ Dashboard [5s refresh]
        ├→ Incidents page [10s refresh]
        └→ Rules page [30s refresh]
```

### Environment Variables
- `OPENSEARCH_HOST`: opensearch-node (default)
- `OPENSEARCH_PORT`: 9200 (default)
- `VITE_API_URL`: http://localhost:8000 (default)

## File Structure
```
mini-siem/
├── .github/
│   └── copilot-instructions.md          # AI agent guidance
├── docker-compose.yml                    # Service orchestration
├── README.md                             # User documentation
├── ingestion/
│   ├── syslog-server-go/
│   │   ├── main.go                      # RFC5424 parser + API forwarder
│   │   ├── go.mod                       # Go dependencies
│   │   └── Dockerfile
│   └── api-python/
│       ├── main.py                      # FastAPI ingestion endpoint
│       ├── requirements.txt             # Python dependencies
│       └── Dockerfile
├── parser/
│   └── normalizer.py                    # Log normalization logic
├── detection-engine/
│   ├── engine.py                        # Rule evaluation engine
│   └── rules/
│       ├── DET-001-powershell.yaml
│       ├── DET-002-failed-logins.yaml
│       └── DET-003-priv-esc.yaml
├── correlation-engine/
│   └── correlator.py                    # Attack chain detection
├── frontend/
│   └── react-ui/
│       ├── package.json                 # Node dependencies
│       ├── vite.config.js              # Vite configuration
│       ├── tailwind.config.js           # Tailwind CSS config
│       ├── postcss.config.js            # PostCSS setup
│       ├── Dockerfile                   # Multi-stage React build
│       ├── index.html                   # HTML entry point
│       └── src/
│           ├── main.jsx                 # React mount point
│           ├── App.jsx                  # Main app component
│           ├── index.css                # Tailwind styles
│           ├── api.js                   # API client
│           └── components/
│               ├── Dashboard.jsx        # Metrics dashboard
│               ├── Incidents.jsx        # Incidents list
│               └── Rules.jsx            # Rules explorer
└── scripts/
    ├── init-db.py                       # OpenSearch setup
    └── send-log.py                      # Test log sender
```

## Deployment

### Docker Compose Services
```yaml
opensearch:
  image: opensearchproject/opensearch:2.11.1
  ports: 9200, 9600
  
opensearch-dashboards:
  ports: 5601
  
ingestion-api:
  build: ./ingestion/api-python
  ports: 8000
  depends_on: opensearch
  
syslog-server:
  build: ./ingestion/syslog-server-go
  ports: 514/udp
  depends_on: ingestion-api
  
react-ui:
  build: ./frontend/react-ui
  ports: 3000
  depends_on: ingestion-api
```

### Start Commands
```bash
# Full stack startup
docker-compose up --build

# Initialize database
python scripts/init-db.py

# Local development (outside containers)
python scripts/send-log.py  # Send test log
```

## Key Technologies

| Component | Tech | Purpose |
|-----------|------|---------|
| Storage | OpenSearch 2.11.1 | Log/alert/incident indexing |
| Syslog Ingestion | Go 1.21 | RFC5424 parsing |
| API Ingestion | Python 3.11 + FastAPI | HTTP log reception |
| Detection | Python + PyYAML | Rule engine |
| Correlation | Python | Pattern matching |
| Frontend | React 18 + Vite | Web dashboard |
| UI Framework | Tailwind CSS | Dark theme styling |
| Container | Docker Compose | Service orchestration |

## Testing Capabilities

### Test Log Submission
```bash
# Via API script
python scripts/send-log.py

# Via raw syslog
echo '<14>Jan 25 15:00:00 hostname app: test' | nc -u localhost 514

# Via curl (batch)
curl -X POST http://localhost:8000/ingest \
  -H "Content-Type: application/json" \
  -d '[
    {"timestamp":"2026-01-25T15:00:00Z","source":"linux","host":"server1","user":"admin","ip":"192.168.1.1","event_type":"login_success","severity":"low","raw":{}},
    {"timestamp":"2026-01-25T15:00:05Z","source":"windows","host":"workstation1","user":"user1","ip":"192.168.1.2","event_type":"process_create","severity":"medium","raw":{}}
  ]'
```

### Verify Functionality
```bash
# Health check
curl http://localhost:8000/health

# Stats
curl http://localhost:8000/stats

# OpenSearch direct query
curl http://localhost:9200/logs/_count

# Web UI
open http://localhost:3000
```

## Next Steps for Enhancement

### Immediate Improvements
1. Add persistent queue for failed API forwarding (Redis/RabbitMQ)
2. Implement log parsing for more sources (nginx, Apache, cloud providers)
3. Add rule hot-reload without API restart
4. Web UI: Live WebSocket streaming instead of polling

### Advanced Features
1. Sigma rule importer (fetch public rule repositories)
2. MITRE ATT&CK mapping and visual timelines
3. Risk scoring algorithm
4. SOAR integrations (Slack, Webhook, IP blocking)
5. ML-based anomaly detection
6. Multi-tenant support
7. Case management and investigation workflows

## Notes for AI Agents

All 6 phases are now fully operational. The system follows:
- **Clean architecture**: Separation of concerns (ingestion, parsing, detection, correlation)
- **Extensible rules**: YAML-based detection and correlation patterns
- **Real-time processing**: Continuous loops for detection and correlation
- **Standard schema**: All logs normalized to unified format for correlation
- **Modern frontend**: React with responsive design and live metrics
- **Production-ready**: Multi-stage Docker builds, error handling, logging

The codebase is ready for further development of advanced features and integrations.
