# Mini SIEM UI Quick Reference Guide

## 🎯 Navigation Map

```
┌─────────────────────────────────────────────────────────┐
│                   🛡️ Mini SIEM v2.0                     │
│          Security Information & Event Management         │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   📊 DASHBOARD         🚨 INCIDENTS         🔔 ALERTS
   ────────────────    ────────────────    ────────────────
   • Real-time KPIs    • Open incidents    • Latest alerts
   • Severity charts   • Timeline view     • Filter by type
   • Event breakdown   • Recommendations   • Full details
   • Engine status     • Action buttons    • Raw logs
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
   📋 LOGS             ⚙️ RULES            🔗 SETTINGS
   ────────────────    ────────────────    ────────────────
   • Raw log view      • Loaded rules      • Refresh rate
   • Multi-filtering   • Severity filter   • Quick links
   • Event types       • Conditions        • Status info
   • Sources           • MITRE tags        • API docs
```

---

## 📊 Dashboard Page

### Metrics
```
┌──────────────────────────────────────────────────────────┐
│ 📋 Total Logs    │ 🔔 Alerts    │ 🚨 Incidents   │ ⚙️ Rules
│    1,234         │    89        │      12        │   18
└──────────────────────────────────────────────────────────┘
```

### Severity Distribution
```
LOGS                           ALERTS
━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 Critical  ████░░░░░░  50  🔴 Critical  ██░░░░░░░░   8
🟠 High      ████████░░ 234  🟠 High      ██████░░░░  34
🟡 Medium    ██████████ 689  🟡 Medium    ████░░░░░░  32
🔵 Low       ███░░░░░░░ 261  🔵 Low       █░░░░░░░░░  15
```

### Top Events
```
process_create (456) | login_failure (234) | file_access (178)
network_conn (123)   | privilege_esc (98)  | auth_failure (67)
dns_query (45)       | firewall_deny (23)
```

---

## 🔔 Alerts Page

### Alert Card (Collapsed)
```
┌────────────────────────────────────────────────────────┐
│ [CRITICAL] Suspicious PowerShell Execution  [2024-01-26]
│ Rule ID: DET-001                                      ▶
│
│ Host: WORKSTATION-01  │ User: admin
│ Event: process_create│ IP: 192.168.1.50
└────────────────────────────────────────────────────────┘
```

### Alert Card (Expanded)
```
┌────────────────────────────────────────────────────────┐
│ [CRITICAL] Suspicious PowerShell Execution  [2024-01-26]
│ Rule ID: DET-001                                      ▼
│
│ Host: WORKSTATION-01  │ User: admin
│ Event: process_create│ IP: 192.168.1.50
├────────────────────────────────────────────────────────┤
│ FULL LOG DETAILS                                       │
│ ┌──────────────────────────────────────────────────┐  │
│ │ {                                                │  │
│ │   "timestamp": "2024-01-26T10:30:45.123Z",     │  │
│ │   "host": "WORKSTATION-01",                     │  │
│ │   "user": "admin",                              │  │
│ │   "event_type": "process_create",              │  │
│ │   "raw": { ... }                               │  │
│ │ }                                               │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ [📋 View Original Log]                                │
└────────────────────────────────────────────────────────┘
```

---

## 📋 Logs Page

### Filter Section
```
┌──────────────────────────────────────────────────────────┐
│ Filter by Severity:                                      │
│ [All (1234)]  [🔴 Critical (50)]  [🟠 High (234)]       │
│ [🟡 Medium (689)]  [🔵 Low (261)]                        │
│                                                          │
│ Filter by Source:                                       │
│ [All]  [🪟 Windows (456)]  [🐧 Linux (378)]            │
│ [🔥 Firewall (234)]  [⚡ Network (126)]                 │
│                                                          │
│ Filter by Event Type:                                   │
│ [ Select Event Type ▼ ]                                │
└──────────────────────────────────────────────────────────┘
```

### Log Card
```
┌────────────────────────────────────────────────────────┐
│ [🟡 MEDIUM] [🪟 WINDOWS] [process_create]            ▶
│
│ Host: DESKTOP-ABC     │ User: john.doe
│ IP: 192.168.1.100     │ 2024-01-26 10:15:30
└────────────────────────────────────────────────────────┘
```

---

## 🚨 Incidents Page

### Incident Filter
```
┌──────────────────────────────────────────────────────────┐
│ [All (12)]  [🔴 Open (5)]  [🟡 Investigating (4)]        │
│ [🟢 Resolved (3)]                                        │
└──────────────────────────────────────────────────────────┘
```

