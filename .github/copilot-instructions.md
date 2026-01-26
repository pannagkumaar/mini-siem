# Copilot Instructions for Mini SIEM

## Project Overview
Mini SIEM is a **modular log ingestion and security event processing platform** using:
- **Data store**: OpenSearch (Elasticsearch-compatible, v2.11.1)
- **Ingestion**: Go syslog server + Python FastAPI ingestion API
- **Processing**: Detection engine (rules-based, Sigma-like YAML), correlation engine (event linking)
- **Frontend**: React + Vite + Tailwind UI
- **Orchestration**: Docker Compose

**Data flow**: 
```
[Log Sources] → [Syslog/JSON API] → [Parser/Normalizer] → [OpenSearch]
                                                              ├→ [Detection Engine] → [Alerts Index]
                                                              └→ [Correlation Engine] → [Incidents Index]
                                                         ↓
                                                    [React Web UI]
```

## Architecture Patterns

### Normalized Log Data Schema (Critical)
**All logs must conform to this schema** for proper correlation and detection. See `scripts/init-db.py` for OpenSearch mappings:

```python
{
  "timestamp": "ISO8601",           # date type; essential for time-based queries and correlation
  "source": "keyword",              # origin system type: windows|linux|firewall|app|network|custom
  "host": "keyword",                # hostname/server identifier
  "user": "keyword",                # username or service account
  "ip": "ip",                       # IP type; enables CIDR queries for correlation
  "event_type": "keyword",          # log category: process_create|login|failure|auth|network etc
  "severity": "keyword",            # low|medium|high|critical (standardized across all sources)
  "raw": {                          # schemaless original log data
    "type": "object",
    "enabled": False                # allows arbitrary JSON without schema conflicts
  }
}
```
- **Indices**: `logs` (raw ingested), `alerts` (detection output), `incidents` (correlation output)
- **Critical constraint**: Use standardized `event_type` and `severity` values across all parsers
- **Raw field**: Preserves original data for debugging; parser extracts normalized fields

### Service Communication Pattern
- **Syslog Server** (Go): Listens `0.0.0.0:514/udp`, parses RFC5424 via `gopkg.in/mcuadros/go-syslog.v2`
- **Ingestion API** (Python/FastAPI): 
  - `POST /ingest` - accepts single log or batch `[{log1}, {log2}]`
  - `GET /health` - readiness check
  - Must receive normalized schema from syslog server
- **Integration point**: Syslog server → `http://ingestion-api:8000/ingest` (TODO: currently prints to stdout)

### Container Networking
All services on `siem-net` bridge network; use internal hostnames:
- OpenSearch: `opensearch-node:9200` (queries, indexing)
- Dashboards: `opensearch-dashboards:5601` (debugging)
- Ingestion API: `ingestion-api:8000` (log reception)
- Syslog Server: `syslog-server:514/udp` (log source)

### Detection Rules Pattern (Sigma-like YAML)
Rules stored in `detection-engine/rules/*.yaml`. Example structure (not yet implemented):
```yaml
id: DET-001
name: Suspicious PowerShell
description: Detects encoded PowerShell commands
condition:
  event_type: process_create
  source: windows
  process_name: powershell.exe
  commandline_contains: "EncodedCommand"
severity: high
mitre_tag: ["T1086"]  # For future ATT&CK mapping
```
- **Engine logic** (TODO): Load rules → query `logs` index → evaluate conditions → write to `alerts`

### Correlation Engine Pattern
Detects attack chains by linking events across time/host/user. Example (not yet implemented):
```python
IF:
  event_type: login_failure AND count > 5 WITHIN 10min
  THEN:
    event_type: login_success WITHIN 5min
  THEN:
    event_type: privilege_escalation
THEN:
  CREATE incident WITH severity: high
```
- **Execution**: Polls `alerts` index → groups by host/user → applies patterns → writes to `incidents`
- **Window**: 10-15 minute lookback for correlation patterns

## Development Workflows

### Starting the Full Stack
```bash
docker-compose up --build
# Verify services are healthy:
# - OpenSearch: curl http://localhost:9200/ (200 response)
# - API: curl http://localhost:8000/health ({"status": "healthy"})
# - Dashboards: http://localhost:5601
```

### Testing Log Ingestion
```bash
# Send test log via API (requires API running):
python scripts/send-log.py

# Send raw syslog (requires syslog server running):
echo '<14>Jan 25 15:00:00 hostname app: test message' | nc -u localhost 514

# View server logs:
docker-compose logs syslog-server
docker-compose logs ingestion-api
```

### Database Initialization
```bash
# Create indices + mappings (run after OpenSearch is up):
python scripts/init-db.py
```

