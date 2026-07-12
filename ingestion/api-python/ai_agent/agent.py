"""
AI Agent for SIEM Alert Analysis

Analyzes security alerts and incidents and provides actionable incident
response recommendations. Supports multiple LLM providers - Groq, OpenAI,
Anthropic, and Google Gemini - auto-detected from whichever API key is
configured (see LLM_PROVIDERS below), with a deterministic template-based
fallback when none are available.
"""

import os
import json
import logging
import asyncio
import aiohttp
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Optional
from opensearchpy import OpenSearch

# Setup logging
class ColoredFormatter(logging.Formatter):
    """Custom formatter with colors"""
    COLORS = {
        'DEBUG': '\033[36m',
        'INFO': '\033[92m',
        'WARNING': '\033[93m',
        'ERROR': '\033[91m',
        'CRITICAL': '\033[95m',
    }
    RESET = '\033[0m'
    
    def format(self, record):
        levelname = record.levelname
        color = self.COLORS.get(levelname, self.RESET)
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        message = super().format(record)
        return f"{color}[{timestamp}] [{levelname:8s}]{self.RESET} {message}"

logger = logging.getLogger(__name__)
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(ColoredFormatter())
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


def utcnow() -> datetime:
    """Naive UTC datetime, matching the (deprecated) utcnow()
    return shape so every existing `.isoformat() + "Z"` call site keeps
    producing correct ISO8601 strings without using the deprecated API."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# Human-readable names for the MITRE ATT&CK technique IDs used across the
# rule pack, so template-mode RCAs don't have to show bare IDs.
MITRE_TECHNIQUE_NAMES = {
    "T1003": "OS Credential Dumping",
    "T1003.001": "OS Credential Dumping: LSASS Memory",
    "T1005": "Data from Local System",
    "T1020": "Automated Exfiltration",
    "T1021": "Remote Services",
    "T1027": "Obfuscated Files or Information",
    "T1036": "Masquerading",
    "T1041": "Exfiltration Over C2 Channel",
    "T1059": "Command and Scripting Interpreter",
    "T1059.001": "Command and Scripting Interpreter: PowerShell",
    "T1068": "Exploitation for Privilege Escalation",
    "T1071": "Application Layer Protocol",
    "T1078": "Valid Accounts",
    "T1078.001": "Valid Accounts: Default Accounts",
    "T1083": "File and Directory Discovery",
    "T1086": "PowerShell (legacy ID)",
    "T1098": "Account Manipulation",
    "T1110": "Brute Force",
    "T1110.001": "Brute Force: Password Guessing",
    "T1112": "Modify Registry",
    "T1133": "External Remote Services",
    "T1134": "Access Token Manipulation",
    "T1136": "Create Account",
    "T1187": "Forced Authentication",
    "T1190": "Exploit Public-Facing Application",
    "T1204": "User Execution",
    "T1204.002": "User Execution: Malicious File",
    "T1224": "Domain Trust Discovery",
    "T1530": "Data from Cloud Storage",
    "T1543": "Create or Modify System Process",
    "T1548": "Abuse Elevation Control Mechanism",
    "T1562": "Impair Defenses",
    "T1566": "Phishing",
    "T1570": "Lateral Tool Transfer",
    "T1572": "Protocol Tunneling",
    "T1580": "Cloud Infrastructure Discovery",
    "T1595": "Active Scanning",
    "T1595.002": "Active Scanning: Vulnerability Scanning",
}

# Narrative building blocks keyed by correlation pattern_id / rule_id, used
# by the deterministic template RCA fallback (no LLM required).
TEMPLATE_NARRATIVES = {
    "CORR-001": {
        "summary": "A brute-force attack against {entity} succeeded, followed by privilege escalation - indicating a full account compromise.",
        "root_cause": "The attacker repeatedly guessed credentials for {user_or_account} until authentication succeeded, then escalated privileges, gaining elevated access on {host_or_entity}.",
    },
    "RULE-AUTH-002": {
        "summary": "A successful login on {entity} occurred immediately after a burst of failed login attempts, suggesting the brute-force attack against this account succeeded.",
        "root_cause": "Weak or guessable credentials allowed an attacker to authenticate after repeated attempts. No account lockout or rate limiting stopped the attack before it succeeded.",
    },
    "CORR-002": {
        "summary": "A high volume of failed login attempts from {entity} was observed, consistent with an automated brute-force or credential-stuffing attack.",
        "root_cause": "An external or internal source is systematically attempting to guess valid credentials against exposed authentication services.",
    },
    "CORR-003": {
        "summary": "A suspicious process was created on {entity} shortly before a privilege escalation event, suggesting local exploitation or abuse of a legitimate tool.",
        "root_cause": "A process running with unusual characteristics (unsigned, obfuscated, or a known offensive-security tool) was used as a stepping stone to gain higher privileges on the host.",
    },
    "CORR-004": {
        "summary": "Reconnaissance/scanning traffic from {entity} was followed by an exploitation attempt (SQL injection or path traversal) against a web application.",
        "root_cause": "An attacker fingerprinted the application using automated scanning tools, identified an injectable or traversable endpoint, and attempted to exploit it.",
    },
    "CORR-005": {
        "summary": "Credentials were dumped from {entity}, followed by lateral movement and a large outbound data transfer - a complete data-theft chain.",
        "root_cause": "An attacker with local access extracted credentials from memory or a credential store, used them to move to additional hosts, and exfiltrated data before detection.",
    },
    "CORR-006": {
        "summary": "A full end-to-end intrusion was detected on {entity}: initial access via brute force, credential dumping, privilege escalation, and data exfiltration.",
        "root_cause": "The attacker progressed through the full attack lifecycle - initial access, execution, credential access, privilege escalation, and exfiltration - without being stopped at any earlier stage.",
    },
    "RULE-AUTH-001": {
        "summary": "A high volume of failed SSH login attempts targeted {entity}, consistent with an automated brute-force attack.",
        "root_cause": "SSH is exposed to a source repeatedly attempting password authentication, indicating either a scan-and-attack bot or a targeted credential attack.",
    },
    "RULE-AUTH-003": {
        "summary": "A privileged account logged in to {entity} under unusual conditions (new location, device, or time).",
        "root_cause": "Either the legitimate administrator is operating from a new context, or the account's credentials have been compromised and are being used by an attacker.",
    },
    "RULE-WEB-001": {
        "summary": "A SQL injection payload was submitted to a web application hosted on {entity}.",
        "root_cause": "User-supplied input reached a SQL query without adequate parameterization or sanitization, allowing injection of attacker-controlled SQL.",
    },
    "RULE-WEB-002": {
        "summary": "A path traversal payload was submitted to a web application hosted on {entity}, attempting to read files outside the web root.",
        "root_cause": "A file-serving endpoint resolves user-supplied paths without canonicalization, allowing access to arbitrary filesystem paths.",
    },
    "RULE-EP-001": {
        "summary": "PowerShell was executed on {entity} with encoding/obfuscation flags commonly used to hide malicious payloads.",
        "root_cause": "A process (potentially a phishing payload or dropper) launched PowerShell with flags designed to evade logging and static detection.",
    },
    "RULE-EP-003": {
        "summary": "A known credential dumping tool was executed on {entity}, indicating an attempt to steal cached credentials.",
        "root_cause": "An attacker with local code execution used a credential-dumping utility against LSASS memory or a credential store to harvest reusable credentials.",
    },
    "RULE-CLOUD-002": {
        "summary": "A burst of sensitive IAM API calls by {entity} suggests preparation for cloud account privilege escalation or persistence.",
        "root_cause": "A principal (user or automation) created access keys, users, or attached policies in a pattern consistent with establishing unauthorized persistent access.",
    },
}

_DEFAULT_NARRATIVE = {
    "summary": "{title} was detected, involving {entity}.",
    "root_cause": "The correlated alerts indicate suspicious activity consistent with: {chain}.",
}


class LLMProviderConfig:
    """Static config for one supported LLM provider."""

    def __init__(self, name: str, env_var: str, api_url: str, default_model: str, model_env_var: str = None):
        self.name = name
        self.env_var = env_var
        self.api_url = api_url
        self.default_model = default_model
        self.model_env_var = model_env_var or f"{name.upper()}_MODEL"


# Every provider here speaks a different wire format (see _call_llm below),
# but the same env-var-driven auto-detect and template fallback wrap all of
# them identically. Order matters only when AI_PROVIDER isn't set and more
# than one key happens to be configured - first match wins.
LLM_PROVIDERS = [
    LLMProviderConfig("groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1/chat/completions", "llama-3.3-70b-versatile"),
    LLMProviderConfig("openai", "OPENAI_API_KEY", "https://api.openai.com/v1/chat/completions", "gpt-4o-mini"),
    LLMProviderConfig("anthropic", "ANTHROPIC_API_KEY", "https://api.anthropic.com/v1/messages", "claude-3-5-haiku-20241022"),
    LLMProviderConfig("gemini", "GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/models", "gemini-1.5-flash"),
]


def _detect_provider(preferred: Optional[str] = None):
    """Return (LLMProviderConfig, api_key) for the first configured provider,
    checking `preferred` first if given. None if no provider key is set."""
    by_name = {p.name: p for p in LLM_PROVIDERS}
    ordered_names = [preferred] if preferred in by_name else []
    ordered_names += [p.name for p in LLM_PROVIDERS if p.name != preferred]

    for name in ordered_names:
        cfg = by_name[name]
        key = os.getenv(cfg.env_var)
        if key:
            return cfg, key
    return None, None


class AISecurityAgent:
    """
    AI-powered security analyst agent that provides incident response recommendations.
    """

    def __init__(self, opensearch_client: OpenSearch, groq_api_key: str = None, provider: str = None):
        self.opensearch = opensearch_client

        if groq_api_key:
            # Explicit constructor arg is a forced override (back-compat with
            # the original Groq-only signature).
            self.provider_cfg = next(p for p in LLM_PROVIDERS if p.name == "groq")
            self.api_key = groq_api_key
        else:
            self.provider_cfg, self.api_key = _detect_provider(provider or os.getenv("AI_PROVIDER"))

        self.provider_name = self.provider_cfg.name if self.provider_cfg else None
        if self.provider_cfg:
            self.model = os.getenv(self.provider_cfg.model_env_var) or self.provider_cfg.default_model
            self.api_url = self.provider_cfg.api_url
        else:
            self.model = "template-fallback-v1"
            self.api_url = None

        if not self.api_key:
            configured_vars = ", ".join(p.env_var for p in LLM_PROVIDERS)
            logger.warning(f"No LLM provider API key found (checked {configured_vars}). AI agent will use template mode.")
        else:
            logger.info(f"AI agent using provider: {self.provider_name} ({self.model})")

    @property
    def llm_enabled(self) -> bool:
        """True when any LLM provider key is configured (else template mode)."""
        return bool(self.api_key)

    @property
    def groq_api_key(self) -> Optional[str]:
        """Deprecated alias, retained for backward compatibility - now means
        'the active LLM provider's API key', whichever provider that is.
        Prefer `llm_enabled` (or `api_key` directly) in new code."""
        return self.api_key

    def _get_system_prompt(self) -> str:
        """Get the system prompt for the AI agent."""
        return """You are an expert cybersecurity analyst specializing in incident response and threat hunting. Your role is to analyze security alerts from a SIEM system and provide:

