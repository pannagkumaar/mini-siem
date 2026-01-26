import requests
import time

OPENSEARCH_HOST = "http://localhost:9200"
INDICES = ["logs", "alerts", "incidents"]

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
        else:
            create_index(index)
    print("Database initialization complete.")

if __name__ == "__main__":
    main()
