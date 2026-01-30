#!/usr/bin/env python3
"""
Continuous Log Generator for SIEM

Generates realistic security events at regular intervals to simulate
actual log ingestion and test detection/correlation engines.
"""

import requests
import json
import time
import random
from datetime import datetime, timedelta
import sys

# Color codes for terminal output
GREEN = '\033[92m'
YELLOW = '\033[93m'
RED = '\033[91m'
CYAN = '\033[36m'
RESET = '\033[0m'

API_URL = "http://localhost:8000/ingest"
BATCH_SIZE = 1
INTERVAL_SECONDS = 2

# Hosts in the network
HOSTS = [
    "web-server-01",
    "web-server-02",
    "db-server-01",
    "workstation-01",
    "workstation-02",
    "workstation-03",
    "firewall-01",
]

# Users
USERS = [
    "admin",
    "user1",
    "user2",
    "service_account",
    "guest",
]

# Realistic event types and their typical characteristics
EVENT_TEMPLATES = [
    {
        "event_type": "login_success",
        "severity": "low",
        "weight": 35,  # 35% probability
        "description": "Successful user login",
    },
    {
        "event_type": "login_failure",
        "severity": "medium",
        "weight": 20,
        "description": "Failed login attempt",
    },
    {
        "event_type": "process_create",
        "severity": "low",
        "weight": 12,
        "description": "Process creation detected",
    },
    {
        "event_type": "file_access",
        "severity": "low",
        "weight": 10,
        "description": "File accessed",
    },
    {
        "event_type": "file_modification",
        "severity": "medium",
        "weight": 5,
        "description": "File modified or deleted",
    },
    {
        "event_type": "network_connection",
        "severity": "low",
        "weight": 8,
        "description": "Network connection established",
    },
    {
        "event_type": "privilege_escalation",
        "severity": "critical",
        "weight": 3,
        "description": "Privilege escalation detected",
    },
    {
        "event_type": "suspicious_process",
        "severity": "high",
        "weight": 4,
        "description": "Suspicious process activity",
    },
    {
        "event_type": "registry_modification",
        "severity": "high",
        "weight": 2,
        "description": "Windows registry modification",
    },
    {
        "event_type": "service_installation",
        "severity": "high",
        "weight": 1,
        "description": "New service or driver installed",
    },
    {
        "event_type": "firewall_rule_change",
        "severity": "high",
        "weight": 1,
        "description": "Firewall rules modified",
    },
    {
        "event_type": "data_exfiltration",
        "severity": "critical",
        "weight": 2,
        "description": "Suspicious data transfer detected",
    },
    {
        "event_type": "command_execution",
        "severity": "medium",
        "weight": 3,
        "description": "Command-line or script execution",
    },
    {
        "event_type": "lateral_movement",
        "severity": "high",
        "weight": 2,
        "description": "Lateral movement detected",
    },
    {
        "event_type": "credential_dumping",
        "severity": "critical",
        "weight": 1,
        "description": "Credential dumping attempt",
    },
]

def log_info(emoji, message):
    """Print an info message with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [INFO] {emoji} {GREEN}{message}{RESET}")

def log_error(message):
    """Print an error message with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [ERROR] ✗ {RED}{message}{RESET}")

