# Release Notes

## v1.0.0 - AI SOC Investigation Lab

Mini-SIEM is now positioned as an **AI-assisted SOC investigation lab**: raw logs in, detections, correlated incidents, AI root cause analysis, MITRE ATT&CK mapping, and exportable remediation reports out - all runnable with a single command and zero paid API dependency.

### Added

- **Attack Replay Mode** (`scripts/replay_attack.py`) - 9 synthetic attack scenarios (`ssh_bruteforce` through `full_attack_chain`), each generating realistic, schema-valid, entirely synthetic log sequences designed to trigger specific detection rules and correlation patterns.
- **Categorized Detection Rule Pack** (`rules/auth`, `rules/web`, `rules/endpoint`, `rules/cloud`) - 11 fully-documented rules (MITRE technique, false positives, remediation, sample log), loaded alongside the existing legacy `detection-engine/rules/` pack.
- **Threshold/aggregation rules** - Sigma-style "N events per entity per time window" detection (e.g. SSH brute force), with in-memory cool-down to avoid alert flooding.
- **Sequence rules** - multi-step rules (e.g. `successful_login_after_bruteforce`) authored as YAML and consumed directly by the correlation engine.
- **Correlated Incident Engine** - the correlation engine now matches ordered, time-windowed attack-chain patterns (not just co-occurrence) and produces incidents with `incident_id`, `title`, `severity`, `status`, `related_alerts`, `timeline`, `affected_assets`, `suspected_attack_chain`, `mitre_techniques`, and `recommended_actions`. Incident IDs are deterministic, so overlapping correlation runs upsert instead of duplicating.
- **AI SOC Agent RCA** (`POST /ai/rca/{incident_id}`) - structured root cause analysis (threat summary, root cause, evidence, MITRE mapping, immediate containment, investigation steps, remediation, false-positive considerations, prevention measures), in **LLM mode** (Groq Llama 3.3 70B) when `GROQ_API_KEY` is set, or a fully-functional **template mode** when it isn't.
- **Report Generator** (`scripts/generate_incident_report.py`) - exports `sample_alerts.json`, `sample_incident_report.md`, `sample_ai_rca_report.md`, `sample_incident_timeline.json`; works against a live stack or fully offline.
- **Demo Mode** (`demo.sh`, `demo.bat`, `DEMO.md`) - one command to start the stack, seed indices, replay the full attack chain, and export a sample report; a 90-second guided walkthrough.
- **Frontend** - the Incidents page now shows the suspected attack chain, MITRE ATT&CK badges, a chronological timeline, a recommended-actions checklist, and a "Generate AI RCA" panel.
- **Documentation** - `docs/ARCHITECTURE.md`, `docs/DETECTION_ENGINE.md`, `docs/AI_SOC_AGENT.md`, `docs/ATTACK_REPLAY.md`, `docs/INCIDENT_REPORTING.md`, `docs/ROADMAP.md`, `docs/CASE_STUDY.md`.
- **Tests** - `tests/` covers rule loading, replay log schema validity, detection triggering, incident correlation, RCA fallback, and report generation. `scripts/verify_demo.py` sanity-checks the entire demo story without requiring Docker.

### Fixed

- The detection engine's condition matcher silently ignored nested conditions like `raw: {process_name: {contains: ...}}`, so several legacy rules (e.g. `DET-001` PowerShell detection) never actually checked their intended fields. Nested/dotted conditions now match correctly.
- `login_success` events never produced an alert (the legacy rule required `severity: low`, which real "notable" logins don't have), silently breaking every correlation pattern that depended on a login-success step. Fixed.
- The detection loop re-processed and re-alerted on the same logs every cycle when the lookback window overlapped the polling interval; it now tracks a cursor and only processes new logs.
- The correlation engine created a new, unbounded incident document on every polling cycle for the same ongoing pattern; incidents are now upserted by a deterministic ID.
- `docker-compose.yml` referenced a non-existent `ai-agent/Dockerfile` service; removed (the AI agent runs inside `ingestion-api`).
- The frontend called incident lifecycle endpoints (`/investigate`, `/resolve`, `/status`) with the wrong HTTP method and body shape; fixed to match the API (and the API's incident lookup now works correctly against the deterministic incident IDs above).

### Acceptance criteria

- [x] Runs the full demo without a paid API key
- [x] A synthetic attack generates alerts
- [x] Related alerts become an incident
- [x] AI/template RCA is generated
- [x] Markdown/JSON reports are exported
- [x] README shows the full value within 10 seconds
- [x] Existing Docker Compose workflow still works
