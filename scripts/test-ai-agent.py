#!/usr/bin/env python3
"""
Test script for AI Agent functionality
"""

import os
import asyncio
import json
from opensearchpy import OpenSearch

# Add the ai-agent to the path
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'ai-agent'))

from agent import AISecurityAgent

async def test_ai_agent():
    """Test the AI agent with a sample alert."""
    
    print("🤖 Testing AI Security Agent...")
    
    # Check for API key
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("❌ GROQ_API_KEY not set. Please set it in your environment.")
        print("   Example: export GROQ_API_KEY='your_api_key_here'")
        return
    
    # Connect to OpenSearch
    try:
        opensearch_client = OpenSearch(
            hosts=[{"host": "localhost", "port": 9200}],
            http_auth=None,
            use_ssl=False,
            verify_certs=False,
            ssl_show_warn=False,
        )
        
        # Test connection
        info = opensearch_client.info()
        print(f"✓ Connected to OpenSearch: {info['version']['number']}")
    except Exception as e:
        print(f"❌ Failed to connect to OpenSearch: {e}")
        print("   Make sure OpenSearch is running on localhost:9200")
        return
    
    # Initialize AI agent
    agent = AISecurityAgent(opensearch_client, api_key)
    print(f"✓ AI Agent initialized with model: {agent.model}")
    
    # Create a test alert if needed
    test_alert = {
        "rule_name": "Suspicious PowerShell Command",
        "rule_id": "DET-001",
        "rule_severity": "high",
        "rule_description": "Detects encoded PowerShell commands that may indicate malicious activity",
        "timestamp": "2026-01-30T15:30:00Z",
        "log_data": {
            "timestamp": "2026-01-30T15:30:00Z",
            "source": "windows",
            "host": "workstation-01", 
            "user": "alice.smith",
            "ip": "10.0.1.100",
            "event_type": "process_create",
            "severity": "high",
            "raw": {
                "EventID": 4688,
                "ProcessName": "powershell.exe",
                "CommandLine": "powershell.exe -EncodedCommand SQBuAHYAbwBrAGUALQBXAGUAYgBSAGUAcQB1AGUAcwB0",
                "ParentProcessName": "cmd.exe",
                "LogonType": 3,
                "SubjectUserName": "alice.smith"
            }
        }
    }
    
    # Check if alerts index exists
    try:
        if not opensearch_client.indices.exists(index="alerts"):
            # Create alerts index
            alerts_mapping = {
                "mappings": {
                    "properties": {
                        "rule_name": {"type": "keyword"},
                        "rule_id": {"type": "keyword"},
                        "rule_severity": {"type": "keyword"},
                        "rule_description": {"type": "text"},
                        "timestamp": {"type": "date"},
                        "log_data": {"type": "object"}
                    }
                }
            }
            opensearch_client.indices.create(index="alerts", body=alerts_mapping)
            print("✓ Created alerts index")
        
        # Insert test alert
        result = opensearch_client.index(
            index="alerts",
            id="test-alert-001",
            body=test_alert
        )
        print(f"✓ Created test alert: {result['_id']}")
        
        # Wait a moment for indexing
        await asyncio.sleep(2)
        
        # Test AI analysis
        print("\n🔍 Running AI analysis...")
        analysis = await agent.analyze_alert("test-alert-001")
        
        if analysis:
            print("✓ AI analysis completed successfully!")
            print("\n📋 Analysis Results:")
            print("=" * 60)
            print(analysis['recommendations'])
            print("=" * 60)
            
            # Get stats
            stats = agent.get_analysis_summary_stats()
            print(f"\n📊 AI Agent Stats: {stats}")
        else:
            print("❌ AI analysis failed")
        
    except Exception as e:
        print(f"❌ Error during testing: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_ai_agent())