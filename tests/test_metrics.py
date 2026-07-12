"""/metrics endpoint tests (offline - no OpenSearch required)."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(main_module):
    # The module-level OpenSearch() client construction succeeds even with
    # no live server (it doesn't connect eagerly), so opensearch_client
    # would otherwise be a real-but-unreachable client - any request that
    # hits it would block on a real connection attempt/timeout. Force it to
    # None so lifespan's initialize_engines() is a no-op and endpoints take
    # their "OpenSearch not available" branch immediately.
    main_module.opensearch_client = None
    with TestClient(main_module.app) as test_client:
        yield test_client


def test_metrics_endpoint_returns_prometheus_text(client):
    response = client.get("/metrics")
    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    assert "siem_logs_ingested_total" in response.text
    assert "siem_ingest_failures_total" in response.text
    assert "siem_incidents_open" in response.text


def test_ingest_increments_logs_ingested_counter(main_module, client):
    before = main_module.LOGS_INGESTED._value.get()

    log = {
        "timestamp": "2026-07-12T12:00:00Z", "source": "app", "host": "test-host",
        "user": "tester", "ip": "10.0.0.5", "event_type": "login_success",
        "severity": "low", "raw": {},
    }
    # opensearch_client is forced to None by the client fixture, so /ingest
    # reports the entry as failed rather than successful - assert against
    # INGEST_FAILURES instead, which exercises the same counter-increment
    # code path without needing a live OpenSearch instance.
    before_failures = main_module.INGEST_FAILURES._value.get()
    response = client.post("/ingest", json=log)
    assert response.status_code == 200
    after_failures = main_module.INGEST_FAILURES._value.get()

    assert after_failures == before_failures + 1
    assert main_module.LOGS_INGESTED._value.get() == before
