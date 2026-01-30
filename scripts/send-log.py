import requests
import json

def send_log(log_data):
    """Sends a log to the ingestion API."""
    url = "http://localhost:8000/ingest"
    headers = {"Content-Type": "application/json"}
    try:
        response = requests.post(url, headers=headers, data=json.dumps(log_data))
        response.raise_for_status()
        print("Log sent successfully.")
        print("Response:", response.json())
    except requests.exceptions.RequestException as e:
        print(f"Error sending log: {e}")

if __name__ == "__main__":
    # Test log that will trigger DET-001 (suspicious PowerShell)
    test_log = {
        "timestamp": "2026-01-30T15:00:00Z",
        "source": "windows",
        "host": "workstation-01",
        "user": "alice.smith",
        "ip": "10.0.1.100",
        "event_type": "process_create",
        "severity": "high",
        "raw": {
            "EventID": 4688,
            "ProcessName": "powershell.exe",
            "CommandLine": "powershell.exe -EncodedCommand SQBuAHYAbwBrAGUALQBXAGUAYgBSAGUAcQB1AGUAcwB0",
            "ParentProcessName": "cmd.exe",
            "LogonType": 3,
            "SubjectUserName": "alice.smith"
        }
    }
    send_log(test_log)
