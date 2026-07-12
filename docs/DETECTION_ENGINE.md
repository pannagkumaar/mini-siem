# Detection Engine

`detection-engine/engine.py` loads YAML rules from `rules/` (recursively) and `detection-engine/rules/`, and evaluates them against normalized logs.

## Rule types

### `single` (default)

Matches one log entry at a time.

```yaml
id: RULE-EP-001
name: Suspicious Encoded PowerShell Execution
severity: critical
log_source: windows
type: single
condition:
  event_type: process_create
  source: windows
  raw.process_name:
    contains: powershell
  raw.commandline:
    regex: "(?i)(-enc\\b|-encodedcommand|bypass|downloadstring)"
mitre_technique:
  - id: T1059.001
    name: Command and Scripting Interpreter - PowerShell
false_positives:
  - Legitimate admin scripts using PowerShell remoting
remediation:
  - Isolate the host and terminate the offending process
sample_log: { ... }
```

### `threshold`

Fires when N+ matching logs share a `group_by` value within `window_minutes` (Sigma-style aggregation). A short in-memory cool-down prevents re-alerting the same group every detection cycle.

```yaml
type: threshold
condition:
  event_type: login_failure
  raw.service: { contains: ssh }
threshold:
  group_by: ip
  count: 5
  window_minutes: 5
```

### `sequence`

Multi-step, ordered patterns are **not** evaluated by the detection engine - they're consumed by the correlation engine instead (see below). A rule is treated as sequence-only when it has a `sequence` block and no `condition`.

## Condition matching

`condition` supports:

- **Exact match:** `event_type: login_failure`
- **Dotted or nested field paths:** `raw.process_name: ...` or `raw: { process_name: ... }` (both are expanded to the same nested-dict match, so either style works).
- **Operators:** `contains`, `regex` (case-insensitive), `in` (list membership), `not`, `exists`, and numeric `gt`/`gte`/`lt`/`lte`.
- **Lists** (`field: [a, b]`) are treated as OR membership.

## Adding a rule

1. Pick a category directory under `rules/` (or create a new one).
2. Copy an existing rule as a template - every rule should have `id`, `name`, `description`, `severity`, `log_source`, `condition` (or `sequence`), `mitre_technique`, `false_positives`, `remediation`, `sample_log`.
3. Restart `detection-engine` (or `ingestion-api`, which also loads rules) - no code changes needed.
4. Verify it loads: `GET /rules`.
5. Trigger it: either replay a matching scenario (`scripts/replay_attack.py`) or `POST /ingest` a log matching `sample_log`.

## Known simplification

If two rules match the same `event_type`, a threshold/sequence step counting "N events of type X" may count alert *records* rather than distinct underlying log events (each rule that matches produces its own alert). This doesn't produce false results in the shipped rule pack/scenarios, but is worth knowing if you add overlapping rules on the same event type with tight thresholds.

## See also

[Correlation Engine](ARCHITECTURE.md) for how `sequence` rules and the built-in `CORR-*` patterns turn alerts into incidents.
