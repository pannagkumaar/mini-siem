#!/usr/bin/env python3
"""
Attack Replay Mode for Mini-SIEM

Generates realistic, entirely synthetic security logs for a named attack
scenario and replays them into the ingestion API in the correct order and
timing to trigger the detection rule pack and correlation engine.

This is for local, educational use only:
  - No real network traffic is sent anywhere except your own Mini-SIEM API.
  - No malware, exploits, or destructive payloads are generated - only
    synthetic *log entries* that describe what such activity would look
    like, for detection-engineering purposes.

Usage:
    python scripts/replay_attack.py --scenario ssh_bruteforce
    python scripts/replay_attack.py --scenario full_attack_chain
    python scripts/replay_attack.py --list
    python scripts/replay_attack.py --scenario ssh_bruteforce --dry-run
"""

import argparse
import json
import sys
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import requests

GREEN = '\033[92m'
YELLOW = '\033[93m'
RED = '\033[91m'
CYAN = '\033[36m'
BOLD = '\033[1m'
RESET = '\033[0m'

DEFAULT_API_URL = "http://localhost:8000"


def log_step(message: str):
    print(f"{CYAN}[*]{RESET} {message}")


def log_ok(message: str):
    print(f"{GREEN}[+]{RESET} {message}")


def log_warn(message: str):
    print(f"{YELLOW}[!]{RESET} {message}")


def log_err(message: str):
    print(f"{RED}[x]{RESET} {message}")


class Clock:
    """Monotonically increasing synthetic timestamp generator.

    Real attack telemetry is spread over seconds/minutes; we replicate that
    spacing so threshold and correlation rules (which key off event
    ordering and time windows) fire the same way they would in production.
    """

    def __init__(self, start: Optional[datetime] = None):
        self.t = start or datetime.utcnow()

    def tick(self, seconds: float = 5.0) -> str:
        self.t += timedelta(seconds=seconds)
        return self.t.isoformat() + "Z"

    def now(self) -> str:
        return self.t.isoformat() + "Z"


def log_entry(
    clock: Clock,
    source: str,
    host: str,
    user: str,
    ip: str,
    event_type: str,
    severity: str,
    raw: Dict[str, Any],
    advance_seconds: float = 5.0,
) -> Dict[str, Any]:
    return {
        "timestamp": clock.tick(advance_seconds),
        "source": source,
        "host": host,
        "user": user,
        "ip": ip,
        "event_type": event_type,
        "severity": severity,
        "raw": raw,
    }


class ScenarioContext:
    """Shared entity values so multi-stage scenarios (and full_attack_chain)
    can reuse the same host/user/ip and produce a single coherent narrative
    that the correlation engine can chain together."""

    def __init__(
        self,
        host: str = "corp-web-01",
        user: str = "root",
        ip: str = "203.0.113.77",
        secondary_host: str = "corp-db-01",
        clock: Optional[Clock] = None,
    ):
        self.host = host
        self.user = user
        self.ip = ip
        self.secondary_host = secondary_host
        self.clock = clock or Clock()


# ---------------------------------------------------------------------------
# Scenario generators - each returns a list of normalized log dicts in the
# order they should be sent.
# ---------------------------------------------------------------------------

def scenario_ssh_bruteforce(ctx: ScenarioContext) -> List[Dict[str, Any]]:
    logs = []
    for i in range(8):
        logs.append(log_entry(
            ctx.clock, "linux", ctx.host, ctx.user, ctx.ip,
            "login_failure", "high",
            {
                "service": "ssh",
                "message": f"Failed password for {ctx.user} from {ctx.ip} port {40000 + i} ssh2",
            },
            advance_seconds=8,
        ))
    return logs


def scenario_successful_login_after_bruteforce(ctx: ScenarioContext) -> List[Dict[str, Any]]:
    logs = scenario_ssh_bruteforce(ctx)
    logs.append(log_entry(
        ctx.clock, "linux", ctx.host, ctx.user, ctx.ip,
        "login_success", "high",
        {
            "service": "ssh",
            "message": f"Accepted password for {ctx.user} from {ctx.ip} port 40099 ssh2",
            "failed_attempts_before_success": len(logs),
        },
        advance_seconds=6,
    ))
    return logs


