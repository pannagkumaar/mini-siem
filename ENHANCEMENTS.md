# Enhanced SIEM Dashboard & Custom Rules

## What's New

### 1. Enhanced Dashboard (Security Operations Center)
The dashboard has been completely redesigned with a professional SOC look:

#### Features:
- **Gradient header** with "Security Operations Center" branding
- **Animated stat cards** with hover effects and scale animations
- **Live status indicator** showing real-time refresh status (green pulse = live)
- **Enhanced severity charts** with gradient progress bars
- **Modern card-based layout** with shadows and gradients
- **Improved color scheme** using cyan/blue gradients for SIEM feel
- **Top event types grid** showing most common security events
- **Detection engine metrics** with color-coded severity counts

### 2. Custom Rule Creation
You can now create custom detection rules directly from the UI!

#### How to Create a Custom Rule:

1. **Navigate to Rules Page**
   - Click "Rules" in the sidebar (⚙️)

2. **Click "Create New Rule" Button**
   - Green button in the top right corner

3. **Fill in Rule Details:**
   - **Rule Name*** (required) - e.g., "Suspicious PowerShell Execution"
   - **Description*** (required) - What does this rule detect?
   - **Severity*** (required) - Choose: low, medium, high, or critical
   - **Event Type*** (required) - e.g., process_create, login, network, file_access
   - **Source** (optional) - e.g., windows, linux, firewall

4. **Add Conditions** (Optional):
   - Click "+ Add Condition" to add field-based filters
   - **Field**: Field name to check (e.g., `process_name`, `user`, `ip`)
   - **Operator**: Choose equals, contains, or greater_than
   - **Value**: Value to match against
   - You can add multiple conditions

5. **Create the Rule**
   - Click "Create Rule" button
   - Rule is saved to `detection-engine/rules/` directory
   - Detection engine will automatically use it

#### Example Rule:

**Rule Name:** Multiple Failed Login Attempts  
**Description:** Detects multiple failed login attempts within short time  
**Severity:** high  
**Event Type:** login  
**Source:** windows  

**Additional Conditions:**
- Field: `status` | Operator: equals | Value: `failure`
- Field: `user` | Operator: contains | Value: `admin`

### 3. Enhanced Rules Page

The Rules page now includes:
- **Summary metrics** showing total rules by severity
- **Click-to-filter** severity cards (click any severity to filter)
- **Expandable rule cards** showing full condition details
- **MITRE ATT&CK tags** display (if present in rules)
- **Modern gradient design** matching the dashboard

### 4. API Endpoint

A new endpoint has been added:

#### POST /rules/create
Creates a new custom detection rule

**Request Body:**
```json
{
  "name": "Rule Name",
  "description": "What this detects",
  "severity": "high",
  "condition": {
    "event_type": "process_create",
    "source": "windows",
    "process_name": "powershell.exe"
  }
}
```

**Response:**
```json
{
  "success": true,
  "rule_id": "DET-100",
  "message": "Rule created successfully",
  "file": "detection-engine/rules/DET-100-rule-name.yaml"
}
```

## How to Update the Project

Since we've made significant UI and backend changes:

### Quick Update (Code changes only - API/Frontend logic):
```powershell
docker-compose restart ingestion-api react-ui
```

### Full Rebuild (Dependencies, Dockerfile changes):
```powershell
docker-compose down
docker-compose build --no-cache ingestion-api react-ui
docker-compose up -d
```

## Technical Details

### Files Modified/Created:

1. **Frontend (React)**:
   - `frontend/react-ui/src/components/DashboardEnhanced.jsx` (new)
   - `frontend/react-ui/src/components/RulesEnhanced.jsx` (new)
   - `frontend/react-ui/src/App.jsx` (updated to use enhanced components)

2. **Backend (FastAPI)**:
   - `ingestion/api-python/main.py` (added `/rules/create` endpoint)

### Color Scheme:
- **Cyan/Blue gradients** - Primary brand colors for SIEM
- **Yellow/Orange** - Alerts and warnings
- **Red/Pink** - Critical incidents
- **Green/Emerald** - Success and creation actions
- **Purple** - Rules and configuration

### Animations:
- **Card scale animation** on data refresh
- **Pulse effect** on live indicator
- **Gradient hover effects** on all cards
- **Smooth transitions** on all interactive elements

## Usage Tips

### Dashboard:
- The dashboard auto-refreshes every 5 seconds
- Click "⏸ Pause" to stop auto-refresh
- Click "▶ Resume" to restart auto-refresh
- Stats cards animate briefly on each update

### Rules Creation:
- Use descriptive names for easy management
- Add multiple conditions for precise detection
- Test your rules with the continuous log generator
- Check alerts page to see if rules are triggering

### Severity Guidelines:
- **Critical**: Immediate threat, confirmed malicious activity
- **High**: Suspicious behavior, potential security risk
- **Medium**: Unusual activity, warrants investigation
- **Low**: Informational, minor anomalies

## Troubleshooting

### Rule Not Showing Up:
1. Check `detection-engine/rules/` directory for your rule file
2. Restart the API container: `docker-compose restart ingestion-api`
3. Check API logs: `docker-compose logs ingestion-api`

### Dashboard Not Loading:
1. Check API health: `curl http://localhost:8000/health`
2. Check OpenSearch: `curl http://localhost:9200/`
3. View container logs: `docker-compose logs react-ui`

### Custom Rule Not Triggering:
1. Ensure log generator is running: `python scripts/continuous-log-generator.py`
2. Check if logs match your rule conditions
3. View detection engine logs: `docker-compose logs ingestion-api`
4. Verify rule syntax in the YAML file

## Next Steps

With these enhancements, you now have:
✅ Professional SOC dashboard
✅ Custom rule creation capability
✅ Enhanced visual design
✅ Better UX with animations and gradients

Consider adding:
- Rule editing/deletion UI
- Rule testing interface
- Alert acknowledgment workflow
- Incident response playbooks
- MITRE ATT&CK mapping visualization
