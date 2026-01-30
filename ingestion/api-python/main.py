import logging
import json
import sys
import os
import hashlib
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any, Union, Optional
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from opensearchpy import OpenSearch
import threading

from parser.normalizer import normalize_log, validate_normalized_log

# Import AI agent
try:
    from ai_agent.agent import AISecurityAgent
    AI_AGENT_AVAILABLE = True
    print("✓ AI Agent module loaded successfully")
except ImportError as e:
    print(f"Warning: AI Agent not available: {e}")
    AISecurityAgent = None
    AI_AGENT_AVAILABLE = False

# Import query parser - available in same directory as main.py
QueryParser = None
EXAMPLE_QUERIES = []
QUERY_PARSER_ERROR = None

try:
    from query_parser import QueryParser as QP, EXAMPLE_QUERIES as EQ
    QueryParser = QP
    EXAMPLE_QUERIES = EQ
except Exception as e:
    import traceback
    QUERY_PARSER_ERROR = f"Error loading query parser: {e}\n{traceback.format_exc()}"

def generate_unique_incident_id(pattern_id: str, host: str = None, user: str = None) -> str:
    """
    Generate unique incident ID based on pattern and affected entities.
    This ensures different incidents of same type get different IDs.
    """
    components = [pattern_id]
    if host:
        components.append(f"host:{host}")
    if user:
        components.append(f"user:{user}")
    
    # Create hash of components for uniqueness
    unique_str = "|".join(components)
    hash_suffix = hashlib.md5(unique_str.encode()).hexdigest()[:8]
    
    return f"{pattern_id}-{hash_suffix}"

# Configure enhanced logging with timestamps and colors
class ColoredFormatter(logging.Formatter):
    """Custom formatter with color codes for console output"""
    COLORS = {
        'DEBUG': '\033[36m',      # Cyan
        'INFO': '\033[92m',       # Green
        'WARNING': '\033[93m',    # Yellow
        'ERROR': '\033[91m',      # Red
        'CRITICAL': '\033[95m',   # Magenta
    }
    RESET = '\033[0m'
    
    def format(self, record):
        levelname = record.levelname
        color = self.COLORS.get(levelname, self.RESET)
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        message = super().format(record)
        return f"{color}[{timestamp}] [{levelname:8s}]{self.RESET} {message}"

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(message)s'
)
logger = logging.getLogger("ingestion-api")
handler = logging.StreamHandler()
handler.setFormatter(ColoredFormatter())
logger.handlers = [handler]

# Log query parser status
if QueryParser:
    logger.info("✓ Query parser loaded successfully")
else:
    if QUERY_PARSER_ERROR:
        logger.error(QUERY_PARSER_ERROR)
    else:
        logger.warning("⚠ Query parser not available")

# OpenSearch client
OPENSEARCH_HOST = os.getenv("OPENSEARCH_HOST", "opensearch-node")
OPENSEARCH_PORT = int(os.getenv("OPENSEARCH_PORT", 9200))

try:
    opensearch_client = OpenSearch(
        hosts=[{"host": OPENSEARCH_HOST, "port": OPENSEARCH_PORT}],
        http_auth=None,
        use_ssl=False,
        verify_certs=False,
        ssl_show_warn=False,
    )
    logger.info(f"✓ Connected to OpenSearch at {OPENSEARCH_HOST}:{OPENSEARCH_PORT}")
except Exception as e:
    logger.error(f"Failed to connect to OpenSearch: {e}")
    opensearch_client = None

# Initialize AI agent
ai_agent = None
if AI_AGENT_AVAILABLE and opensearch_client:
    try:
        ai_agent = AISecurityAgent(opensearch_client)
        if ai_agent.groq_api_key:
            logger.info("✓ AI Security Agent initialized with Groq API")
        else:
            logger.warning("⚠ AI Agent initialized but no Groq API key provided")
    except Exception as e:
        logger.error(f"Failed to initialize AI agent: {e}")
        ai_agent = None
else:
    logger.warning("⚠ AI Agent not available")

# Detection and correlation engines (lazy loaded)
detection_engine = None
correlation_engine = None