def scenario_web_sql_injection(ctx: ScenarioContext) -> List[Dict[str, Any]]:
    logs = [
        log_entry(
            ctx.clock, "app", ctx.host, "anonymous", ctx.ip,
            "web_request", "medium",
            {
                "method": "GET",
                "uri": "/products?id=1",
                "status": 200,
                "user_agent": "sqlmap/1.7.2#stable (http://sqlmap.org)",
            },
            advance_seconds=3,
        ),
        log_entry(
            ctx.clock, "app", ctx.host, "anonymous", ctx.ip,
            "web_request", "high",
            {
                "method": "GET",
                "uri": "/products?id=1' OR 1=1--",
                "status": 500,
                "user_agent": "sqlmap/1.7.2#stable (http://sqlmap.org)",
            },
            advance_seconds=4,
        ),
    ]
    return logs


def scenario_path_traversal_attempt(ctx: ScenarioContext) -> List[Dict[str, Any]]:
    logs = [
        log_entry(
            ctx.clock, "app", ctx.host, "anonymous", ctx.ip,
            "web_request", "medium",
            {
                "method": "GET",
                "uri": "/",
                "status": 200,
                "user_agent": "Mozilla/5.0 (compatible; Nikto/2.5.0)",
            },
            advance_seconds=3,
        ),
        log_entry(
            ctx.clock, "app", ctx.host, "anonymous", ctx.ip,
            "web_request", "high",
            {
                "method": "GET",
                "uri": "/download?file=../../../../etc/passwd",
                "status": 403,
                "user_agent": "Mozilla/5.0 (compatible; Nikto/2.5.0)",
            },
            advance_seconds=4,
        ),
    ]
    return logs


def scenario_suspicious_powershell(ctx: ScenarioContext) -> List[Dict[str, Any]]:
    return [
        log_entry(
            ctx.clock, "windows", ctx.host, ctx.user, ctx.ip,
            "process_create", "critical",
            {
                "EventID": 4688,
                "process_name": "powershell.exe",
                "parent_process": "winword.exe",
                "commandline": (
                    "powershell.exe -nop -w hidden -EncodedCommand "
                    "SQBuAHYAbwBrAGUALQBXAGUAYgBSAGUAcQB1AGUAcwB0AC0AVQBSAEkA"
                ),
            },
            advance_seconds=5,
        ),
    ]


def scenario_admin_login_anomaly(ctx: ScenarioContext) -> List[Dict[str, Any]]:
    return [
        log_entry(
            ctx.clock, "windows", "dc-01", "admin", "198.51.100.23",
            "login_success", "high",
            {
                "EventID": 4624,
                "LogonType": 10,
                "unusual_login": True,
                "reason": "new_geolocation:RO first_seen_ip",
            },
            advance_seconds=5,
        ),
    ]


def scenario_privilege_escalation(ctx: ScenarioContext) -> List[Dict[str, Any]]:
    return [
        log_entry(
            ctx.clock, "windows", ctx.host, ctx.user, ctx.ip,
            "process_create", "high",
            {
                "EventID": 4688,
                "process_name": "psexec.exe",
                "parent_process": "cmd.exe",
                "commandline": "psexec.exe -accepteula \\\\localhost -s cmd.exe",
            },
            advance_seconds=5,
        ),
        log_entry(
            ctx.clock, "windows", ctx.host, ctx.user, ctx.ip,
            "privilege_escalation", "critical",
            {
                "privilege_level": "user to system",
                "method": "token impersonation",
            },
            advance_seconds=4,
        ),
    ]


