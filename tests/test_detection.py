"""Detection triggering tests: rules must fire on matching logs and stay
silent on benign look-alikes."""


def test_powershell_rule_fires_on_encoded_command(detection_engine):
    log = {
        "timestamp": "2026-07-12T12:00:00Z", "source": "windows", "host": "workstation-01",
        "user": "alice.smith", "ip": "10.0.1.100", "event_type": "process_create", "severity": "critical",
        "raw": {
            "process_name": "powershell.exe",
            "commandline": "powershell.exe -nop -w hidden -EncodedCommand SQBuAHYAbwBrAGUA",
            "parent_process": "cmd.exe",
        },
    }
    alerts = detection_engine.detect(log)
    assert any(a["rule_id"] == "RULE-EP-001" for a in alerts)


def test_powershell_rule_does_not_fire_on_benign_command(detection_engine):
    """Regression test: the nested-condition matcher used to silently ignore
    raw.commandline/raw.process_name checks, matching on process_create alone."""
    log = {
        "timestamp": "2026-07-12T12:00:00Z", "source": "windows", "host": "workstation-01",
        "user": "alice.smith", "ip": "10.0.1.100", "event_type": "process_create", "severity": "low",
        "raw": {"process_name": "powershell.exe", "commandline": "powershell.exe Get-Process", "parent_process": "explorer.exe"},
    }
    alerts = detection_engine.detect(log)
    assert not any(a["rule_id"] == "RULE-EP-001" for a in alerts)
    assert not any(a["rule_id"] == "DET-001" for a in alerts)


def test_sql_injection_rule_fires(detection_engine):
    log = {
        "timestamp": "2026-07-12T11:22:10Z", "source": "app", "host": "web-server-01",
        "user": "anonymous", "ip": "198.51.100.77", "event_type": "web_request", "severity": "high",
        "raw": {"method": "GET", "uri": "/products?id=1' OR 1=1--", "status": 500, "user_agent": "Mozilla/5.0"},
    }
    alerts = detection_engine.detect(log)
    assert any(a["rule_id"] == "RULE-WEB-001" for a in alerts)


def test_ssh_bruteforce_threshold_fires_at_count(detection_engine):
    logs = [
        {
            "timestamp": f"2026-07-12T10:0{i}:00Z", "source": "linux", "host": "web-server-01",
            "user": "root", "ip": "203.0.113.45", "event_type": "login_failure", "severity": "high",
            "raw": {"service": "ssh", "message": "Failed password for root"},
        }
        for i in range(6)
    ]
    alerts = detection_engine.detect_thresholds(logs)
    threshold_alert = next(a for a in alerts if a["rule_id"] == "RULE-AUTH-001")
    assert threshold_alert["threshold_context"]["matched_count"] == 6


def test_ssh_bruteforce_threshold_silent_below_count(detection_engine):
    logs = [
        {
            "timestamp": f"2026-07-12T10:0{i}:00Z", "source": "linux", "host": "web-server-01",
            "user": "root", "ip": "203.0.113.45", "event_type": "login_failure", "severity": "high",
            "raw": {"service": "ssh", "message": "Failed password for root"},
        }
        for i in range(3)
    ]
    alerts = detection_engine.detect_thresholds(logs)
    assert not any(a["rule_id"] == "RULE-AUTH-001" for a in alerts)


def test_threshold_cooldown_prevents_duplicate_alerts(detection_engine):
    logs = [
        {
            "timestamp": f"2026-07-12T10:0{i}:00Z", "source": "linux", "host": "web-server-01",
            "user": "root", "ip": "203.0.113.45", "event_type": "login_failure", "severity": "high",
            "raw": {"service": "ssh", "message": "Failed password for root"},
        }
        for i in range(6)
    ]
    first = detection_engine.detect_thresholds(logs)
    second = detection_engine.detect_thresholds(logs)
    assert any(a["rule_id"] == "RULE-AUTH-001" for a in first)
    assert not any(a["rule_id"] == "RULE-AUTH-001" for a in second)


def test_full_attack_chain_scenario_generates_alerts_for_every_stage(detection_engine, replay_module):
    ctx = replay_module.ScenarioContext()
    logs = replay_module.scenario_full_attack_chain(ctx)

    alerts = []
    for log in logs:
        alerts.extend(detection_engine.detect(log))
    alerts.extend(detection_engine.detect_thresholds(logs))

    rule_ids = {a["rule_id"] for a in alerts}
    assert "RULE-AUTH-001" in rule_ids   # ssh brute force
    assert "DET-010" in rule_ids         # successful login observed
    assert "RULE-EP-001" in rule_ids     # encoded powershell
    assert "RULE-EP-003" in rule_ids     # credential dumping
    assert "DET-016" in rule_ids         # lateral movement
    assert "DET-014" in rule_ids         # data exfiltration
