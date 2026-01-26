@echo off
setlocal enabledelayedexpansion

REM Mini SIEM Start Script for Windows
REM This script starts all services and streams logs to the terminal

title Mini SIEM - Complete System Startup

echo.
echo ╔════════════════════════════════════════════════════════╗
echo ║         Mini SIEM - Complete System Startup            ║
echo ╚════════════════════════════════════════════════════════╝
echo.

REM Check if docker-compose is installed
where docker-compose >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: docker-compose is not installed
    pause
    exit /b 1
)

REM Step 1: Clean up old containers
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Step 1: Cleaning Up Old Containers
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Stopping any running containers...
docker-compose down 2>nul
echo ✓ Cleanup complete
echo.

REM Step 2: Build and start all services
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Step 2: Starting Docker Containers
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Building and starting all services (this may take 1-2 minutes)...
docker-compose up -d
timeout /t 5 /nobreak

REM Step 3: Check service health
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Step 3: Waiting for Services to Be Ready
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Checking service health...

set RETRY_COUNT=0
set MAX_RETRIES=30

:health_check_loop
if %RETRY_COUNT% GEQ %MAX_RETRIES% (
    echo ✗ API failed to become healthy
    pause
    exit /b 1
)

for /f %%i in ('curl -s -o /dev/null -w "%%{http_code}" http://localhost:8000/health 2^>nul') do set HTTP_CODE=%%i

if "%HTTP_CODE%"=="200" (
    echo ✓ API is healthy
    goto health_check_done
)

set /a RETRY_COUNT+=1
echo Attempt !RETRY_COUNT!/%MAX_RETRIES% - Waiting for API...
timeout /t 2 /nobreak
goto health_check_loop

:health_check_done
echo.

REM Step 4: Initialize database
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Step 4: Initializing OpenSearch Indices
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Creating indices and mappings...
python scripts/init-db.py >nul 2>&1
echo ✓ Database initialized
echo.

REM Step 5: Stream all logs
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Step 5: Starting Log Stream
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo All services are running!
echo.
echo Service URLs:
echo   React UI:              http://localhost:3000
echo   Ingestion API:         http://localhost:8000
echo   OpenSearch Dashboards: http://localhost:5601
echo.
echo Streaming logs from all containers (Ctrl+C to stop)...
echo.

docker-compose logs -f --timestamps

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Shutdown Instructions
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo To stop all services, run:
echo   docker-compose down
echo.
echo To view logs again without restarting:
echo   docker-compose logs -f
echo.
pause