def scenario_data_exfiltration_pattern(ctx: ScenarioContext) -> List[Dict[str, Any]]:
    return [
        log_entry(
            ctx.clock, "windows", ctx.host, ctx.user, ctx.ip,
            "credential_dumping", "critical",
            {
                "tool": "mimikatz",
                "target": "lsass.exe",
                "commandline": "mimikatz.exe \"privilege::debug\" \"sekurlsa::logonpasswords\"",
            },
            advance_seconds=6,
        ),
        log_entry(
            ctx.clock, "windows", ctx.host, ctx.user, ctx.ip,
            "lateral_movement", "high",
            {
                "source_host": ctx.host,
                "target_host": ctx.secondary_host,
                "method": "SMB",
            },
            advance_seconds=8,
        ),
        log_entry(
            ctx.clock, "windows", ctx.host, ctx.user, ctx.ip,
            "data_exfiltration", "critical",
            {
                "data_size_mb": 350,
                "destination": "c2-server.example",
                "protocol": "HTTPS",
            },
            advance_seconds=10,
        ),
    ]


def scenario_full_attack_chain(ctx: ScenarioContext) -> List[Dict[str, Any]]:
    """
    A single coherent, end-to-end intrusion narrative on one host/user/ip:
      recon -> brute force -> account takeover -> execution -> credential
      access -> privilege escalation -> lateral movement -> exfiltration.
    Stage order matters: the correlation engine's CORR-006 pattern matches
    steps strictly in sequence, so privilege escalation must land *before*
    lateral movement / exfiltration, not after.
    """
    logs: List[Dict[str, Any]] = []
    logs += scenario_successful_login_after_bruteforce(ctx)   # initial access
    logs += scenario_suspicious_powershell(ctx)                # execution
    logs.append(log_entry(                                     # credential access
        ctx.clock, "windows", ctx.host, ctx.user, ctx.ip,
        "credential_dumping", "critical",
        {
            "tool": "mimikatz",
            "target": "lsass.exe",
            "commandline": "mimikatz.exe \"privilege::debug\" \"sekurlsa::logonpasswords\"",
        },
        advance_seconds=6,
    ))
    logs.append(log_entry(                                     # privilege escalation
        ctx.clock, "windows", ctx.host, ctx.user, ctx.ip,
        "privilege_escalation", "critical",
        {"privilege_level": "user to system", "method": "kernel exploit"},
        advance_seconds=5,
    ))
    logs.append(log_entry(                                     # lateral movement
        ctx.clock, "windows", ctx.host, ctx.user, ctx.ip,
        "lateral_movement", "high",
        {"source_host": ctx.host, "target_host": ctx.secondary_host, "method": "SMB"},
        advance_seconds=8,
    ))
    logs.append(log_entry(                                     # exfiltration
        ctx.clock, "windows", ctx.host, ctx.user, ctx.ip,
        "data_exfiltration", "critical",
        {"data_size_mb": 350, "destination": "c2-server.example", "protocol": "HTTPS"},
        advance_seconds=10,
    ))
    return logs


SCENARIOS = {
    "ssh_bruteforce": scenario_ssh_bruteforce,
    "successful_login_after_bruteforce": scenario_successful_login_after_bruteforce,
    "web_sql_injection": scenario_web_sql_injection,
    "path_traversal_attempt": scenario_path_traversal_attempt,
    "suspicious_powershell": scenario_suspicious_powershell,
    "admin_login_anomaly": scenario_admin_login_anomaly,
    "privilege_escalation": scenario_privilege_escalation,
    "data_exfiltration_pattern": scenario_data_exfiltration_pattern,
    "full_attack_chain": scenario_full_attack_chain,
}

SCENARIO_DESCRIPTIONS = {
    "ssh_bruteforce": "8 failed SSH logins from one IP -> triggers RULE-AUTH-001 / CORR-002",
    "successful_login_after_bruteforce": "Failed logins + a successful login -> triggers RULE-AUTH-002 (account compromise)",
    "web_sql_injection": "Scanner recon + SQL injection payload -> triggers RULE-WEB-003, RULE-WEB-001, CORR-004",
    "path_traversal_attempt": "Scanner recon + path traversal payload -> triggers RULE-WEB-003, RULE-WEB-002, CORR-004",
    "suspicious_powershell": "Office app spawns encoded PowerShell -> triggers RULE-EP-001, RULE-EP-002, DET-001",
    "admin_login_anomaly": "Admin login from a new location -> triggers RULE-AUTH-003",
    "privilege_escalation": "Suspicious process then privilege escalation -> triggers CORR-003",
    "data_exfiltration_pattern": "Credential dump -> lateral movement -> data exfil -> triggers CORR-005",
    "full_attack_chain": "End-to-end intrusion covering every stage above -> triggers CORR-001/002/003/005/006",
}


