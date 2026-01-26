# 🎨 Visual Guide - Advanced Search Feature

## The Search Page (New!)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Mini SIEM - 🔍 Advanced Search               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Query Syntax Help ▼                                            │
│                                                                  │
│  Query: [severity:high AND event_type:login_failure    ] 💾     │
│                                                                  │
│  ┌─ Auto-complete suggestions ─────────────────────────────┐    │
│  │ severity:high AND event_type:login_failure AND ...     │    │
│  │ severity:critical                                       │    │
│  │ severity:high                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Time Range: [Last 24 hours ▼]  Limit: [50 ▼]  [Search]       │
│                                                                  │
│  📌 Saved Searches: [Failed Logins] [Privilege Escalation]     │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Results: 47 | Page 1 of 2 | Took 45ms                  │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │ [HIGH] [WINDOWS] login_failure                  ▼       │   │
│  │ Host: prod-dc01 | User: admin | IP: 10.0.0.50         │   │
│  │ 2024-01-26 14:32:15                                    │   │
│  │                                                          │   │
│  │ ┌─ Details ──────────────────────────────────────────┐ │   │
│  │ │ timestamp: 2024-01-26T14:32:15Z                    │ │   │
│  │ │ host: prod-dc01                                    │ │   │
│  │ │ user: admin                                        │ │   │
│  │ │ event_type: login_failure                          │ │   │
│  │ │ severity: high                                     │ │   │
│  │ │ source: windows                                    │ │   │
│  │ │ raw: { ... }                                       │ │   │
│  │ └────────────────────────────────────────────────────┘ │   │
│  │                                                          │   │
│  │ [CRITICAL] [NETWORK] network_connection        ▼       │   │
│  │ Host: prod-web-01 | User: system | IP: 10.0.1.50     │   │
│  │ 2024-01-26 14:31:45                                    │   │
│  │                                                          │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ [← Previous] Page 1 of 2 [Next →]                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Query Syntax Reference

### Color Coding in Help
```
field:value              <- Green (field search)
AND                      <- Blue (operator)
OR                       <- Blue (operator)
(grouping)               <- Purple (structure)
*wildcard                <- Orange (pattern)
>100                     <- Red (comparison)
1h ago                   <- Yellow (time)
```

### Example Query Progression
```
1. Simple:
   severity:high

2. With AND:
   severity:high AND event_type:login_failure

3. With wildcards:
   severity:high AND host:prod-*

4. With grouping:
   (event_type:privilege_escalation OR process_create) AND host:prod-*

5. Complex:
   ((event_type:privilege_escalation OR process_create) AND user:*admin*) 
   AND severity:critical 
   AND timestamp:1h ago
```

---

## Color Scheme in Results

### Severity Badges
```
┌────────────┐
│ CRITICAL   │ Red background (#DC2626)
│ HIGH       │ Orange background (#EA580C)
│ MEDIUM     │ Yellow background (#EAB308)
│ LOW        │ Blue background (#2563EB)
│ INFO       │ Gray background (#4B5563)
└────────────┘
```

### Source Badges
```
┌─────────────────┐
│ WINDOWS         │ Blue background
│ LINUX           │ Orange background
│ FIREWALL        │ Red background
│ NETWORK         │ Purple background
│ APP             │ Green background
│ CUSTOM          │ Gray background
└─────────────────┘
```

---

## Workflow: Threat Hunting

```
Step 1: Identify Threat Category
   ↓
   Suspicious PowerShell execution

Step 2: Build Query
   ↓
   commandline:*powershell* AND severity:high

Step 3: Execute Search
   ↓
   Click "Search" button

Step 4: Review Results
   ↓
   See 3 matching events

Step 5: Expand Details
   ↓
   Click on result to see full log

Step 6: Save Query
   ↓
   Click 💾, name it "Suspicious PowerShell"
   
Step 7: Reuse Later
   ↓
   Click saved search button to run again
```

---

## Navigation Menu

