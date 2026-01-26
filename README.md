# Mini SIEM - Security Information & Event Management Platform

An **enterprise-grade SIEM platform** built with Go, Python, OpenSearch, and React for real-time security event processing, threat detection, and advanced threat hunting.

**Now with Advanced Search** - Query your logs like you would in Splunk or ElasticSearch! 🔍

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Port 514 (UDP), 3000, 5601, 8000, 9200 available

### Start All Services

```bash
docker-compose down
docker-compose up --build -d
Start-Sleep -Seconds 45
python scripts/init-db.py
```

### Access the Dashboard
- **Web UI**: http://localhost:3000
- **Advanced Search** (NEW): Click 🔍 in navigation
- **OpenSearch Dashboards**: http://localhost:5601
- **API Health**: http://localhost:8000/health

## What's New: Advanced Search

**Professional search interface with:**
- Query syntax: `severity:high AND event_type:login_failure`
- Boolean operators: AND, OR, (grouping)
- Wildcards: `host:prod-*`
- Range queries: `destination_port:>8000`
- Time expressions: `timestamp:1h ago`
- Saved searches: Save and reuse favorite queries
- Auto-complete: Field suggestions as you type
- Enterprise UI: Professional dark theme

**Try it:**
```
severity:high
event_type:login_failure AND host:prod-*
commandline:*powershell* AND severity:critical
(user:admin OR user:root) AND timestamp:6h ago
```

## Architecture

```
[Log Sources] → [Syslog/API] → [Normalizer] → [OpenSearch]
                                                 ├→ [Detection Engine] → Alerts
                                                 ├→ [Correlation Engine] → Incidents
                                                 └→ [Advanced Search] ← NEW!
                                                      ↓
                                                 [React UI - 6 Pages]
```

## Features Implemented ✅

- **Phase 1**: OpenSearch storage with normalized schema
- **Phase 2**: RFC5424 syslog server + JSON API with forwarding
- **Phase 3**: Log normalization (Windows, Linux, firewall)
- **Phase 4**: Detection engine with Sigma-like YAML rules
- **Phase 5**: Correlation engine for attack chains
- **Phase 6**: React web UI with dashboard, incidents, alerts, logs, rules
- **Phase 7** ⭐ **NEW**: Advanced search with query syntax and saved searches

## Test Log Ingestion

```bash
# Send test log
python scripts/send-log.py

# Send raw syslog
echo '<14>Jan 25 15:00:00 hostname app: test' | nc -u localhost 514
```

## API Endpoints

- `POST /ingest` - Submit logs
- `GET /health` - Health check
- `GET /stats` - Statistics
- `GET /rules` - Detection rules
- `GET /incidents?hours=24` - Recent incidents

## Future Features

- [ ] Sigma rule importer
- [ ] MITRE ATT&CK mapping
- [ ] Risk scoring
- [ ] SOAR actions (block IP, disable user)
- [ ] ML anomaly detection
