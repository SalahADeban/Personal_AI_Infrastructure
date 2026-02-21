#!/bin/bash
# PAI Services Gateway - Deployment Script
# Deploys to Ubuntu/CasaOS server via SSH

set -e

# Configuration - Edit these for your server
REMOTE_USER="${REMOTE_USER:-salah}"
REMOTE_HOST="${REMOTE_HOST:-homeserver}"
REMOTE_PATH="${REMOTE_PATH:-/DATA/AppData/pai-gateway}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-pai-gateway}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
error() { echo -e "${RED}[error]${NC} $1"; exit 1; }

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

usage() {
    cat << EOF
PAI Services Gateway Deployment

Usage: ./deploy.sh [command] [options]

Commands:
  build         Build Docker image locally (requires Docker)
  build-remote  Build Docker image on remote server
  push          Push to remote server and deploy
  logs        View remote container logs
  status      Check remote container status
  stop        Stop remote containers
  restart     Restart remote containers
  shell       SSH into remote server

Options:
  --host      Remote host (default: homeserver)
  --user      Remote user (default: salah)
  --path      Remote path (default: /DATA/AppData/pai-gateway)

Environment variables:
  REMOTE_HOST, REMOTE_USER, REMOTE_PATH

Examples:
  ./deploy.sh build                    # Build locally
  ./deploy.sh push                     # Deploy to server
  ./deploy.sh push --host 192.168.1.50 # Deploy to specific host
  ./deploy.sh logs                     # View logs
  ./deploy.sh status                   # Check status
EOF
}

# Parse arguments
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

cmd_build() {
    log "Building Docker image..."

    # Check if docker is available locally
    if command -v docker &> /dev/null; then
        docker build -t pai-gateway:latest -f docker/Dockerfile .
        log "Build complete: pai-gateway:latest"
        docker images pai-gateway:latest --format "Size: {{.Size}}"
    else
        warn "Docker not available locally. Use 'deploy.sh push' to build on remote server."
        warn "Or start Docker Desktop and run again."
    fi
}

cmd_build_remote() {
    log "Building Docker image on ${REMOTE}..."

    # Package and upload files
    log "Packaging files..."
    TMPFILE=$(mktemp /tmp/pai-gateway.XXXXXX.tar.gz)
    tar -czf "$TMPFILE" \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='bun.lock' \
        --exclude='.env' \
        --exclude='config/services.yaml' \
        -C "$(pwd)" .

    log "Uploading to server..."
    ssh "${REMOTE}" "mkdir -p ${REMOTE_PATH}"
    scp "$TMPFILE" "${REMOTE}:/tmp/pai-gateway.tar.gz"
    ssh "${REMOTE}" "cd ${REMOTE_PATH} && tar -xzf /tmp/pai-gateway.tar.gz && rm /tmp/pai-gateway.tar.gz"
    rm "$TMPFILE"

    # Build on remote
    ssh -t "${REMOTE}" "
        cd ${REMOTE_PATH}/docker
        sudo docker build -t pai-gateway:latest -f Dockerfile ..
        sudo docker images pai-gateway:latest --format 'Size: {{.Size}}'
    "
    log "Remote build complete!"
}

cmd_push() {
    log "Deploying to ${REMOTE}:${REMOTE_PATH}"

    # Check SSH connection
    if ! ssh -q "${REMOTE}" exit; then
        error "Cannot connect to ${REMOTE}"
    fi

    # Create remote directory structure (with sudo for /DATA)
    log "Creating remote directories..."
    ssh -t "${REMOTE}" "sudo mkdir -p ${REMOTE_PATH}/{src/{services,sources,output},config,docker} && sudo chown -R \$(whoami):\$(whoami) ${REMOTE_PATH}"

    # Create tarball excluding unwanted files
    log "Packaging files..."
    TMPFILE=$(mktemp /tmp/pai-gateway.XXXXXX.tar.gz)
    tar -czf "$TMPFILE" \
        --exclude='node_modules' \
        --exclude='.git' \
        --exclude='bun.lock' \
        --exclude='.env' \
        --exclude='config/services.yaml' \
        -C "$(pwd)" .

    # Upload and extract
    log "Uploading to server..."
    scp "$TMPFILE" "${REMOTE}:/tmp/pai-gateway.tar.gz"
    ssh "${REMOTE}" "cd ${REMOTE_PATH} && tar -xzf /tmp/pai-gateway.tar.gz && rm /tmp/pai-gateway.tar.gz"
    rm "$TMPFILE"

    # Check if config exists on remote, if not copy example
    log "Checking config..."
    ssh "${REMOTE}" "
        if [ ! -f ${REMOTE_PATH}/config/services.yaml ]; then
            cp ${REMOTE_PATH}/config/services.example.yaml ${REMOTE_PATH}/config/services.yaml
            echo 'Created services.yaml from example - please configure it'
        fi
    "

    # Check if .env exists on remote, if not copy example
    ssh "${REMOTE}" "
        if [ ! -f ${REMOTE_PATH}/docker/.env ]; then
            cp ${REMOTE_PATH}/docker/.env.example ${REMOTE_PATH}/docker/.env
            echo 'Created .env from example - please configure webhooks'
        fi
    "

    # Build and start on remote
    log "Building and starting containers..."
    ssh -t "${REMOTE}" "
        cd ${REMOTE_PATH}/docker
        sudo docker compose build
        sudo docker compose up -d
        sudo docker compose ps
    "

    log "Deployment complete!"
    log "Gateway URL: http://${REMOTE_HOST}:4001"
    log "Health check: curl http://${REMOTE_HOST}:4001/api/health"
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
        curl -s http://localhost:4001/api/health | jq . || echo 'Gateway not responding'
        echo ''
        echo '=== Scheduler Status ==='
        curl -s http://localhost:4001/api/scheduler | jq . || echo 'Gateway not responding'
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

cmd_shell() {
    log "Connecting to ${REMOTE}..."
    ssh "${REMOTE}"
}

# Main
case "${COMMAND}" in
    build)        cmd_build ;;
    build-remote) cmd_build_remote ;;
    push)         cmd_push ;;
    logs)         cmd_logs ;;
    status)       cmd_status ;;
    stop)         cmd_stop ;;
    restart)      cmd_restart ;;
    shell)        cmd_shell ;;
    -h|--help|help|"") usage ;;
    *) error "Unknown command: ${COMMAND}" ;;
esac
