# 🚀 Testing the Improved UI & Features

## Quick Start Guide

### Prerequisites
- Docker & Docker Compose installed
- Ports available: 514 (UDP), 3000, 5601, 8000, 9200

### Step 1: Start the System

```bash
# Navigate to project root
cd /path/to/SIEM

# Start all services
docker-compose up --build

# Wait 30-60 seconds for services to initialize
```

### Step 2: Initialize Database

In a separate terminal:
```bash
python scripts/init-db.py
```

### Step 3: Access the UI

Open your browser:
- **Main Dashboard**: http://localhost:3000
- **OpenSearch (Debug)**: http://localhost:5601
- **API Docs**: http://localhost:8000/docs

---

## 🧪 Testing Each Feature

### Dashboard Testing

**What to test:**
- [ ] Real-time KPI metrics update
- [ ] Severity distribution charts render
- [ ] Event type grid displays data
- [ ] Refresh rate selector works (2s, 5s, 10s, 30s)
- [ ] Engine info sections load
- [ ] Color coding is correct

**Expected results:**
```
✓ All 4 metrics visible with live counts
✓ Charts show severity distribution
✓ Refresh updates metrics without page reload
✓ No console errors
```

---

### Alerts Page Testing

**Step 1: Generate Test Data**
```bash
# In project root, run test log generator
python scripts/continuous-log-generator.py &
```

**What to test:**
- [ ] Alerts load and display
- [ ] Time range selector works (1, 6, 24 hours, 7 days)
- [ ] Severity filter buttons work
- [ ] Alert cards expand/collapse
- [ ] Expanded view shows all details:
  - Rule name and ID
  - Host, user, IP, event type
  - Full log JSON
  - Timestamp

**Expected results:**
```
✓ Alerts appear within 10 seconds
✓ Filters correctly narrow results
✓ Expanded cards show complete information
✓ JSON viewer displays properly formatted data
```

---

### Logs Page Testing

**What to test:**
- [ ] Logs load from multiple sources
- [ ] Time range selector works
- [ ] Severity filters work correctly
- [ ] Source filter shows available options
- [ ] Event type dropdown populates
- [ ] Log cards expand to show details
- [ ] Filters work in combination

**Test filters:**
1. Filter by severity only
2. Filter by source only
3. Filter by event type only
4. Combine multiple filters

**Expected results:**
```
✓ Logs display with correct badges
✓ Filters reduce results appropriately
✓ Expanded logs show all normalized fields
✓ Raw data section shows original log JSON
```

---

### Incidents Page Testing

**What to test:**
- [ ] Incidents display correctly
- [ ] Status filter works (open, investigating, resolved)
- [ ] Incident cards expand/collapse
- [ ] Expanded view shows:
  - Full details and metadata
  - Alert timeline
  - Recommendations
  - Action buttons

**Expected results:**
```
✓ Incidents appear if any are detected
✓ Status filter buttons reduce list
✓ Timeline shows related alerts
✓ All metadata displays correctly
```

---

### Rules Page Testing

**What to test:**
- [ ] All rules load and display count
- [ ] Severity metrics show correctly
- [ ] Severity filter works
- [ ] Rule cards expand/collapse
- [ ] Expanded view shows:
  - Rule condition JSON
  - MITRE tags (if present)
  - Full rule definition

**Expected results:**
```
✓ Rule count matches detection engine
✓ Severity breakdown is accurate
✓ Conditions display as formatted JSON
✓ MITRE tags styled as badges
```

---

### Navigation Testing

**What to test:**
- [ ] All 5 navigation buttons work
- [ ] Active page highlighted in sidebar
- [ ] Quick links in footer work
  - OpenSearch Dashboards
  - API Docs
- [ ] Page transitions smooth
- [ ] Current page indicator updates
- [ ] Time display in header updates

**Expected results:**
```
✓ Can navigate between all pages
✓ Active page clearly indicated
✓ Links open in new tabs
✓ No page reload issues
```

---

### API Integration Testing

**Test individual endpoints:**

```bash
# Test /alerts
curl http://localhost:8000/alerts?hours=24

# Test /logs with filters
curl "http://localhost:8000/logs?hours=24&severity=high"

# Test /summary
curl http://localhost:8000/summary

# Test /stats
curl http://localhost:8000/stats

# Test /rules
curl http://localhost:8000/rules

# Test /incidents
curl http://localhost:8000/incidents?hours=24
```

**Expected results:**
```
✓ All endpoints return valid JSON
✓ Data structure matches frontend expectations
✓ Filtering parameters work correctly
✓ Aggregations return accurate counts
```

---

## 📊 Data Volume Testing

### Test with Various Data Sizes

1. **Small Dataset** (1-100 logs)
   ```bash
   python scripts/send-log.py
   ```
   Expected: Instant load, responsive UI

2. **Medium Dataset** (1,000-10,000 logs)
   ```bash
   for i in {1..100}; do python scripts/continuous-log-generator.py; done
   ```
   Expected: <2 second load time, smooth scrolling