1. **Threat Assessment**: Determine the severity and potential impact of the alert
2. **Root Cause Analysis**: Explain what likely caused this alert and the attack vector
3. **Immediate Actions**: Provide specific, actionable steps to contain and remediate the threat
4. **Investigation Steps**: Suggest additional data sources and queries to investigate further
5. **Prevention Measures**: Recommend long-term security improvements to prevent similar incidents

GUIDELINES:
- Be concise but thorough in your analysis
- Prioritize immediate containment actions for high-severity threats
- Provide specific commands, queries, or procedures when possible
- Consider the broader attack context (MITRE ATT&CK framework)
- Focus on actionable intelligence that security operators can execute

FORMAT your response as structured sections:
## Threat Assessment
## Root Cause Analysis  
## Immediate Actions
## Investigation Steps
## Prevention Measures

Each section should be specific and actionable based on the alert details provided."""

    async def _call_llm(self, system_prompt: str, user_prompt: str, want_json: bool = False) -> Optional[str]:
        """Dispatch a chat completion to whichever provider is active. Every
        provider has a different request/response shape, so each gets its
        own small adapter; callers only ever see plain text back."""
        if not self.api_key or not self.provider_cfg:
            return None

        try:
            if self.provider_name in ("groq", "openai"):
                return await self._call_openai_compatible(system_prompt, user_prompt, want_json)
            if self.provider_name == "anthropic":
                return await self._call_anthropic(system_prompt, user_prompt)
            if self.provider_name == "gemini":
                return await self._call_gemini(system_prompt, user_prompt)
        except Exception as e:
            logger.error(f"Error calling {self.provider_name} API: {e}")
            return None

        logger.error(f"Unknown LLM provider: {self.provider_name}")
        return None

    async def _call_openai_compatible(self, system_prompt: str, user_prompt: str, want_json: bool) -> Optional[str]:
        """Groq and OpenAI both implement the OpenAI chat completions schema."""
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key}',
        }
        payload = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "model": self.model,
            "stream": False,
            "temperature": 0.4,
            "max_tokens": 2048,
        }
        if want_json:
            payload["response_format"] = {"type": "json_object"}

        async with aiohttp.ClientSession() as session:
            async with session.post(self.api_url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as response:
                if response.status != 200:
                    logger.error(f"{self.provider_name} API error {response.status}: {await response.text()}")
                    return None
                result = await response.json()
                return result['choices'][0]['message']['content']

    async def _call_anthropic(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """Anthropic's Messages API - system prompt is a top-level field, and
        the key goes in x-api-key rather than an Authorization bearer token."""
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': self.api_key,
            'anthropic-version': '2023-06-01',
        }
        payload = {
            "model": self.model,
            "max_tokens": 2048,
            "temperature": 0.4,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(self.api_url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as response:
                if response.status != 200:
                    logger.error(f"anthropic API error {response.status}: {await response.text()}")
                    return None
                result = await response.json()
                return result['content'][0]['text']

    async def _call_gemini(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """Google's Generative Language API - key travels as a query param,
        not a header, and the endpoint is per-model rather than shared."""
        url = f"{self.api_url}/{self.model}:generateContent?key={self.api_key}"
        headers = {'Content-Type': 'application/json'}
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {"temperature": 0.4, "maxOutputTokens": 2048},
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload, timeout=aiohttp.ClientTimeout(total=30)) as response:
                if response.status != 200:
                    logger.error(f"gemini API error {response.status}: {await response.text()}")
                    return None
                result = await response.json()
                return result['candidates'][0]['content']['parts'][0]['text']

    async def _call_groq_api(self, prompt: str) -> Optional[str]:
        """Back-compat entry point used by analyze_alert/convert_natural_language_query
        below - despite the name, this now dispatches to whichever provider
        is active, not just Groq."""
        return await self._call_llm(self._get_system_prompt(), prompt)

    def _format_alert_for_analysis(self, alert: Dict[str, Any]) -> str:
        """Format alert data into a comprehensive prompt for AI analysis."""
        
        # Extract key information from the alert
        rule_name = alert.get('rule_name', 'Unknown')
        rule_severity = alert.get('rule_severity', 'Unknown')
        rule_description = alert.get('rule_description', 'No description')
        timestamp = alert.get('timestamp', 'Unknown')
        
        # Extract log data
        log_data = alert.get('log_data', {})
        source = log_data.get('source', 'Unknown')
        host = log_data.get('host', 'Unknown')
        user = log_data.get('user', 'Unknown')
        event_type = log_data.get('event_type', 'Unknown')
        
        # Extract raw log data for context
        raw_data = log_data.get('raw', {})
        
        prompt = f"""SECURITY ALERT ANALYSIS REQUEST

