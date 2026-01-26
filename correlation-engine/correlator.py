"""
Correlation Engine for SIEM

Detects attack chains by linking related events across time, host, and user.
Generates incidents by identifying suspicious patterns in alerts.
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from collections import defaultdict
from opensearchpy import OpenSearch


class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors for better log readability."""
    
    COLORS = {
        'DEBUG': '\033[36m',    # Cyan
        'INFO': '\033[92m',     # Green
        'WARNING': '\033[93m',  # Yellow
        'ERROR': '\033[91m',    # Red
    }
    RESET = '\033[0m'
    
    def format(self, record):
        log_color = self.COLORS.get(record.levelname, self.RESET)
        record.msg = f"{log_color}{record.msg}{self.RESET}"
        return super().format(record)


# Configure logger with ColoredFormatter
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


class CorrelationPattern:
    """Represents a correlation pattern to detect attack chains."""
    
    def __init__(self, pattern_dict: Dict[str, Any]):
        self.id = pattern_dict.get("id", "UNKNOWN")
        self.name = pattern_dict.get("name", "Unnamed Pattern")
        self.description = pattern_dict.get("description", "")
        self.steps = pattern_dict.get("steps", [])
        self.time_window_minutes = pattern_dict.get("time_window_minutes", 15)
        self.severity = pattern_dict.get("severity", "high")
        self.raw = pattern_dict

    def __repr__(self):
        return f"<Pattern {self.id}: {self.name}>"


class CorrelationEngine:
    """
    Correlation Engine that detects attack chains in alerts.
    """
    
    def __init__(self, opensearch_client: OpenSearch):
        self.opensearch = opensearch_client
        self.patterns = self._default_patterns()

    def _default_patterns(self) -> List[CorrelationPattern]:
        """Define default correlation patterns for common attack chains."""
        return [
            CorrelationPattern({
                "id": "CORR-001",
                "name": "Brute Force + Successful Login + Escalation",
                "description": "Detects failed login attempts followed by successful login and privilege escalation",
                "steps": [
                    {"event_type": "login_failure", "min_count": 5, "window_minutes": 10},
                    {"event_type": "login_success", "window_minutes": 5},
                    {"event_type": "privilege_escalation", "window_minutes": 5},
                ],
                "time_window_minutes": 15,
                "severity": "critical",
            }),
            CorrelationPattern({
                "id": "CORR-002",
                "name": "Multiple Failed Logins",
                "description": "Detects multiple failed login attempts from the same user or host",
                "steps": [
                    {"event_type": "login_failure", "min_count": 5, "window_minutes": 15},
                ],
                "time_window_minutes": 15,
                "severity": "high",
            }),
            CorrelationPattern({
                "id": "CORR-003",
                "name": "Suspicious Process + Escalation",
                "description": "Detects suspicious process creation followed by privilege escalation",
                "steps": [
                    {"event_type": "process_create", "source": "windows"},
                    {"event_type": "privilege_escalation", "window_minutes": 2},
                ],
                "time_window_minutes": 5,
                "severity": "high",
            }),
        ]

    def run_correlation_loop(self, interval_seconds: int = 30, lookback_minutes: int = 15):
        """
        Run a continuous correlation loop that detects attack chains.
        
        Args:
            interval_seconds: How often to check for attack chains
            lookback_minutes: How far back to look for related alerts
        """
        import time
        
        logger.info(f"🔗 Correlation Engine Started (checking every {interval_seconds}s, lookback {lookback_minutes}m)")
        
        while True:
            try:
                self.correlate_recent_alerts(lookback_minutes)
                time.sleep(interval_seconds)
            except Exception as e:
                logger.error(f"✗ Error in correlation loop: {e}")
                time.sleep(interval_seconds)

    def correlate_recent_alerts(self, lookback_minutes: int = 15):
        """
        Query recent alerts and apply correlation patterns to detect incidents.
        
        Args:
            lookback_minutes: How far back to query
        """
        if not self.opensearch:
            logger.error("✗ OpenSearch client not available")
            return

        try:
            # Query alerts from the last N minutes
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
            alerts = [hit["_source"] for hit in response.get("hits", {}).get("hits", [])]

            if not alerts:
                logger.debug(f"No alerts in the last {lookback_minutes} minutes")
                return

            logger.info(f"🔍 Analyzing {len(alerts)} alerts for attack chains")

            # Group alerts by host and user
            alerts_by_host = defaultdict(list)
            alerts_by_user = defaultdict(list)

            for alert in alerts:
                host = alert.get("host", "unknown")
                user = alert.get("user", "unknown")
                alerts_by_host[host].append(alert)
                alerts_by_user[user].append(alert)

            # Check correlation patterns
            incidents = []

            for pattern in self.patterns:
                # For simple patterns, group by host/user and check
                for entity_value, entity_alerts in alerts_by_host.items():
                    incident = self._check_pattern_on_alerts(pattern, entity_alerts, entity_value, "host")
                    if incident:
                        incidents.append(incident)

                for entity_value, entity_alerts in alerts_by_user.items():
                    incident = self._check_pattern_on_alerts(pattern, entity_alerts, entity_value, "user")
                    if incident:
                        incidents.append(incident)

            # Index incidents
            for incident in incidents:
                try:
                    self.opensearch.index(index="incidents", body=incident, refresh=True)
                    severity = incident.get('severity', 'unknown').upper()
                    logger.info(f"🎯 INCIDENT: {incident['title']:40} | Pattern: {incident['pattern_id']:10} | Severity: {severity}")
                except Exception as e:
                    logger.error(f"✗ Failed to index incident: {e}")

        except Exception as e:
            logger.error(f"✗ Error correlating alerts: {e}")

    def _check_pattern_on_alerts(
        self, 
        pattern: CorrelationPattern, 
        alerts: List[Dict[str, Any]], 
        entity_value: str,
        entity_type: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Check if a correlation pattern matches a set of alerts.
        
        Args:
            pattern: The correlation pattern to check
            alerts: List of alerts to check against
            entity_value: The host/user value being checked
            entity_type: Either "host" or "user"
            
        Returns:
            An incident document if the pattern matches, None otherwise
        """
        if not alerts:
            return None

        # Sort alerts by timestamp
        sorted_alerts = sorted(alerts, key=lambda a: a.get("timestamp", ""))

        # Simple pattern matching: check if we have the right event types
        event_types = [alert.get("matched_log", {}).get("event_type") for alert in sorted_alerts]
        
        # Count occurrences of each event type
        event_type_counts = defaultdict(int)
        for et in event_types:
            if et:
                event_type_counts[et] += 1

        # Check if pattern requirements are met
        matches = True
        for step in pattern.steps:
            required_event_type = step.get("event_type")
            min_count = step.get("min_count", 1)

            if event_type_counts.get(required_event_type, 0) < min_count:
                matches = False
                break

        if not matches:
            return None

        # If pattern matched, create an incident
        return {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "pattern_id": pattern.id,
            "title": pattern.name,
            "description": pattern.description,
            "severity": pattern.severity,
            entity_type: entity_value,
            "related_alerts": [alert.get("rule_id") for alert in sorted_alerts],
            "alert_count": len(sorted_alerts),
            "status": "open",
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
                {"id": p.id, "name": p.name, "severity": p.severity}
                for p in self.patterns
            ]
        }
