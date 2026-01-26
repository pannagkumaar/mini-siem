# ✅ Incident Action Buttons - Fixed

## Issues Resolved

### 1. **Investigate Button Not Working**
- **Problem**: 500 error "document_missing_exception"
- **Cause**: Incidents from correlation engine didn't have persistent document IDs in OpenSearch
- **Solution**: 
  - Modified `/incidents/{incident_id}/investigate` endpoint to create document if missing
  - Uses try/catch to either update existing or create new document
  - Returns proper response on success

### 2. **Status Update Button Not Working**
- **Problem**: 500 error when attempting status updates
- **Cause**: Same as above - missing documents in OpenSearch index
- **Solution**:
  - Added try/catch pattern to `/incidents/{incident_id}/status` endpoint
  - Creates document with initial data if it doesn't exist
  - Preserves pattern_id when creating new documents

### 3. **Resolve Button Not Working**
- **Problem**: 500 error when attempting resolution
- **Cause**: Document persistence issue
- **Solution**:
  - Updated `/incidents/{incident_id}/resolve` endpoint with same try/catch pattern
  - Supports optional resolution notes parameter
  - Creates document if missing with resolved status

### 4. **Incidents Disappearing After Status Update**
- **Problem**: Updated incidents would disappear from the UI
- **Cause**: Frontend was reading from transient correlation engine data, not OpenSearch
- **Solution**:
  - Changed `/incidents` endpoint to query OpenSearch `incidents` index directly
  - Fallback to correlation engine if OpenSearch query fails
  - Now persists manual updates permanently
  - Includes `_id` field from OpenSearch for proper identification

### 5. **Buttons Using Wrong Document ID**
- **Problem**: Buttons passed `pattern_id` but OpenSearch uses `_id`
- **Cause**: API returns incidents with both fields, but update endpoints expected `_id`
- **Solution**:
  - Updated all button handlers to use `incident._id || incident.pattern_id`
  - Ensures compatibility with both correlation engine and stored incidents

## Code Changes

### Backend (`ingestion/api-python/main.py`)

#### Updated `/incidents` endpoint
```python
@app.get("/incidents")
def get_recent_incidents(hours: int = 24):
    """Query OpenSearch incidents index instead of correlation engine"""
    # Queries incidents index with proper time range
    # Returns incidents with _id field for proper updates
    # Includes fallback to correlation engine if needed
```

#### Updated `/incidents/{incident_id}/investigate`
```python
@app.put("/incidents/{incident_id}/investigate")
async def start_investigation(incident_id: str):
    # Try to get and update existing document
    # If not found, create new document with investigating status
    # Sets investigation_started timestamp
```

#### Updated `/incidents/{incident_id}/status`
```python
@app.put("/incidents/{incident_id}/status")
async def update_incident_status(incident_id: str, status: str):
    # Validates status is one of: open, investigating, resolved
    # Updates existing or creates new document
    # Preserves pattern_id field
```

#### Updated `/incidents/{incident_id}/resolve`
```python
@app.put("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: str, notes: str = None):
    # Updates existing or creates new document
    # Sets resolved status and resolved_at timestamp
    # Optionally stores resolution notes
```

### Frontend (`frontend/react-ui/src/components/Incidents.jsx`)

#### Updated Button Handlers
- `handleInvestigate()` - Now correctly updates local state and persists
- `handleStatusUpdate()` - Updates status and shows success message
- `handleResolve()` - Resolves incident with optional notes

#### Updated Button IDs
```jsx
onClick={() => handleInvestigate(incident._id || incident.pattern_id, idx)}
onClick={() => handleStatusUpdate(incident._id || incident.pattern_id, idx, 'open')}
onClick={() => handleResolve(incident._id || incident.pattern_id, idx)}
```

## Testing

### Test 1: Investigate Button ✓
```bash
curl -X PUT http://localhost:8000/incidents/TEST-001/investigate
Response: {"success": true, "incident_id": "TEST-001", "message": "Investigation started"}
```

### Test 2: Status Update Button ✓
```bash
curl -X PUT "http://localhost:8000/incidents/TEST-002/status?status=resolved"
Response: {"success": true, "incident_id": "TEST-002", "status": "resolved"}
```

### Test 3: Resolve Button ✓
```bash
curl -X PUT "http://localhost:8000/incidents/TEST-003/resolve?notes=Fixed"
Response: {"success": true, "incident_id": "TEST-003", "message": "Incident resolved"}
```

### Test 4: Persistence ✓
Updated incidents now appear in `/incidents` endpoint indefinitely

## User Experience Improvements

1. **Instant Feedback**: Buttons show loading state while processing
2. **Success Messages**: Green success notification appears after action
3. **Status Persistence**: Updated incidents stay in database
4. **Error Handling**: Clear error messages if action fails
5. **Button States**: Buttons disable when appropriate (e.g., can't investigate twice)

## Files Modified

1. **Backend**
   - `ingestion/api-python/main.py` - 3 endpoint fixes + 1 query fix

2. **Frontend**
   - `frontend/react-ui/src/components/Incidents.jsx` - Button ID fixes

## Status

✅ All incident action buttons now fully functional
✅ Updates persist in OpenSearch
✅ No more disappearing incidents
✅ Clear user feedback on all actions
✅ Tested and working