Alert Details:
- Rule: {rule_name}
- Severity: {rule_severity}
- Description: {rule_description}
- Timestamp: {timestamp}

Affected System:
- Source: {source}
- Host: {host}
- User: {user}
- Event Type: {event_type}

Log Data Context:
{json.dumps(log_data, indent=2)}

Raw Event Details:
{json.dumps(raw_data, indent=2)}

Please analyze this security alert and provide your expert assessment with specific recommendations for incident response."""

        return prompt

    async def analyze_alert(self, alert_id: str) -> Optional[Dict[str, Any]]:
        """Analyze a specific alert and return AI recommendations."""
        try:
            # Fetch the alert from OpenSearch
            response = self.opensearch.get(index="alerts", id=alert_id)
            alert = response['_source']
            
            logger.info(f"Analyzing alert {alert_id}: {alert.get('rule_name', 'Unknown')}")
            
            # Format alert for AI analysis
            prompt = self._format_alert_for_analysis(alert)
            
            # Get AI analysis
            ai_response = await self._call_groq_api(prompt)
            
            if ai_response:
                analysis = {
                    'alert_id': alert_id,
                    'analysis_timestamp': utcnow().isoformat(),
                    'ai_model': self.model,
                    'recommendations': ai_response,
                    'confidence': 'high',  # Could implement confidence scoring
                    'status': 'completed'
                }
                
                # Store analysis in OpenSearch
                await self._store_analysis(alert_id, analysis)
                
                logger.info(f"✓ Completed AI analysis for alert {alert_id}")
                return analysis
            else:
                logger.error(f"Failed to get AI analysis for alert {alert_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error analyzing alert {alert_id}: {e}")
            return None

    async def _store_analysis(self, alert_id: str, analysis: Dict[str, Any]):
        """Store AI analysis in OpenSearch."""
        try:
            # Create analysis index if it doesn't exist
            if not self.opensearch.indices.exists(index="ai_analyses"):
                mapping = {
                    "mappings": {
                        "properties": {
                            "alert_id": {"type": "keyword"},
                            "analysis_timestamp": {"type": "date"},
                            "ai_model": {"type": "keyword"},
                            "recommendations": {"type": "text"},
                            "confidence": {"type": "keyword"},
                            "status": {"type": "keyword"}
                        }
                    }
                }
                self.opensearch.indices.create(index="ai_analyses", body=mapping)
                logger.info("Created ai_analyses index")
            
            # Store the analysis
            self.opensearch.index(
                index="ai_analyses",
                id=f"analysis_{alert_id}_{int(utcnow().timestamp())}",
                body=analysis
            )
            
        except Exception as e:
            logger.error(f"Error storing analysis for alert {alert_id}: {e}")

    async def analyze_recent_alerts(self, hours: int = 1, max_alerts: int = 10):
        """Analyze recent high-severity alerts automatically."""
        try:
            # Query for recent high-severity alerts without AI analysis
            query = {
                "query": {
                    "bool": {
                        "must": [
                            {
                                "range": {
                                    "timestamp": {
                                        "gte": (utcnow() - timedelta(hours=hours)).isoformat()
                                    }
                                }
                            },
                            {
                                "terms": {
                                    "rule_severity": ["high", "critical"]
                                }
                            }
                        ]
                    }
                },
                "sort": [{"timestamp": {"order": "desc"}}],
                "size": max_alerts
            }
            
            response = self.opensearch.search(index="alerts", body=query)
            alerts = response['hits']['hits']
            
            if not alerts:
                logger.info("No recent high-severity alerts found")
                return
            
            logger.info(f"Found {len(alerts)} recent high-severity alerts to analyze")
            
            # Analyze each alert
            for alert_hit in alerts:
                alert_id = alert_hit['_id']
                alert = alert_hit['_source']
                
                # Check if analysis already exists
                existing_query = {
                    "query": {
                        "term": {"alert_id": alert_id}
                    }
                }
                
                existing = self.opensearch.search(index="ai_analyses", body=existing_query)
                if existing['hits']['total']['value'] > 0:
                    logger.debug(f"Skipping alert {alert_id} - already analyzed")
                    continue
                
                # Analyze the alert
                await self.analyze_alert(alert_id)
                
                # Small delay to avoid rate limiting
                await asyncio.sleep(1)
                
        except Exception as e:
            logger.error(f"Error in automatic alert analysis: {e}")

    async def get_analysis_for_alert(self, alert_id: str) -> Optional[Dict[str, Any]]:
        """Get existing AI analysis for an alert."""
        try:
            query = {
                "query": {
                    "term": {"alert_id": alert_id}
                },
                "sort": [{"analysis_timestamp": {"order": "desc"}}],
                "size": 1
            }
            
            response = self.opensearch.search(index="ai_analyses", body=query)
            
            if response['hits']['total']['value'] > 0:
                return response['hits']['hits'][0]['_source']
            else:
                return None
                
        except Exception as e:
            logger.error(f"Error fetching analysis for alert {alert_id}: {e}")
            return None

    def get_analysis_summary_stats(self) -> Dict[str, Any]:
        """Get summary statistics about AI analyses."""
        try:
            # Get total analyses count
            total_response = self.opensearch.count(index="ai_analyses")
            total_analyses = total_response['count']
            
            # Get recent analyses (last 24 hours)
            recent_query = {
                "query": {
                    "range": {
                        "analysis_timestamp": {
                            "gte": (utcnow() - timedelta(hours=24)).isoformat()
                        }
                    }
                }
            }
            recent_response = self.opensearch.count(index="ai_analyses", body=recent_query)
            recent_analyses = recent_response['count']
            
            return {
                'total_analyses': total_analyses,
                'recent_analyses_24h': recent_analyses,
                'provider': self.provider_name,
                'ai_model': self.model,
                'status': 'active' if self.llm_enabled else 'disabled'
            }
            
        except Exception as e:
            logger.error(f"Error getting analysis stats: {e}")
            return {
                'total_analyses': 0,
                'recent_analyses_24h': 0,
                'ai_model': self.model,
                'status': 'error',
                'error': str(e)
            }

    async def convert_natural_language_query(self, nl_query: str) -> Dict[str, Any]:
        """
        Convert natural language query to SIEM query syntax.
        
        Args:
            nl_query: Natural language query from user
            
        Returns:
            Dict with query string and explanation
        """
        if not self.llm_enabled:
            return {
                "success": False,
                "error": "AI agent is not available (no LLM provider API key configured - set GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY)",
                "query": nl_query
            }
        
        schema_info = """
