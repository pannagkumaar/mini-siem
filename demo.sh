#!/usr/bin/env bash
#
# Mini-SIEM one-command demo (Linux/macOS/WSL/Git Bash)
#
# Starts the full stack, seeds the OpenSearch indices, replays a synthetic
# full attack chain, waits for detection + correlation to catch up, and
# exports a sample incident report + AI RCA. No paid API key required.
#
set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

step()  { echo -e "${CYAN}[*]${NC} $1"; }
ok()    { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[x]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BOLD}=== Mini-SIEM: AI SOC Investigation Lab - Demo ===${NC}"
echo ""

# 1. Verify Docker is available
step "Checking Docker..."
if ! command -v docker >/dev/null 2>&1; then
    err "Docker is not installed or not on PATH. Install Docker Desktop and re-run this script."
    exit 1
fi
if ! docker info >/dev/null 2>&1; then
    err "Docker is installed but the daemon isn't running. Start Docker and re-run this script."
    exit 1
fi
DOCKER_COMPOSE="docker compose"
if ! docker compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
fi
ok "Docker is available ($($DOCKER_COMPOSE version --short 2>/dev/null || echo ok))"

# 2. Start services
step "Starting services (this can take a minute on first run)..."
$DOCKER_COMPOSE up --build -d
ok "Services started"

# 3. Wait for the ingestion API to be healthy
step "Waiting for the ingestion API to become healthy..."
for i in $(seq 1 60); do
    if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
        ok "Ingestion API is healthy"
        break
    fi
    if [ "$i" -eq 60 ]; then
        err "Ingestion API did not become healthy in time. Check: $DOCKER_COMPOSE logs ingestion-api"
        exit 1
    fi
    sleep 2
done

# 4. Initialize OpenSearch indices
step "Initializing OpenSearch indices..."
python3 scripts/init-db.py || python scripts/init-db.py
ok "Indices ready"

# 5. Replay the full attack chain
step "Replaying synthetic full attack chain..."
python3 scripts/replay_attack.py --scenario full_attack_chain --fast || \
    python scripts/replay_attack.py --scenario full_attack_chain --fast

# 6. Give detection + correlation engines time to process
step "Waiting for detection (~10s) and correlation (~20s) engines to catch up..."
sleep 30
ok "Detection and correlation should now have produced alerts + incidents"

# 7. Generate a sample incident report + AI RCA
step "Generating incident report and AI RCA..."
python3 scripts/generate_incident_report.py --incident latest || \
    python scripts/generate_incident_report.py --incident latest

echo ""
echo -e "${BOLD}=== Demo ready ===${NC}"
echo ""
echo "  Dashboard:            http://localhost:3000"
echo "  API health:           http://localhost:8000/health"
echo "  API docs:             http://localhost:8000/docs"
echo "  OpenSearch Dashboards: http://localhost:5601"
echo "  Sample report:        outputs/sample_incident_report.md"
echo "  Sample AI RCA:         outputs/sample_ai_rca_report.md"
echo ""
echo "See DEMO.md for a guided 90-second walkthrough."
