"""Report generation tests (offline mode - no Docker/OpenSearch required)."""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def report_module(tmp_path):
    spec = importlib.util.spec_from_file_location(
        "siem_report_gen", REPO_ROOT / "scripts" / "generate_incident_report.py"
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["siem_report_gen"] = module
    spec.loader.exec_module(module)
    # Redirect output so the test suite doesn't write into the real repo.
    module.OUTPUT_DIR = tmp_path / "outputs"
    return module


def test_offline_sample_generation_returns_incident_alerts_rca(report_module):
    incident, alerts, rca = report_module.generate_offline_sample()
    assert incident["pattern_id"] in {"CORR-006", "CORR-001", "CORR-005", "CORR-003", "RULE-AUTH-002", "CORR-002"}
    assert len(alerts) == incident["alert_count"]
    assert rca["threat_summary"]


def test_write_outputs_creates_all_four_files(report_module):
    incident, alerts, rca = report_module.generate_offline_sample()
    report_module.write_outputs(incident, alerts, rca)

    out = report_module.OUTPUT_DIR
    assert (out / "sample_alerts.json").exists()
    assert (out / "sample_incident_report.md").exists()
    assert (out / "sample_ai_rca_report.md").exists()
    assert (out / "sample_incident_timeline.json").exists()


def test_sample_alerts_json_matches_alert_count(report_module):
    incident, alerts, rca = report_module.generate_offline_sample()
    report_module.write_outputs(incident, alerts, rca)

    data = json.loads((report_module.OUTPUT_DIR / "sample_alerts.json").read_text())
    assert len(data) == len(alerts) == incident["alert_count"]


def test_incident_report_markdown_contains_key_sections(report_module):
    incident, alerts, rca = report_module.generate_offline_sample()
    report_module.write_outputs(incident, alerts, rca)

    text = (report_module.OUTPUT_DIR / "sample_incident_report.md").read_text()
    for heading in ["# Incident Report", "## Suspected Attack Chain", "## MITRE ATT&CK Techniques",
                     "## Related Alerts", "## Timeline", "## Recommended Actions"]:
        assert heading in text


def test_rca_report_markdown_contains_key_sections(report_module):
    incident, alerts, rca = report_module.generate_offline_sample()
    report_module.write_outputs(incident, alerts, rca)

    text = (report_module.OUTPUT_DIR / "sample_ai_rca_report.md").read_text()
    for heading in ["# AI Root Cause Analysis", "## Threat Summary", "## Root Cause Analysis",
                     "## MITRE ATT&CK Mapping", "## Remediation"]:
        assert heading in text
