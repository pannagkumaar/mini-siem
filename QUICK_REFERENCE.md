# Quick Reference - Enhanced SIEM

## 🚀 Access URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **SIEM Dashboard** | http://localhost:3000 | Main UI with enhanced dashboard |
| **API Documentation** | http://localhost:8000/docs | FastAPI Swagger docs |
| **OpenSearch Dashboards** | http://localhost:5601 | Data exploration |
| **OpenSearch API** | http://localhost:9200 | Direct database access |

## 🎨 Enhanced Dashboard Features

### Live Controls
- **Pause/Resume Button**: Control auto-refresh (top right)
- **Live Indicator**: Green pulse = active, Gray = paused
- **Auto-refresh**: Updates every 5 seconds when active

### Stat Cards (Top Row)
- **Total Logs**: All ingested events (cyan gradient)
- **Active Alerts**: Detection rule matches (yellow gradient)
- **Security Incidents**: Correlated threats (red gradient)
- **Animation**: Cards scale briefly on each data refresh

### Severity Charts (Middle Section)
- **Log Severity**: Distribution of all log events
- **Alert Severity**: Distribution of triggered alerts
- **Visual**: Gradient progress bars with counts
- **Colors**: Critical=red, High=orange, Medium=yellow, Low=blue

### Event Types Grid (Bottom Section)
- **Top 8**: Most frequent event types
- **Interactive**: Hover for highlight effect
- **Real-time**: Updates as new logs arrive

## 🛠️ Custom Rule Creation

### Step-by-Step Guide

1. **Navigate to Rules**
   ```
   Sidebar → Rules (⚙️)
   ```

2. **Click "Create New Rule"**
   ```
   Green button, top right corner
   ```

3. **Fill Required Fields**
   ```
   Rule Name*: "Suspicious Admin Activity"
   Description*: "Detects suspicious actions by admin users"
   Severity*: high
   Event Type*: login
   Source: windows (optional)
   ```

4. **Add Conditions (Optional)**
   ```
   Click "+ Add Condition"
   
   Condition 1:
   - Field: user
   - Operator: contains
   - Value: admin
   
   Condition 2:
   - Field: source_ip
   - Operator: equals
   - Value: 192.168.1.100
   ```

5. **Create & Verify**
   ```
   Click "Create Rule"
   → Success message appears
   → Rule saved to detection-engine/rules/
   → Rules list refreshes automatically
   ```

## 📋 Rule Field Reference

### Required Fields
| Field | Type | Example | Purpose |
|-------|------|---------|---------|
| `name` | string | "Brute Force Detection" | Rule display name |
| `description` | string | "Detects multiple failed logins" | What it detects |
| `severity` | enum | low/medium/high/critical | Threat level |
| `event_type` | string | process_create, login, network | Log category |

### Optional Fields
| Field | Type | Example | Purpose |
|-------|------|---------|---------|
| `source` | string | windows, linux, firewall | Log source system |
| `conditions` | array | [{field, operator, value}] | Additional filters |

### Condition Operators
- **equals**: Exact match (`field == value`)
- **contains**: Substring match (`value in field`)
- **greater_than**: Numeric comparison (`field > value`)

## 🎯 Common Use Cases

### Use Case 1: PowerShell Detection
```json
{
  "name": "Encoded PowerShell Command",
  "description": "Detects Base64-encoded PowerShell execution",
  "severity": "high",
  "event_type": "process_create",
  "source": "windows",
  "conditions": [
    {
      "field": "process_name",
      "operator": "equals",
      "value": "powershell.exe"
    },
    {
      "field": "commandline",
      "operator": "contains",
      "value": "EncodedCommand"
    }
  ]
}
```

### Use Case 2: Failed Login Monitoring
```json
{
  "name": "Multiple Failed Logins",
  "description": "Detects potential brute force attacks",
  "severity": "critical",
  "event_type": "login",
  "source": "windows",
  "conditions": [
    {
      "field": "status",
      "operator": "equals",
      "value": "failure"
    }
  ]
}
```

### Use Case 3: Suspicious Network Activity
```json
{
  "name": "Outbound Connection to Suspicious Port",
  "description": "Detects connections to non-standard ports",
  "severity": "medium",
  "event_type": "network",
  "conditions": [
    {
      "field": "destination_port",
      "operator": "greater_than",
      "value": "10000"
    }
  ]
}
```

## 🔧 API Quick Reference

