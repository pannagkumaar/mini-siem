#!/usr/bin/env python3
"""
Incident Report Generator for Mini-SIEM

Exports a correlated incident, its related alerts, its timeline, and an
AI (or template-fallback) root cause analysis as JSON/Markdown artifacts
under outputs/.

Usage:
    python scripts/generate_incident_report.py --incident latest
    python scripts/generate_incident_report.py --incident INC-98B8F88399
    python scripts/generate_incident_report.py --offline   # no live API needed

Outputs:
    outputs/sample_alerts.json
    outputs/sample_incident_report.md
    outputs/sample_ai_rca_report.md
    outputs/sample_incident_timeline.json
"""

import argparse
import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = REPO_ROOT / "outputs"
DEFAULT_API_URL = "http://localhost:8000"

GREEN = '\033[92m'
YELLOW = '\033[93m'
RED = '\033[91m'
CYAN = '\033[36m'
RESET = '\033[0m'


def log_step(msg: str):
    print(f"{CYAN}[*]{RESET} {msg}")


def log_ok(msg: str):
    print(f"{GREEN}[+]{RESET} {msg}")


def log_warn(msg: str):
    print(f"{YELLOW}[!]{RESET} {msg}")


def log_err(msg: str):
    print(f"{RED}[x]{RESET} {msg}")


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# Online mode: talk to a running Mini-SIEM ingestion API
# ---------------------------------------------------------------------------

def fetch_online(api_url: str, incident_selector: str) -> Optional[Tuple[Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]]]:
    try:
        requests.get(f"{api_url}/health", timeout=5).raise_for_status()
    except requests.exceptions.RequestException as e:
        log_warn(f"Ingestion API not reachable at {api_url} ({e}) - falling back to --offline mode")
        return None

    resp = requests.get(f"{api_url}/incidents", params={"hours": 24}, timeout=10)
    resp.raise_for_status()
    incidents = resp.json().get("incidents", [])

    if not incidents:
        log_warn("No incidents found via the API yet - falling back to --offline mode")
        log_warn("Tip: run `python scripts/replay_attack.py --scenario full_attack_chain` first")
        return None

    if incident_selector == "latest":
        incidents.sort(key=lambda i: i.get("timestamp", ""), reverse=True)
        incident = incidents[0]
    else:
        matches = [i for i in incidents if i.get("incident_id") == incident_selector or i.get("_id") == incident_selector]
        if not matches:
            log_err(f"Incident '{incident_selector}' not found in the last 24h of incidents")
            return None
        incident = matches[0]

    incident_id = incident.get("incident_id", incident.get("_id"))
    log_ok(f"Using incident {incident_id} - {incident.get('title')}")

    alerts_resp = requests.get(f"{api_url}/alerts", params={"hours": 24, "limit": 500}, timeout=10)
    alerts_resp.raise_for_status()
    all_alerts = alerts_resp.json().get("alerts", [])

    related_ids = set(incident.get("related_alert_ids") or [])
    related_rule_ids = incident.get("related_alerts") or []
    if related_ids:
        alerts = [a for a in all_alerts if a.get("_id") in related_ids]
    else:
        alerts = [a for a in all_alerts if a.get("rule_id") in related_rule_ids]

    log_step(f"Requesting AI RCA for {incident_id} (uses Groq if configured, template fallback otherwise)")
    try:
        rca_resp = requests.post(f"{api_url}/ai/rca/{incident_id}", timeout=30)
        rca_resp.raise_for_status()
        rca = rca_resp.json().get("rca", {})
    except requests.exceptions.RequestException as e:
        log_warn(f"RCA generation failed ({e}); report will omit RCA content")
        rca = {}

    return incident, alerts, rca


# ---------------------------------------------------------------------------
# Offline mode: run the detection + correlation + AI agent modules locally
# against a freshly generated full_attack_chain scenario. No Docker/
# OpenSearch/API required - useful for CI and for `verify_demo.py`.
# ---------------------------------------------------------------------------

