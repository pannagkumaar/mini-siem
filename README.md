# Mini SIEM - Security Information & Event Management Platform

A modular, open-source SIEM built with Go, Python, OpenSearch, and React for real-time security event processing and threat detection.

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Port 514 (UDP), 3000, 5601, 8000, 9200 available

### Start All Services

```bash
docker-compose up --build
python scripts/init-db.py
```

### Access the Dashboard
- **Web UI**: http://localhost:3000
- **OpenSearch Dashboards**: http://localhost:5601
- **API Health**: http://localhost:8000/health
- **Syslog Server**: localhost:514/UDP

## Architecture

```
[Log Sources] → [Syslog/API] → [Normalizer] → [OpenSearch]
                                                 ├→ [Detection Engine] → Alerts
                                                 └→ [Correlation Engine] → Incidents
                                                      ↓
                                                 [React UI]
```

## Features Implemented ✅

- **Phase 1**: OpenSearch storage with normalized schema
- **Phase 2**: RFC5424 syslog server + JSON API with forwarding
- **Phase 3**: Log normalization (Windows, Linux, firewall)
- **Phase 4**: Detection engine with Sigma-like YAML rules
- **Phase 5**: Correlation engine for attack chains
- **Phase 6**: React web UI with dashboard, incidents, rules

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
