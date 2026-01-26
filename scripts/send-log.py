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
    test_log = {
        "timestamp": "2026-01-25T15:00:00Z",
        "source": "test-script",
        "host": "localhost",
        "user": "testuser",
        "ip": "127.0.0.1",
        "event_type": "test_event",
        "severity": "low",
        "raw": {"message": "This is a test log from the send-log.py script."}
    }
    send_log(test_log)
