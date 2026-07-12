"""Incident correlation tests."""


def _alerts_for(detection_engine, logs):
    alerts = []
    for log in logs:
        alerts.extend(detection_engine.detect(log))
    alerts.extend(detection_engine.detect_thresholds(logs))
    for alert in alerts:
        # Correlation orders by alert timestamp; use the underlying log's
        # timestamp (matches how the real pipeline stores alert timestamps
        # relative to detection time - here we pin it for deterministic tests).
        alert["timestamp"] = alert["matched_log"]["timestamp"]
    return alerts


def test_full_attack_chain_produces_flagship_incident(detection_engine, correlation_engine, replay_module):
    ctx = replay_module.ScenarioContext()
    logs = replay_module.scenario_full_attack_chain(ctx)
    alerts = _alerts_for(detection_engine, logs)

    incidents = correlation_engine.build_incidents(alerts)
    pattern_ids = {i["pattern_id"] for i in incidents}

    assert "CORR-006" in pattern_ids
    assert "CORR-001" in pattern_ids
    assert "RULE-AUTH-002" in pattern_ids


def test_incident_has_required_fields(detection_engine, correlation_engine, replay_module):
    ctx = replay_module.ScenarioContext()
    logs = replay_module.scenario_full_attack_chain(ctx)
    alerts = _alerts_for(detection_engine, logs)
    incidents = correlation_engine.build_incidents(alerts)

    required_fields = [
        "incident_id", "title", "severity", "status", "related_alerts",
        "timeline", "affected_assets", "suspected_attack_chain",
        "mitre_techniques", "recommended_actions",
    ]
    for incident in incidents:
        for field in required_fields:
            assert field in incident, f"incident missing field {field}"
        assert incident["status"] == "open"
        assert incident["severity"] in {"low", "medium", "high", "critical"}


def test_incident_ids_are_deterministic(detection_engine, correlation_engine, replay_module):
    ctx = replay_module.ScenarioContext()
    logs = replay_module.scenario_full_attack_chain(ctx)
    alerts = _alerts_for(detection_engine, logs)

    incidents_a = correlation_engine.build_incidents(alerts)
    incidents_b = correlation_engine.build_incidents(alerts)

    ids_a = sorted(i["incident_id"] for i in incidents_a)
    ids_b = sorted(i["incident_id"] for i in incidents_b)
    assert ids_a == ids_b


def test_ssh_bruteforce_alone_does_not_trigger_full_chain(detection_engine, correlation_engine, replay_module):
    ctx = replay_module.ScenarioContext()
    logs = replay_module.scenario_ssh_bruteforce(ctx)
    alerts = _alerts_for(detection_engine, logs)
    incidents = correlation_engine.build_incidents(alerts)

    pattern_ids = {i["pattern_id"] for i in incidents}
    assert "CORR-006" not in pattern_ids
    assert "CORR-002" in pattern_ids  # multiple failed logins should still fire


def test_related_alert_ids_match_alert_count(detection_engine, correlation_engine, replay_module):
    ctx = replay_module.ScenarioContext()
    logs = replay_module.scenario_full_attack_chain(ctx)
    alerts = _alerts_for(detection_engine, logs)
    for i, alert in enumerate(alerts):
        alert["_id"] = f"test-{i}"
    incidents = correlation_engine.build_incidents(alerts)

    for incident in incidents:
        assert len(incident["related_alert_ids"]) == incident["alert_count"]