def generate_offline_sample() -> Tuple[Dict[str, Any], List[Dict[str, Any]], Dict[str, Any]]:
    import asyncio

    log_step("Running in offline mode: generating a synthetic full_attack_chain sample locally")

    replay = _load_module("replay_attack", REPO_ROOT / "scripts" / "replay_attack.py")
    engine_mod = _load_module("dt_engine", REPO_ROOT / "detection-engine" / "engine.py")
    corr_mod = _load_module("dt_correlator", REPO_ROOT / "correlation-engine" / "correlator.py")
    agent_mod = _load_module("dt_agent", REPO_ROOT / "ingestion" / "api-python" / "ai_agent" / "agent.py")

    class _NoOpenSearch:
        pass

    ctx = replay.ScenarioContext()
    logs = replay.scenario_full_attack_chain(ctx)

    engine = engine_mod.DetectionEngine(_NoOpenSearch())
    alerts: List[Dict[str, Any]] = []
    for log in logs:
        alerts.extend(engine.detect(log))
    alerts.extend(engine.detect_thresholds(logs))
    for alert in alerts:
        alert["timestamp"] = alert["matched_log"]["timestamp"]
        alert["_id"] = f"offline-{alert['rule_id']}-{alert['timestamp']}"

    correlator = corr_mod.CorrelationEngine(_NoOpenSearch())
    incidents = correlator.build_incidents(alerts)
    incidents.sort(key=lambda i: (i["severity"] != "critical", -i["alert_count"]))
    incident = incidents[0]
    # The correlator already recorded exactly which alert _ids matched this
    # incident's pattern (related_alert_ids) - reuse it rather than
    # re-deriving from rule_id, which would over-select every alert that
    # ever fired for that rule_id (not just the ones in this pattern match).
    related_ids = set(incident.get("related_alert_ids") or [])
    related_alerts = [a for a in alerts if a.get("_id") in related_ids]

    agent = agent_mod.AISecurityAgent(opensearch_client=None, groq_api_key=None)
    rca = asyncio.run(agent.generate_incident_rca(incident))

    log_ok(f"Generated offline sample incident {incident['incident_id']} - {incident['title']}")
    return incident, related_alerts, rca


# ---------------------------------------------------------------------------
# Report rendering
# ---------------------------------------------------------------------------

def render_incident_report(incident: Dict[str, Any], alerts: List[Dict[str, Any]]) -> str:
    assets = incident.get("affected_assets", {})
    lines = [
        f"# Incident Report: {incident.get('title', 'Untitled Incident')}",
        "",
        f"**Incident ID:** `{incident.get('incident_id', 'N/A')}`  ",
        f"**Severity:** {str(incident.get('severity', 'unknown')).upper()}  ",
        f"**Status:** {incident.get('status', 'open')}  ",
        f"**Pattern:** {incident.get('pattern_id', 'N/A')} - {incident.get('pattern_name', '')}  ",
        f"**First Seen:** {incident.get('first_seen', 'N/A')}  ",
        f"**Last Seen:** {incident.get('last_seen', 'N/A')}  ",
        f"**Alert Count:** {incident.get('alert_count', len(alerts))}",
        "",
        "## Description",
        "",
        incident.get("description", "N/A"),
        "",
        "## Suspected Attack Chain",
        "",
        f"`{incident.get('suspected_attack_chain', 'N/A')}`",
        "",
        "## Affected Assets",
        "",
        f"- **Hosts:** {', '.join(assets.get('hosts', []) or ['N/A'])}",
        f"- **Users:** {', '.join(assets.get('users', []) or ['N/A'])}",
        f"- **IPs:** {', '.join(assets.get('ips', []) or ['N/A'])}",
        "",
        "## MITRE ATT&CK Techniques",
        "",
    ]
    mitre = incident.get("mitre_techniques", [])
    lines.append(", ".join(mitre) if mitre else "None mapped")
    lines += ["", "## Related Alerts", "", "| Timestamp | Rule ID | Rule Name | Severity | Host | User |",
              "|---|---|---|---|---|---|"]
    for a in alerts:
        lines.append(
            f"| {a.get('timestamp', 'N/A')} | {a.get('rule_id', 'N/A')} | {a.get('rule_name', 'N/A')} | "
            f"{a.get('rule_severity', 'N/A')} | {a.get('host', 'N/A')} | {a.get('user', 'N/A')} |"
        )
    lines += ["", "## Timeline", ""]
    for step in incident.get("timeline", []):
        lines.append(
            f"- `{step.get('timestamp', 'N/A')}` **{step.get('rule_name', step.get('rule_id'))}** "
            f"({step.get('event_type', 'N/A')}, {step.get('severity', 'N/A')}) - "
            f"host={step.get('host', 'N/A')} user={step.get('user', 'N/A')}"
        )
    lines += ["", "## Recommended Actions", ""]
    for action in incident.get("recommended_actions", []):
        lines.append(f"- [ ] {action}")
    lines += [
        "",
        "---",
        f"*Generated by Mini-SIEM report generator at {datetime.utcnow().isoformat()}Z*",
        "",
    ]
    return "\n".join(lines)


