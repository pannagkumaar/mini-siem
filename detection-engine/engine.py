"""
Detection Engine for SIEM

Loads Sigma-like YAML rules (single-event, threshold/aggregation, and
correlation-only sequence rules) and evaluates them against normalized logs
to generate alerts.

Rule directories:
  - rules/                  (categorized rule pack: auth/, web/, endpoint/, cloud/)
  - detection-engine/rules/ (legacy DET-* rules, kept for backward compatibility)

Rule types:
  - single:    matches an individual log entry (default when a rule has a
               "condition" block and no "threshold").
  - threshold: matches when N+ logs satisfying "condition" share the same
               group_by value within window_minutes (Sigma-style aggregation).
  - sequence:  multi-step, ordered pattern across event types. These rules
               are NOT evaluated here - they are consumed by the correlation
               engine, which turns them into incidents.
"""

import os
import json
import re
import yaml
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional, Callable, Union
from pathlib import Path
from collections import defaultdict
from opensearchpy import OpenSearch

# Setup enhanced logging
class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors"""
    COLORS = {
        'DEBUG': '\033[36m',
        'INFO': '\033[92m',
        'WARNING': '\033[93m',
        'ERROR': '\033[91m',
        'CRITICAL': '\033[95m',
    }
    RESET = '\033[0m'

    def format(self, record):
        levelname = record.levelname
        color = self.COLORS.get(levelname, self.RESET)
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        message = super().format(record)
        return f"{color}[{timestamp}] [{levelname:8s}]{self.RESET} {message}"

logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(ColoredFormatter())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


# Operators recognized inside a condition leaf, e.g. {"contains": "powershell"}
_OPERATORS = {"contains", "regex", "in", "not", "gt", "gte", "lt", "lte", "exists"}


def utcnow() -> datetime:
    """Naive UTC datetime, matching the (deprecated) utcnow()
    return shape so every existing `.isoformat() + "Z"` call site keeps
    producing correct ISO8601 strings without using the deprecated API."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_nested_value(obj: Any, dotted_path: str) -> Any:
    """Look up a (possibly dotted) field path inside a dict, e.g. 'raw.process_name'."""
    cursor = obj
    for part in dotted_path.split("."):
        if not isinstance(cursor, dict) or part not in cursor:
            return None
        cursor = cursor[part]
    return cursor


def _is_operator_dict(d: Dict[str, Any]) -> bool:
    return bool(d) and all(str(k).lower() in _OPERATORS for k in d.keys())


def _expand_dotted_keys(condition: Any) -> Any:
    """Expand dotted keys like 'raw.process_name' into nested dicts so that
    both dotted and nested-dict rule styles are supported uniformly."""
    if not isinstance(condition, dict):
        return condition

    if _is_operator_dict(condition):
        return condition

    result: Dict[str, Any] = {}
    for key, value in condition.items():
        expanded_value = _expand_dotted_keys(value)
        if "." in key:
            parts = key.split(".")
            cursor = result
            for part in parts[:-1]:
                cursor = cursor.setdefault(part, {})
            cursor[parts[-1]] = expanded_value
        else:
            result[key] = expanded_value
    return result


