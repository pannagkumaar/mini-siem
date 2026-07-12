#!/usr/bin/env python3
"""
Verify Demo - sanity-checks the whole "AI SOC Investigation Lab" story
without requiring Docker, OpenSearch, or a live API.

Checks:
  1. Required files exist (demo scripts, docs, rule pack, assets, etc.)
  2. Detection rules load correctly (rule pack + legacy rules)
  3. Sample attack logs can be generated for every scenario
  4. Detection + correlation actually fire on the full attack chain
  5. Incident reports (+ AI RCA) can be generated offline
  6. Demo commands (demo.sh / demo.bat) reference real, existing scripts

Usage:
    python scripts/verify_demo.py
"""
import importlib.util
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

GREEN = '\033[92m'
RED = '\033[91m'
CYAN = '\033[36m'
YELLOW = '\033[93m'
RESET = '\033[0m'

results = []  # (name, ok, detail)


def check(name):
    def decorator(fn):
        def wrapper():
            try:
                detail = fn()
                results.append((name, True, detail or ""))
            except AssertionError as e:
                results.append((name, False, str(e)))
            except Exception as e:
                results.append((name, False, f"unexpected error: {e}"))
        return wrapper
    return decorator


def _load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class _NoOpenSearch:
    pass


REQUIRED_FILES = [
    "README.md", "DEMO.md", "demo.sh", "demo.bat", "docker-compose.yml",
    "RELEASE_NOTES.md",
    "scripts/replay_attack.py", "scripts/generate_incident_report.py",
    "scripts/init-db.py",
    "detection-engine/engine.py", "correlation-engine/correlator.py",
    "ingestion/api-python/ai_agent/agent.py", "parser/normalizer.py",
    "docs/ARCHITECTURE.md", "docs/DETECTION_ENGINE.md", "docs/AI_SOC_AGENT.md",
    "docs/ATTACK_REPLAY.md", "docs/INCIDENT_REPORTING.md",
    "docs/CASE_STUDY.md", "docs/RISK_SCORING.md",
    "assets/dashboard.png", "assets/alerts.png", "assets/incident-view.png",
    "assets/ai-rca.png", "assets/advanced-search.png", "assets/demo.gif",
]

RULE_PACK_FILES = [
    "rules/auth/ssh_bruteforce.yml",
    "rules/auth/successful_login_after_failures.yml",
    "rules/auth/admin_login_anomaly.yml",
    "rules/web/sql_injection_attempt.yml",
    "rules/web/path_traversal_attempt.yml",
    "rules/web/suspicious_user_agent.yml",
    "rules/endpoint/powershell_encoded_command.yml",
    "rules/endpoint/suspicious_process_chain.yml",
    "rules/endpoint/credential_dumping_pattern.yml",
    "rules/cloud/public_s3_access.yml",
    "rules/cloud/suspicious_iam_activity.yml",
]


@check("Required project files exist")
def check_required_files():
    missing = [f for f in REQUIRED_FILES + RULE_PACK_FILES if not (REPO_ROOT / f).exists()]
    assert not missing, f"missing: {', '.join(missing)}"
    return f"{len(REQUIRED_FILES) + len(RULE_PACK_FILES)} files present"


@check("Detection rules load correctly")
def check_rules_load():
    engine_mod = _load_module("verify_engine", REPO_ROOT / "detection-engine" / "engine.py")
    engine = engine_mod.DetectionEngine(_NoOpenSearch())
    assert len(engine.rules) >= 28, f"expected >=28 rules, got {len(engine.rules)}"
    expected_ids = {Path(f).stem.upper() for f in RULE_PACK_FILES}  # not exact match, just sanity
    rule_ids = {r.id for r in engine.rules}
    assert "RULE-AUTH-001" in rule_ids
    assert "RULE-EP-001" in rule_ids
    assert "RULE-AUTH-002" in {r.id for r in engine.sequence_rules}
    return f"{len(engine.rules)} detection rules + {len(engine.sequence_rules)} sequence rule(s) loaded"


@check("Sample logs can be generated for every scenario")
def check_scenarios_generate_valid_logs():
    replay = _load_module("verify_replay", REPO_ROOT / "scripts" / "replay_attack.py")
    normalizer = _load_module("verify_normalizer", REPO_ROOT / "parser" / "normalizer.py")

    total_logs = 0
    for name, fn in replay.SCENARIOS.items():
        ctx = replay.ScenarioContext()
        logs = fn(ctx)
        assert logs, f"scenario {name} produced no logs"
        for log in logs:
            ok, err = normalizer.validate_normalized_log(log)
            assert ok, f"scenario {name} produced an invalid log: {err}"
        total_logs += len(logs)
    return f"{len(replay.SCENARIOS)} scenarios, {total_logs} synthetic logs, all schema-valid"


