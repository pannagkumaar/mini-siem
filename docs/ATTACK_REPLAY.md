# Attack Replay Mode

`scripts/replay_attack.py` generates synthetic, normalized-schema logs for a named scenario and POSTs them to the ingestion API (`/ingest`) with realistic timing, so detection and correlation fire the same way they would against real telemetry.

**Safety:** these are synthetic *log entries describing* an attack pattern - no real exploits are executed, no network scanning happens, and nothing leaves your machine except HTTP requests to your own local Mini-SIEM API.

## Usage

```bash
python scripts/replay_attack.py --list
python scripts/replay_attack.py --scenario ssh_bruteforce
python scripts/replay_attack.py --scenario full_attack_chain
python scripts/replay_attack.py --scenario all              # every scenario, back to back
python scripts/replay_attack.py --scenario ssh_bruteforce --dry-run   # print instead of send
python scripts/replay_attack.py --scenario ssh_bruteforce --fast      # no delay between sends
python scripts/replay_attack.py --api-url http://localhost:8000       # override target
```

## Scenarios

| Scenario | Narrative | Triggers |
|---|---|---|
| `ssh_bruteforce` | 8 failed SSH logins from one IP | `RULE-AUTH-001` (threshold), `CORR-002` |
| `successful_login_after_bruteforce` | Failed logins + a successful login | `RULE-AUTH-002` (sequence -> incident) |
| `web_sql_injection` | Scanner recon + SQLi payload | `RULE-WEB-003`, `RULE-WEB-001`, `CORR-004` |
| `path_traversal_attempt` | Scanner recon + path traversal payload | `RULE-WEB-003`, `RULE-WEB-002`, `CORR-004` |
| `suspicious_powershell` | Office app spawns encoded PowerShell | `RULE-EP-001`, `RULE-EP-002`, `DET-001` |
| `admin_login_anomaly` | Admin login from a new location | `RULE-AUTH-003` |
| `privilege_escalation` | Suspicious process then privilege escalation | `CORR-003` |
| `data_exfiltration_pattern` | Credential dump -> lateral movement -> exfil | `CORR-005` |
| `full_attack_chain` | Every stage above, one coherent host/user/IP | `CORR-001/002/003/005/006`, `RULE-AUTH-002` |

## How it works

- `Clock` produces monotonically increasing synthetic timestamps so time-windowed rules (thresholds, sequences) see realistic spacing.
- `ScenarioContext` holds a shared `host`/`user`/`ip` so multi-stage scenarios (and `full_attack_chain`, which composes the individual scenario generators) produce one coherent narrative the correlation engine can chain together.
- **Stage order matters.** The correlation engine matches pattern steps strictly in sequence, so e.g. privilege escalation must be sent *before* lateral movement/exfiltration for `CORR-006` to match - see `scenario_full_attack_chain` for the canonical ordering.

## Adding a new scenario

1. Write a `scenario_<name>(ctx) -> List[dict]` function using `log_entry(...)` to build normalized logs.
2. Register it in the `SCENARIOS` dict and add a one-line description to `SCENARIO_DESCRIPTIONS`.
3. If it should trigger a new correlation pattern, add that pattern to `correlation-engine/correlator.py`'s `_default_patterns()` or as a `sequence` rule under `rules/`.
4. Verify: `python scripts/verify_demo.py`.