3. **Large Dataset** (100,000+ logs)
   - UI should still be responsive
   - Pagination/limits prevent overload
   - API should return within 5 seconds

---

## 🎨 Visual Testing Checklist

### Colors & Styling
- [ ] Severity colors match documentation:
  - Critical = Red (#ef4444)
  - High = Orange (#f97316)
  - Medium = Yellow (#eab308)
  - Low = Blue (#3b82f6)
- [ ] Status colors display correctly
- [ ] Source badges have correct colors
- [ ] Hover effects work on buttons
- [ ] Selected filters highlighted properly

### Responsive Design
- [ ] Desktop (1920x1080): Full layout visible
- [ ] Tablet (768x1024): Sidebar collapses
- [ ] Mobile (375x667): Single column layout
- [ ] Text readable at all sizes
- [ ] Buttons clickable on mobile

### Performance
- [ ] Dashboard loads in <2 seconds
- [ ] Charts render smoothly
- [ ] Scrolling is smooth (60fps)
- [ ] Expand/collapse is instant
- [ ] No lag when typing in filters

---

## 🐛 Troubleshooting

### Issue: Alerts/Logs not showing

**Solution:**
```bash
# 1. Check if logs are being ingested
docker-compose logs ingestion-api

# 2. Verify OpenSearch has data
curl http://localhost:9200/logs/_count

# 3. Check browser console for errors
# (Open DevTools: F12)
```

### Issue: Filters not working

**Solution:**
```bash
# Check API endpoint
curl "http://localhost:8000/logs?hours=24&severity=high"

# Verify log data has correct fields
curl http://localhost:9200/logs/_search | jq '.hits.hits[0]._source'
```

### Issue: Page not updating

**Solution:**
```bash
# Check if API is running
curl http://localhost:8000/health

# Check network tab in DevTools
# Verify CORS headers are present

# Check browser console for CORS errors
```

### Issue: Slow performance

**Solution:**
1. Check Docker resource limits
2. Monitor OpenSearch logs
3. Reduce data limit in page selectors
4. Close other browser tabs

---

## ✅ Final Verification Checklist

Before considering improvements complete, verify:

### Backend
- [ ] `/alerts` endpoint returns data with correct schema
- [ ] `/logs` endpoint with filters works correctly
- [ ] `/summary` endpoint returns aggregations
- [ ] All endpoints have proper error handling
- [ ] CORS is properly configured
- [ ] Response times < 2 seconds

### Frontend
- [ ] All 5 pages load without errors
- [ ] Real-time updates work (auto-refresh)
- [ ] All filters function correctly
- [ ] Expandable cards show complete data
- [ ] JSON viewers display properly
- [ ] Color coding is consistent
- [ ] Responsive on multiple devices

### Integration
- [ ] Dashboard reflects incoming data
- [ ] Alerts appear when rules match
- [ ] Logs correlate with alerts
- [ ] Incidents link related events
- [ ] Rules display conditions correctly

### Data Quality
- [ ] All normalized fields present
- [ ] Timestamps are accurate
- [ ] IP addresses valid
- [ ] Severity levels standardized
- [ ] Event types consistent

---

## 📈 Performance Benchmarks

### Expected Response Times

| Endpoint | Data Size | Response Time |
|----------|-----------|----------------|
| /stats | Any | < 500ms |
| /summary | 10k+ logs | < 1s |
| /alerts | 1k | < 500ms |
| /logs | 1k | < 500ms |
| /incidents | Any | < 500ms |
| /rules | Any | < 100ms |

### Browser Performance

| Action | Expected Time |
|--------|----------------|
| Page load | < 2s |
| Switch page | < 500ms |
| Expand card | Instant |
| Filter apply | < 200ms |
| Auto-refresh | No visible lag |

---

## 🎯 Success Criteria

The improvements are considered successful when:

✅ **Functionality**
- All 5 main pages are fully functional
- All filters work correctly
- Real-time updates work smoothly
- Data displays with no truncation

✅ **UI/UX**
- Professional appearance with consistent styling
- Intuitive navigation
- Clear visual hierarchy
- Responsive across devices

✅ **Performance**
- Pages load in < 2 seconds
- No lag during interactions
- Smooth animations
- API responses < 2 seconds

✅ **Data Quality**
- All fields populated correctly
- Proper color coding
- Accurate counts and aggregations
- Proper timezone handling

---

## 📞 Support & Issues

### Getting Help
1. Check browser console (F12) for errors
2. Check container logs: `docker-compose logs <service>`
3. Verify all services running: `docker-compose ps`
4. Test API directly: `curl http://localhost:8000/health`

### Reporting Issues
Include:
- Step to reproduce
- Expected behavior
- Actual behavior
- Browser/OS info
- Console error messages
- API response (if applicable)

---

**Last Updated**: January 2026  
**Testing Version**: 2.0.0  
**Status**: Ready for Production ✓
