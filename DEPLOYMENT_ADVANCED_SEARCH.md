# Quick Deploy Guide - Advanced Search

## 1. Ensure Docker is Running
```powershell
# Check Docker status
docker --version

# If Docker Desktop isn't running, start it
# (It may take 30-60 seconds to start)
```

## 2. Stop Current Services
```powershell
# Navigate to SIEM directory
cd C:\Users\User\Documents\code\SIEM

# Stop containers
docker-compose down
```

## 3. Rebuild and Start
```powershell
# Build and start in background
docker-compose up --build -d

# Wait for services (takes 30-60 seconds)
Start-Sleep -Seconds 45

# Check status
docker-compose ps
```

**Expected output:**
```
NAME                COMMAND                  SERVICE                 STATUS
opensearch-node     "/usr/local/bin/docker-entrypoint.sh"           opensearch               Up
opensearch-dashboards  "/usr/local/bin/docker-entrypoint.sh"           opensearch-dashboards    Up
siem-ingestion-api   "python main.py"         ingestion-api           Up
siem-react-ui        "npm run dev"             react-ui                Up
syslog-server        "./syslog-server"         syslog-server           Up
```

## 4. Verify API is Ready
```powershell
# Check health endpoint
Invoke-RestMethod -Uri "http://localhost:8000/health"

# Should show:
# status     : healthy
# opensearch : connected
```

## 5. Access the UI
1. Open browser: `http://localhost:3000`
2. Click **Search** (🔍) in left menu
3. Try a query: `severity:high`

## 6. Check Backend Logs
```powershell
# If search endpoint not working:
docker-compose logs -f ingestion-api

# Look for error messages starting with "ERROR"
```

## 7. Sample Queries to Try

### Quick Test
```
severity:high
```

### Moderate
```
event_type:login_failure AND severity:high
```

### Complex
```
(host:prod-* OR host:prod-web-*) AND (event_type:privilege_escalation OR event_type:process_create) AND severity:critical
```

## 8. If Something Breaks

### Option A: Full Rebuild
```powershell
docker-compose down -v  # Remove volumes too
docker-compose up --build -d
```

### Option B: Just Rebuild API
```powershell
docker-compose build ingestion-api
docker-compose restart ingestion-api
```

### Option C: Check Frontend Build
```powershell
docker-compose logs react-ui | Select-String -Pattern "error|Error|ERROR"
```

## 9. Commit Changes to Git
```powershell
# Once deployed and tested
git add .
git commit -m "feat: Add advanced search with query parser and professional UI"
git push
```

---

## ✅ Deployment Checklist

- [ ] Docker is running
- [ ] Old containers stopped (`docker-compose down`)
- [ ] New build started (`docker-compose up --build -d`)
- [ ] Services are healthy (`docker-compose ps` - all should say "Up")
- [ ] API responds (`http://localhost:8000/health`)
- [ ] UI loads (`http://localhost:3000`)
- [ ] Search page accessible (click Search icon)
- [ ] Simple query works (`severity:high`)
- [ ] Changes committed to git

---

## 📊 What Got Added

### Backend Files
- `ingestion/api-python/query_parser.py` - Query parsing engine
- `ingestion/api-python/main.py` - 4 new endpoints added

### Frontend Files
- `frontend/react-ui/src/components/Search.jsx` - Search UI
- `frontend/react-ui/src/components/api.js` - New API calls
- `frontend/react-ui/src/App.jsx` - Navigation updated

### Documentation
- `ADVANCED_SEARCH_GUIDE.md` - Full feature guide
- `DEPLOYMENT_GUIDE.md` - This file

---

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| "Docker not found" | Start Docker Desktop |
| Port 3000 already in use | `docker-compose down` then try again |
| API 503 error | Wait 30 more seconds for OpenSearch to start |
| React UI blank | Check `docker-compose logs react-ui` |
| Search endpoint 404 | Rebuild with `docker-compose up --build` |
| Query parse error | Check syntax with autocomplete suggestions |

---

## 💡 Tips

1. **Autocomplete is your friend** - Start typing a field name to see suggestions
2. **Use wildcards** - `host:prod-*` matches any host starting with "prod-"
3. **Save frequently used queries** - Click 💾 button to save
4. **Check query help** - Click "Query Syntax Help" dropdown for details
5. **Look at examples** - Autocomplete shows working example queries

---

## 🎯 Next: Start Searching!

Once deployed:
1. Go to `http://localhost:3000`
2. Click Search (🔍)
3. Enter: `severity:high`
4. Click Search or press Enter
5. Explore results!

**Happy threat hunting! 🔍**
