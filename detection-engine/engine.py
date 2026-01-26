"""
Detection Engine for SIEM

Loads Sigma-like YAML rules and evaluates them against normalized logs
to generate alerts.
"""

import os
import json
import yaml
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from pathlib import Path
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


class DetectionRule:
    """Represents a single detection rule."""
    
    def __init__(self, rule_dict: Dict[str, Any]):
        self.id = rule_dict.get("id", "UNKNOWN")
        self.name = rule_dict.get("name", "Unnamed Rule")
        self.description = rule_dict.get("description", "")
        self.condition = rule_dict.get("condition", {})
        self.severity = rule_dict.get("severity", "medium")
        self.mitre_tags = rule_dict.get("mitre_tag", [])
        self.raw = rule_dict

    def __repr__(self):
        return f"<Rule {self.id}: {self.name}>"

    def evaluate(self, log: Dict[str, Any]) -> bool:
        """
        Evaluate the rule condition against a log entry.
        
        Condition matching logic:
        - All keys in condition must match the log
        - Supports exact match, contains, and regex patterns
        
        Args:
            log: Normalized log entry
            
        Returns:
            True if the rule matches the log
        """
        for field, value in self.condition.items():
            if field not in log:
                return False

            log_value = log[field]

            # Exact match
            if isinstance(value, (str, int, float, bool)):
                if log_value != value:
                    return False

            # Dictionary with operators (future: supports range, contains, etc.)
            elif isinstance(value, dict):
                for operator, operand in value.items():
                    if operator == "contains":
                        if operand not in str(log_value):
                            return False
                    elif operator == "regex":
                        import re
                        if not re.search(operand, str(log_value)):
                            return False
                    elif operator == "in":
                        if log_value not in operand:
                            return False

            # List (OR logic)
            elif isinstance(value, list):
                if log_value not in value:
                    return False

        return True

    def generate_alert(self, log: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate an alert when the rule matches a log.
        
        Args:
            log: Normalized log entry that triggered the alert
            
        Returns:
            Alert document ready to index
        """
        return {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "rule_id": self.id,
            "rule_name": self.name,
            "rule_severity": self.severity,
            "matched_log": log,
            "source": log.get("source"),
            "host": log.get("host"),
            "user": log.get("user"),
            "mitre_tags": self.mitre_tags,
        }


class DetectionEngine:
    """
    Detection Engine that loads rules and evaluates them against logs.
    """
    
    def __init__(self, opensearch_client: OpenSearch, rules_dir: str = "detection-engine/rules"):
        self.opensearch = opensearch_client
        self.rules_dir = rules_dir
        self.rules: List[DetectionRule] = []
        self.load_rules()

    def load_rules(self):
        """Load all YAML rules from the rules directory."""
        rules_path = Path(self.rules_dir)
        
        if not rules_path.exists():
            logger.warning(f"Rules directory not found: {self.rules_dir}")
            return

        yaml_files = list(rules_path.glob("*.yaml")) + list(rules_path.glob("*.yml"))
        
        for rule_file in yaml_files:
            try:
                with open(rule_file, "r") as f:
                    rule_dict = yaml.safe_load(f)
                    if rule_dict:
                        rule = DetectionRule(rule_dict)
                        self.rules.append(rule)
                        logger.info(f"Loaded rule: {rule}")
            except Exception as e:
                logger.error(f"Failed to load rule from {rule_file}: {e}")

        logger.info(f"Loaded {len(self.rules)} detection rules")

    def detect(self, log: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Evaluate all rules against a single log entry.
        
        Args:
            log: Normalized log entry
            
        Returns:
            List of alerts generated (may be empty if no rules match)
        """
        alerts = []
        
        for rule in self.rules:
            try:
                if rule.evaluate(log):
                    alert = rule.generate_alert(log)
                    alerts.append(alert)
                    logger.info(f"🚨 ALERT: {rule.id} matched | Host: {log.get('host', 'unknown'):15} | Event: {log.get('event_type', 'unknown'):15} | Severity: {rule.severity.upper()}")
            except Exception as e:
                logger.error(f"✗ Error evaluating rule {rule.id}: {e}")

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
        Query recent logs and run detection rules against them.
        
        Args:
            lookback_minutes: How far back to query
        """
        if not self.opensearch:
            logger.error("OpenSearch client not available")
            return

        try:
            # Query logs from the last N minutes
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
                "sort": [{"timestamp": {"order": "desc"}}]
            }

            response = self.opensearch.search(index="logs", body=query)
            hits = response.get("hits", {}).get("hits", [])

            if not hits:
                logger.debug(f"No new logs in the last {lookback_minutes} minutes")
                return

            logger.info(f"Processing {len(hits)} logs for detection")

            # Evaluate rules and index alerts
            for hit in hits:
                log = hit["_source"]
                alerts = self.detect(log)
                
                for alert in alerts:
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
            "by_severity": severity_counts,
            "rules": [
                {"id": r.id, "name": r.name, "severity": r.severity}
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
    
    # Initialize Detection Engine
    rules_dir = os.environ.get("RULES_DIR", "rules")
    engine = DetectionEngine(client, rules_dir=rules_dir)
    
    # Run detection loop
    interval = int(os.environ.get("DETECTION_INTERVAL", "10"))
    lookback = int(os.environ.get("DETECTION_LOOKBACK", "5"))
    
    try:
        engine.run_detection_loop(interval_seconds=interval, lookback_minutes=lookback)
    except KeyboardInterrupt:
        logger.info("Detection engine shutting down...")