def initialize_engines():
    """Initialize detection and correlation engines."""
    global detection_engine, correlation_engine
    
    try:
        # Import engines only if OpenSearch is available
        if opensearch_client:
            import importlib
            
            # Load modules with hyphens using importlib
            sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
            
            detection_mod = importlib.import_module("detection-engine.engine")
            DetectionEngine = detection_mod.DetectionEngine
            detection_engine = DetectionEngine(opensearch_client)
            logger.info("Detection engine loaded successfully")
            
            correlation_mod = importlib.import_module("correlation-engine.correlator")
            CorrelationEngine = correlation_mod.CorrelationEngine
            correlation_engine = CorrelationEngine(opensearch_client)
            logger.info("Correlation engine loaded successfully")
            
            # Start background threads for detection and correlation
            detection_thread = threading.Thread(target=detection_engine.run_detection_loop, daemon=True)
            detection_thread.start()
            logger.info("Detection engine loop started")
            
            correlation_thread = threading.Thread(target=correlation_engine.run_correlation_loop, daemon=True)
            correlation_thread.start()
            logger.info("Correlation engine loop started")
            
    except ImportError as e:
        logger.warning(f"Could not load detection/correlation engines: {e}")
    except Exception as e:
        logger.error(f"Error initializing engines: {e}")


app = FastAPI(title="SIEM Ingestion API", version="1.0.0")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)


@app.on_event("startup")
async def startup_event():
    """Initialize engines on startup."""
    initialize_engines()


