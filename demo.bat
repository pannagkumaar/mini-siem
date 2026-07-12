@echo off
setlocal enabledelayedexpansion

echo === Mini-SIEM: AI SOC Investigation Lab - Demo ===
echo.

cd /d "%~dp0"

REM 1. Verify Docker is available
echo [*] Checking Docker...
where docker >nul 2>nul
if errorlevel 1 (
    echo [x] Docker is not installed or not on PATH. Install Docker Desktop and re-run this script.
    exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
    echo [x] Docker is installed but the daemon isn't running. Start Docker Desktop and re-run this script.
    exit /b 1
)
echo [+] Docker is available

set COMPOSE_CMD=docker compose
docker compose version >nul 2>nul
if errorlevel 1 (
    set COMPOSE_CMD=docker-compose
)

REM 2. Start services
echo [*] Starting services (this can take a minute on first run)...
%COMPOSE_CMD% up --build -d
if errorlevel 1 (
    echo [x] Failed to start services. Check docker-compose output above.
    exit /b 1
)
echo [+] Services started

REM 3. Wait for the ingestion API to become healthy
echo [*] Waiting for the ingestion API to become healthy...
set HEALTHY=0
for /L %%i in (1,1,60) do (
    if !HEALTHY! == 0 (
        curl -sf http://localhost:8000/health >nul 2>nul
        if not errorlevel 1 (
            set HEALTHY=1
        ) else (
            timeout /t 2 /nobreak >nul
        )
    )
)
if !HEALTHY! == 0 (
    echo [x] Ingestion API did not become healthy in time. Check: %COMPOSE_CMD% logs ingestion-api
    exit /b 1
)
echo [+] Ingestion API is healthy

REM 4. Initialize OpenSearch indices
echo [*] Initializing OpenSearch indices...
python scripts\init-db.py
echo [+] Indices ready

REM 5. Replay the full attack chain
echo [*] Replaying synthetic full attack chain...
python scripts\replay_attack.py --scenario full_attack_chain --fast

REM 6. Give detection + correlation engines time to process
echo [*] Waiting for detection (~10s) and correlation (~20s) engines to catch up...
timeout /t 30 /nobreak >nul
echo [+] Detection and correlation should now have produced alerts + incidents

REM 7. Generate a sample incident report + AI RCA
echo [*] Generating incident report and AI RCA...
python scripts\generate_incident_report.py --incident latest

echo.
echo === Demo ready ===
echo.
echo   Dashboard:             http://localhost:3000
echo   API health:            http://localhost:8000/health
echo   API docs:              http://localhost:8000/docs
echo   OpenSearch Dashboards: http://localhost:5601
echo   Sample report:         outputs\sample_incident_report.md
echo   Sample AI RCA:         outputs\sample_ai_rca_report.md
echo.
echo See DEMO.md for a guided 90-second walkthrough.

endlocal