```
┌─ Navigation ─────────┐
│                      │
│ 📊 Dashboard        │ Overview & metrics
│ 🚨 Incidents        │ Security incidents
│ 🔔 Alerts           │ Detection alerts
│ 🔍 Search ← NEW!    │ Advanced search
│ 📋 Logs             │ Raw logs
│ ⚙️  Rules            │ Detection rules
│                      │
└──────────────────────┘
```

---

## Saved Search Modal

```
┌────────────────────────────────────────┐
│         Save Search                    │
├────────────────────────────────────────┤
│                                        │
│  Search Name:                          │
│  [Failed Logins High Severity          │
│  __________________________________]   │
│                                        │
│  Description (optional):               │
│  [Find login failures with high        │
│   severity for incident investigation  │
│                                        │
│   __________________________________   │
│   __________________________________ ] │
│                                        │
│  [Cancel]              [Save Search]   │
│                                        │
└────────────────────────────────────────┘
```

---

## Auto-Complete Suggestions

As you type, you'll see:

```
When typing "sev"
  ├─ severity:high
  ├─ severity:critical
  ├─ severity:medium
  └─ severity:low

When typing "event_type:"
  ├─ event_type:login_failure
  ├─ event_type:privilege_escalation
  ├─ event_type:process_create
  └─ event_type:network_connection

When typing "AND"
  ├─ AND query examples
  └─ Boolean operators help
```

---

## Loading States

```
Normal:
  [🔍 Advanced Search] → Active, clickable

Searching:
  [🔍 Advanced Search] → Slightly faded, "Searching..." text
  Query Input → Disabled while loading
  [Search] → Shows "Searching..." text

Results:
  [🔍 Advanced Search] → Active again
  Results display → Visible
  [Search] → Ready for new query
```

---

## Error Messages

```
Red banner at top:
┌─────────────────────────────────────────┐
│ ⚠️  Invalid query: "severity::high"     │
│ Did you mean: severity:high             │
└─────────────────────────────────────────┘

Or:

┌─────────────────────────────────────────┐
│ ❌ API Error: OpenSearch not available  │
│ Check that services are running         │
└─────────────────────────────────────────┘

Or:

┌─────────────────────────────────────────┐
│ ✅ Search saved as "My Query"           │
│ Dismisses after 5 seconds              │
└─────────────────────────────────────────┘
```

---

## Responsive Design

### Desktop (Wide Screen)
```
┌────────────────────────────────────────────────┐
│  Query Input (full width)                      │
│  [Time] [Limit] [Search] [Save]               │
│  Results (2 columns of info)                   │
└────────────────────────────────────────────────┘
```

### Tablet (Medium)
```
┌──────────────────────────────┐
│  Query Input (full width)    │
│  [Time] [Limit]              │
│  [Search] [Save]             │
│  Results (1 column)          │
└──────────────────────────────┘
```

### Mobile (Narrow)
```
┌──────────────────┐
│ Query Input      │
│ [Time ▼]         │
│ [Limit ▼]        │
│ [Search]         │
│ [💾]             │
│ Results (stacked)│
└──────────────────┘
```

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Execute search |
| Tab | Next suggestion |
| Shift+Tab | Previous suggestion |
| Escape | Clear suggestions |
| Ctrl+S | Focus save button |

---

## Query Builder Visual

```
Question: Find admin login failures in last hour

1. What event? 
   └─ event_type:login_failure

2. From whom?
   └─ user:*admin*

3. When?
   └─ timestamp:1h ago

4. Combined:
   └─ event_type:login_failure AND user:*admin* AND timestamp:1h ago

Result:
[event_type:login_failure AND user:*admin* AND timestamp:1h ago]
```

---

## Performance Visualization

```
Query Complexity vs Response Time

Simple Query:          |█ ~50ms
  severity:high

Moderate:            |████ ~150ms
  severity:high AND host:prod-*

Complex:          |████████ ~300ms
  (sev:critical OR (host:prod AND event_type:priv_esc)) AND timestamp:1h ago

Very Complex:    |██████████ ~500ms
  ((A AND B) OR (C AND D)) AND ((E OR F) AND (G AND H)) AND time:24h ago
```

---

This visual guide should help users understand the search interface! 🎨
