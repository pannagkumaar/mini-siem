"""SOAR response-action stub tests (offline - no OpenSearch required)."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(main_module):
    # See tests/test_metrics.py's client fixture for why this is forced to
    # None rather than relying on ambient environment state.
    main_module.opensearch_client = None
    with TestClient(main_module.app) as test_client:
        yield test_client


def test_invalid_action_is_rejected(client):
    response = client.post(
        "/incidents/INC-TEST123/respond",
        json={"action": "launch_nukes", "target": "203.0.113.9"},
    )
    assert response.status_code == 400
    assert "block_ip" in response.json()["detail"]


def test_invalid_action_is_rejected_before_opensearch_check(client):
    # Validation happens before the OpenSearch availability check, so a bad
    # action is always a 400 regardless of backend state.
    response = client.post(
        "/incidents/INC-TEST123/respond",
        json={"action": "not-a-real-action", "target": "x"},
    )
    assert response.status_code == 400


def test_valid_action_without_opensearch_returns_503(client):
    response = client.post(
        "/incidents/INC-TEST123/respond",
        json={"action": "block_ip", "target": "203.0.113.9"},
    )
    assert response.status_code == 503


def test_responses_endpoint_returns_503_without_opensearch(client):
    response = client.get("/incidents/INC-TEST123/responses")
    assert response.status_code == 503