Available fields and their values:
- severity: low, medium, high, critical
- event_type: login_success, login_failure, process_create, file_access, privilege_escalation, network_connection, etc.
- source: windows, linux, firewall, app, network, custom
- host: hostname or server name (supports wildcards with *)
- user: username (supports wildcards with *)
- ip: IP address (supports wildcards like 192.168.*)
- timestamp: use relative times like >1h (1 hour ago), >24h (24 hours ago), <30m (within 30 minutes)
- raw.process_name: process executable name
- raw.commandline: command line arguments
- raw.file_name: file names
- raw.domain: domain names

Query syntax operators:
- AND: combine multiple conditions (all must match)
- OR: either condition matches
- NOT: exclude results
- Parentheses: group conditions like (user:admin OR user:root)
- Wildcards: * for any characters (e.g., host:prod-*) - USE ONLY ON TEXT/KEYWORD FIELDS, NOT IP FIELDS
- Comparisons: >1h (greater than), <24h (less than) for timestamps

CRITICAL IP FIELD RULES:
- IP fields (ip, source_ip, destination_ip) MUST use CIDR notation, NEVER wildcards
- Examples:
  * ✅ CORRECT: ip:192.168.0.0/16 (for 192.168.*.*)
  * ✅ CORRECT: ip:10.0.0.0/8 (for 10.*.*.*)
  * ✅ CORRECT: ip:172.16.0.0/12 (for 172.16-31.*.*)
  * ❌ WRONG: ip:192.168.* (will cause error)
  * ❌ WRONG: ip:10.* (will cause error)

