import requests
import time

OPENSEARCH_HOST = "http://localhost:9200"
INDICES = ["logs", "alerts", "incidents", "ai_analyses", "response_actions"]

# A simple mapping for the logs index to ensure timestamp is handled correctly
LOGS_MAPPING = {
    "properties": {
        "timestamp": {"type": "date"},
        "source": {"type": "keyword"},
        "host": {"type": "keyword"},
        "user": {"type": "keyword"},
        "ip": {"type": "ip"},
        "event_type": {"type": "keyword"},
        "severity": {"type": "keyword"},
        "raw": {
            "type": "object",
            "enabled": False  # Raw log can be schemaless, disable dynamic mapping
        }
    }
}

AI_ANALYSES_MAPPING = {
    "properties": {
        "alert_id": {"type": "keyword"},
        "analysis": {
            "type": "object",
            "properties": {
                "threat_assessment": {"type": "text"},
                "root_cause": {"type": "text"},
                "immediate_actions": {"type": "text"},
                "investigation_steps": {"type": "text"},
                "prevention_measures": {"type": "text"}
            }
        },
        "created_at": {"type": "date"}
    }
}

# Explicit mapping so risk_score is numeric/sortable (dynamic mapping would
# otherwise infer it correctly too, but this guarantees it and documents the
# shape incidents are written in - see correlation-engine/risk.py).
INCIDENTS_MAPPING = {
    "properties": {
        "timestamp": {"type": "date"},
        "first_seen": {"type": "date"},
        "last_seen": {"type": "date"},
        "incident_id": {"type": "keyword"},
        "pattern_id": {"type": "keyword"},
        "severity": {"type": "keyword"},
        "status": {"type": "keyword"},
        "risk_score": {"type": "integer"},
        "risk_band": {"type": "keyword"},
        "host": {"type": "keyword"},
        "user": {"type": "keyword"},
        "ip": {"type": "keyword"},
    }
}

# Simulated SOAR response actions (block_ip/disable_user/isolate_host) - see
# POST /incidents/{id}/respond. Never touches a real system; this is purely
# a record of what an analyst triggered.
RESPONSE_ACTIONS_MAPPING = {
    "properties": {
        "incident_id": {"type": "keyword"},
        "action": {"type": "keyword"},
        "target": {"type": "keyword"},
        "status": {"type": "keyword"},
        "executed_at": {"type": "date"},
        "executed_by": {"type": "keyword"},
    }
}

def wait_for_opensearch():
    """Waits for OpenSearch to be available."""
    print("Waiting for OpenSearch to become available...")
    for _ in range(120): # Wait for up to 2 minutes
        try:
            response = requests.get(OPENSEARCH_HOST)
            if response.status_code == 200:
                print("OpenSearch is up and running!")
                return True
        except requests.exceptions.ConnectionError:
            pass
        time.sleep(1)
    print("Error: OpenSearch did not become available in time.")
    return False

def create_index(index_name, mapping=None):
    """Creates an index in OpenSearch."""
    url = f"{OPENSEARCH_HOST}/{index_name}"
    headers = {"Content-Type": "application/json"}
    
    try:
        # Check if the index already exists
        response = requests.head(url)
        if response.status_code == 200:
            print(f"Index '{index_name}' already exists.")
            return

        # Create the index
        if mapping:
            response = requests.put(url, headers=headers, json={"mappings": mapping})
        else:
            response = requests.put(url, headers=headers)

        response.raise_for_status() # Raise an exception for bad status codes
        print(f"Successfully created index '{index_name}'.")

    except requests.exceptions.RequestException as e:
        print(f"Error creating index '{index_name}': {e}")
        if e.response:
            print(f"Response: {e.response.text}")

def main():
    if not wait_for_opensearch():
        return

    print("Starting database initialization...")
    for index in INDICES:
        if index == "logs":
            create_index(index, LOGS_MAPPING)
        elif index == "ai_analyses":
            create_index(index, AI_ANALYSES_MAPPING)
        elif index == "incidents":
            create_index(index, INCIDENTS_MAPPING)
        elif index == "response_actions":
            create_index(index, RESPONSE_ACTIONS_MAPPING)
        else:
            create_index(index)
    print("Database initialization complete.")

if __name__ == "__main__":
    main()