### Create Rule via API
```powershell
$rule = @{
    name = "My Custom Rule"
    description = "Detects something suspicious"
    severity = "high"
    condition = @{
        event_type = "process_create"
        source = "windows"
    }
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:8000/rules/create" `
    -Method POST `
    -Body $rule `
    -ContentType "application/json"
```

### Response Format
```json
{
  "success": true,
  "rule_id": "DET-020",
  "message": "Rule created successfully",
  "file": "detection-engine/rules/DET-020-my-custom-rule.yaml"
}
```

## 📊 Severity Guidelines

| Level | When to Use | Example |
|-------|-------------|---------|
| **Critical** | Confirmed malicious activity, immediate threat | Ransomware execution, credential dumping |
| **High** | Suspicious behavior, likely threat | Multiple failed logins, privilege escalation |
| **Medium** | Unusual activity, potential risk | Rare process execution, unusual network traffic |
| **Low** | Informational, minor anomalies | Configuration changes, user profile updates |

## 🐛 Troubleshooting

### Dashboard Not Loading
```powershell
# Check all services
docker-compose ps

# Restart UI
docker-compose restart react-ui

# Check logs
docker-compose logs react-ui
```

### Rule Not Created
```powershell
# Check API logs
docker-compose logs ingestion-api

# Verify API health
Invoke-RestMethod -Uri "http://localhost:8000/health"

# Check rules directory in container
docker exec ingestion-api ls -la detection-engine/rules/
```

### Rules Not Triggering
```powershell
# Verify log generator is running
Get-Process | Where-Object {$_.Name -like "*python*"}

# Check if logs are being ingested
Invoke-RestMethod -Uri "http://localhost:8000/stats"

# View recent logs
Invoke-RestMethod -Uri "http://localhost:8000/logs?page=1&limit=10"
```

### Changes Not Appearing
```powershell
# Full rebuild
docker-compose down
docker-compose build --no-cache ingestion-api react-ui
docker-compose up -d

# Just restart (for code changes)
docker-compose restart ingestion-api react-ui
```

## 🎨 Color Code Reference

### Severity Colors
- 🔴 **Critical**: Red gradients (`from-red-400 to-pink-500`)
- 🟠 **High**: Orange gradients (`from-orange-400 to-orange-500`)
- 🟡 **Medium**: Yellow gradients (`from-yellow-400 to-yellow-500`)
- 🔵 **Low**: Blue gradients (`from-blue-400 to-blue-500`)

### Component Colors
- 💠 **Primary/Dashboard**: Cyan-Blue (`from-cyan-400 to-blue-500`)
- 🟢 **Success/Create**: Green-Emerald (`from-green-600 to-emerald-600`)
- 🟣 **Rules/Config**: Purple (`text-purple-400`)
- ⚪ **Neutral**: Gray scale (`gray-700, gray-800, gray-900`)

## 💡 Pro Tips

1. **Filter by severity**: Click any severity card on Rules page to filter
2. **Expand rule details**: Click any rule card to see full conditions
3. **Monitor live**: Watch the green pulse indicator - if it stops, refresh is paused
4. **Test rules quickly**: Use continuous log generator for instant testing
5. **Check OpenSearch**: Use Dashboards (port 5601) for deep data analysis
6. **Save searches**: Use the Search page to save complex queries
7. **API docs**: Check `/docs` for all available endpoints and schemas

## 📝 File Locations

### In Container (API)
```
/app/detection-engine/rules/       ← Custom rules saved here
/app/main.py                        ← API code with /rules/create
/app/query_parser.py                ← Search query parser
```

### On Host
```
detection-engine/rules/             ← Rule YAML files
frontend/react-ui/src/components/   ← React components
ingestion/api-python/main.py        ← API source code
```

## 🚦 Status Indicators

### Dashboard Header
- 🟢 **Green Pulse**: Auto-refresh active (live data)
- ⚪ **Gray Dot**: Auto-refresh paused
- **"Live (5s)"**: Refresh interval in seconds
- **"Paused"**: No auto-refresh

### Service Status
- ✅ **All green in `docker-compose ps`**: System healthy
- ⚠️ **Yellow/Restarting**: Service recovering
- ❌ **Red/Exited**: Service failed - check logs

---

**Quick Start**: Open http://localhost:3000 → Dashboard auto-loads → Click "Rules" → Click "Create New Rule" → Fill form → Done! 🎉
