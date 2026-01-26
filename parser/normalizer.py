"""
Log Normalization Module

Converts logs from various sources into the standardized SIEM schema:
{
  "timestamp": "ISO8601",
  "source": "windows|linux|firewall|app|network|custom",
  "host": "hostname",
  "user": "username",
  "ip": "ip_address",
  "event_type": "event_category",
  "severity": "low|medium|high|critical",
  "raw": {...}
}
"""

import re
from datetime import datetime
from typing import Dict, Any, Optional
from enum import Enum


class LogSource(Enum):
    """Supported log sources."""
    WINDOWS = "windows"
    LINUX = "linux"
    SYSLOG = "syslog"
    FIREWALL = "firewall"
    APP = "app"
    NETWORK = "network"
    CUSTOM = "custom"


class EventType(Enum):
    """Standardized event types."""
    PROCESS_CREATE = "process_create"
    PROCESS_TERMINATE = "process_terminate"
    LOGIN_SUCCESS = "login_success"
    LOGIN_FAILURE = "login_failure"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    FILE_ACCESS = "file_access"
    NETWORK_CONNECTION = "network_connection"
    DNS_QUERY = "dns_query"
    AUTH_FAILURE = "auth_failure"
    FIREWALL_ALLOW = "firewall_allow"
    FIREWALL_DENY = "firewall_deny"
    ALERT = "alert"
    ERROR = "error"
    INFO = "info"
    SYSLOG_EVENT = "syslog_event"


class Severity(Enum):
    """Standardized severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


def normalize_timestamp(timestamp_str: Optional[str]) -> str:
    """
    Parse various timestamp formats and return ISO8601 format.
    
    Args:
        timestamp_str: Timestamp in various formats
        
    Returns:
        ISO8601 formatted timestamp string
    """
    if not timestamp_str:
        return datetime.utcnow().isoformat() + "Z"

    try:
        # Try ISO8601 format first
        if "T" in timestamp_str:
            dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            return dt.isoformat()

        # Try common log formats
        formats = [
            "%Y-%m-%d %H:%M:%S",
            "%b %d %H:%M:%S",
            "%d/%b/%Y:%H:%M:%S",
        ]

        for fmt in formats:
            try:
                dt = datetime.strptime(timestamp_str, fmt)
                return dt.isoformat() + "Z"
            except ValueError:
                continue

        # If parsing fails, return current time
        return datetime.utcnow().isoformat() + "Z"

    except Exception:
        return datetime.utcnow().isoformat() + "Z"


def extract_ip_from_string(text: str) -> Optional[str]:
    """Extract first valid IPv4 address from text."""
    if not text:
        return None
    
    ip_pattern = r"(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)"
    match = re.search(ip_pattern, text)
    return match.group(0) if match else None


def normalize_windows_event(raw_log: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize Windows Event Log."""
    timestamp = normalize_timestamp(raw_log.get("TimeCreated"))
    
    # Determine event type from EventID
    event_id = raw_log.get("EventID", 0)
    event_type_map = {
        4688: EventType.PROCESS_CREATE.value,
        4689: EventType.PROCESS_TERMINATE.value,
        4624: EventType.LOGIN_SUCCESS.value,
        4625: EventType.LOGIN_FAILURE.value,
        4672: EventType.PRIVILEGE_ESCALATION.value,
        4656: EventType.FILE_ACCESS.value,
    }
    event_type = event_type_map.get(event_id, EventType.INFO.value)
    
    return {
        "timestamp": timestamp,
        "source": LogSource.WINDOWS.value,
        "host": raw_log.get("ComputerName", "unknown"),
        "user": raw_log.get("TargetUserName", raw_log.get("SubjectUserName", "unknown")),
        "ip": extract_ip_from_string(str(raw_log.get("IpAddress", ""))) or "0.0.0.0",
        "event_type": event_type,
        "severity": Severity.MEDIUM.value,
        "raw": raw_log,
    }


