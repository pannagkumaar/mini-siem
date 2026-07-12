"""AI SOC Agent tests: multi-provider detection and RCA fallback (template
mode - no API key, no network required for any test in this file)."""
import asyncio

import pytest


SAMPLE_INCIDENT = {
    "incident_id": "INC-TEST0001",
    "title": "Full Attack Chain: Initial Access to Exfiltration",
    "pattern_id": "CORR-006",
    "severity": "critical",
    "description": "End-to-end intrusion",
    "hosts": ["web-server-01"],
    "users": ["root"],
    "ips": ["203.0.113.45"],
    "suspected_attack_chain": "SSH Brute Force -> Successful Login -> Data Exfiltration",
    "mitre_techniques": ["T1110", "T1078", "T1041"],
    "recommended_actions": ["Isolate the host", "Rotate credentials"],
    "false_positives": [],
    "alert_count": 3,
    "first_seen": "2026-07-12T10:00:00Z",
    "last_seen": "2026-07-12T10:15:00Z",
    "timeline": [
        {"timestamp": "2026-07-12T10:00:00Z", "rule_id": "RULE-AUTH-001", "rule_name": "SSH Brute Force Attempt",
         "event_type": "login_failure", "severity": "high", "host": "web-server-01", "user": "root"},
    ],
}

RCA_SECTIONS = [
    "threat_summary", "root_cause_analysis", "evidence", "mitre_attack_mapping",
    "immediate_containment", "investigation_steps", "remediation",
    "false_positive_considerations", "prevention_measures",
]


def test_template_rca_used_without_api_key(agent_module):
    agent = agent_module.AISecurityAgent(opensearch_client=None, groq_api_key=None)
    rca = asyncio.run(agent.generate_incident_rca(SAMPLE_INCIDENT))
    assert rca["mode"] == "template"


def test_template_rca_has_all_required_sections(agent_module):
    agent = agent_module.AISecurityAgent(opensearch_client=None, groq_api_key=None)
    rca = asyncio.run(agent.generate_incident_rca(SAMPLE_INCIDENT))
    for section in RCA_SECTIONS:
        assert section in rca
        assert rca[section], f"section {section} is empty"


def test_template_rca_mentions_the_affected_host(agent_module):
    agent = agent_module.AISecurityAgent(opensearch_client=None, groq_api_key=None)
    rca = asyncio.run(agent.generate_incident_rca(SAMPLE_INCIDENT))
    assert "web-server-01" in rca["threat_summary"]


def test_template_rca_maps_mitre_ids_to_names(agent_module):
    agent = agent_module.AISecurityAgent(opensearch_client=None, groq_api_key=None)
    rca = asyncio.run(agent.generate_incident_rca(SAMPLE_INCIDENT))
    mapped_ids = {m["id"] for m in rca["mitre_attack_mapping"]}
    assert mapped_ids == set(SAMPLE_INCIDENT["mitre_techniques"])
    assert all(m["name"] for m in rca["mitre_attack_mapping"])


def test_rca_works_for_unknown_pattern_id(agent_module):
    """Incidents whose pattern_id isn't in TEMPLATE_NARRATIVES must still get
    a coherent RCA via the default narrative, not raise an exception."""
    agent = agent_module.AISecurityAgent(opensearch_client=None, groq_api_key=None)
    incident = dict(SAMPLE_INCIDENT, pattern_id="CORR-999-UNKNOWN")
    rca = asyncio.run(agent.generate_incident_rca(incident))
    assert rca["threat_summary"]


# ---------------------------------------------------------------------
# Multi-provider LLM detection (Groq / OpenAI / Anthropic / Gemini)
# ---------------------------------------------------------------------

ALL_PROVIDER_ENV_VARS = ["GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "AI_PROVIDER"]


@pytest.fixture
def clean_provider_env(monkeypatch):
    """Every provider-related env var starts unset for these tests, regardless
    of what's in the developer's shell or .env (which isn't auto-loaded)."""
    for var in ALL_PROVIDER_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    return monkeypatch


def test_no_keys_configured_means_no_provider(agent_module, clean_provider_env):
    agent = agent_module.AISecurityAgent(opensearch_client=None)
    assert agent.provider_name is None
    assert agent.groq_api_key is None


@pytest.mark.parametrize("env_var,expected_provider", [
    ("GROQ_API_KEY", "groq"),
    ("OPENAI_API_KEY", "openai"),
    ("ANTHROPIC_API_KEY", "anthropic"),
    ("GEMINI_API_KEY", "gemini"),
])
def test_each_provider_key_is_auto_detected(agent_module, clean_provider_env, env_var, expected_provider):
    clean_provider_env.setenv(env_var, "test-key")
    agent = agent_module.AISecurityAgent(opensearch_client=None)
    assert agent.provider_name == expected_provider
    assert agent.groq_api_key == "test-key"
    assert agent.model  # every provider has a non-empty default model


def test_ai_provider_env_var_overrides_priority_order(agent_module, clean_provider_env):
    clean_provider_env.setenv("GROQ_API_KEY", "g")
    clean_provider_env.setenv("ANTHROPIC_API_KEY", "a")
    clean_provider_env.setenv("AI_PROVIDER", "anthropic")
    agent = agent_module.AISecurityAgent(opensearch_client=None)
    assert agent.provider_name == "anthropic"


def test_explicit_groq_api_key_arg_forces_groq(agent_module, clean_provider_env):
    clean_provider_env.setenv("OPENAI_API_KEY", "o")
    agent = agent_module.AISecurityAgent(opensearch_client=None, groq_api_key="forced-key")
    assert agent.provider_name == "groq"
    assert agent.groq_api_key == "forced-key"


@pytest.mark.parametrize("provider,env_var,response_body,expected_text", [
    ("groq", "GROQ_API_KEY", {"choices": [{"message": {"content": "hi from groq"}}]}, "hi from groq"),
    ("openai", "OPENAI_API_KEY", {"choices": [{"message": {"content": "hi from openai"}}]}, "hi from openai"),
    ("anthropic", "ANTHROPIC_API_KEY", {"content": [{"type": "text", "text": "hi from claude"}]}, "hi from claude"),
    ("gemini", "GEMINI_API_KEY", {"candidates": [{"content": {"parts": [{"text": "hi from gemini"}]}}]}, "hi from gemini"),
])
def test_each_provider_adapter_parses_its_response_shape(
    agent_module, clean_provider_env, provider, env_var, response_body, expected_text
):
    """Each provider returns a differently-shaped response; _call_llm must
    normalize all of them down to plain text."""
    import aiohttp

    class FakeResponse:
        status = 200

        async def json(self):
            return response_body

        async def text(self):
            return str(response_body)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    class FakeSession:
        def post(self, url, headers=None, json=None, timeout=None):
            return FakeResponse()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

    clean_provider_env.setenv(env_var, "test-key")
    agent = agent_module.AISecurityAgent(opensearch_client=None)
    assert agent.provider_name == provider

    original_session = aiohttp.ClientSession
    aiohttp.ClientSession = lambda: FakeSession()
    try:
        text = asyncio.run(agent._call_llm("system", "user"))
    finally:
        aiohttp.ClientSession = original_session

    assert text == expected_text
