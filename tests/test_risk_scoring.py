"""Incident risk scoring tests (correlation-engine/risk.py)."""


def test_lone_medium_alert_scores_medium_band(risk_module):
    context = {"severity": "medium", "users": [], "mitre_techniques": []}
    alerts = [{"rule_id": "RULE-AUTH-003"}]

    result = risk_module.compute_risk(context, alerts)

    assert result["risk_band"] == "medium"
    assert result["risk_score"] == 45
    assert result["risk_factors"] == [{"label": "base severity (medium)", "points": 45}]


def test_full_chain_with_admin_and_exfil_scores_critical(risk_module):
    context = {
        "severity": "critical",
        "users": ["Administrator"],
        "mitre_techniques": ["T1110", "T1078", "T1059", "T1003", "T1068", "T1041"],
    }
    alerts = [
        {"rule_id": "RULE-AUTH-001"},
        {"rule_id": "RULE-AUTH-002"},
        {"rule_id": "RULE-EP-001"},
        {"rule_id": "DET-017"},
        {"rule_id": "DET-005"},
        {"rule_id": "DET-014"},
    ]

    result = risk_module.compute_risk(context, alerts)

    assert result["risk_band"] == "critical"
    assert result["risk_score"] >= 90


def test_score_clamps_at_100(risk_module):
    context = {
        "severity": "critical",
        "users": ["root"],
        "mitre_techniques": ["T1041", "T1003"],
    }
    # Ten distinct rule ids - chain bonus alone would exceed the 25pt cap.
    alerts = [{"rule_id": f"RULE-{i}"} for i in range(10)]

    result = risk_module.compute_risk(context, alerts)

    assert result["risk_score"] == 100
    assert result["risk_band"] == "critical"


def test_single_stage_has_no_chain_bonus(risk_module):
    context = {"severity": "low", "users": [], "mitre_techniques": []}
    alerts = [{"rule_id": "RULE-WEB-003"}, {"rule_id": "RULE-WEB-003"}]  # same rule twice

    result = risk_module.compute_risk(context, alerts)

    labels = [f["label"] for f in result["risk_factors"]]
    assert not any("attack-chain" in label for label in labels)
    assert result["risk_score"] == 25
    assert result["risk_band"] == "low"


def test_unknown_severity_falls_back_to_medium_base(risk_module):
    context = {"severity": "unknown-severity", "users": [], "mitre_techniques": []}
    result = risk_module.compute_risk(context, [{"rule_id": "X"}])
    assert result["risk_score"] == 45
