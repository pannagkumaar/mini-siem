# Roadmap

## Near-term

- **Sigma rule importer** - convert upstream Sigma rules into the `rules/` schema automatically.
- **Risk scoring** - a rolling per-host/per-user risk score derived from alert/incident history, surfaced on the dashboard.
- **SOAR-style response actions** - opt-in, clearly-labeled automated containment actions (block IP at a mock firewall, disable a mock account) triggered from an incident, for teaching automated response workflows. Local/simulated targets only.
- **Sequence rule authoring UI** - build multi-step correlation patterns from the Rules page instead of hand-editing YAML.

## Medium-term

- **ML-based anomaly detection** - a baseline model (e.g. isolation forest over login/process frequency features) as an additional detection signal alongside rule-based detection.
- **Multi-tenant support** - namespace logs/alerts/incidents per organization/team.
- **Alert triage feedback loop** - let analysts mark alerts as true/false positive and feed that back into rule tuning suggestions.
- **Expanded cloud coverage** - Azure/GCP log sources and rules (currently AWS-flavored).

## Already shipped (v1.0.0)

Attack replay mode, categorized + threshold + sequence detection rules, correlation-engine incident chaining, AI SOC Agent with LLM + template RCA modes, incident report export, one-command demo. See [RELEASE_NOTES.md](../RELEASE_NOTES.md).

## Contributing

Issues and PRs welcome - see [docs/DETECTION_ENGINE.md](DETECTION_ENGINE.md) and [docs/ATTACK_REPLAY.md](ATTACK_REPLAY.md) for how to add a new rule or scenario.
