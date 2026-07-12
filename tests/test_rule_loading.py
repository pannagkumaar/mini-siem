"""Rule loading tests: the detection engine should load every rule in the
pack + legacy rules, with no duplicate IDs and all required fields present."""


def test_loads_both_rule_directories(detection_engine):
    assert len(detection_engine.rules) >= 28  # 11 new rule pack + 18 legacy (minus 1 sequence-only)


def test_new_rule_pack_ids_present(detection_engine):
    ids = {r.id for r in detection_engine.rules}
    expected = {
        "RULE-AUTH-001", "RULE-AUTH-003",
        "RULE-WEB-001", "RULE-WEB-002", "RULE-WEB-003",
        "RULE-EP-001", "RULE-EP-002", "RULE-EP-003",
        "RULE-CLOUD-001", "RULE-CLOUD-002",
    }
    assert expected.issubset(ids)


def test_sequence_rule_deferred_to_correlation(detection_engine):
    seq_ids = {r.id for r in detection_engine.sequence_rules}
    assert "RULE-AUTH-002" in seq_ids
    # It must NOT also be loaded as a single/threshold detection rule.
    assert "RULE-AUTH-002" not in {r.id for r in detection_engine.rules}


def test_no_duplicate_rule_ids(detection_engine):
    ids = [r.id for r in detection_engine.rules]
    assert len(ids) == len(set(ids))


def test_every_rule_has_required_fields(detection_engine):
    for rule in detection_engine.rules:
        assert rule.id and rule.id != "UNKNOWN"
        assert rule.name
        assert rule.severity in {"low", "medium", "high", "critical"}
        assert rule.condition, f"{rule.id} has an empty condition"


def test_threshold_rules_have_group_by_and_count(detection_engine):
    threshold_rules = [r for r in detection_engine.rules if r.threshold]
    assert threshold_rules, "expected at least one threshold rule to be loaded"
    for rule in threshold_rules:
        assert "group_by" in rule.threshold
        assert "count" in rule.threshold


def test_rule_pack_files_have_mitre_and_remediation(engine_module):
    from pathlib import Path
    import yaml

    repo_root = Path(__file__).resolve().parent.parent
    rule_files = sorted((repo_root / "rules").rglob("*.yml"))
    assert len(rule_files) == 11

    for rule_file in rule_files:
        data = yaml.safe_load(rule_file.read_text())
        assert data.get("id"), rule_file
        assert data.get("mitre_technique"), f"{rule_file} missing mitre_technique"
        assert data.get("remediation"), f"{rule_file} missing remediation"
        assert data.get("false_positives"), f"{rule_file} missing false_positives"
        assert data.get("sample_log"), f"{rule_file} missing sample_log"
        assert "condition" in data or "sequence" in data
