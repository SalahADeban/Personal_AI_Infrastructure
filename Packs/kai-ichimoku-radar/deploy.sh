#!/bin/bash
# IchimokuRadar - Deployment Script

set -e

REMOTE_USER="${REMOTE_USER:-salah}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_PATH="${REMOTE_PATH:-/DATA/AppData/ichimoku-radar}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

usage() {
    cat << EOF
IchimokuRadar Deployment

Usage: ./deploy.sh [command] [options]

Commands:
  push        Push to remote server and deploy
  logs        View remote container logs
  status      Check remote container status
  stop        Stop remote containers
  restart     Restart remote containers

Options:
  --host      Remote host (required)
  --user      Remote user (default: salah)
  --path      Remote path (default: /DATA/AppData/ichimoku-radar)

Examples:
  ./deploy.sh push --host 192.168.1.50
  ./deploy.sh logs --host 192.168.1.50
  ./deploy.sh status --host 192.168.1.50
EOF
}

COMMAND="${1:-}"
shift || true

while [[ $# -gt 0 ]]; do
    case $1 in
        --host) REMOTE_HOST="$2"; shift 2 ;;
        --user) REMOTE_USER="$2"; shift 2 ;;
        --path) REMOTE_PATH="$2"; shift 2 ;;
        *) shift ;;
    esac
done

REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

check_host() {
    [[ -z "$REMOTE_HOST" ]] && error "Missing --host parameter"
}

cmd_push() {
    log "Deploying IchimokuRadar to ${REMOTE}:${REMOTE_PATH}"

    if ! ssh -q "${REMOTE}" exit; then
        error "Cannot connect to ${REMOTE}"
    fi

    # Create remote directories
    log "Creating remote directories..."
    ssh -t "${REMOTE}" "sudo mkdir -p ${REMOTE_PATH}/{src/data-sources,public,data/ohlcv,data/history,docker} && sudo chown -R \$(whoami):\$(whoami) ${REMOTE_PATH}"

    # Package files
    log "Packaging files..."
    TMPFILE=$(mktemp /tmp/ichimoku-radar.XXXXXX.tar.gz)
    tar -czf "$TMPFILE" \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='bun.lock' \
        --exclude='.server.pid' \
        --exclude='.server.log' \
        --exclude='data/ohlcv/*.json' \
        --exclude='data/history/*.json' \
        -C "$(pwd)" .

    # Upload and extract
    log "Uploading to server..."
    scp "$TMPFILE" "${REMOTE}:/tmp/ichimoku-radar.tar.gz"
    ssh "${REMOTE}" "cd ${REMOTE_PATH} && tar -xzf /tmp/ichimoku-radar.tar.gz && rm /tmp/ichimoku-radar.tar.gz"
    rm "$TMPFILE"

    # Create pai-network if it doesn't exist
    log "Setting up Docker network..."
    ssh -t "${REMOTE}" "sudo docker network create pai-network 2>/dev/null || true"

    # Build and start
    log "Building and starting container..."
    ssh -t "${REMOTE}" "
        cd ${REMOTE_PATH}/docker
        sudo docker compose build
        sudo docker compose up -d
        sudo docker compose ps
    "

    log "Deployment complete!"
    log "Dashboard: http://${REMOTE_HOST}:5181"
    log "API: http://${REMOTE_HOST}:5181/api/signals"
}

cmd_logs() {
    log "Fetching logs from ${REMOTE}..."
    ssh -t "${REMOTE}" "cd ${REMOTE_PATH}/docker && sudo docker compose logs -f --tail=100"
}

cmd_status() {
    log "Checking status on ${REMOTE}..."
    ssh -t "${REMOTE}" "
        cd ${REMOTE_PATH}/docker
        echo '=== Container Status ==='
        sudo docker compose ps
        echo ''
        echo '=== Health Check ==='
        curl -s http://localhost:5181/api/health | jq . || echo 'Not responding'
    "
}

cmd_stop() {
    log "Stopping containers on ${REMOTE}..."
    ssh -t "${REMOTE}" "cd ${REMOTE_PATH}/docker && sudo docker compose down"
    log "Containers stopped"
}

cmd_restart() {
    log "Restarting containers on ${REMOTE}..."
    ssh -t "${REMOTE}" "cd ${REMOTE_PATH}/docker && sudo docker compose restart"
    log "Containers restarted"
}

case "${COMMAND}" in
    push)    check_host; cmd_push ;;
    logs)    check_host; cmd_logs ;;
    status)  check_host; cmd_status ;;
    stop)    check_host; cmd_stop ;;
    restart) check_host; cmd_restart ;;
    -h|--help|help|"") usage ;;
    *) error "Unknown command: ${COMMAND}" ;;
esac
