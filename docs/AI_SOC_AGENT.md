# AI SOC Agent

`ingestion/api-python/ai_agent/agent.py` provides two capabilities:

1. **Per-alert analysis** (`POST /ai/analyze/{alert_id}`) - existing feature, requires `GROQ_API_KEY`.
2. **Per-incident root cause analysis** (`POST /ai/rca/{incident_id}`) - works with or without an API key.

## Two modes

### LLM mode

Used automatically when `GROQ_API_KEY` is set (in `.env` or the environment). Calls Groq's `llama-3.3-70b-versatile` with the incident's title, severity, attack chain, affected assets, MITRE techniques, and timeline, and asks for a JSON object with the RCA sections below. If the call fails or returns malformed JSON, the agent **automatically falls back to template mode** rather than erroring out.

### Template mode (no API key required)

A deterministic, rule-based RCA generator. Pattern-specific narratives (keyed by the incident's `pattern_id`, e.g. `CORR-006`) are combined with data already computed by the correlation engine (timeline, MITRE techniques, recommended actions, false positives) to produce a complete, incident-specific RCA with zero external calls. This is what runs by default and what powers `demo.sh`/`demo.bat` out of the box.

## RCA schema

Both modes return the same shape:

```json
{
  "incident_id": "INC-...",
  "mode": "llm | template",
  "ai_model": "llama-3.3-70b-versatile | template-fallback-v1",
  "generated_at": "ISO8601",
  "threat_summary": "...",
  "root_cause_analysis": "...",
  "evidence": ["..."],
  "mitre_attack_mapping": [{"id": "T1110", "name": "Brute Force", "description": "..."}],
  "immediate_containment": ["..."],
  "investigation_steps": ["..."],
  "remediation": ["..."],
  "false_positive_considerations": ["..."],
  "prevention_measures": ["..."]
}
```

## Endpoints

- `POST /ai/rca/{incident_id}` - generate (or return cached) RCA. `?force=true` regenerates.
- `GET /ai/rca/{incident_id}` - fetch a previously generated RCA without triggering a new one.

RCAs are cached in the `ai_rca` OpenSearch index, keyed by `incident_id`, so repeated requests are free.

## Try it without Docker

```python
import asyncio
from ai_agent.agent import AISecurityAgent

agent = AISecurityAgent(opensearch_client=None, groq_api_key=None)  # template mode
rca = asyncio.run(agent.generate_incident_rca(my_incident_dict))
```

`scripts/generate_incident_report.py --offline` does exactly this to produce `outputs/sample_ai_rca_report.md` without any live services.
