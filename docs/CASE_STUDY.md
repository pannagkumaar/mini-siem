# Case Study: Full Attack Chain, Start to Finish

This walks through one real run of the flagship scenario, showing exactly what each layer produced. Reproduce it yourself with:

```bash
docker-compose up --build -d
python scripts/init-db.py
python scripts/replay_attack.py --scenario full_attack_chain
# wait ~30s for detection + correlation
python scripts/generate_incident_report.py --incident latest
```

(Everything below is also reproducible offline, with no Docker at all, via `python scripts/generate_incident_report.py --offline` - that's how this case study was generated.)

## 1. Raw synthetic logs

`replay_attack.py --scenario full_attack_chain` sends 14 normalized log events on one host/user/IP (`corp-web-01` / `root` / `203.0.113.77`): 8 failed SSH logins, a successful login, an encoded PowerShell execution, a credential dump, a privilege escalation, a lateral movement, and a data exfiltration - in that order.

## 2. Detection alerts

The detection engine evaluates every log against the rule pack. This run produced **28 alerts**, including:

- `RULE-AUTH-001` (threshold: 8/5 failed SSH logins from one IP within 5 minutes)
- `DET-010` "Successful Login Observed"
- `RULE-EP-001` "Suspicious Encoded PowerShell Execution"
- `RULE-EP-003` "Credential Dumping Tool Detected"
- `DET-003` / `DET-005` "Privilege Escalation Detected"
- `DET-016` "Lateral Movement Detected"
- `DET-014` "Data Exfiltration Detected"

(Several legacy `DET-*` rules also match the same events as the new `RULE-*` pack - that overlap is intentional: independent weak signals corroborating each other is exactly how real detection stacks build confidence.)

## 3. Correlated incident

The correlation engine grouped the alerts above (by host) into **6 incidents**, including the flagship:

```
CORR-006 - Full Attack Chain: Initial Access to Exfiltration
Severity: CRITICAL | 10 related alerts
Suspected attack chain:
  Multiple Failed Login Attempts -> Credential Access Attempt ->
  Successful Login Observed -> Suspicious Encoded PowerShell Execution ->
  Credential Dumping Tool Detected -> Privilege Escalation Detected ->
  Data Exfiltration Detected
MITRE ATT&CK: T1110, T1078, T1059, T1003, T1068, T1041, ...
```

Also fired in the same run: `CORR-001` (brute force to account compromise), `CORR-002` (multiple failed logins), `CORR-003` (suspicious process + privilege escalation), `CORR-005` (credential theft to exfiltration), and `RULE-AUTH-002` (successful login after repeated failures) - each a valid, independently useful incident at a different granularity.

## 4. AI root cause analysis (template mode, no API key)

```
Threat Summary:
[CRITICAL] A full end-to-end intrusion was detected on corp-web-01: initial
access via brute force, credential dumping, privilege escalation, and data
exfiltration.

Root Cause Analysis:
The attacker progressed through the full attack lifecycle - initial access,
execution, credential access, privilege escalation, and exfiltration -
without being stopped at any earlier stage.

Immediate Containment:
- Isolate/contain corp-web-01 from the network pending investigation.
- Isolate the host, rotate all credentials, and hunt for lateral movement

Remediation:
- Activate the incident response plan - this is a confirmed full compromise
- Preserve forensic evidence (memory, disk, logs) before remediation
- Enable PowerShell Script Block Logging and Constrained Language Mode
...
```

## 5. Exported report

`generate_incident_report.py` writes `outputs/sample_incident_report.md` (full write-up with a timeline and a related-alerts table) and `outputs/sample_ai_rca_report.md` (the RCA above, fully expanded) - both ready to paste into a ticketing system.

## What this demonstrates

- **Detection → Correlation → RCA → Report is a real, working pipeline**, not a mockup - every artifact above comes from actually running the code, not from illustrative text.
- **Zero paid API dependency.** The RCA above required no `GROQ_API_KEY`.
- **Idempotent incidents.** Re-running correlation over the same alerts does not create duplicate incidents (deterministic `incident_id`).
