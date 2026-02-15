#!/bin/bash
# TrendRadar - Deployment Script

set -e

REMOTE_USER="${REMOTE_USER:-salah}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_PATH="${REMOTE_PATH:-/DATA/AppData/trendradar}"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

COMMAND="${1:-}"
shift || true

while [[ $# -gt 0 ]]; do
    case $1 in
        --host) REMOTE_HOST="$2"; shift 2 ;;
        --user) REMOTE_USER="$2"; shift 2 ;;
        *) shift ;;
    esac
done

REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

check_host() {
    [[ -z "$REMOTE_HOST" ]] && error "Missing --host parameter"
}

cmd_push() {
    check_host
    log "Deploying TrendRadar to ${REMOTE}:${REMOTE_PATH}"

    ssh -t "${REMOTE}" "sudo mkdir -p ${REMOTE_PATH} && sudo chown -R \$(whoami):\$(whoami) ${REMOTE_PATH}"

    log "Packaging files..."
    TMPFILE=$(mktemp /tmp/trendradar.XXXXXX.tar.gz)
    tar -czf "$TMPFILE" \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='bun.lock' \
        --exclude='.server.pid' \
        --exclude='.server.log' \
        --exclude='data/history/*.json' \
        -C "$(pwd)" .

    log "Uploading..."
    scp "$TMPFILE" "${REMOTE}:/tmp/trendradar.tar.gz"
    ssh "${REMOTE}" "cd ${REMOTE_PATH} && tar -xzf /tmp/trendradar.tar.gz && rm /tmp/trendradar.tar.gz"
    rm "$TMPFILE"

    log "Creating network and building..."
    ssh -t "${REMOTE}" "sudo docker network create pai-network 2>/dev/null || true"

    # Update docker-compose to use pai-network
    ssh "${REMOTE}" "cat > ${REMOTE_PATH}/docker/docker-compose.yml << 'EOF'
services:
  trendradar:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    container_name: trendradar
    ports:
      - \"5180:5180\"
    volumes:
      - trendradar-data:/data
    environment:
      - DATA_DIR=/data
    restart: unless-stopped
    networks:
      - pai-network

networks:
  pai-network:
    external: true

volumes:
  trendradar-data:
EOF"

    ssh -t "${REMOTE}" "cd ${REMOTE_PATH}/docker && sudo docker compose build && sudo docker compose up -d"

    log "Done! Dashboard: http://${REMOTE_HOST}:5180"
}

cmd_logs() {
    check_host
    ssh -t "${REMOTE}" "cd ${REMOTE_PATH}/docker && sudo docker compose logs -f --tail=100"
}

cmd_status() {
    check_host
    ssh -t "${REMOTE}" "cd ${REMOTE_PATH}/docker && sudo docker compose ps && echo && curl -s http://localhost:5180/api/health | head -c 200"
}

case "${COMMAND}" in
    push) cmd_push ;;
    logs) cmd_logs ;;
    status) cmd_status ;;
    *) echo "Usage: ./deploy.sh push|logs|status --host IP" ;;
esac