def log_success(message):
    """Print a success message with timestamp"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [SUCCESS] ✓ {GREEN}{message}{RESET}")

def select_event_template():
    """Randomly select an event template weighted by probability"""
    total_weight = sum(t["weight"] for t in EVENT_TEMPLATES)
    choice = random.uniform(0, total_weight)
    current = 0
    
    for template in EVENT_TEMPLATES:
        current += template["weight"]
        if choice <= current:
            return template
    
    return EVENT_TEMPLATES[0]

def generate_log():
    """Generate a realistic log entry"""
    template = select_event_template()
    host = random.choice(HOSTS)
    user = random.choice(USERS)
    
    # Generate random IP in typical ranges
    ip_parts = [
        str(random.randint(10, 192)),
        str(random.randint(0, 255)),
        str(random.randint(0, 255)),
        str(random.randint(1, 254)),
    ]
    ip = ".".join(ip_parts)
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    # Enhanced metadata based on event type
    raw_data = {
        "description": template["description"],
    }
    
    if template["event_type"] == "process_create":
        raw_data.update({
            "process_name": random.choice(["svchost.exe", "powershell.exe", "cmd.exe", "explorer.exe", "chrome.exe", "notepad.exe"]),
            "process_id": random.randint(1000, 9999),
            "parent_process": random.choice(["explorer.exe", "svchost.exe", "system.exe"]),
            "command_line": f"process.exe --arg {random.choice(['malware', 'payload', 'config', 'update'])}"
        })
    elif template["event_type"] == "file_access":
        raw_data.update({
            "file_path": random.choice([
                "C:\\Windows\\System32\\config\\SAM",
                "C:\\Users\\Admin\\Documents\\passwords.txt",
                "/etc/passwd",
                "/etc/shadow",
                "C:\\sensitive_data.xlsx"
            ]),
            "access_type": random.choice(["read", "write", "execute", "delete"]),
        })
    elif template["event_type"] == "file_modification":
        raw_data.update({
            "file_path": random.choice([
                "C:\\Windows\\System32\\drivers\\etc\\hosts",
                "C:\\boot.ini",
                "/etc/sudoers",
                "C:\\Windows\\registry.dat"
            ]),
            "modification_type": random.choice(["created", "modified", "deleted"]),
        })
    elif template["event_type"] == "network_connection":
        raw_data.update({
            "source_ip": ip,
            "destination_ip": random.choice(["192.168.1.1", "10.0.0.1", "8.8.8.8", "1.1.1.1"]),
            "destination_port": random.choice([22, 443, 445, 3389, 4444, 8080, 9001]),
            "protocol": random.choice(["TCP", "UDP", "ICMP"]),
        })
    elif template["event_type"] == "privilege_escalation":
        raw_data.update({
            "privilege_level": random.choice(["user to admin", "user to system", "admin to system"]),
            "method": random.choice(["UAC bypass", "kernel exploit", "service hijacking"]),
        })
    elif template["event_type"] == "suspicious_process":
        raw_data.update({
            "process_name": random.choice(["mimikatz.exe", "psexec.exe", "certutil.exe", "regedit.exe", "taskkill.exe"]),
            "severity_reason": random.choice(["known malware", "living off the land", "obfuscated", "unsigned"]),
        })
    elif template["event_type"] == "registry_modification":
        raw_data.update({
            "registry_path": random.choice([
                "HKLM\\Software\\Microsoft\\Windows\\Run",
                "HKCU\\Software\\Microsoft\\Windows\\Run",
                "HKLM\\System\\CurrentControlSet\\Services"
            ]),
            "registry_key": "MaliciousKey",
            "registry_value": "C:\\malware.exe",
        })
    elif template["event_type"] == "service_installation":
        raw_data.update({
            "service_name": random.choice(["WinDefender", "SecurityService", "SystemUpdate"]),
            "service_path": "C:\\Windows\\System32\\malicious.exe",
            "start_type": random.choice(["Automatic", "Manual", "Disabled"]),
        })
    elif template["event_type"] == "data_exfiltration":
        raw_data.update({
            "data_size_mb": random.randint(1, 500),
            "destination": random.choice(["unknown.com", "malicious-server.net", "c2-server.io"]),
            "protocol": random.choice(["HTTP", "HTTPS", "DNS", "ICMP"]),
        })
    elif template["event_type"] == "command_execution":
        raw_data.update({
            "shell": random.choice(["cmd.exe", "powershell.exe", "bash", "sh"]),
            "command": random.choice([
                "whoami",
                "ipconfig",
                "net user admin password",
                "systeminfo",
                "tasklist"
            ]),
        })
    elif template["event_type"] == "lateral_movement":
        raw_data.update({
            "source_host": host,
            "target_host": random.choice(HOSTS),
            "method": random.choice(["SMB", "RDP", "SSH", "WinRM"]),
        })
    elif template["event_type"] == "credential_dumping":
        raw_data.update({
            "tool": random.choice(["mimikatz", "gsecdump", "pwdump", "secretsdump.py"]),
            "target": random.choice(["SAM", "NTDS.dit", "LSA secrets"]),
        })
    
    # Assign appropriate source based on host type and event
    if "windows" in template["event_type"] or "registry" in template["event_type"] or host.startswith("workstation") or "powershell" in str(raw_data):
        source = "windows"
    elif host.startswith("firewall"):
        source = "firewall"
    elif "network" in template["event_type"]:
        source = "network"
    else:
        # Default to windows for most security events
        source = "windows"
    
    log = {
        "timestamp": timestamp,
        "source": source,
        "host": host,
        "user": user,
        "ip": ip,
        "event_type": template["event_type"],
        "severity": template["severity"],
        "raw": raw_data
    }
    
    return log

def send_logs(logs):
    """Send logs to the ingestion API"""
    try:
        headers = {"Content-Type": "application/json"}
        
        # Send as batch if multiple logs, or single if just one
        if len(logs) == 1:
            payload = logs[0]
        else:
            payload = logs
        
        response = requests.post(API_URL, headers=headers, json=payload, timeout=5)
        response.raise_for_status()
        
        return True, response.json()
    except requests.exceptions.RequestException as e:
        return False, str(e)

def main():
    """Main log generation loop"""
    log_info("[START]", f"Log Generator Started - Sending {BATCH_SIZE} log(s) every {INTERVAL_SECONDS}s")
    log_info("[URL]", f"API URL: {API_URL}")
    
    count = 0
    failed = 0
    
    try:
        for i in range(69):
            # Generate batch of logs
            logs = [generate_log() for _ in range(BATCH_SIZE)]
            
            # Send logs
            success, response = send_logs(logs)
            
            if success:
                count += len(logs)
                log_success(f"Sent {len(logs)} log(s) - Total: {count} | Events: {[l['event_type'] for l in logs]}")
            else:
                failed += 1
                log_error(f"Failed to send logs (attempt {failed}): {response}")
            
            time.sleep(INTERVAL_SECONDS)
    
    except KeyboardInterrupt:
        log_info("[STOP]", f"Generator stopped - Total logs sent: {count}, Failed: {failed}")
        sys.exit(0)

if __name__ == "__main__":
    main()
