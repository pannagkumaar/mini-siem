"""AI SOC Agent RCA fallback tests (template mode - no API key, no network)."""
import asyncio


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
