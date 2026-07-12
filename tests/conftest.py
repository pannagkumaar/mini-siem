"""
Shared pytest fixtures for Mini-SIEM.

The detection-engine/ and correlation-engine/ directories use hyphens (they
double as standalone Docker service roots), so they can't be imported with a
normal dotted `import`. We load them by file path instead - this mirrors
exactly how ingestion/api-python/main.py loads them via importlib at runtime.
"""
import importlib.util
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent


def _load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class _NoOpenSearch:
    """Stand-in for an OpenSearch client in tests that never hit the network."""
    pass


@pytest.fixture(scope="session")
def normalizer_module():
    return _load_module("siem_normalizer", REPO_ROOT / "parser" / "normalizer.py")


@pytest.fixture(scope="session")
def engine_module():
    return _load_module("siem_engine", REPO_ROOT / "detection-engine" / "engine.py")


@pytest.fixture(scope="session")
def correlator_module():
    return _load_module("siem_correlator", REPO_ROOT / "correlation-engine" / "correlator.py")


@pytest.fixture(scope="session")
def risk_module():
    return _load_module("siem_risk", REPO_ROOT / "correlation-engine" / "risk.py")


@pytest.fixture(scope="session")
def replay_module():
    return _load_module("siem_replay", REPO_ROOT / "scripts" / "replay_attack.py")


@pytest.fixture(scope="session")
def agent_module():
    return _load_module(
        "siem_agent", REPO_ROOT / "ingestion" / "api-python" / "ai_agent" / "agent.py"
    )


@pytest.fixture(scope="session")
def main_module():
    """
    Load ingestion/api-python/main.py once for the whole test session.

    main.py's own imports (`from config import settings`,
    `from parser.normalizer import ...`) assume the layout it runs under in
    Docker/uvicorn, where main.py, config.py, and parser/ all live directly
    under the working directory. Locally that layout is split between the
    repo root (parser/) and ingestion/api-python/ (main.py, config.py,
    ...), so both are added to sys.path first - this mirrors the Docker
    image's COPY layout (see ingestion/api-python/Dockerfile) without
    requiring Docker to run the test.

    Session-scoped and loaded exactly once: main.py registers Prometheus
    metrics (Counter/Gauge) into the global default CollectorRegistry at
    import time, and importing it a second time under a different module
    name would try to register the same metric names twice, which
    prometheus_client rejects with a "Duplicated timeseries" error.
    """
    api_dir = REPO_ROOT / "ingestion" / "api-python"
    for path in (str(REPO_ROOT), str(api_dir)):
        if path not in sys.path:
            sys.path.insert(0, path)
    return _load_module("siem_main", api_dir / "main.py")


@pytest.fixture
def detection_engine(engine_module):
    return engine_module.DetectionEngine(_NoOpenSearch())


@pytest.fixture
def correlation_engine(correlator_module):
    return correlator_module.CorrelationEngine(_NoOpenSearch())