### Incident Card (Expanded)
```
┌────────────────────────────────────────────────────────┐
│ [CRITICAL] Privilege Escalation Detected               │
│ ID: INC-2024-001                    [OPEN]   ▼        │
│
│ Host: SERVER-01  │ User: attacker  │ Alerts: 15
│ Impact: High     │ Status: Open
├────────────────────────────────────────────────────────┤
│ INCIDENT DETAILS                                       │
│ Started: 2024-01-26 09:45:00                          │
│ Detected: 2024-01-26 10:30:45                         │
│ Timeline: 5 related alerts                            │
│                                                        │
│ 📊 ALERT TIMELINE                                      │
│ 10:30:45 - Login Failure (server-01)                 │
│ 10:31:12 - Process Creation (server-01)              │
│ 10:32:00 - Privilege Escalation (server-01)          │
│ 10:32:45 - File Access (sensitive dir)               │
│ 10:33:30 - Network Connection (suspicious IP)        │
│                                                        │
│ 💡 RECOMMENDATION                                      │
│ Isolate SERVER-01 from network immediately.          │
│ Check recent privilege escalation attempts.           │
│ Review login logs for suspicious accounts.            │
│                                                        │
│ [👁️ Investigate] [🔄 Update Status] [✓ Resolve]      │
└────────────────────────────────────────────────────────┘
```

---

## ⚙️ Rules Page

### Rules Summary
```
┌──────────────────────────────────────────────────────────┐
│ Total Rules: 18                                          │
│
│ [🔴 CRITICAL: 2] [🟠 HIGH: 6] [🟡 MEDIUM: 7] [🔵 LOW: 3]
└──────────────────────────────────────────────────────────┘
```

### Rule Card (Expanded)
```
┌────────────────────────────────────────────────────────┐
│ [HIGH] Suspicious PowerShell                          ▼
│ ID: DET-001                                            │
│ Detects encoded PowerShell commands                    │
├────────────────────────────────────────────────────────┤
│ CONDITION                                              │
│ ┌──────────────────────────────────────────────────┐  │
│ │ {                                                │  │
│ │   "source": "windows",                          │  │
│ │   "event_type": "process_create",              │  │
│ │   "process_name": "powershell.exe",            │  │
│ │   "commandline": {                             │  │
│ │     "contains": "EncodedCommand"               │  │
│ │   }                                            │  │
│ │ }                                               │  │
│ └──────────────────────────────────────────────────┘  │
│                                                        │
│ MITRE ATT&CK                                          │
│ [T1086] Powershell  [T1027] Obfuscation             │
└────────────────────────────────────────────────────────┘
```

---

## 🎨 Color Scheme

### Severity Colors
```
🔴 CRITICAL  Red (#ef4444)     - Immediate action required
🟠 HIGH      Orange (#f97316)  - Urgent investigation
🟡 MEDIUM    Yellow (#eab308)  - Should be reviewed
🔵 LOW       Blue (#3b82f6)    - Informational
```

### Status Colors
```
🔴 OPEN          Red (#991b1b)      - Active incident
🟡 INVESTIGATING Yellow (#854d0e)   - Being worked on
🟢 RESOLVED      Green (#166534)    - Closed/handled
```

### Source Colors
```
🪟 WINDOWS   Blue (#1e40af)
🐧 LINUX     Orange (#7c2d12)
🔥 FIREWALL  Red (#7f1d1d)
⚡ NETWORK   Purple (#581c87)
🟢 APP       Green (#15803d)
```

---

## ⚡ Keyboard Shortcuts (Coming Soon)

```
G + D  → Go to Dashboard
G + A  → Go to Alerts
G + L  → Go to Logs
G + I  → Go to Incidents
G + R  → Go to Rules

E      → Expand/Collapse current card
?      → Show help
```

---

## 📱 Responsive Breakpoints

```
Desktop (1024px+)   - Full layout with sidebars
Tablet (768px)      - Collapsed sidebar, stacked grids
Mobile (480px)      - Full-width, single column
```

---

## 🔄 Auto-Refresh Intervals

```
Dashboard   → 2s, 5s, 10s, 30s (configurable)
Alerts      → 10s (automatic)
Logs        → 15s (automatic)
Incidents   → 10s (automatic)
Rules       → 30s (automatic)
```

---

## 🎯 Common Tasks

### Task: Find Failed Login Attempts
1. Go to **Logs** page
2. Select "Last 24 hours"
3. Event Type: `login_failure`
4. Review results sorted by timestamp

### Task: Investigate Alert
1. Go to **Alerts** page
2. Find alert in list
3. Click to expand
4. View matched log and raw data
5. Note: host, user, IP, event details

### Task: Track Attack Chain
1. Go to **Incidents** page
2. Find incident
3. Expand to see timeline
4. Review all related alerts
5. Check recommendations

### Task: Review Detection Rules
1. Go to **Rules** page
2. Filter by severity if needed
3. Expand rule to see conditions
4. Check MITRE tags
5. Verify rule is active

---

**Last Updated**: January 2026  
**Version**: 2.0.0