Common CIDR ranges:
- /8: entire Class A (16.7M IPs, e.g., 10.0.0.0/8)
- /16: entire Class B (65K IPs, e.g., 192.168.0.0/16)
- /24: single subnet (256 IPs, e.g., 192.168.1.0/24)
- /32: single IP (e.g., 192.168.1.1/32)

Examples:
- "show me failed logins" → severity:high AND event_type:login_failure
- "admin activity on production servers in the last hour" → (user:admin OR user:root) AND host:prod-* AND timestamp:>1h
- "powershell commands with high severity" → raw.commandline:*powershell* AND severity:high
- "network connections from 192.168 network" → event_type:network_connection AND ip:192.168.0.0/16
- "traffic from 10.x.x.x IPs" → ip:10.0.0.0/8
"""
        
        prompt = f"""Convert the following natural language query into proper SIEM query syntax.

{schema_info}

User query: "{nl_query}"

Respond with a JSON object containing:
1. "query": The converted query string using the syntax above
2. "explanation": Brief explanation of what the query will search for
3. "fields_used": List of fields used in the query

Example response format:
{{
  "query": "severity:high AND event_type:login_failure AND timestamp:>1h",
  "explanation": "Search for high severity failed login attempts in the last hour",
  "fields_used": ["severity", "event_type", "timestamp"]
}}