@app.post("/ingest")
async def ingest_log(request: Request):
    """
    Accepts a single log entry or a list of log entries.
    Validates the schema and stores in OpenSearch 'logs' index.
    Applies detection rules to generate alerts.
    """
    try:
        log_data = await request.json()
    except Exception as e:
        logger.error(f"✗ Failed to parse request: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Handle both single log and batch
    logs_to_ingest = log_data if isinstance(log_data, list) else [log_data]

    if not logs_to_ingest:
        raise HTTPException(status_code=400, detail="No logs provided")

    logger.info(f"📥 Received {len(logs_to_ingest)} log(s) for ingestion")

    # Validate and index each log
    successful = 0
    failed = 0
    errors = []

    for idx, log in enumerate(logs_to_ingest, 1):
        try:
            # Extract key info for logging
            host = log.get('host', 'unknown')
            event_type = log.get('event_type', 'unknown')
            severity = log.get('severity', 'unknown')
            
            # Check if log is already normalized or needs normalization
            is_valid, error_msg = validate_normalized_log(log)
            
            if not is_valid:
                # Try to normalize the log
                log = normalize_log(log)
                is_valid, error_msg = validate_normalized_log(log)
                
                if not is_valid:
                    raise ValueError(f"Normalization failed: {error_msg}")

            # Index the log in OpenSearch
            if opensearch_client:
                response = opensearch_client.index(
                    index="logs",
                    body=log,
                    refresh=True,
                )
                logger.info(f"✓ [{idx}] {host:15} | {event_type:15} | {severity:8} | ID: {response['_id']}")
                successful += 1
            else:
                logger.warning(f"✗ [{idx}] OpenSearch not available - {host} ({event_type})")
                failed += 1
                errors.append("OpenSearch connection failed")

        except Exception as e:
            logger.error(f"✗ [{idx}] Error processing log ({host}/{event_type}): {e}")
            failed += 1
            errors.append(str(e))

    response_data = {
        "status": "partial_success" if failed > 0 else "success",
        "received_entries": len(logs_to_ingest),
        "successful": successful,
        "failed": failed,
    }

    if errors:
        response_data["errors"] = errors[:5]  # Limit error messages

    return response_data


@app.get("/health")
def health_check():
    """
    Health check endpoint. Returns status and OpenSearch connectivity.
    """
    opensearch_status = "disconnected"
    try:
        if opensearch_client:
            info = opensearch_client.info()
            opensearch_status = "connected"
    except Exception as e:
        logger.error(f"OpenSearch health check failed: {e}")

    return {
        "status": "healthy",
        "opensearch": opensearch_status,
    }


@app.get("/stats")
def get_stats():
    """
    Get ingestion statistics from OpenSearch.
    """
    if not opensearch_client:
        raise HTTPException(status_code=503, detail="OpenSearch not available")

    try:
        logs_count = opensearch_client.count(index="logs")["count"]
        alerts_count = opensearch_client.count(index="alerts", ignore=[404])["count"]
        incidents_count = opensearch_client.count(index="incidents", ignore=[404])["count"]

        stats = {
            "logs": logs_count,
            "alerts": alerts_count,
            "incidents": incidents_count,
        }

        # Add engine stats if available
        if detection_engine:
            stats["detection_engine"] = detection_engine.get_rule_stats()

        if correlation_engine:
            stats["correlation_engine"] = correlation_engine.get_stats()

        return stats

    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve stats")


@app.get("/rules")
def get_detection_rules():
    """
    Get list of loaded detection rules.
    """
    if not detection_engine:
        # Return empty rules list instead of 503
        return {"rules": [], "count": 0, "note": "Detection engine not initialized"}

    try:
        return detection_engine.get_rule_stats()
    except Exception as e:
        logger.error(f"Error getting rules: {e}")
        return {"rules": [], "count": 0, "error": str(e)}


@app.get("/incidents")
def get_recent_incidents(hours: int = 24):
    """
    Get recent incidents from OpenSearch incidents index (includes correlation + manual updates).
    Generates unique IDs for incidents to prevent duplicates.
    """
    try:
        # Calculate time range
        now = datetime.utcnow()
        start_time = (now - timedelta(hours=hours)).isoformat() + "Z"
        
        # Query incidents from OpenSearch index
        query = {
            "query": {
                "range": {
                    "timestamp": {
                        "gte": start_time,
                        "lte": now.isoformat() + "Z"
                    }
                }
            },
            "sort": [{"timestamp": {"order": "desc"}}],
            "size": 100
        }
        
        response = opensearch_client.search(index="incidents", body=query)
        
        incidents = []
        seen_ids = set()  # Track unique incidents
        skipped = 0
        
        for hit in response["hits"]["hits"]:
            incident = hit["_source"]
            
            # Generate unique ID based on pattern + host + user
            pattern_id = incident.get("pattern_id", hit["_id"])
            host = incident.get("host", "unknown")
            user = incident.get("user", "unknown")
            unique_id = generate_unique_incident_id(pattern_id, host, user)
            
            # Skip duplicates (same pattern on same host/user)
            if unique_id in seen_ids:
                skipped += 1
                continue
            seen_ids.add(unique_id)
            
            incident["_id"] = unique_id  # Override with unique ID
            incidents.append(incident)
        
        logger.info(f"Incidents: returned {len(incidents)}, skipped {skipped} duplicates")
        return {"incidents": incidents, "count": len(incidents)}

    except Exception as e:
        logger.error(f"Error getting incidents: {e}")
        # Fallback to correlation engine if OpenSearch fails
        if correlation_engine:
            try:
                incidents = correlation_engine.get_incidents(hours)
                # Add unique IDs to fallback incidents too
                for incident in incidents:
                    pattern_id = incident.get("pattern_id", "UNKNOWN")
                    host = incident.get("host", "unknown")
                    user = incident.get("user", "unknown")
                    incident["_id"] = generate_unique_incident_id(pattern_id, host, user)
                return {"incidents": incidents, "count": len(incidents)}
            except:
                pass
        return {"incidents": [], "count": 0, "error": str(e)}


@app.get("/alerts")
def get_recent_alerts(hours: int = 24, limit: int = 100):
    """
    Get recent alerts from the alerts index with full details.
    """
    if not opensearch_client:
        raise HTTPException(status_code=503, detail="OpenSearch not available")

    try:
        # Calculate time range
        now = datetime.utcnow()
        start_time = (now - timedelta(hours=hours)).isoformat() + "Z"
        
        query = {
            "query": {
                "range": {
                    "timestamp": {
                        "gte": start_time,
                        "lte": now.isoformat() + "Z"
                    }
                }
            },
            "sort": [{"timestamp": {"order": "desc"}}],
            "size": limit
        }
        
        response = opensearch_client.search(index="alerts", body=query)
        
        alerts = []
        for hit in response["hits"]["hits"]:
            alert = hit["_source"]
            alert["_id"] = hit["_id"]
            alerts.append(alert)
        
        return {
            "alerts": alerts,
            "count": len(alerts),
            "total": response["hits"]["total"]["value"]
        }
    except Exception as e:
        logger.error(f"Error getting alerts: {e}")
        return {"alerts": [], "count": 0, "error": str(e)}


@app.get("/logs")
def get_recent_logs(hours: int = 24, limit: int = 100, event_type: str = None, severity: str = None, source: str = None):
    """
    Get recent logs with optional filtering.
    """
    if not opensearch_client:
        raise HTTPException(status_code=503, detail="OpenSearch not available")

    try:
        # Calculate time range
        now = datetime.utcnow()
        start_time = (now - timedelta(hours=hours)).isoformat() + "Z"
        
        # Build filter conditions
        filters = [
            {
                "range": {
                    "timestamp": {
                        "gte": start_time,
                        "lte": now.isoformat() + "Z"
                    }
                }
            }
        ]
        
        if event_type:
            filters.append({"term": {"event_type": event_type}})
        if severity:
            filters.append({"term": {"severity": severity}})
        if source:
            filters.append({"term": {"source": source}})
        
        query = {
            "query": {
                "bool": {
                    "must": filters
                }
            },
            "sort": [{"timestamp": {"order": "desc"}}],
            "size": limit
        }
        
        response = opensearch_client.search(index="logs", body=query)
        
        logs = []
        for hit in response["hits"]["hits"]:
            log = hit["_source"]
            log["_id"] = hit["_id"]
            logs.append(log)
        
        return {
            "logs": logs,
            "count": len(logs),
            "total": response["hits"]["total"]["value"]
        }
    except Exception as e:
        logger.error(f"Error getting logs: {e}")
        return {"logs": [], "count": 0, "error": str(e)}


@app.get("/summary")
def get_summary():
    """
    Get detailed summary statistics including severity breakdown.
    """
    if not opensearch_client:
        raise HTTPException(status_code=503, detail="OpenSearch not available")

    try:
        # Get severity aggregation for logs
        log_severity_query = {
            "query": {"match_all": {}},
            "aggs": {
                "severity_breakdown": {
                    "terms": {
                        "field": "severity.keyword",
                        "size": 10
                    }
                },
                "event_type_breakdown": {
                    "terms": {
                        "field": "event_type.keyword",
                        "size": 20
                    }
                }
            },
            "size": 0
        }
        
        log_response = opensearch_client.search(index="logs", body=log_severity_query)
        log_severity = {bucket["key"]: bucket["doc_count"] for bucket in log_response["aggregations"]["severity_breakdown"]["buckets"]}
        log_types = {bucket["key"]: bucket["doc_count"] for bucket in log_response["aggregations"]["event_type_breakdown"]["buckets"]}
        
        # Get severity aggregation for alerts
        alert_severity_query = {
            "query": {"match_all": {}},
            "aggs": {
                "severity_breakdown": {
                    "terms": {
                        "field": "rule_severity.keyword",
                        "size": 10
                    }
                }
            },
            "size": 0
        }
        
        alert_response = opensearch_client.search(index="alerts", body=alert_severity_query)
        alert_severity = {bucket["key"]: bucket["doc_count"] for bucket in alert_response["aggregations"]["severity_breakdown"]["buckets"]}
        
        return {
            "log_severity": log_severity,
            "log_event_types": log_types,
            "alert_severity": alert_severity,
            "logs_total": log_response["hits"]["total"]["value"],
            "alerts_total": alert_response["hits"]["total"]["value"],
        }
    except Exception as e:
        logger.error(f"Error getting summary: {e}")
        return {
            "log_severity": {},
            "log_event_types": {},
            "alert_severity": {},
            "error": str(e)
        }


@app.put("/incidents/{incident_id}/status")
async def update_incident_status(incident_id: str, status: str):
    """
    Update incident status (open, investigating, resolved)
    """
    try:
        valid_statuses = ["open", "investigating", "resolved"]
        if status.lower() not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        
        # Try to get existing document first
        try:
            existing = opensearch_client.get(index="incidents", id=incident_id)
            # Update existing document
            update_body = {
                "doc": {
                    "status": status.lower(),
                    "updated_at": datetime.utcnow().isoformat()
                }
            }
            result = opensearch_client.update(index="incidents", id=incident_id, body=update_body)
        except:
            # Document doesn't exist, create it
            doc = {
                "pattern_id": incident_id,
                "status": status.lower(),
                "timestamp": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            result = opensearch_client.index(index="incidents", id=incident_id, body=doc)
        
        logger.info(f"Updated incident {incident_id} status to {status}")
        return {"success": True, "incident_id": incident_id, "status": status}
    except Exception as e:
        logger.error(f"Error updating incident status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/incidents/{incident_id}/investigate")
async def start_investigation(incident_id: str):
    """
    Mark incident as investigating
    """
    try:
        # Try to get existing document first
        try:
            existing = opensearch_client.get(index="incidents", id=incident_id)
            # Update existing document
            update_body = {
                "doc": {
                    "status": "investigating",
                    "investigation_started": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat()
                }
            }
            result = opensearch_client.update(index="incidents", id=incident_id, body=update_body)
        except:
            # Document doesn't exist, create it
            doc = {
                "pattern_id": incident_id,
                "status": "investigating",
                "timestamp": datetime.utcnow().isoformat(),
                "investigation_started": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            result = opensearch_client.index(index="incidents", id=incident_id, body=doc)
        
        logger.info(f"Started investigation on incident {incident_id}")
        return {"success": True, "incident_id": incident_id, "message": "Investigation started"}
    except Exception as e:
        logger.error(f"Error starting investigation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, notes: str = None):
    """
    Resolve incident with optional notes
    """
    try:
        # Try to get existing document first
        try:
            existing = opensearch_client.get(index="incidents", id=incident_id)
            # Update existing document
            update_body = {
                "doc": {
                    "status": "resolved",
                    "resolved_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat()
                }
            }
            if notes:
                update_body["doc"]["resolution_notes"] = notes
            
            result = opensearch_client.update(index="incidents", id=incident_id, body=update_body)
        except:
            # Document doesn't exist, create it
            doc = {
                "pattern_id": incident_id,
                "status": "resolved",
                "timestamp": datetime.utcnow().isoformat(),
                "resolved_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat()
            }
            if notes:
                doc["resolution_notes"] = notes
            
            result = opensearch_client.index(index="incidents", id=incident_id, body=doc)
        
        logger.info(f"Resolved incident {incident_id}")
        return {"success": True, "incident_id": incident_id, "message": "Incident resolved"}
    except Exception as e:
        logger.error(f"Error resolving incident: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search")
def advanced_search(
    q: str = None,
    hours: int = 24,
    limit: int = 100,
    offset: int = 0,
    sort_by: str = "timestamp",
    sort_order: str = "desc",
    index: str = "logs,alerts"  # Search both logs and alerts by default
):
    """
    Advanced search with SIEM query syntax.
    
    Query examples:
      - severity:high
      - event_type:login_failure AND severity:high
      - host:prod-* AND (user:admin OR user:root)
      - timestamp:1h ago
      - source_ip:192.168.* AND destination_port:443
    
    Parameters:
      - index: Comma-separated list of indices to search (default: "logs,alerts")
    """
    logger.info(f"SEARCH ENDPOINT CALLED - Query: {q}, Index: {index}")
    
    if not opensearch_client:
        raise HTTPException(status_code=503, detail="OpenSearch not available")
    
    if not q:
        raise HTTPException(status_code=400, detail="Query parameter 'q' is required")
    
    try:
        # Parse advanced query
        if QueryParser is None:
            logger.error("QueryParser not available - falling back to simple search")
            # Fallback: simple keyword search
            query_dsl = {
                "query": {
                    "bool": {
                        "must": [
                            {"match_all": {}}
                        ]
                    }
                }
            }
        else:
            parser = QueryParser(q)
            query_dsl = parser.parse()
        
        # Add time range filter
        now = datetime.utcnow()
        start_time = (now - timedelta(hours=hours)).isoformat() + "Z"
        
        # Merge time range into query - wrap non-bool queries in bool
        if "bool" not in query_dsl.get("query", {}):
            # If the query isn't already a bool query, wrap it
            existing_query = query_dsl.get("query", {"match_all": {}})
            query_dsl["query"] = {
                "bool": {
                    "must": [existing_query]
                }
            }
        
        # Ensure must array exists
        if "must" not in query_dsl["query"].get("bool", {}):
            query_dsl["query"]["bool"]["must"] = []
        
        # Add time range filter
        query_dsl["query"]["bool"]["must"].append({
            "range": {
                "timestamp": {
                    "gte": start_time,
                    "lte": now.isoformat() + "Z"
                }
            }
        })
        
        # Add sorting
        query_dsl["sort"] = [{sort_by: {"order": sort_order}}]
        query_dsl["from"] = offset
        query_dsl["size"] = limit
        
        # Debug logging
        logger.info(f"Advanced search - Query: {q}")
        logger.info(f"Generated DSL: {json.dumps(query_dsl, indent=2)}")
        
        # Execute search across specified indices
        response = opensearch_client.search(index=index, body=query_dsl)
        
        results = []
        for hit in response["hits"]["hits"]:
            log = hit["_source"]
            log["_id"] = hit["_id"]
            log["_score"] = hit.get("_score", 0)
            results.append(log)
        
        return {
            "query": q,
            "results": results,
            "count": len(results),
            "total": response["hits"]["total"]["value"],
            "took_ms": response["took"]
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid query: {str(e)}")
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search/suggestions")
def get_search_suggestions():
    """Get example queries and field suggestions for autocomplete"""
    if QueryParser is None:
        return {
            "examples": [],
            "fields": ["severity", "event_type", "source", "host", "user", "ip"],
            "operators": ["AND", "OR"],
            "comparisons": [">", "<"],
            "syntax_help": {
                "note": "Query parser not available"
            }
        }
    
    return {
        "examples": EXAMPLE_QUERIES,
        "fields": list(QueryParser.FIELD_MAPPING.keys()),
        "operators": ["AND", "OR", "NOT"],
        "comparisons": [">", ">=", "<", "<=", "="],
        "wildcards": ["*", "?"],
        "syntax_help": {
            "basic": "field:value",
            "wildcard": "field:prod-*",
            "phrase": 'field:"exact phrase"',
            "range": "field:>100",
            "time": "timestamp:1h ago",
            "logical": "AND, OR operators",
            "grouping": "(condition1 OR condition2)",
        }
    }


@app.post("/search/save")
def save_search(name: str, query: str, description: str = None):
    """Save a search query for later use"""
    try:
        doc = {
            "name": name,
            "query": query,
            "description": description,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "created_by": "system",
            "usage_count": 0
        }
        
        result = opensearch_client.index(index="saved_searches", body=doc)
        
        return {
            "id": result["_id"],
            "name": name,
            "query": query,
            "status": "saved"
        }
    except Exception as e:
        logger.error(f"Error saving search: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/search/saved")
def get_saved_searches():
    """Get all saved searches"""
    try:
        query = {
            "query": {"match_all": {}},
            "size": 100,
            "sort": [{"created_at": {"order": "desc"}}]
        }
        
        response = opensearch_client.search(index="saved_searches", body=query)
        
        searches = []
        for hit in response["hits"]["hits"]:
            search = hit["_source"]
            search["_id"] = hit["_id"]
            searches.append(search)
        
        return {"searches": searches, "count": len(searches)}
    except Exception as e:
        logger.error(f"Error getting saved searches: {e}")
        return {"searches": [], "count": 0}


@app.post("/rules/create")
async def create_custom_rule(request: Request):
    """
    Create a new custom detection rule dynamically.
    Accepts rule definition and writes it to the rules directory.
    """
    try:
        rule_data = await request.json()
        
        # Validate required fields
        if not rule_data.get("name"):
            raise HTTPException(status_code=400, detail="Rule name is required")
        if not rule_data.get("description"):
            raise HTTPException(status_code=400, detail="Rule description is required")
        if not rule_data.get("severity"):
            raise HTTPException(status_code=400, detail="Rule severity is required")
        if not rule_data.get("condition"):
            raise HTTPException(status_code=400, detail="Rule condition is required")
        
        # Generate rule ID if not provided
        if not rule_data.get("id"):
            # Find the next available rule number
            import glob
            existing_rules = glob.glob("detection-engine/rules/DET-*.yaml")
            if existing_rules:
                max_num = max([int(f.split("DET-")[1].split("-")[0]) for f in existing_rules if "DET-" in f])
                rule_num = max_num + 1
            else:
                rule_num = 100
            rule_data["id"] = f"DET-{rule_num:03d}"
        
        # Sanitize filename
        filename_safe = rule_data["name"].lower().replace(" ", "-").replace("_", "-")
        filename_safe = "".join(c for c in filename_safe if c.isalnum() or c == "-")
        rule_file = f"detection-engine/rules/{rule_data['id']}-{filename_safe}.yaml"
        
        # Convert to YAML format
        import yaml
        yaml_content = yaml.dump(rule_data, default_flow_style=False, sort_keys=False)
        
        # Write to file
        os.makedirs("detection-engine/rules", exist_ok=True)
        with open(rule_file, "w") as f:
            f.write(yaml_content)
        
        logger.info(f"Created new custom rule: {rule_data['id']} - {rule_data['name']} -> {rule_file}")
        
        # Reload detection engine rules (if engine is running)
        try:
            from detection_engine import engine
            engine.load_rules()  # Reload rules dynamically
            logger.info("Detection engine rules reloaded")
        except Exception as reload_err:
            logger.warning(f"Could not reload detection engine: {reload_err}")
        
        return {
            "success": True,
            "rule_id": rule_data["id"],
            "message": f"Rule created successfully: {rule_file}",
            "file": rule_file
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating custom rule: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Failed to create rule: {str(e)}")


@app.post("/ai/analyze/{alert_id}")
async def analyze_alert_ai(alert_id: str):
    """
    Analyze a specific alert using AI and provide recommendations.
    """
    if not ai_agent or not ai_agent.groq_api_key:
        raise HTTPException(status_code=503, detail="AI agent not available or not configured")
    
    try:
        analysis = await ai_agent.analyze_alert(alert_id)
        
        if analysis:
            return {
                "success": True,
                "alert_id": alert_id,
                "analysis": analysis
            }
        else:
            raise HTTPException(status_code=404, detail="Alert not found or analysis failed")
            
    except Exception as e:
        logger.error(f"Error analyzing alert {alert_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/ai/analysis/{alert_id}")
async def get_alert_analysis(alert_id: str):
    """
    Get existing AI analysis for an alert.
    """
    if not ai_agent:
        raise HTTPException(status_code=503, detail="AI agent not available")
    
    try:
        analysis = await ai_agent.get_analysis_for_alert(alert_id)
        
        if analysis:
            return {
                "success": True,
                "alert_id": alert_id,
                "analysis": analysis
            }
        else:
            return {
                "success": True,
                "alert_id": alert_id,
                "analysis": None,
                "message": "No analysis found for this alert"
            }
            
    except Exception as e:
        logger.error(f"Error fetching analysis for alert {alert_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch analysis: {str(e)}")


@app.post("/ai/analyze/batch")
async def analyze_recent_alerts():
    """
    Trigger AI analysis of recent high-severity alerts.
    """
    if not ai_agent or not ai_agent.groq_api_key:
        raise HTTPException(status_code=503, detail="AI agent not available or not configured")
    
    try:
        # Run analysis in background
        asyncio.create_task(ai_agent.analyze_recent_alerts(hours=1, max_alerts=5))
        
        return {
            "success": True,
            "message": "Batch analysis started for recent high-severity alerts"
        }
        
    except Exception as e:
        logger.error(f"Error starting batch analysis: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start batch analysis: {str(e)}")


@app.get("/ai/stats")
async def get_ai_stats():
    """
    Get AI agent statistics and status.
    """
    if not ai_agent:
        return {
            "status": "disabled",
            "message": "AI agent not available"
        }
    
    try:
        stats = ai_agent.get_analysis_summary_stats()
        return {
            "success": True,
            "stats": stats
        }
        
    except Exception as e:
        logger.error(f"Error fetching AI stats: {e}")
        return {
            "success": False,
            "error": str(e),
            "stats": {
                "status": "error"
            }
        }


@app.post("/ai/convert-query")
async def convert_nl_query(request: Request):
    """
    Convert natural language query to SIEM query syntax using AI.
    
    Request body:
    {
        "query": "show me failed logins from admin users in the last hour"
    }
    
    Response:
    {
        "success": true,
        "query": "event_type:login_failure AND user:admin AND timestamp:>1h",
        "explanation": "Search for failed login attempts by admin users in the last hour",
        "fields_used": ["event_type", "user", "timestamp"],
        "original_query": "show me failed logins from admin users in the last hour"
    }
    """
    if not ai_agent:
        raise HTTPException(
            status_code=503,
            detail="AI agent not available. Please configure Groq API key."
        )
    
    try:
        data = await request.json()
        nl_query = data.get("query", "")
        
        if not nl_query:
            raise HTTPException(status_code=400, detail="Query parameter is required")
        
        logger.info(f"🤖 Converting natural language query: {nl_query}")
        
        result = await ai_agent.convert_natural_language_query(nl_query)
        
        if result.get("success"):
            logger.info(f"✓ Query converted: {result['query']}")
        else:
            logger.warning(f"⚠ Query conversion failed: {result.get('error')}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error converting query: {e}")
        raise HTTPException(status_code=500, detail=f"Query conversion failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