class DetectionRule:
    """Represents a single detection rule (single-event or threshold)."""

    def __init__(self, rule_dict: Dict[str, Any], source_file: Optional[str] = None):
        self.id = rule_dict.get("id", "UNKNOWN")
        self.name = rule_dict.get("name", "Unnamed Rule")
        self.description = rule_dict.get("description", "")
        self.condition = _expand_dotted_keys(rule_dict.get("condition", {}))
        self.severity = rule_dict.get("severity", "medium")
        self.log_source = rule_dict.get("log_source", "any")
        self.threshold = rule_dict.get("threshold")
        self.rule_type = rule_dict.get("type") or ("threshold" if self.threshold else "single")
        self.false_positives = rule_dict.get("false_positives", [])
        self.remediation = rule_dict.get("remediation", [])
        self.sample_log = rule_dict.get("sample_log")
        self.source_file = source_file

        # MITRE ATT&CK techniques - support both the new "mitre_technique"
        # (list of {id, name}) and the legacy "mitre_tag" (list of ids) formats.
        mitre_technique = rule_dict.get("mitre_technique")
        legacy_tags = rule_dict.get("mitre_tag", [])
        if mitre_technique:
            self.mitre_techniques = [
                t if isinstance(t, dict) else {"id": t, "name": ""}
                for t in mitre_technique
            ]
        else:
            self.mitre_techniques = [{"id": t, "name": ""} for t in legacy_tags]
        self.mitre_tags = [t["id"] for t in self.mitre_techniques]

        self.raw = rule_dict

    def __repr__(self):
        return f"<Rule {self.id}: {self.name} ({self.rule_type})>"

    def is_sequence(self) -> bool:
        return "sequence" in self.raw

    def _match_value(self, expected: Any, actual: Any) -> bool:
        if isinstance(expected, dict):
            if _is_operator_dict(expected):
                for operator, operand in expected.items():
                    operator = operator.lower()
                    if operator == "contains":
                        if operand is None or actual is None or str(operand).lower() not in str(actual).lower():
                            return False
                    elif operator == "regex":
                        if actual is None or not re.search(operand, str(actual), re.IGNORECASE):
                            return False
                    elif operator == "in":
                        candidates = [str(c).lower() for c in operand]
                        if actual is None or str(actual).lower() not in candidates:
                            return False
                    elif operator == "not":
                        if actual == operand:
                            return False
                    elif operator == "exists":
                        if bool(operand) != (actual is not None):
                            return False
                    elif operator in ("gt", "gte", "lt", "lte"):
                        try:
                            a, b = float(actual), float(operand)
                        except (TypeError, ValueError):
                            return False
                        if operator == "gt" and not a > b:
                            return False
                        if operator == "gte" and not a >= b:
                            return False
                        if operator == "lt" and not a < b:
                            return False
                        if operator == "lte" and not a <= b:
                            return False
                return True
            # Nested field match
            if not isinstance(actual, dict):
                return False
            return self._match_dict(expected, actual)
        if isinstance(expected, list):
            return actual in expected
        if isinstance(expected, str) and isinstance(actual, str):
            return expected.lower() == actual.lower()
        return actual == expected

    def _match_dict(self, condition: Dict[str, Any], log: Dict[str, Any]) -> bool:
        for field, expected in condition.items():
            if not isinstance(log, dict) or field not in log:
                return False
            if not self._match_value(expected, log[field]):
                return False
        return True

    def evaluate(self, log: Dict[str, Any]) -> bool:
        """Evaluate the rule's condition against a normalized log entry."""
        if not self.condition:
            return False
        try:
            return self._match_dict(self.condition, log)
        except Exception as e:
            logger.error(f"✗ Error evaluating condition for {self.id}: {e}")
            return False

    def generate_alert(
        self,
        log: Dict[str, Any],
        threshold_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Generate an alert document when the rule matches (a log, or a group of logs)."""
        alert = {
            "timestamp": utcnow().isoformat() + "Z",
            "rule_id": self.id,
            "rule_name": self.name,
            "rule_description": self.description,
            "rule_severity": self.severity,
            "rule_type": self.rule_type,
            "log_source": self.log_source,
            "matched_log": log,
            "source": log.get("source"),
            "host": log.get("host"),
            "user": log.get("user"),
            "ip": log.get("ip"),
            "mitre_tags": self.mitre_tags,
            "mitre_techniques": self.mitre_techniques,
            "false_positives": self.false_positives,
            "remediation": self.remediation,
        }
        if threshold_context:
            alert["threshold_context"] = threshold_context
        return alert


class DetectionEngine:
    """
    Detection Engine that loads rules and evaluates them against logs.
    """

    def __init__(
        self,
        opensearch_client: OpenSearch,
        rules_dir: Union[str, List[str]] = None,
    ):
        self.opensearch = opensearch_client
        if rules_dir is None:
            # Resolve relative to this file's location (not cwd) so the engine
            # finds the rule pack whether it's run from the repo root, from
            # detection-engine/ directly, or inside a Docker container.
            base_dir = Path(__file__).resolve().parent
            repo_root = base_dir.parent
            rules_dirs = [str(repo_root / "rules"), str(base_dir / "rules")]
        elif isinstance(rules_dir, str):
            rules_dirs = [rules_dir]
        else:
            rules_dirs = list(rules_dir)
        self.rules_dirs = rules_dirs
        self.rules: List[DetectionRule] = []
        self.sequence_rules: List[DetectionRule] = []
        self._last_processed_timestamp: Optional[str] = None
        self._recent_threshold_alerts: Dict[str, datetime] = {}
        self.load_rules()

    def load_rules(self):
        """Load all YAML rules from the configured rule directories (recursively)."""
        self.rules = []
        self.sequence_rules = []
        seen_ids = set()

        for rules_dir in self.rules_dirs:
            rules_path = Path(rules_dir)
            if not rules_path.exists():
                logger.warning(f"Rules directory not found: {rules_dir}")
                continue

            yaml_files = sorted(set(rules_path.rglob("*.yaml")) | set(rules_path.rglob("*.yml")))

            for rule_file in yaml_files:
                try:
                    with open(rule_file, "r") as f:
                        rule_dict = yaml.safe_load(f)
                    if not rule_dict:
                        continue

                    rule = DetectionRule(rule_dict, source_file=str(rule_file))

                    if rule.id in seen_ids:
                        logger.warning(f"Duplicate rule id {rule.id} in {rule_file}, skipping")
                        continue
                    seen_ids.add(rule.id)

                    if rule.is_sequence() and not rule.condition:
                        # Sequence-only rules are consumed by the correlation engine.
                        self.sequence_rules.append(rule)
                        continue

                    self.rules.append(rule)
                    logger.info(f"Loaded rule: {rule}")
                except Exception as e:
                    logger.error(f"Failed to load rule from {rule_file}: {e}")

        logger.info(
            f"Loaded {len(self.rules)} detection rules "
            f"({len(self.sequence_rules)} sequence rules deferred to correlation engine)"
        )

    def detect(self, log: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Evaluate all single-event rules against one log entry.

        Args:
            log: Normalized log entry

        Returns:
            List of alerts generated (may be empty if no rules match)
        """
        alerts = []

        for rule in self.rules:
            if rule.threshold:
                continue
            try:
                if rule.evaluate(log):
                    alert = rule.generate_alert(log)
                    alerts.append(alert)
                    logger.info(
                        f"🚨 ALERT: {rule.id} matched | Host: {log.get('host', 'unknown'):15} | "
                        f"Event: {log.get('event_type', 'unknown'):15} | Severity: {rule.severity.upper()}"
                    )
            except Exception as e:
                logger.error(f"✗ Error evaluating rule {rule.id}: {e}")

        return alerts

    def detect_thresholds(self, logs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Evaluate threshold/aggregation rules across a batch of logs.

        A threshold rule fires once per (rule, group_by value) when the number
        of matching logs reaches `threshold.count` inside the batch. A short
        in-memory cool-down (threshold.window_minutes) prevents the same
        group from re-alerting every detection cycle.
        """
        alerts = []
        now = utcnow()

        for rule in self.rules:
            if not rule.threshold:
                continue

            group_field = rule.threshold.get("group_by", "host")
            min_count = rule.threshold.get("count", 5)
            window_minutes = rule.threshold.get("window_minutes", 5)

            groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
            for log in logs:
                try:
                    if rule.evaluate(log):
                        key = get_nested_value(log, group_field) or "unknown"
                        groups[key].append(log)
                except Exception as e:
                    logger.error(f"✗ Error evaluating threshold rule {rule.id}: {e}")

            for group_value, matched_logs in groups.items():
                if len(matched_logs) < min_count:
                    continue

                cooldown_key = f"{rule.id}:{group_value}"
                last_alerted = self._recent_threshold_alerts.get(cooldown_key)
                if last_alerted and (now - last_alerted) < timedelta(minutes=window_minutes):
                    continue

                self._recent_threshold_alerts[cooldown_key] = now
                latest_log = max(matched_logs, key=lambda l: l.get("timestamp", ""))
                alert = rule.generate_alert(
                    latest_log,
                    threshold_context={
                        "group_by_field": group_field,
                        "group_by_value": group_value,
                        "matched_count": len(matched_logs),
                        "required_count": min_count,
                        "window_minutes": window_minutes,
                        "sample_event_ids": [l.get("timestamp") for l in matched_logs[:10]],
                    },
                )
                alerts.append(alert)
                logger.info(
                    f"🚨 THRESHOLD ALERT: {rule.id} matched | {group_field}={group_value} | "
                    f"{len(matched_logs)}/{min_count} events | Severity: {rule.severity.upper()}"
                )

        return alerts

    def run_detection_loop(self, interval_seconds: int = 10, lookback_minutes: int = 5):
        """
        Run a continuous detection loop that periodically checks new logs.

        Args:
            interval_seconds: How often to check for new logs
            lookback_minutes: How far back to look for new logs
        """
        import time

        logger.info(f"🔍 Detection Engine Started (checking every {interval_seconds}s, lookback {lookback_minutes}m)")

        while True:
            try:
                self.process_recent_logs(lookback_minutes)
                time.sleep(interval_seconds)
            except Exception as e:
                logger.error(f"✗ Error in detection loop: {e}")
                time.sleep(interval_seconds)

    def process_recent_logs(self, lookback_minutes: int = 5):
        """
        Query recent logs and run detection rules (single-event + threshold) against them.

        Args:
            lookback_minutes: How far back to query
        """
        if not self.opensearch:
            logger.error("OpenSearch client not available")
            return

        try:
            now = utcnow()
            lookback_start = (now - timedelta(minutes=lookback_minutes)).isoformat() + "Z"
            # Use a cursor so the same log isn't re-evaluated (and re-alerted)
            # on every detection cycle when the lookback window overlaps.
            start_time = self._last_processed_timestamp or lookback_start
            if start_time < lookback_start:
                start_time = lookback_start

            query = {
                "query": {
                    "range": {
                        "timestamp": {
                            "gt": start_time,
                            "lte": now.isoformat() + "Z"
                        }
                    }
                },
                "size": 1000,
                "sort": [{"timestamp": {"order": "asc"}}]
            }

            response = self.opensearch.search(index="logs", body=query)
            hits = response.get("hits", {}).get("hits", [])

            if not hits:
                logger.debug(f"No new logs since {start_time}")
                return

            logs = [hit["_source"] for hit in hits]
            self._last_processed_timestamp = max(l.get("timestamp", now.isoformat() + "Z") for l in logs)

            logger.info(f"Processing {len(logs)} logs for detection")

            all_alerts = []
            for log in logs:
                all_alerts.extend(self.detect(log))
            all_alerts.extend(self.detect_thresholds(logs))

            for alert in all_alerts:
                try:
                    self.opensearch.index(index="alerts", body=alert, refresh=True)
                except Exception as e:
                    logger.error(f"Failed to index alert: {e}")

        except Exception as e:
            logger.error(f"Error processing recent logs: {e}")

    def get_rule_stats(self) -> Dict[str, Any]:
        """Get statistics about loaded rules."""
        severity_counts = {}
        for rule in self.rules:
            severity = rule.severity
            severity_counts[severity] = severity_counts.get(severity, 0) + 1

        return {
            "total_rules": len(self.rules),
            "sequence_rules": len(self.sequence_rules),
            "by_severity": severity_counts,
            "rules": [
                {
                    "id": r.id,
                    "name": r.name,
                    "description": r.description,
                    "severity": r.severity,
                    "type": r.rule_type,
                    "log_source": r.log_source,
                    "condition": r.condition,
                    "threshold": r.threshold,
                    "mitre_tag": r.mitre_tags,
                    "mitre_techniques": r.mitre_techniques,
                    "false_positives": r.false_positives,
                    "remediation": r.remediation,
                }
                for r in self.rules
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

    # Initialize Detection Engine (defaults to loading rules/ + detection-engine/rules/)
    rules_dir_env = os.environ.get("RULES_DIR")
    engine = DetectionEngine(client, rules_dir=rules_dir_env.split(",") if rules_dir_env else None)

    # Run detection loop
    interval = int(os.environ.get("DETECTION_INTERVAL", "10"))
    lookback = int(os.environ.get("DETECTION_LOOKBACK", "5"))

    try:
        engine.run_detection_loop(interval_seconds=interval, lookback_minutes=lookback)
    except KeyboardInterrupt:
        logger.info("Detection engine shutting down...")
