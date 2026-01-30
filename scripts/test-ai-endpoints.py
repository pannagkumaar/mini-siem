#!/usr/bin/env python3
"""
Simple test for AI Agent API endpoints
"""

import requests
import json
import time

API_BASE = "http://localhost:8000"

def test_ai_endpoints():
    """Test the AI agent API endpoints."""
    
    print("🧪 Testing AI Agent API endpoints...")
    
    try:
        # Test AI stats endpoint
        print("\n1. Testing AI stats endpoint...")
        response = requests.get(f"{API_BASE}/ai/stats")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            stats = response.json()
            print(f"AI Status: {stats.get('stats', {}).get('status', 'unknown')}")
            print(f"Response: {json.dumps(stats, indent=2)}")
        else:
            print(f"Error: {response.text}")
        
        # Test batch analysis trigger
        print("\n2. Testing batch analysis trigger...")
        response = requests.post(f"{API_BASE}/ai/analyze/batch")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Response: {json.dumps(result, indent=2)}")
        else:
            print(f"Error: {response.text}")
        
        # List recent alerts to test individual analysis
        print("\n3. Getting recent alerts to test analysis...")
        response = requests.get(f"{API_BASE}/alerts?hours=24&limit=5")
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            alerts_data = response.json()
            alerts = alerts_data.get('data', {}).get('alerts', [])
            
            if alerts:
                alert_id = alerts[0]['_id']
                print(f"Found alert: {alert_id}")
                
                # Test individual analysis
                print(f"\n4. Testing individual analysis for alert {alert_id}...")
                response = requests.post(f"{API_BASE}/ai/analyze/{alert_id}")
                print(f"Status: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    print(f"Analysis started successfully!")
                    print(f"Response: {json.dumps(result, indent=2)}")
                    
                    # Wait a moment and check for results
                    print("\nWaiting 5 seconds for analysis to complete...")
                    time.sleep(5)
                    
                    response = requests.get(f"{API_BASE}/ai/analysis/{alert_id}")
                    if response.status_code == 200:
                        analysis = response.json()
                        if analysis.get('analysis'):
                            print("✓ Analysis completed!")
                            recommendations = analysis['analysis'].get('recommendations', '')
                            print(f"Recommendations preview: {recommendations[:200]}...")
                        else:
                            print("Analysis not yet available")
                    else:
                        print(f"Error getting analysis: {response.text}")
                        
                else:
                    print(f"Error: {response.text}")
            else:
                print("No alerts found to test with")
        else:
            print(f"Error getting alerts: {response.text}")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    test_ai_endpoints()