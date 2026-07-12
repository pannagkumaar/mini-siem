"""
Correlation Engine for SIEM

Groups related alerts into incidents by matching ordered attack-chain
patterns (e.g. brute force -> successful login -> privilege escalation)
across a shared entity (host, user, or IP) within a time window.

Patterns come from two places:
  1. Built-in default patterns defined in this file.
  2. "sequence" rules loaded from the rules/ pack (rules authored with a
     `sequence` block instead of a `condition` block - see
     rules/auth/successful_login_after_failures.yml for an example).
"""

import hashlib
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional
from collections import defaultdict

import yaml
from opensearchpy import OpenSearch


class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors for better log readability."""

    COLORS = {
        'DEBUG': '\033[36m',
        'INFO': '\033[92m',
        'WARNING': '\033[93m',
        'ERROR': '\033[91m',
    }
    RESET = '\033[0m'

    def format(self, record):
        log_color = self.COLORS.get(record.levelname, self.RESET)
        record.msg = f"{log_color}{record.msg}{self.RESET}"
        return super().format(record)


logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = ColoredFormatter(
        fmt='[%(asctime)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def _parse_ts(ts: str) -> datetime:
    """Parse an ISO8601 timestamp (with or without trailing Z)."""
    if not ts:
        return datetime.utcnow()
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return datetime.utcnow()


class CorrelationPattern:
    """Represents an ordered, multi-step attack-chain pattern to detect."""

    def __init__(self, pattern_dict: Dict[str, Any]):
        self.id = pattern_dict.get("id", "UNKNOWN")
        self.name = pattern_dict.get("name", "Unnamed Pattern")
        self.description = pattern_dict.get("description", "")
        self.steps: List[Dict[str, Any]] = pattern_dict.get("steps", [])
        self.group_by = pattern_dict.get("group_by", "host")
        self.time_window_minutes = pattern_dict.get("time_window_minutes", 15)
        self.severity = pattern_dict.get("severity", "high")
        self.mitre_techniques: List[str] = pattern_dict.get("mitre_techniques", [])
        self.recommended_actions: List[str] = pattern_dict.get("recommended_actions", [])
        self.raw = pattern_dict

    def __repr__(self):
        return f"<Pattern {self.id}: {self.name}>"

    @staticmethod
    def _alert_matches_step(alert: Dict[str, Any], step: Dict[str, Any]) -> bool:
        log = alert.get("matched_log", {}) or {}

        if "rule_id" in step and alert.get("rule_id") != step["rule_id"]:
            return False
        if "rule_id_in" in step and alert.get("rule_id") not in step["rule_id_in"]:
            return False
        if "event_type" in step and log.get("event_type") != step["event_type"]:
            return False
        if "event_type_in" in step and log.get("event_type") not in step["event_type_in"]:
            return False
        if "min_severity" in step:
            order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
            if order.get(alert.get("rule_severity", "low"), 0) < order.get(step["min_severity"], 0):
                return False
        return True

    def match(self, alerts: List[Dict[str, Any]]) -> Optional[List[Dict[str, Any]]]:
        """
        Try to match this pattern's ordered steps against a chronologically
        sorted list of alerts for a single entity (host/user/ip).

        Returns the list of alerts that satisfy the pattern (one sub-list per
        step, flattened) or None if the pattern doesn't match.
        """
        if not alerts or not self.steps:
            return None

        cursor_time: Optional[datetime] = None
        selected: List[Dict[str, Any]] = []

        for step in self.steps:
            min_count = step.get("min_count", 1)
            candidates = [
                a for a in alerts
                if self._alert_matches_step(a, step)
                and (cursor_time is None or _parse_ts(a["timestamp"]) >= cursor_time)
            ]
            if len(candidates) < min_count:
                return None

            candidates.sort(key=lambda a: a["timestamp"])
            chosen = candidates[:min_count]
            selected.extend(chosen)
            cursor_time = _parse_ts(chosen[-1]["timestamp"])

        span_start = min(_parse_ts(a["timestamp"]) for a in selected)
        span_end = max(_parse_ts(a["timestamp"]) for a in selected)
        if span_end - span_start > timedelta(minutes=self.time_window_minutes):
            return None

        return selected


def _default_patterns() -> List[CorrelationPattern]:
    """Built-in correlation patterns covering common attack chains."""
    return [
        CorrelationPattern({
            "id": "CORR-001",
            "name": "Brute Force to Full Account Compromise",
            "description": "Repeated failed logins followed by a successful login and privilege escalation on the same host - a classic account takeover chain.",
            "group_by": "host",
            "steps": [
                {"event_type": "login_failure", "min_count": 5},
                {"event_type": "login_success"},
                {"event_type": "privilege_escalation"},
            ],
            "time_window_minutes": 20,
            "severity": "critical",
            "mitre_techniques": ["T1110", "T1078", "T1068"],
            "recommended_actions": [
                "Force password reset and revoke active sessions for the affected account",
                "Block the source IP at the perimeter firewall",
                "Review all commands executed during the session",
            ],
        }),
        CorrelationPattern({
            "id": "CORR-002",
            "name": "Multiple Failed Login Attempts",
            "description": "A burst of failed login attempts from the same source, indicating a probable brute-force / credential-stuffing attempt.",
            "group_by": "ip",
            "steps": [
                {"event_type": "login_failure", "min_count": 5},
            ],
            "time_window_minutes": 15,
            "severity": "high",
            "mitre_techniques": ["T1110"],
            "recommended_actions": [
                "Rate-limit or temporarily block the source IP",
                "Confirm the targeted account(s) have not been compromised",
            ],
        }),
        CorrelationPattern({
            "id": "CORR-003",
            "name": "Suspicious Process Followed by Privilege Escalation",
            "description": "A suspicious process was created shortly before a privilege escalation event on the same host.",
            "group_by": "host",
            "steps": [
                {"event_type": "process_create"},
                {"event_type": "privilege_escalation"},
            ],
            "time_window_minutes": 10,
            "severity": "high",
            "mitre_techniques": ["T1068", "T1134"],
            "recommended_actions": [
                "Isolate the host from the network",
                "Capture a memory/process snapshot for forensic analysis",
            ],
        }),
        CorrelationPattern({
            "id": "CORR-004",
            "name": "Web Application Attack Chain (Recon to Exploitation)",
            "description": "Scanner/reconnaissance traffic from a source IP was followed by an exploitation attempt (SQL injection or path traversal) against the same application.",
            "group_by": "ip",
            "steps": [
                {"rule_id": "RULE-WEB-003"},
                {"rule_id_in": ["RULE-WEB-001", "RULE-WEB-002"]},
            ],
            "time_window_minutes": 15,
            "severity": "high",
            "mitre_techniques": ["T1595", "T1190"],
            "recommended_actions": [
                "Block the source IP at the WAF/firewall",
                "Review application logs for successful exploitation",
                "Patch the vulnerable endpoint",
            ],
        }),
        CorrelationPattern({
            "id": "CORR-005",
            "name": "Credential Theft to Data Exfiltration",
            "description": "Credential dumping was followed by lateral movement and then a large outbound data transfer - a full data-theft chain.",
            "group_by": "host",
            "steps": [
                {"event_type": "credential_dumping"},
                {"event_type": "lateral_movement"},
                {"event_type": "data_exfiltration"},
            ],
            "time_window_minutes": 30,
            "severity": "critical",
            "mitre_techniques": ["T1003", "T1570", "T1041"],
            "recommended_actions": [
                "Isolate all affected hosts immediately",
                "Rotate all credentials that may have been dumped",
                "Block the exfiltration destination at the egress firewall/proxy",
            ],
        }),
        CorrelationPattern({
            "id": "CORR-006",
            "name": "Full Attack Chain: Initial Access to Exfiltration",
            "description": "End-to-end intrusion: brute-force initial access, successful login, suspicious script execution, credential dumping, privilege escalation, and data exfiltration on the same host.",
            "group_by": "host",
            "steps": [
                {"event_type": "login_failure", "min_count": 5},
                {"event_type": "login_success"},
                {"event_type": "process_create"},
                {"event_type": "credential_dumping"},
                {"event_type": "privilege_escalation"},
                {"event_type": "data_exfiltration"},
            ],
            "time_window_minutes": 45,
            "severity": "critical",
            "mitre_techniques": ["T1110", "T1078", "T1059", "T1003", "T1068", "T1041"],
            "recommended_actions": [
                "Activate the incident response plan - this is a confirmed full compromise",
                "Isolate the host, rotate all credentials, and hunt for lateral movement",
                "Preserve forensic evidence (memory, disk, logs) before remediation",
                "Notify stakeholders per the incident response / breach notification policy",
            ],
        }),
    ]


def _load_sequence_rules(rules_dirs: List[Path]) -> List[CorrelationPattern]:
    """Load correlation patterns from rules/ files authored with a `sequence` block."""
    patterns = []
    seen_ids = set()

    for rules_dir in rules_dirs:
        if not rules_dir.exists():
            continue
        yaml_files = sorted(set(rules_dir.rglob("*.yaml")) | set(rules_dir.rglob("*.yml")))
        for rule_file in yaml_files:
            try:
                with open(rule_file, "r") as f:
                    rule_dict = yaml.safe_load(f)
                if not rule_dict or "sequence" not in rule_dict or "condition" in rule_dict:
                    continue

                seq = rule_dict["sequence"]
                rule_id = rule_dict.get("id", "UNKNOWN")
                if rule_id in seen_ids:
                    continue
                seen_ids.add(rule_id)

                mitre = rule_dict.get("mitre_technique", [])
                mitre_ids = [m["id"] if isinstance(m, dict) else m for m in mitre]

                pattern = CorrelationPattern({
                    "id": rule_id,
                    "name": rule_dict.get("name", "Unnamed Sequence"),
                    "description": rule_dict.get("description", ""),
                    "group_by": seq.get("group_by", "ip"),
                    "steps": seq.get("steps", []),
                    "time_window_minutes": seq.get("time_window_minutes", 15),
                    "severity": rule_dict.get("severity", "high"),
                    "mitre_techniques": mitre_ids,
                    "recommended_actions": rule_dict.get("remediation", []),
                })
                patterns.append(pattern)
                logger.info(f"Loaded sequence rule as correlation pattern: {pattern}")
            except Exception as e:
                logger.error(f"Failed to load sequence rule from {rule_file}: {e}")

    return patterns


class CorrelationEngine:
    """
    Correlation Engine that groups related alerts into incidents using
    ordered, time-windowed attack-chain patterns.
    """

    def __init__(self, opensearch_client: OpenSearch, rules_dir: Optional[str] = None):
        self.opensearch = opensearch_client

        if rules_dir:
            rules_dirs = [Path(rules_dir)]
        else:
            base_dir = Path(__file__).resolve().parent
            repo_root = base_dir.parent
            rules_dirs = [repo_root / "rules"]

        self.patterns: List[CorrelationPattern] = _default_patterns() + _load_sequence_rules(rules_dirs)
        self._last_processed_timestamp: Optional[str] = None

    def run_correlation_loop(self, interval_seconds: int = 30, lookback_minutes: int = 30):
        """
        Run a continuous correlation loop that detects attack chains.

        Args:
            interval_seconds: How often to check for attack chains
            lookback_minutes: How far back to look for related alerts
        """
        import time

        logger.info(f"🔗 Correlation Engine Started (checking every {interval_seconds}s, lookback {lookback_minutes}m, {len(self.patterns)} patterns)")

        while True:
            try:
                self.correlate_recent_alerts(lookback_minutes)
                time.sleep(interval_seconds)
            except Exception as e:
                logger.error(f"✗ Error in correlation loop: {e}")
                time.sleep(interval_seconds)

    def correlate_recent_alerts(self, lookback_minutes: int = 30):
        """
        Query recent alerts and apply correlation patterns to detect incidents.

        Args:
            lookback_minutes: How far back to query
        """
        if not self.opensearch:
            logger.error("✗ OpenSearch client not available")
            return

        try:
            now = datetime.utcnow()
            start_time = (now - timedelta(minutes=lookback_minutes)).isoformat() + "Z"

            query = {
                "query": {
                    "range": {
                        "timestamp": {
                            "gte": start_time,
                            "lte": now.isoformat() + "Z"
                        }
                    }
                },
                "size": 1000,
                "sort": [{"timestamp": {"order": "asc"}}]
            }

            response = self.opensearch.search(index="alerts", body=query)
            alerts = []
            for hit in response.get("hits", {}).get("hits", []):
                alert = hit["_source"]
                alert["_id"] = hit["_id"]
                alerts.append(alert)

            if not alerts:
                logger.debug(f"No alerts in the last {lookback_minutes} minutes")
                return

            logger.info(f"🔍 Analyzing {len(alerts)} alerts for attack chains")

            incidents = self.build_incidents(alerts)

            for incident in incidents:
                try:
                    # Upsert by deterministic incident_id so re-running correlation
                    # over an overlapping window doesn't create duplicate incidents.
                    existing_status = None
                    try:
                        existing = self.opensearch.get(index="incidents", id=incident["incident_id"])
                        existing_status = existing["_source"].get("status")
                    except Exception:
                        pass
                    if existing_status and existing_status != "open":
                        # Preserve analyst-set status (investigating/resolved)
                        incident["status"] = existing_status

                    self.opensearch.index(index="incidents", id=incident["incident_id"], body=incident, refresh=True)
                    logger.info(
                        f"🎯 INCIDENT: {incident['title']:45} | {incident['incident_id']:20} | Severity: {incident['severity'].upper()}"
                    )
                except Exception as e:
                    logger.error(f"✗ Failed to index incident: {e}")

        except Exception as e:
            logger.error(f"✗ Error correlating alerts: {e}")

    def build_incidents(self, alerts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Run every pattern against every candidate entity and build incident documents."""
        incidents = []
        seen_incident_ids = set()

        for pattern in self.patterns:
            groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
            for alert in alerts:
                key = alert.get(pattern.group_by) or (alert.get("matched_log", {}) or {}).get(pattern.group_by)
                if key and key != "unknown":
                    groups[key].append(alert)

            for entity_value, entity_alerts in groups.items():
                entity_alerts.sort(key=lambda a: a.get("timestamp", ""))
                matched = pattern.match(entity_alerts)
                if not matched:
                    continue

                incident = self._build_incident_doc(pattern, entity_value, matched)
                if incident["incident_id"] in seen_incident_ids:
                    continue
                seen_incident_ids.add(incident["incident_id"])
                incidents.append(incident)

        return incidents

    def _build_incident_doc(
        self,
        pattern: CorrelationPattern,
        entity_value: str,
        matched_alerts: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        matched_alerts = sorted(matched_alerts, key=lambda a: a.get("timestamp", ""))

        span_start = matched_alerts[0]["timestamp"]
        span_end = matched_alerts[-1]["timestamp"]

        # Deterministic ID: same pattern + entity + time span => same incident.
        id_material = f"{pattern.id}|{pattern.group_by}:{entity_value}|{span_start}|{span_end}"
        incident_id = f"INC-{hashlib.md5(id_material.encode()).hexdigest()[:10].upper()}"

        hosts = sorted({a.get("host") for a in matched_alerts if a.get("host")})
        users = sorted({a.get("user") for a in matched_alerts if a.get("user")})
        ips = sorted({a.get("ip") for a in matched_alerts if a.get("ip")})

        timeline = [
            {
                "timestamp": a.get("timestamp"),
                "rule_id": a.get("rule_id"),
                "rule_name": a.get("rule_name"),
                "event_type": (a.get("matched_log") or {}).get("event_type"),
                "severity": a.get("rule_severity"),
                "host": a.get("host"),
                "user": a.get("user"),
                "description": a.get("rule_description") or a.get("rule_name"),
            }
            for a in matched_alerts
        ]

        seen_rule_names = []
        for a in matched_alerts:
            name = a.get("rule_name") or a.get("rule_id")
            if name not in seen_rule_names:
                seen_rule_names.append(name)
        suspected_attack_chain = " -> ".join(seen_rule_names)

        mitre_techniques = list(dict.fromkeys(
            pattern.mitre_techniques + [t for a in matched_alerts for t in a.get("mitre_tags", [])]
        ))

        remediation_actions = list(dict.fromkeys(
            pattern.recommended_actions + [r for a in matched_alerts for r in a.get("remediation", [])]
        ))[:10]

        false_positives = list(dict.fromkeys(
            [fp for a in matched_alerts for fp in (a.get("false_positives") or [])]
        ))[:10]

        return {
            "incident_id": incident_id,
            "title": pattern.name,
            "pattern_name": pattern.name,
            "pattern_id": pattern.id,
            "description": pattern.description,
            "severity": pattern.severity,
            "status": "open",
            "timestamp": span_end,
            "first_seen": span_start,
            "last_seen": span_end,
            pattern.group_by: entity_value,
            "host": hosts[0] if hosts else None,
            "user": users[0] if users else None,
            "hosts": hosts,
            "users": users,
            "ips": ips,
            "affected_assets": {"hosts": hosts, "users": users, "ips": ips},
            "related_alerts": [a.get("rule_id") for a in matched_alerts],
            "related_alert_ids": [a.get("_id") for a in matched_alerts if a.get("_id")],
            "alert_count": len(matched_alerts),
            "timeline": timeline,
            "events": [a.get("matched_log") for a in matched_alerts if a.get("matched_log")],
            "suspected_attack_chain": suspected_attack_chain,
            "mitre_techniques": mitre_techniques,
            "recommended_actions": remediation_actions,
            "false_positives": false_positives,
        }

    def get_incidents(self, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Retrieve recent incidents.

        Args:
            hours: How many hours back to query

        Returns:
            List of incident documents
        """
        if not self.opensearch:
            logger.error("✗ OpenSearch client not available")
            return []

        try:
            now = datetime.utcnow()
            start_time = (now - timedelta(hours=hours)).isoformat() + "Z"

            query = {
                "query": {
                    "range": {
                        "timestamp": {
                            "gte": start_time,
                            "lte": now.isoformat() + "Z"
                        }
                    }
                },
                "size": 100,
                "sort": [{"timestamp": {"order": "desc"}}]
            }

            response = self.opensearch.search(index="incidents", body=query)
            return [hit["_source"] for hit in response.get("hits", {}).get("hits", [])]

        except Exception as e:
            logger.error(f"✗ Error retrieving incidents: {e}")
            return []

    def get_stats(self) -> Dict[str, Any]:
        """Get correlation engine statistics."""
        return {
            "patterns": len(self.patterns),
            "patterns_list": [
                {"id": p.id, "name": p.name, "severity": p.severity, "group_by": p.group_by}
                for p in self.patterns
            ]
        }


if __name__ == "__main__":
    import os
    import time

    # OpenSearch connection (use Docker service name)
    opensearch_host = os.environ.get("OPENSEARCH_HOST", "opensearch-node")
    opensearch_port = int(os.environ.get("OPENSEARCH_PORT", "9200"))

    logger.info(f"Connecting to OpenSearch at {opensearch_host}:{opensearch_port}")

    # Wait for OpenSearch to be ready
    max_retries = 30
    for attempt in range(max_retries):
        try:
            client = OpenSearch(
                hosts=[{"host": opensearch_host, "port": opensearch_port}],
                http_compress=True,
                use_ssl=False,
                verify_certs=False,
                timeout=30,
            )
            # Test connection
            info = client.info()
            logger.info(f"✓ Connected to OpenSearch: {info['version']['number']}")
            break
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"Waiting for OpenSearch... ({attempt + 1}/{max_retries})")
                time.sleep(2)
            else:
                logger.error(f"Failed to connect to OpenSearch after {max_retries} attempts: {e}")
                raise

    # Initialize Correlation Engine
    engine = CorrelationEngine(client)

    # Run correlation loop
    interval = int(os.environ.get("CORRELATION_INTERVAL", "15"))
    lookback = int(os.environ.get("CORRELATION_LOOKBACK", "30"))

    try:
        engine.run_correlation_loop(interval_seconds=interval, lookback_minutes=lookback)
    except KeyboardInterrupt:
        logger.info("Correlation engine shutting down...")
