"""
Advanced query parser for SIEM search syntax.
Supports simple and complex query expressions.

Examples:
  - severity:high
  - event_type:login_failure AND severity:high
  - host:prod-* AND (user:admin OR user:root)
  - timestamp:>1h ago
  - source_ip:192.168.* AND destination_port:443
  - raw.commandline:*powershell* AND severity:critical
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Any, Tuple


class QueryParser:
    """Parse SIEM query syntax and convert to OpenSearch DSL"""
    
    # Supported field mappings
    FIELD_MAPPING = {
        'severity': 'severity',
        'event_type': 'event_type',
        'source': 'source',
        'host': 'host',
        'user': 'user',
        'ip': 'ip',
        'source_ip': 'source_ip',
        'destination_ip': 'destination_ip',
        'destination_port': 'destination_port',
        'protocol': 'protocol.keyword',
        'process_name': 'raw.process_name.keyword',
        'commandline': 'raw.commandline',
        'domain': 'raw.domain',
        'file_name': 'raw.file_name.keyword',
        'status': 'raw.status.keyword',
    }
    
    # Fields that are keyword type and need case-insensitive matching
    KEYWORD_FIELDS = {
        'severity', 'event_type', 'source', 'host', 'user'
    }
    
    # Relative time expressions
    TIME_PATTERNS = {
        'now': 0,
        '\\d+s': 'seconds',
        '\\d+m': 'minutes',
        '\\d+h': 'hours',
        '\\d+d': 'days',
    }
    
    def __init__(self, query_string: str):
        self.query_string = query_string.strip()
        self.tokens = []
        self.position = 0
        
    def parse(self) -> Dict[str, Any]:
        """Parse query string and return OpenSearch DSL"""
        if not self.query_string:
            return {"query": {"match_all": {}}}
        
        try:
            self._tokenize()
            condition = self._parse_or_expression()
            return {"query": condition}
        except Exception as e:
            raise ValueError(f"Query parse error: {e}")
    
    def _tokenize(self):
        """Tokenize the query string"""
        # Pattern for tokens: words, quoted strings, operators, parentheses
        pattern = r'("[^"]*"|\'[^\']*\'|[()]|[^\s()]+)'
        matches = re.findall(pattern, self.query_string)
        self.tokens = [m.strip('\'"') for m in matches]
    
    def _current_token(self) -> str:
        """Get current token without consuming"""
        if self.position < len(self.tokens):
            return self.tokens[self.position]
        return None
    
    def _consume_token(self) -> str:
        """Get and consume current token"""
        token = self._current_token()
        if token is not None:
            self.position += 1
        return token
    
    def _parse_or_expression(self) -> Dict[str, Any]:
        """Parse OR-separated expressions (lowest precedence)"""
        left = self._parse_and_expression()
        
        while self._current_token() and self._current_token().upper() == 'OR':
            self._consume_token()  # consume 'OR'
            right = self._parse_and_expression()
            left = {
                "bool": {
                    "should": [left, right],
                    "minimum_should_match": 1
                }
            }
        
        return left
    
    def _parse_and_expression(self) -> Dict[str, Any]:
        """Parse AND-separated expressions"""
        left = self._parse_primary_expression()
        
        while self._current_token() and self._current_token().upper() == 'AND':
            self._consume_token()  # consume 'AND'
            right = self._parse_primary_expression()
            left = {
                "bool": {
                    "must": [left, right]
                }
            }
        
        return left
    
    def _parse_primary_expression(self) -> Dict[str, Any]:
        """Parse primary expressions (field:value, parentheses)"""
        token = self._current_token()
        
        if token == '(':
            # Handle parenthesized expression
            self._consume_token()
            expr = self._parse_or_expression()
            if self._current_token() == ')':
                self._consume_token()
            return expr
        
        if token and ':' in token:
            return self._parse_field_condition()
        
        # Handle bare terms (search across all fields)
        return {
            "multi_match": {
                "query": token,
                "fields": ["*"],
                "type": "best_fields",
                "lenient": True
            }
        }
    
    def _parse_field_condition(self) -> Dict[str, Any]:
        """Parse field:value conditions"""
        condition = self._consume_token()
        field, value = condition.split(':', 1)
        field = field.strip()
        value = value.strip()
        
        # Map field name
        es_field = self.FIELD_MAPPING.get(field, field)
        
        # Special handling for severity when searching across logs and alerts
        # Logs use 'severity', alerts use 'rule_severity'
        if field == 'severity':
            return self._handle_severity_condition(value)
        
        # Handle wildcards and ranges
        if value.startswith('>'):
            # Numeric/datetime range
            return self._handle_range_condition(es_field, value)
        elif value.startswith('<'):
            return self._handle_range_condition(es_field, value)
        elif '*' in value or '?' in value:
            # Wildcard matching
            return {
                "wildcard": {
                    es_field: {
                        "value": value
                    }
                }
            }
        elif self._is_time_expression(value):
            # Relative time (e.g., "1h ago")
            return self._handle_time_condition(value)
        elif self._is_cidr(value):
            # CIDR matching for IPs
            return {
                "bool": {
                    "must": [{
                        "range": {
                            es_field: {
                                "gte": value.split('/')[0],
                                "lte": value.split('/')[0]
                            }
                        }
                    }]
                }
            }
        else:
            # Exact match or phrase
            if ' ' in value:
                # Phrase search
                return {
                    "match_phrase": {
                        es_field: value
                    }
                }
            else:
                # For keyword fields, use match query for better compatibility
                if field in self.KEYWORD_FIELDS:
                    return {
                        "match": {
                            es_field: {
                                "query": value.lower()
                            }
                        }
                    }
                else:
                    # Regular term query
                    return {
                        "term": {
                            es_field: value
                        }
                    }
    
    def _handle_severity_condition(self, value: str) -> Dict[str, Any]:
        """
        Handle severity field specially to search both 'severity' (logs) and 'rule_severity' (alerts).
        Returns a bool query that matches either field.
        """
        # Create a query that matches either severity or rule_severity
        return {
            "bool": {
                "should": [
                    {
                        "match": {
                            "severity": {
                                "query": value.lower()
                            }
                        }
                    },
                    {
                        "match": {
                            "rule_severity": {
                                "query": value.lower()
                            }
                        }
                    }
                ],
                "minimum_should_match": 1
            }
        }
    
    def _handle_range_condition(self, field: str, value: str) -> Dict[str, Any]:
        """Handle range conditions like >100 or <2024-01-01"""
        if value.startswith('>='):
            operator = 'gte'
            val = value[2:].strip()
        elif value.startswith('>'):
            operator = 'gt'
            val = value[1:].strip()
        elif value.startswith('<='):
            operator = 'lte'
            val = value[2:].strip()
        elif value.startswith('<'):
            operator = 'lt'
            val = value[1:].strip()
        else:
            raise ValueError(f"Invalid range: {value}")
        
        return {
            "range": {
                field: {
                    operator: val
                }
            }
        }
    
    def _handle_time_condition(self, value: str) -> Dict[str, Any]:
        """Handle relative time expressions like '1h ago', '2d ago'"""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        
        # Parse relative time (e.g., "1h ago", "2d ago")
        match = re.match(r'(\d+)([smhd])\s*(?:ago)?', value, re.IGNORECASE)
        if not match:
            raise ValueError(f"Invalid time expression: {value}")
        
        amount, unit = match.groups()
        amount = int(amount)
        
        delta_map = {
            's': timedelta(seconds=amount),
            'm': timedelta(minutes=amount),
            'h': timedelta(hours=amount),
            'd': timedelta(days=amount),
        }
        
        delta = delta_map.get(unit.lower())
        if not delta:
            raise ValueError(f"Unknown time unit: {unit}")
        
        start_time = now - delta
        
        return {
            "range": {
                "timestamp": {
                    "gte": start_time.isoformat() + "Z",
                    "lte": now.isoformat() + "Z"
                }
            }
        }
    
    def _is_time_expression(self, value: str) -> bool:
        """Check if value is a relative time expression"""
        return bool(re.match(r'\d+[smhd]\s*(?:ago)?$', value, re.IGNORECASE))
    
    def _is_cidr(self, value: str) -> bool:
        """Check if value is CIDR notation"""
        return '/' in value and re.match(r'\d+\.\d+\.\d+\.\d+/\d+', value)


def build_query(query_string: str, extra_filters: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Build OpenSearch query from SIEM syntax
    
    Args:
        query_string: SIEM query syntax
        extra_filters: Additional filters to apply (e.g., time range)
    
    Returns:
        OpenSearch query DSL
    """
    parser = QueryParser(query_string)
    query = parser.parse()
    
    # Add extra filters if provided
    if extra_filters:
        if 'range' in extra_filters:
            query['query']['bool'] = query['query'].get('bool', {'must': []})
            if 'must' not in query['query']['bool']:
                query['query']['bool']['must'] = []
            query['query']['bool']['must'].append({'range': extra_filters['range']})
    
    return query


# Common example queries
EXAMPLE_QUERIES = [
    ("severity:high", "All high severity events"),
    ("event_type:login_failure AND severity:high", "High severity login failures"),
    ("host:prod-* AND severity:critical", "Critical events on production servers"),
    ("source_ip:192.168.* AND destination_port:443", "HTTPS traffic from internal IPs"),
    ("user:admin OR user:root", "Events from admin/root users"),
    ("commandline:*powershell* AND severity:critical", "Critical PowerShell executions"),
    ("timestamp:1h ago", "Events from last hour"),
    ("(event_type:process_create OR event_type:network_connection) AND severity:high", "High severity process or network events"),
]