@check("Full attack chain triggers detection + correlation")
def check_full_chain_detects_and_correlates():
    replay = _load_module("verify_replay2", REPO_ROOT / "scripts" / "replay_attack.py")
    engine_mod = _load_module("verify_engine2", REPO_ROOT / "detection-engine" / "engine.py")
    corr_mod = _load_module("verify_corr", REPO_ROOT / "correlation-engine" / "correlator.py")

    engine = engine_mod.DetectionEngine(_NoOpenSearch())
    ctx = replay.ScenarioContext()
    logs = replay.scenario_full_attack_chain(ctx)

    alerts = []
    for log in logs:
        alerts.extend(engine.detect(log))
    alerts.extend(engine.detect_thresholds(logs))
    assert len(alerts) >= 10, f"expected >=10 alerts, got {len(alerts)}"
    for alert in alerts:
        alert["timestamp"] = alert["matched_log"]["timestamp"]

    correlator = corr_mod.CorrelationEngine(_NoOpenSearch())
    incidents = correlator.build_incidents(alerts)
    pattern_ids = {i["pattern_id"] for i in incidents}
    assert "CORR-006" in pattern_ids, f"flagship pattern CORR-006 did not fire; got {pattern_ids}"
    return f"{len(alerts)} alerts -> {len(incidents)} incidents, including CORR-006"


@check("Incident report + AI RCA can be generated offline")
def check_report_generation_offline():
    report_mod = _load_module("verify_report", REPO_ROOT / "scripts" / "generate_incident_report.py")
    incident, alerts, rca = report_mod.generate_offline_sample()
    assert rca.get("mode") == "template", "expected template-mode RCA with no API key configured"
    report_mod.write_outputs(incident, alerts, rca)
    for fname in ["sample_alerts.json", "sample_incident_report.md", "sample_ai_rca_report.md", "sample_incident_timeline.json"]:
        path = report_mod.OUTPUT_DIR / fname
        assert path.exists() and path.stat().st_size > 0, f"{fname} was not written"
    return f"outputs/ contains all 4 report artifacts (incident {incident['incident_id']})"


@check("demo.sh / demo.bat reference real scripts")
def check_demo_scripts_reference_real_paths():
    referenced = set()
    for demo_file in ["demo.sh", "demo.bat"]:
        text = (REPO_ROOT / demo_file).read_text(encoding="utf-8")
        for match in re.finditer(r"scripts[\\/][\w\-.]+\.py", text):
            referenced.add(match.group(0).replace("\\", "/"))
    assert referenced, "no script references found in demo.sh/demo.bat"
    missing = [r for r in referenced if not (REPO_ROOT / r).exists()]
    assert not missing, f"demo scripts reference missing files: {missing}"
    return f"{len(referenced)} referenced script(s) all exist: {', '.join(sorted(referenced))}"


@check("replay_attack.py --list runs cleanly")
def check_replay_cli_smoke_test():
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "replay_attack.py"), "--list"],
        capture_output=True, text=True, timeout=30,
    )
    assert result.returncode == 0, f"exit code {result.returncode}: {result.stderr[-500:]}"
    assert "full_attack_chain" in result.stdout
    return "exit code 0, scenario list printed"


def main():
    print(f"{CYAN}Mini-SIEM - Demo Verification{RESET}\n")

    for fn in [
        check_required_files, check_rules_load, check_scenarios_generate_valid_logs,
        check_full_chain_detects_and_correlates, check_report_generation_offline,
        check_demo_scripts_reference_real_paths, check_replay_cli_smoke_test,
    ]:
        fn()

    passed = sum(1 for _, ok, _ in results if ok)
    for name, ok, detail in results:
        icon = f"{GREEN}[PASS]{RESET}" if ok else f"{RED}[FAIL]{RESET}"
        print(f"{icon} {name}")
        if detail:
            color = "" if ok else RED
            print(f"       {color}{detail}{RESET}")

    print(f"\n{passed}/{len(results)} checks passed")

    if passed != len(results):
        print(f"{YELLOW}Some checks failed - see details above.{RESET}")
        return 1

    print(f"{GREEN}All checks passed - the demo is ready to run.{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