def normalize_linux_syslog(raw_log: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize Linux syslog messages."""
    timestamp = normalize_timestamp(raw_log.get("timestamp"))
    message = raw_log.get("message", "")
    
    # Determine event type from message patterns
    event_type = EventType.SYSLOG_EVENT.value
    if "sudo" in message.lower():
        event_type = EventType.PRIVILEGE_ESCALATION.value
    elif "Failed password" in message or "authentication failure" in message.lower():
        event_type = EventType.LOGIN_FAILURE.value
    elif "Accepted" in message or "session opened" in message.lower():
        event_type = EventType.LOGIN_SUCCESS.value
    
    return {
        "timestamp": timestamp,
        "source": LogSource.LINUX.value,
        "host": raw_log.get("hostname", "unknown"),
        "user": raw_log.get("user", "unknown"),
        "ip": extract_ip_from_string(message) or "0.0.0.0",
        "event_type": event_type,
        "severity": Severity.MEDIUM.value,
        "raw": raw_log,
    }


def normalize_firewall_log(raw_log: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize firewall logs."""
    timestamp = normalize_timestamp(raw_log.get("timestamp"))
    action = raw_log.get("action", "").lower()
    
    event_type = EventType.FIREWALL_ALLOW.value if action == "allow" else EventType.FIREWALL_DENY.value
    severity = Severity.HIGH.value if action == "deny" else Severity.LOW.value
    
    return {
        "timestamp": timestamp,
        "source": LogSource.FIREWALL.value,
        "host": raw_log.get("source_device", "unknown"),
        "user": "firewall",
        "ip": raw_log.get("source_ip", "0.0.0.0"),
        "event_type": event_type,
        "severity": severity,
        "raw": raw_log,
    }


def normalize_log(raw_log: Dict[str, Any], source_hint: Optional[str] = None) -> Dict[str, Any]:
    """
    Normalize a raw log to the standardized SIEM schema.
    
    Args:
        raw_log: Raw log dictionary
        source_hint: Optional hint about the log source (windows, linux, firewall, etc.)
        
    Returns:
        Normalized log dictionary
    """
    if not isinstance(raw_log, dict):
        raw_log = {"message": str(raw_log)}

    # Determine the source
    if source_hint:
        source_hint = source_hint.lower()
        if "windows" in source_hint or "event" in source_hint:
            return normalize_windows_event(raw_log)
        elif "linux" in source_hint or "syslog" in source_hint:
            return normalize_linux_syslog(raw_log)
        elif "firewall" in source_hint:
            return normalize_firewall_log(raw_log)

    # Auto-detect based on fields present
    if "EventID" in raw_log or "ComputerName" in raw_log:
        return normalize_windows_event(raw_log)
    elif "hostname" in raw_log or "tag" in raw_log:
        return normalize_linux_syslog(raw_log)
    elif "source_ip" in raw_log and "action" in raw_log:
        return normalize_firewall_log(raw_log)

    # Default normalization for unknown formats
    return {
        "timestamp": normalize_timestamp(raw_log.get("timestamp")),
        "source": LogSource.CUSTOM.value,
        "host": raw_log.get("host", raw_log.get("hostname", "unknown")),
        "user": raw_log.get("user", raw_log.get("username", "unknown")),
        "ip": extract_ip_from_string(str(raw_log.get("ip", ""))) or "0.0.0.0",
        "event_type": raw_log.get("event_type", EventType.INFO.value),
        "severity": raw_log.get("severity", Severity.MEDIUM.value),
        "raw": raw_log,
    }


def validate_normalized_log(log: Dict[str, Any]) -> tuple[bool, Optional[str]]:
    """
    Validate a normalized log against the schema.
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    required_fields = ["timestamp", "source", "host", "user", "ip", "event_type", "severity", "raw"]
    
    missing_fields = [f for f in required_fields if f not in log]
    if missing_fields:
        return False, f"Missing required fields: {missing_fields}"
    
    # Validate field types
    if not isinstance(log["timestamp"], str):
        return False, "timestamp must be a string (ISO8601 format)"
    
    if log["source"] not in [s.value for s in LogSource]:
        return False, f"Invalid source: {log['source']}"
    
    if log["event_type"] not in [e.value for e in EventType]:
        return False, f"Invalid event_type: {log['event_type']}"
    
    if log["severity"] not in [s.value for s in Severity]:
        return False, f"Invalid severity: {log['severity']}"
    
    return True, None