def send_log(api_url: str, log: Dict[str, Any], timeout: float = 5.0) -> bool:
    try:
        response = requests.post(f"{api_url}/ingest", json=log, timeout=timeout)
        response.raise_for_status()
        return True
    except requests.exceptions.RequestException as e:
        log_err(f"Failed to send log: {e}")
        return False


def run_scenario(
    name: str,
    api_url: str,
    delay: float,
    dry_run: bool,
    ctx: Optional[ScenarioContext] = None,
) -> int:
    if name not in SCENARIOS:
        log_err(f"Unknown scenario '{name}'. Use --list to see available scenarios.")
        return 0

    log_step(f"Scenario: {BOLD}{name}{RESET} - {SCENARIO_DESCRIPTIONS.get(name, '')}")
    ctx = ctx or ScenarioContext()
    logs = SCENARIOS[name](ctx)

    sent = 0
    for i, log in enumerate(logs, 1):
        if dry_run:
            print(json.dumps(log, indent=2))
        else:
            ok = send_log(api_url, log)
            if ok:
                sent += 1
                log_ok(
                    f"[{i}/{len(logs)}] sent {log['event_type']:20} "
                    f"host={log['host']:15} user={log['user']:10} severity={log['severity']}"
                )
            if delay > 0:
                time.sleep(delay)

    if not dry_run:
        log_ok(f"Scenario '{name}' complete - {sent}/{len(logs)} logs ingested")
    return sent


def check_api(api_url: str) -> bool:
    try:
        response = requests.get(f"{api_url}/health", timeout=5)
        response.raise_for_status()
        return True
    except requests.exceptions.RequestException as e:
        log_err(f"Ingestion API not reachable at {api_url}: {e}")
        log_warn("Is Mini-SIEM running? Try: docker-compose up -d  (or ./demo.sh)")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Replay synthetic attack scenarios into Mini-SIEM for detection/incident demos.",
    )
    parser.add_argument("--scenario", choices=list(SCENARIOS.keys()) + ["all"], help="Scenario to replay")
    parser.add_argument("--list", action="store_true", help="List available scenarios and exit")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help=f"Ingestion API base URL (default: {DEFAULT_API_URL})")
    parser.add_argument("--delay", type=float, default=0.3, help="Seconds to sleep between log sends (default: 0.3)")
    parser.add_argument("--fast", action="store_true", help="Send logs with no delay between them")
    parser.add_argument("--dry-run", action="store_true", help="Print generated logs instead of sending them")
    args = parser.parse_args()

    if args.list or not args.scenario:
        print(f"{BOLD}Available attack replay scenarios:{RESET}\n")
        for name, desc in SCENARIO_DESCRIPTIONS.items():
            print(f"  {CYAN}{name:38}{RESET} {desc}")
        print(f"\n  {CYAN}{'all':38}{RESET} Run every scenario above, back to back\n")
        print("Usage: python scripts/replay_attack.py --scenario <name>")
        return 0

    delay = 0.0 if args.fast else args.delay

    if not args.dry_run and not check_api(args.api_url):
        return 1

    print(f"{BOLD}Mini-SIEM Attack Replay{RESET}")
    print(f"Target API: {args.api_url}\n")

    total_sent = 0
    if args.scenario == "all":
        for name in SCENARIOS:
            total_sent += run_scenario(name, args.api_url, delay, args.dry_run)
            print()
    else:
        total_sent = run_scenario(args.scenario, args.api_url, delay, args.dry_run)

    if not args.dry_run:
        print()
        log_ok(f"Done - {total_sent} synthetic log(s) ingested")
        log_step("Give the detection engine ~10-15s and the correlation engine ~15-30s to catch up, then check:")
        print(f"    Dashboard:  http://localhost:3000")
        print(f"    Alerts:     http://localhost:8000/alerts")
        print(f"    Incidents:  http://localhost:8000/incidents")
    return 0


if __name__ == "__main__":
    sys.exit(main())
