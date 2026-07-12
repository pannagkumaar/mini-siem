# AI SOC Agent

`ingestion/api-python/ai_agent/agent.py` provides two capabilities:

1. **Per-alert analysis** (`POST /ai/analyze/{alert_id}`) - requires an LLM provider key.
2. **Per-incident root cause analysis** (`POST /ai/rca/{incident_id}`) - works with or without one.

## Two modes

### LLM mode - multi-provider

The agent auto-detects whichever LLM provider key is set in the environment, in this order (first match wins):

| Provider | Env var | Default model |
|---|---|---|
| Groq | `GROQ_API_KEY` | `llama-3.3-70b-versatile` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | `claude-3-5-haiku-20241022` |
| Google Gemini | `GEMINI_API_KEY` | `gemini-1.5-flash` |

Set `AI_PROVIDER` (`groq` / `openai` / `anthropic` / `gemini`) to force a specific one when more than one key is present, and `{PROVIDER}_MODEL` (e.g. `ANTHROPIC_MODEL`) to override the default model. See `.env.example`.

Each provider speaks a different wire format under the hood (OpenAI-compatible chat completions for Groq/OpenAI, Anthropic's Messages API, Google's Generative Language API) - `_call_llm()` in `agent.py` dispatches to the right adapter and normalizes all of them down to plain text before the rest of the agent ever sees a response. If the call fails, times out, or returns malformed JSON, the agent **automatically falls back to template mode** rather than erroring out.

### Template mode (no API key required)

A deterministic, rule-based RCA generator. Pattern-specific narratives (keyed by the incident's `pattern_id`, e.g. `CORR-006`) are combined with data already computed by the correlation engine (timeline, MITRE techniques, recommended actions, false positives) to produce a complete, incident-specific RCA with zero external calls. This is what runs by default and what powers `demo.sh`/`demo.bat` out of the box.

## RCA schema

Both modes return the same shape:

```json
{
  "incident_id": "INC-...",
  "mode": "llm | template",
  "provider": "groq | openai | anthropic | gemini | null",
  "ai_model": "llama-3.3-70b-versatile | template-fallback-v1 | ...",
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

agent = AISecurityAgent(opensearch_client=None)  # auto-detects a provider key, or template mode if none set
rca = asyncio.run(agent.generate_incident_rca(my_incident_dict))
```

`scripts/generate_incident_report.py --offline` does exactly this to produce `outputs/sample_ai_rca_report.md` without any live services.

## Adding another provider

1. Add an `LLMProviderConfig(name, env_var, api_url, default_model)` entry to `LLM_PROVIDERS` in `agent.py`.
2. Add a `_call_<name>()` adapter that builds that provider's request shape and returns the plain-text completion.
3. Wire it into the `if self.provider_name == "..."` dispatch in `_call_llm()`.
4. Add the env var to `.env.example` and `docker-compose.yml`.
