#!/bin/bash

# Mini SIEM Start Script
# This script starts all services and streams logs to the terminal

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         Mini SIEM - Complete System Startup            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"

# Function to print section headers
print_header() {
    echo -e "\n${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}$1${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed${NC}"
    exit 1
fi

# Step 1: Clean up old containers
print_header "Step 1: Cleaning Up Old Containers"
echo "Stopping any running containers..."
docker-compose down 2>/dev/null || true
echo -e "${GREEN}✓ Cleanup complete${NC}"

# Step 2: Build and start all services
print_header "Step 2: Starting Docker Containers"
echo "Building and starting all services (this may take 1-2 minutes)..."
docker-compose up -d
sleep 5

# Step 3: Check service health
print_header "Step 3: Waiting for Services to Be Ready"
echo "Checking service health..."

MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ API is healthy${NC}"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Attempt $RETRY_COUNT/$MAX_RETRIES - Waiting for API..."
    sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ API failed to become healthy${NC}"
    exit 1
fi

# Step 4: Initialize database
print_header "Step 4: Initializing OpenSearch Indices"
echo "Creating indices and mappings..."
python scripts/init-db.py > /dev/null 2>&1
echo -e "${GREEN}✓ Database initialized${NC}"

# Step 5: Stream all logs
print_header "Step 5: Starting Log Stream"
echo -e "${GREEN}All services are running!${NC}\n"
echo "Service URLs:"
echo -e "  ${BLUE}React UI:${NC}              http://localhost:3000"
echo -e "  ${BLUE}Ingestion API:${NC}         http://localhost:8000"
echo -e "  ${BLUE}OpenSearch Dashboards:${NC} http://localhost:5601"
echo -e "\n${YELLOW}Streaming logs from all containers...${NC}\n"

# Stream logs from all containers
docker-compose logs -f --timestamps

# If we get here (Ctrl+C was pressed), show cleanup info
print_header "Shutdown Instructions"
echo "To stop all services, run:"
echo -e "  ${BLUE}docker-compose down${NC}"
echo ""
echo "To view logs again without restarting:"
echo -e "  ${BLUE}docker-compose logs -f${NC}"
