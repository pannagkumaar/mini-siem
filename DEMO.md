# 90-Second Demo Script

This is the guided walkthrough for showing Mini-SIEM end-to-end: raw logs →
detections → a correlated incident → AI root cause analysis → an exported
report. No paid API key required.

## Before you start

```bash
git clone <this repo>
cd mini-siem
cp .env.example .env   # optional: add an LLM provider key for LLM-mode RCA
```

## The 90 seconds

**1. Start Mini-SIEM (0:00 - 0:20)**

```bash
./demo.sh        # Linux/macOS/WSL/Git Bash
demo.bat         # Windows cmd
```

This checks Docker, builds and starts every service, waits for the API to
be healthy, and initializes the OpenSearch indices.

**2. Replay the full attack chain (0:20 - 0:30)**

`demo.sh`/`demo.bat` already do this for you, but to run it again on demand:

```bash
python scripts/replay_attack.py --scenario full_attack_chain
```

This sends ~14 synthetic log events into the ingestion API describing one
coherent intrusion: SSH brute force → account takeover → encoded PowerShell
execution → credential dumping → privilege escalation → lateral movement →
data exfiltration.

**3. Open the dashboard (0:30 - 0:40)**

Open **http://localhost:3000**. The overview shows live counts of logs,
alerts, and incidents ticking up.

**4. View a generated alert (0:40 - 0:55)**

Click **Alerts**. You'll see individual rule matches (e.g. `RULE-AUTH-001
SSH Brute Force Attempt`, `RULE-EP-001 Suspicious Encoded PowerShell
Execution`) each tagged with severity and MITRE ATT&CK technique IDs.

**5. Open the incident (0:55 - 1:10)**

Click **Incidents**. The correlation engine has grouped the individual
alerts above into a single incident - e.g. `CORR-006: Full Attack Chain:
Initial Access to Exfiltration` - with a timeline, affected hosts/users,
a suspected attack chain string, and a risk score badge (0-100, hover for
the factor breakdown - see [docs/RISK_SCORING.md](docs/RISK_SCORING.md)).

**6. Generate the AI RCA (1:10 - 1:20)**

Expand the incident and click **Generate AI RCA**. If a provider key
(`GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`)
is set in `.env`, this calls that LLM for a natural-language root cause
analysis. If not, you instantly get a deterministic template RCA - still a
full threat summary, root cause, evidence, MITRE mapping,
containment/investigation/remediation steps, and false-positive notes.

**7. Export the incident report (1:20 - 1:30)**

```bash
python scripts/generate_incident_report.py --incident latest
```

Produces:
- `outputs/sample_incident_report.md` - the incident write-up
- `outputs/sample_ai_rca_report.md` - the RCA, ready to paste into a ticket
- `outputs/sample_alerts.json` / `outputs/sample_incident_timeline.json` -
  raw data for further tooling

That's the full loop: **raw logs → normalized events → detection alerts →
correlated incident → AI root cause analysis → MITRE mapping → remediation
checklist → exported report.**

## Try the other scenarios

```bash
python scripts/replay_attack.py --list
python scripts/replay_attack.py --scenario ssh_bruteforce
python scripts/replay_attack.py --scenario web_sql_injection
python scripts/replay_attack.py --scenario data_exfiltration_pattern
```

See [docs/ATTACK_REPLAY.md](docs/ATTACK_REPLAY.md) for the full scenario
list and which rules/incidents each one is designed to trigger.

## Beyond the 90 seconds

- **Respond to an incident** - expand it and use the Response Actions panel
  (`block_ip` / `disable_user` / `isolate_host`). This is simulated only -
  it records the action and never touches a real system.
- **Metrics** - `curl http://localhost:8000/metrics` for Prometheus-format
  ingestion/detection/incident counters.
