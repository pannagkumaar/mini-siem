"""Attack replay log format tests: every scenario must produce logs that
pass schema validation and are non-destructive (no real targets/payloads)."""
import pytest


@pytest.fixture
def scenario_names(replay_module):
    return list(replay_module.SCENARIOS.keys())


def test_all_scenarios_registered_with_descriptions(replay_module):
    for name in replay_module.SCENARIOS:
        assert name in replay_module.SCENARIO_DESCRIPTIONS


def test_expected_scenarios_exist(replay_module):
    expected = {
        "ssh_bruteforce", "successful_login_after_bruteforce", "web_sql_injection",
        "path_traversal_attempt", "suspicious_powershell", "admin_login_anomaly",
        "privilege_escalation", "data_exfiltration_pattern", "full_attack_chain",
    }
    assert expected == set(replay_module.SCENARIOS.keys())


@pytest.mark.parametrize("scenario_name", [
    "ssh_bruteforce", "successful_login_after_bruteforce", "web_sql_injection",
    "path_traversal_attempt", "suspicious_powershell", "admin_login_anomaly",
    "privilege_escalation", "data_exfiltration_pattern", "full_attack_chain",
])
def test_scenario_logs_pass_schema_validation(replay_module, normalizer_module, scenario_name):
    ctx = replay_module.ScenarioContext()
    logs = replay_module.SCENARIOS[scenario_name](ctx)
    assert len(logs) > 0

    for log in logs:
        is_valid, error = normalizer_module.validate_normalized_log(log)
        assert is_valid, f"{scenario_name} produced an invalid log: {error}"


def test_scenario_logs_are_chronologically_ordered(replay_module):
    ctx = replay_module.ScenarioContext()
    logs = replay_module.scenario_full_attack_chain(ctx)
    timestamps = [log["timestamp"] for log in logs]
    assert timestamps == sorted(timestamps)


def test_full_attack_chain_stage_order_matches_corr006():
    """Privilege escalation must land before lateral movement/exfiltration -
    a regression test for a real ordering bug found during development."""
    import importlib.util
    from pathlib import Path

    repo_root = Path(__file__).resolve().parent.parent
    spec = importlib.util.spec_from_file_location(
        "replay_order_check", repo_root / "scripts" / "replay_attack.py"
    )
    replay = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(replay)

    ctx = replay.ScenarioContext()
    logs = replay.scenario_full_attack_chain(ctx)
    event_types = [log["event_type"] for log in logs]

    priv_esc_idx = event_types.index("privilege_escalation")
    exfil_idx = event_types.index("data_exfiltration")
    lateral_idx = event_types.index("lateral_movement")

    assert priv_esc_idx < exfil_idx
    assert priv_esc_idx < lateral_idx


def test_no_real_network_calls_in_scenario_logs(replay_module):
    """Sanity check that scenario data stays synthetic/local - no live hostnames
    or IPs outside documentation ranges (RFC 5737 TEST-NET / RFC1918 private)."""
    ctx = replay_module.ScenarioContext()
    for scenario_fn in replay_module.SCENARIOS.values():
        for log in scenario_fn(replay_module.ScenarioContext()):
            ip = log["ip"]
            assert (
                ip.startswith("10.")
                or ip.startswith("198.51.100.")
                or ip.startswith("203.0.113.")
                or ip.startswith("192.0.2.")
            ), f"unexpected non-synthetic IP in scenario data: {ip}"
