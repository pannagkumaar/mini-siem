# Test script for incident status update and resolve buttons
# Tests the new API endpoints for incident management

$API_URL = "http://localhost:8000"

Write-Host "=== Mini SIEM Incident Actions Test ===" -ForegroundColor Cyan

# First, get some incidents
Write-Host "`n1. Fetching incidents..." -ForegroundColor Yellow
$incidents = Invoke-RestMethod -Uri "$API_URL/incidents?hours=24" -ErrorAction SilentlyContinue

if ($incidents.incidents -and $incidents.incidents.Count -gt 0) {
    $incident = $incidents.incidents[0]
    $incidentId = $incident.pattern_id
    
    Write-Host "✓ Found incident: $incidentId" -ForegroundColor Green
    Write-Host "  Status: $($incident.status)" -ForegroundColor Cyan
    
    # Test 1: Start investigation
    Write-Host "`n2. Testing 'Investigate' action..." -ForegroundColor Yellow
    try {
        $investigateResponse = Invoke-RestMethod -Uri "$API_URL/incidents/$incidentId/investigate" -Method PUT
        Write-Host "✓ Investigate action successful" -ForegroundColor Green
        Write-Host "  Response: $($investigateResponse | ConvertTo-Json)" -ForegroundColor Cyan
    } catch {
        Write-Host "✗ Investigate action failed: $_" -ForegroundColor Red
    }
    
    # Test 2: Update status to open
    Write-Host "`n3. Testing 'Status Update' action (set to open)..." -ForegroundColor Yellow
    try {
        $statusResponse = Invoke-RestMethod -Uri "$API_URL/incidents/$incidentId/status?status=open" -Method PUT
        Write-Host "✓ Status update successful" -ForegroundColor Green
        Write-Host "  Response: $($statusResponse | ConvertTo-Json)" -ForegroundColor Cyan
    } catch {
        Write-Host "✗ Status update failed: $_" -ForegroundColor Red
    }
    
    # Test 3: Resolve incident
    Write-Host "`n4. Testing 'Resolve' action..." -ForegroundColor Yellow
    try {
        $resolveResponse = Invoke-RestMethod -Uri "$API_URL/incidents/$incidentId/resolve?notes=Test%20resolution" -Method PUT
        Write-Host "✓ Resolve action successful" -ForegroundColor Green
        Write-Host "  Response: $($resolveResponse | ConvertTo-Json)" -ForegroundColor Cyan
    } catch {
        Write-Host "✗ Resolve action failed: $_" -ForegroundColor Red
    }
    
    # Test 4: Verify status change
    Write-Host "`n5. Verifying status change..." -ForegroundColor Yellow
    try {
        $updatedIncidents = Invoke-RestMethod -Uri "$API_URL/incidents?hours=24" -ErrorAction SilentlyContinue
        $updatedIncident = $updatedIncidents.incidents | Where-Object { $_.pattern_id -eq $incidentId }
        if ($updatedIncident) {
            Write-Host "✓ Incident status updated to: $($updatedIncident.status)" -ForegroundColor Green
        }
    } catch {
        Write-Host "✗ Verification failed: $_" -ForegroundColor Red
    }
    
} else {
    Write-Host "⚠ No incidents found. Create some incidents first with:" -ForegroundColor Yellow
    Write-Host "  python scripts/send-log.py" -ForegroundColor Cyan
}

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