Only respond with valid JSON, no additional text."""

        try:
            response_text = await self._call_groq_api(prompt)
            
            if not response_text:
                return {
                    "success": False,
                    "error": "AI service unavailable",
                    "query": nl_query
                }
            
            # Parse JSON response
            result = json.loads(response_text)
            
            return {
                "success": True,
                "query": result.get("query", nl_query),
                "explanation": result.get("explanation", ""),
                "fields_used": result.get("fields_used", []),
                "original_query": nl_query
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {e}")
            # Try to extract query from text response
            if "query" in response_text.lower():
                lines = response_text.split('\n')
                for line in lines:
                    if 'query' in line.lower() and ':' in line:
                        query = line.split(':', 1)[1].strip().strip('"\'')
                        return {
                            "success": True,
                            "query": query,
                            "explanation": "AI-generated query",
                            "fields_used": [],
                            "original_query": nl_query
                        }
            
            return {
                "success": False,
                "error": f"Failed to parse AI response: {str(e)}",
                "query": nl_query
            }
            
        except Exception as e:
            logger.error(f"Error converting query: {e}")
            return {
                "success": False,
                "error": str(e),
                "query": nl_query
            }

    # ------------------------------------------------------------------
    # Root Cause Analysis (RCA) for correlated incidents
    #
    # generate_incident_rca() is the entry point used by the API. It tries
    # the Groq LLM first (if a key is configured), and always falls back to
    # a deterministic, template-based RCA so the demo works with zero paid
    # API dependency.
    # ------------------------------------------------------------------

    RCA_SECTIONS = [
        "threat_summary",
        "root_cause_analysis",
        "evidence",
        "mitre_attack_mapping",
        "immediate_containment",
        "investigation_steps",
        "remediation",
        "false_positive_considerations",
        "prevention_measures",
    ]

    async def generate_incident_rca(self, incident: Dict[str, Any], force: bool = False) -> Dict[str, Any]:
        """Generate (or retrieve cached) root cause analysis for an incident."""
        incident_id = incident.get("incident_id", "unknown")

        if not force:
            cached = await self.get_rca_for_incident(incident_id)
            if cached:
                return cached

        rca = None
        if self.llm_enabled:
            rca = await self._generate_llm_rca(incident)
            if rca is None:
                logger.warning(f"LLM RCA failed for {incident_id}, falling back to template mode")

        if rca is None:
            rca = self._generate_template_rca(incident)

        await self._store_rca(incident_id, rca)
        return rca

    def _mitre_mapping_for(self, mitre_ids: List[str]) -> List[Dict[str, str]]:
        mapping = []
        for tech_id in mitre_ids:
            mapping.append({
                "id": tech_id,
                "name": MITRE_TECHNIQUE_NAMES.get(tech_id, "Unclassified technique"),
                "description": f"See https://attack.mitre.org/techniques/{tech_id.replace('.', '/')}/ for details.",
            })
        return mapping

    def _generate_template_rca(self, incident: Dict[str, Any]) -> Dict[str, Any]:
        """Deterministic, offline RCA generator - no external API required."""
        pattern_id = incident.get("pattern_id", "")
        title = incident.get("title") or incident.get("pattern_name") or "Security Incident"
        severity = (incident.get("severity") or "medium").lower()
        hosts = incident.get("hosts") or ([incident["host"]] if incident.get("host") else [])
        users = incident.get("users") or ([incident["user"]] if incident.get("user") else [])
        entity = hosts[0] if hosts else (users[0] if users else incident.get("ip", "the affected system"))
        chain = incident.get("suspected_attack_chain") or title
        timeline = incident.get("timeline") or []
        mitre_ids = incident.get("mitre_techniques") or []
        recommended = incident.get("recommended_actions") or []
        false_positives = incident.get("false_positives") or []

        narrative = TEMPLATE_NARRATIVES.get(pattern_id, _DEFAULT_NARRATIVE)
        summary = narrative["summary"].format(entity=entity, title=title, chain=chain)
        root_cause = narrative["root_cause"].format(
            entity=entity,
            user_or_account=(users[0] if users else "a valid account"),
            host_or_entity=(hosts[0] if hosts else entity),
            chain=chain,
        )

        evidence = [
            f"{step.get('timestamp', '?')} - {step.get('rule_name', step.get('rule_id', 'event'))} "
            f"on host={step.get('host', 'n/a')} user={step.get('user', 'n/a')} "
            f"(severity={step.get('severity', 'n/a')})"
            for step in timeline
        ] or [f"{incident.get('alert_count', 0)} correlated alert(s) matched pattern {pattern_id or 'N/A'}."]

        containment = [
            f"Isolate/contain {entity} from the network pending investigation.",
        ] + [a for a in recommended if "isolat" in a.lower() or "block" in a.lower() or "revoke" in a.lower()][:2]
        if len(containment) == 1:
            containment.append("Disable or reset credentials for any accounts involved until verified safe.")

        investigation_steps = [
            f"Pull the full event timeline for {entity} across the incident window "
            f"({incident.get('first_seen', 'N/A')} to {incident.get('last_seen', 'N/A')}).",
            "Correlate with authentication logs, EDR telemetry, and network flow data for the same window.",
            "Identify whether any of the related alerts' source IPs are known-malicious (threat intel lookup).",
            "Determine the full blast radius: what other hosts/accounts did this entity interact with afterward?",
        ]

        remediation = recommended[:8] or [
            "Patch or reconfigure the vulnerable component that allowed this activity.",
            "Review and tighten detection/prevention controls for this attack pattern.",
        ]

        fp_considerations = false_positives[:5] or [
            "Confirm this activity wasn't an authorized penetration test or scheduled scan.",
            "Check for known automation/service accounts that may legitimately trigger this pattern.",
        ]

        prevention = [
            "Add this pattern to continuous detection coverage (already active via the correlation engine).",
            "Run a tabletop exercise for this attack chain to validate response playbooks.",
        ] + ([f"Track MITRE {mid} in the organization's control-mapping matrix." for mid in mitre_ids[:2]])

        return {
            "incident_id": incident.get("incident_id", "unknown"),
            "mode": "template",
            "ai_model": "template-fallback-v1",
            "generated_at": utcnow().isoformat() + "Z",
            "threat_summary": f"[{severity.upper()}] {summary}",
            "root_cause_analysis": root_cause,
            "evidence": evidence,
            "mitre_attack_mapping": self._mitre_mapping_for(mitre_ids),
            "immediate_containment": containment,
            "investigation_steps": investigation_steps,
            "remediation": remediation,
            "false_positive_considerations": fp_considerations,
            "prevention_measures": prevention,
        }

    def _format_incident_for_llm(self, incident: Dict[str, Any]) -> str:
        return f"""INCIDENT DETAILS
