"""
AI Agent for SIEM Alert Analysis

Uses Groq API to analyze security alerts and provide actionable recommendations
for incident response and remediation.
"""

import os
import json
import logging
import asyncio
import aiohttp
from datetime import datetime, timedelta
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


class AISecurityAgent:
    """
    AI-powered security analyst agent that provides incident response recommendations.
    """
    
    def __init__(self, opensearch_client: OpenSearch, groq_api_key: str = None):
        self.opensearch = opensearch_client
        self.groq_api_key = groq_api_key or os.getenv("GROQ_API_KEY")
        self.model = "llama-3.3-70b-versatile"
        self.api_url = "https://api.groq.com/openai/v1/chat/completions"
        
        if not self.groq_api_key:
            logger.warning("No Groq API key provided. AI agent will be disabled.")
    
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

    async def _call_groq_api(self, prompt: str) -> Optional[str]:
        """Make async call to Groq API."""
        if not self.groq_api_key:
            return None
            
        try:
            async with aiohttp.ClientSession() as session:
                headers = {
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {self.groq_api_key}'
                }
                
                payload = {
                    "messages": [
                        {"role": "system", "content": self._get_system_prompt()},
                        {"role": "user", "content": prompt}
                    ],
                    "model": self.model,
                    "stream": False,
                    "temperature": 0.7,
                    "max_tokens": 2048
                }
                
                async with session.post(self.api_url, headers=headers, json=payload) as response:
                    if response.status == 200:
                        result = await response.json()
                        return result['choices'][0]['message']['content']
                    else:
                        error_text = await response.text()
                        logger.error(f"Groq API error {response.status}: {error_text}")
                        return None
                        
        except Exception as e:
            logger.error(f"Error calling Groq API: {e}")
            return None

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
                    'analysis_timestamp': datetime.utcnow().isoformat(),
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
                id=f"analysis_{alert_id}_{int(datetime.utcnow().timestamp())}",
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
                                        "gte": (datetime.utcnow() - timedelta(hours=hours)).isoformat()
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
                            "gte": (datetime.utcnow() - timedelta(hours=24)).isoformat()
                        }
                    }
                }
            }
            recent_response = self.opensearch.count(index="ai_analyses", body=recent_query)
            recent_analyses = recent_response['count']
            
            return {
                'total_analyses': total_analyses,
                'recent_analyses_24h': recent_analyses,
                'ai_model': self.model,
                'status': 'active' if self.groq_api_key else 'disabled'
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
    
    if not agent.groq_api_key:
        logger.error("GROQ_API_KEY environment variable not set. Exiting.")
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