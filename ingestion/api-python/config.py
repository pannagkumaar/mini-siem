"""
Typed configuration for the ingestion API.

Reads environment variables once at import time. Every setting has a default
that preserves the original zero-config demo behavior, so `docker-compose up`
with no `.env` file keeps working unchanged.
"""

import os
from dataclasses import dataclass, field
from typing import List


def _split_csv(value: str) -> List[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    opensearch_host: str = os.getenv("OPENSEARCH_HOST", "opensearch-node")
    opensearch_port: int = int(os.getenv("OPENSEARCH_PORT", "9200"))

    # CORS - defaults to the local React dev/demo origin only (see A1).
    cors_origins: List[str] = field(default_factory=lambda: _split_csv(
        os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
    ))

    # Optional write-endpoint auth - empty string disables auth entirely,
    # which is the default so the open demo keeps working (see A2).
    api_key: str = os.getenv("SIEM_API_KEY", "")

    # Whether this process should also run the detection/correlation
    # background loops itself. In docker-compose, standalone
    # detection-engine/correlation-engine containers already do this, so
    # compose sets this to "false" to avoid double-processing alerts (B2).
    # Defaults to "true" so a bare `uvicorn main:app` (no standalone
    # containers running) still detects and correlates on its own.
    run_engines_in_api: bool = os.getenv("RUN_ENGINES_IN_API", "true").lower() == "true"


settings = Settings()