Title: {incident.get('title', 'Unknown')}
Incident ID: {incident.get('incident_id', 'unknown')}
Severity: {incident.get('severity', 'unknown')}
Description: {incident.get('description', '')}
Suspected Attack Chain: {incident.get('suspected_attack_chain', '')}
Affected Hosts: {', '.join(incident.get('hosts') or [])}
Affected Users: {', '.join(incident.get('users') or [])}
Related MITRE Techniques: {', '.join(incident.get('mitre_techniques') or [])}
Alert Count: {incident.get('alert_count', 0)}
First Seen: {incident.get('first_seen', 'N/A')}
Last Seen: {incident.get('last_seen', 'N/A')}

TIMELINE:
{json.dumps(incident.get('timeline', []), indent=2)}
"""

    async def _generate_llm_rca(self, incident: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Ask the active LLM provider for a structured RCA. Returns None on
        any failure so the caller can fall back to template mode."""
        system_prompt = (
            "You are an expert SOC analyst performing root cause analysis on a correlated security incident. "
            "Respond with ONLY a valid JSON object (no markdown fences, no commentary) with exactly these keys: "
            "threat_summary (string), root_cause_analysis (string), evidence (array of strings), "
            "mitre_attack_mapping (array of objects with id/name/description), "
            "immediate_containment (array of strings), investigation_steps (array of strings), "
            "remediation (array of strings), false_positive_considerations (array of strings), "
            "prevention_measures (array of strings)."
        )
        prompt = self._format_incident_for_llm(incident)

        try:
            content = await self._call_llm(system_prompt, prompt, want_json=True)
            if not content:
                return None

            parsed = json.loads(_extract_json(content))
            rca = {key: parsed.get(key) for key in self.RCA_SECTIONS}
            if not rca.get("threat_summary"):
                return None

            rca.update({
                "incident_id": incident.get("incident_id", "unknown"),
                "mode": "llm",
                "provider": self.provider_name,
                "ai_model": self.model,
                "generated_at": utcnow().isoformat() + "Z",
            })
            return rca
        except Exception as e:
            logger.error(f"Error generating LLM RCA: {e}")
            return None

    async def _store_rca(self, incident_id: str, rca: Dict[str, Any]):
        """Store the RCA in OpenSearch, keyed by incident_id (upsert)."""
        if not self.opensearch:
            return
        try:
            if not self.opensearch.indices.exists(index="ai_rca"):
                self.opensearch.indices.create(index="ai_rca")
            self.opensearch.index(index="ai_rca", id=incident_id, body=rca, refresh=True)
        except Exception as e:
            logger.error(f"Error storing RCA for {incident_id}: {e}")

    async def get_rca_for_incident(self, incident_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a previously generated RCA for an incident, if any."""
        if not self.opensearch:
            return None
        try:
            response = self.opensearch.get(index="ai_rca", id=incident_id)
            return response["_source"]
        except Exception:
            return None


def _extract_json(text: str) -> str:
    """Strip markdown code fences from an LLM response, if present."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    return text.strip()


async def main():
    """Main function for running the AI agent as a standalone service."""
    logger.info("Starting AI Security Agent...")
    
    # Initialize OpenSearch client
    opensearch_client = OpenSearch(
        hosts=[{"host": os.getenv("OPENSEARCH_HOST", "opensearch-node"), "port": 9200}],
        http_auth=None,
        use_ssl=False,
        verify_certs=False,
        ssl_show_warn=False,
    )
    
    # Initialize AI agent
    agent = AISecurityAgent(opensearch_client)
    
    if not agent.llm_enabled:
        logger.error("No LLM provider API key set (GROQ_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY). Exiting.")
        return
    
    # Run continuous analysis loop
    while True:
        try:
            logger.info("Running automatic analysis of recent alerts...")
            await agent.analyze_recent_alerts(hours=1, max_alerts=5)
            
            # Wait 5 minutes before next analysis cycle
            logger.info("Analysis cycle complete. Waiting 5 minutes...")
            await asyncio.sleep(300)
            
        except KeyboardInterrupt:
            logger.info("Shutting down AI agent...")
            break
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
            await asyncio.sleep(60)  # Wait 1 minute on error


if __name__ == "__main__":
    asyncio.run(main())