### Debugging with OpenSearch Dashboards
- Navigate to `http://localhost:5601`
- Index Patterns → Create pattern `logs*`
- Discover tab to query indexed logs
- Dev Tools → Console for direct OpenSearch API calls

## Project Conventions

### Language & Build Tools
- **Go**: 1.21, modules (`go.mod`), multi-stage Docker builds (builder → alpine)
  - No external configuration files; all logic in `main.go`
  - Graceful shutdown via signal handlers (`SIGINT`, `SIGTERM`)
- **Python**: 3.11-slim, FastAPI, uvicorn
  - Run with `--host 0.0.0.0` for Docker accessibility
  - Basic logging via stdlib + print statements (no structured logging yet)

### OpenSearch Patterns
- **No security**: Docker env disables security plugin (`plugins.security.disabled=true`)
- **Mappings**: Explicit type definitions to avoid dynamic mapping conflicts
- **Disabled dynamic mapping**: `raw` field uses `"enabled": False` for schemaless logs

### Code Structure
- **Flat services**: Each service (Go/Python) is a single module in its own directory
- **Minimal abstractions**: Services are MVP-stage; focus on direct functionality
- **Logging**: Printf/logging to stdout (Docker captures for compose logs)

## Key Files Reference
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Service definitions & networking |
| `ingestion/api-python/main.py` | Log ingest endpoint, health check |
| `ingestion/syslog-server-go/main.go` | RFC5424 syslog listener |
| `scripts/init-db.py` | OpenSearch index + mapping setup |
| `scripts/send-log.py` | Test log sender to API |
| `detection-engine/rules/` | (Empty) Future: YAML/JSON rule files |
| `correlation-engine/` | (Empty) Future: Event correlation logic |
| `frontend/react-ui/` | (Empty) Future: Dashboard UI |

## Adding New Features

### New Log Ingestion Source
1. Add service to `docker-compose.yml` on `siem-net`
2. Forward parsed logs to `http://ingestion-api:8000/ingest` (POST JSON)
3. Follow log schema above

### New Detection Rule
1. Create file in `detection-engine/rules/` (format TBD)
2. Read logs from OpenSearch, check conditions, write to `alerts` index

### New Correlation Logic
1. Implement in `correlation-engine/` (language/framework TBD)
2. Subscribe to `alerts` or `logs`, write linked events to `incidents` index

## Common Pitfalls
- **OpenSearch not ready**: `init-db.py` includes 120-second wait loop; verify logs with `docker-compose logs opensearch`
- **Syslog parsing fails**: Ensure source logs match RFC5424 format; check server logs for parse errors
- **API unreachable from containers**: Use internal hostname `ingestion-api:8000`, not `localhost:8000`
- **Port conflicts**: Services expect ports 514 (UDP), 5601, 8000, 9200; adjust in compose if taken

## MVP Build Plan (2 weeks)

### Phase 1: Storage (Day 1)
- OpenSearch container running with single-node configuration
- Create three indices: `logs`, `alerts`, `incidents`
- Apply mappings with normalized schema (timestamp, source, host, user, ip, event_type, severity, raw)

### Phase 2: Log Ingestion (Days 2-3)
- Go syslog server parses RFC5424 on port 514/udp
- Python FastAPI endpoint `POST /ingest` accepts single/batch logs
- Syslog server forwards parsed logs to ingestion API (integration point)
- `/health` endpoint for container readiness

### Phase 3: Parser & Normalization (Days 3-4)
- `parser/normalizer.py`: Convert raw logs to normalized schema
- Parse common formats (Windows events, Linux syslog, firewall logs)
- Push normalized logs to `logs` index in OpenSearch

### Phase 4: Detection Engine (Days 5-7)
- Load Sigma-like YAML rules from `detection-engine/rules/`
- Query new logs every 10 seconds
- Evaluate rule conditions against normalized schema
- Write matching logs to `alerts` index with alert metadata

### Phase 5: Correlation Engine (Days 8-10)
- Fetch alerts from last 15 minutes
- Group by host/user
- Apply correlation patterns (e.g., 5+ failed logins → success → escalation)
- Create incidents in `incidents` index

### Phase 6: Web UI (Days 11-14)
- React + Vite + Tailwind setup
- Pages: Dashboard (metrics), Logs table, Alerts list, Incidents
- OpenSearch API integration for queries
- Real-time log/alert streaming (polling or WebSocket)

## Advanced Features (Post-MVP Resume Boosters)
- Sigma rule importer (import public rule sets)
- MITRE ATT&CK mapping and tagging
- Visual attack timeline and kill-chain visualization
- Risk scoring algorithm
- Multi-tenant support
- SOAR actions (block IP, disable user, revoke session)
- ML-based anomaly detection
- Elasticsearch/OpenSearch plugin ecosystem integration
