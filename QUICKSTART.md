# Mini SIEM Quick Start Guide

## Prerequisites
- Docker Desktop & Docker Compose
- Available ports: 514 (UDP), 3000, 5601, 8000, 9200
- Python 3.11+ (for running init scripts locally, optional)

## One-Command Startup

```bash
# In project root
docker-compose up --build
```

This starts:
- OpenSearch (9200) - Log storage
- OpenSearch Dashboards (5601) - Debug interface
- Ingestion API (8000) - Log reception
- Syslog Server (514/UDP) - Syslog ingestion
- React UI (3000) - Web dashboard

**Wait 30-60 seconds** for all services to fully initialize.

## Initialize Database

In a separate terminal:
```bash
python scripts/init-db.py
```

This creates the `logs`, `alerts`, and `incidents` indices with proper mappings.

## Access the Dashboard

Open browser to: **http://localhost:3000**

You'll see:
- **Dashboard**: Real-time metrics (logs, alerts, incidents counts)
- **Incidents**: Detected attack chains
- **Rules**: Loaded detection rules

## Send Test Logs

### Option 1: Via Python Script
```bash
python scripts/send-log.py
```

### Option 2: Via Raw Syslog
```bash
# On Windows PowerShell:
echo '<14>Jan 25 15:00:00 hostname PowerShell: Suspicious -EncodedCommand command' | nc -u localhost 514

# This triggers DET-001 rule if detected as Windows process_create event
```

### Option 3: Via curl (Batch)
```bash
curl -X POST http://localhost:8000/ingest \
  -H "Content-Type: application/json" \
  -d '[
    {
      "timestamp": "2026-01-25T15:00:00Z",
      "source": "windows",
      "host": "workstation1",
      "user": "attacker",
      "ip": "192.168.1.100",
      "event_type": "login_failure",
      "severity": "medium",
      "raw": {}
    },
    {
      "timestamp": "2026-01-25T15:00:02Z",
      "source": "windows",
      "host": "workstation1",
      "user": "attacker",
      "ip": "192.168.1.100",
      "event_type": "login_failure",
      "severity": "medium",
      "raw": {}
    }
  ]'
```

## Monitor Logs in OpenSearch

```bash
# Count all logs
curl http://localhost:9200/logs/_count

# Query recent logs
curl -X GET "localhost:9200/logs/_search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "range": {
        "timestamp": {
          "gte": "now-1h"
        }
      }
    },
    "size": 10,
    "sort": [{"timestamp": {"order": "desc"}}]
  }'
```

## Check API Status

```bash
# Health check
curl http://localhost:8000/health

# Get statistics
curl http://localhost:8000/stats

# List detection rules
curl http://localhost:8000/rules

# Get recent incidents
curl http://localhost:8000/incidents?hours=24
```

## View Service Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ingestion-api
docker-compose logs -f syslog-server
docker-compose logs -f opensearch
```

## Detection Rules

Rules in `detection-engine/rules/*.yaml` are auto-loaded. Examples:

**DET-001**: Detects PowerShell encoded commands
```yaml
condition:
  source: windows
  event_type: process_create
  raw:
    commandline:
      contains: EncodedCommand
severity: high
```

**DET-002**: Detects failed login attempts
```yaml
condition:
  event_type: login_failure
severity: medium
```

**DET-003**: Detects privilege escalation
```yaml
condition:
  event_type: privilege_escalation
severity: high
```

To add a new rule, create a `.yaml` file in `detection-engine/rules/` and it will be loaded on next API restart.

## Correlation Patterns

Built-in patterns detect attack chains:

1. **Brute Force → Success → Escalation** (CRITICAL)
   - 5+ failed logins → successful login → privilege escalation

2. **Multiple Failed Logins** (HIGH)
   - 5+ failed login attempts in 15 minutes

3. **Suspicious Process + Escalation** (HIGH)
   - Process creation followed by privilege escalation

These automatically trigger when conditions are met.

## Stop Services

```bash
# Graceful shutdown
docker-compose down

# Remove all data (fresh start)
docker-compose down -v
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection refused on 8000 | API still starting, wait 30s and retry |
| OpenSearch connection failed | Check `docker-compose logs opensearch` |
| No logs in dashboard | Verify logs sent with `curl http://localhost:8000/stats` |
| Rules not loading | Check YAML syntax, see API logs |
| React UI shows errors | Check browser console, verify API accessible |

## Next Steps

1. **Explore data**: Use OpenSearch Dashboards at http://localhost:5601
2. **Create rules**: Add `.yaml` files to `detection-engine/rules/`
3. **Integrate sources**: Forward logs from Windows/Linux/firewalls to 514/UDP
4. **Customize UI**: Edit components in `frontend/react-ui/src/`
5. **Add correlation patterns**: Edit `correlation-engine/correlator.py`

## Documentation

- **Architecture Details**: See `.github/copilot-instructions.md`
- **Implementation Status**: See `IMPLEMENTATION.md`
- **API Reference**: OpenSearch docs at https://opensearch.org/docs/
- **Detection Rules**: See `detection-engine/rules/` examples
