#!/bin/bash
set -e
REMOTE_USER="${REMOTE_USER:-salah}"
REMOTE_HOST="${REMOTE_HOST:-}"
REMOTE_PATH="${REMOTE_PATH:-/DATA/AppData/newsscanner}"

log() { echo -e "\033[0;32m[deploy]\033[0m $1"; }
error() { echo -e "\033[0;31m[error]\033[0m $1"; exit 1; }

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
check_host() { [[ -z "$REMOTE_HOST" ]] && error "Missing --host"; }

cmd_push() {
    check_host
    log "Deploying NewsScanner to ${REMOTE}:${REMOTE_PATH}"
    ssh -t "${REMOTE}" "sudo mkdir -p ${REMOTE_PATH} && sudo chown -R \$(whoami):\$(whoami) ${REMOTE_PATH}"

    TMPFILE=$(mktemp /tmp/newsscanner.XXXXXX.tar.gz)
    tar -czf "$TMPFILE" --exclude='node_modules' --exclude='.git' --exclude='bun.lock' -C "$(pwd)" .
    scp "$TMPFILE" "${REMOTE}:/tmp/newsscanner.tar.gz"
    ssh "${REMOTE}" "cd ${REMOTE_PATH} && tar -xzf /tmp/newsscanner.tar.gz && rm /tmp/newsscanner.tar.gz"
    rm "$TMPFILE"

    ssh -t "${REMOTE}" "sudo docker network create pai-network 2>/dev/null || true; cd ${REMOTE_PATH}/docker && sudo docker compose build && sudo docker compose up -d"
    log "Done! Dashboard: http://${REMOTE_HOST}:5182"
}

cmd_logs() { check_host; ssh -t "${REMOTE}" "cd ${REMOTE_PATH}/docker && sudo docker compose logs -f --tail=100"; }
cmd_status() { check_host; ssh -t "${REMOTE}" "cd ${REMOTE_PATH}/docker && sudo docker compose ps"; }

case "${COMMAND}" in
    push) cmd_push ;;
    logs) cmd_logs ;;
    status) cmd_status ;;
    *) echo "Usage: ./deploy.sh push|logs|status --host IP" ;;
esac