def render_rca_report(incident: Dict[str, Any], rca: Dict[str, Any]) -> str:
    if not rca:
        return f"# AI Root Cause Analysis\n\nNo RCA available for incident {incident.get('incident_id', 'N/A')}.\n"

    def section(title: str, key: str, as_list: bool = True) -> List[str]:
        value = rca.get(key)
        out = [f"## {title}", ""]
        if not value:
            out.append("_None provided._")
        elif as_list and isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    out.append(f"- **{item.get('id', '')}** {item.get('name', '')}: {item.get('description', '')}")
                else:
                    out.append(f"- {item}")
        else:
            out.append(str(value))
        out.append("")
        return out

    lines = [
        f"# AI Root Cause Analysis: {incident.get('title', 'Incident')}",
        "",
        f"**Incident ID:** `{incident.get('incident_id', 'N/A')}`  ",
        f"**Mode:** {rca.get('mode', 'unknown')} (`{rca.get('ai_model', 'n/a')}`)  ",
        f"**Generated At:** {rca.get('generated_at', 'N/A')}",
        "",
        "## Threat Summary",
        "",
        rca.get("threat_summary", "N/A"),
        "",
        "## Root Cause Analysis",
        "",
        rca.get("root_cause_analysis", "N/A"),
        "",
    ]
    lines += section("Evidence", "evidence")
    lines += section("MITRE ATT&CK Mapping", "mitre_attack_mapping")
    lines += section("Immediate Containment", "immediate_containment")
    lines += section("Investigation Steps", "investigation_steps")
    lines += section("Remediation", "remediation")
    lines += section("False Positive Considerations", "false_positive_considerations")
    lines += section("Prevention Measures", "prevention_measures")
    lines += [
        "---",
        f"*Generated by Mini-SIEM AI Security Agent ({rca.get('mode', 'unknown')} mode) - "
        "no paid API required for template mode.*",
        "",
    ]
    return "\n".join(lines)


def _display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def write_outputs(incident: Dict[str, Any], alerts: List[Dict[str, Any]], rca: Dict[str, Any]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    alerts_path = OUTPUT_DIR / "sample_alerts.json"
    alerts_path.write_text(json.dumps(alerts, indent=2, default=str), encoding="utf-8")
    log_ok(f"Wrote {_display_path(alerts_path)} ({len(alerts)} alerts)")

    timeline_path = OUTPUT_DIR / "sample_incident_timeline.json"
    timeline_path.write_text(json.dumps(incident.get("timeline", []), indent=2, default=str), encoding="utf-8")
    log_ok(f"Wrote {_display_path(timeline_path)}")

    incident_report_path = OUTPUT_DIR / "sample_incident_report.md"
    incident_report_path.write_text(render_incident_report(incident, alerts), encoding="utf-8")
    log_ok(f"Wrote {_display_path(incident_report_path)}")

    rca_report_path = OUTPUT_DIR / "sample_ai_rca_report.md"
    rca_report_path.write_text(render_rca_report(incident, rca), encoding="utf-8")
    log_ok(f"Wrote {_display_path(rca_report_path)}")


def main():
    parser = argparse.ArgumentParser(description="Generate an incident report + AI RCA from Mini-SIEM.")
    parser.add_argument("--incident", default="latest", help="Incident ID to report on, or 'latest' (default)")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help=f"Ingestion API base URL (default: {DEFAULT_API_URL})")
    parser.add_argument("--offline", action="store_true", help="Skip the live API and generate a synthetic sample locally")
    args = parser.parse_args()

    result = None
    if not args.offline:
        result = fetch_online(args.api_url, args.incident)

    if result is None:
        incident, alerts, rca = generate_offline_sample()
    else:
        incident, alerts, rca = result

    write_outputs(incident, alerts, rca)
    log_ok("Report generation complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
