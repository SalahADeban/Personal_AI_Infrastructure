#!/bin/bash
# PAI Services Auto-Deploy
# Pulls latest from git and rebuilds changed containers
# Run via cron: */5 * * * * /DATA/AppData/pai/autodeploy.sh >> /DATA/AppData/pai/autodeploy.log 2>&1

set -e

PAI_DIR="${PAI_DIR:-/DATA/AppData/pai}"
REPO_URL="${REPO_URL:-https://github.com/SalahADeban/Personal_AI_Infrastructure.git}"
BRANCH="${BRANCH:-main}"

cd "$PAI_DIR"

# Pull latest changes
git fetch origin "$BRANCH" --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0  # No changes
fi

echo "[$(date)] Changes detected, deploying..."
git pull origin "$BRANCH" --quiet

# Track which services changed
CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE")

# Rebuild changed services
rebuild_service() {
    local name=$1
    local path=$2
    local port=$3

    if echo "$CHANGED" | grep -q "Packs/$path/"; then
        echo "[$(date)] Rebuilding $name..."
        cd "$PAI_DIR/Packs/$path/docker"
        docker compose build --quiet
        docker compose up -d
        echo "[$(date)] $name deployed on port $port"
    fi
}

rebuild_service "PAI Gateway" "kai-services-gateway" 4001
rebuild_service "NewsScanner" "kai-news-scanner" 5182
rebuild_service "TrendRadar" "kai-trend-radar" 5180
rebuild_service "IchimokuRadar" "kai-ichimoku-radar" 5181

echo "[$(date)] Deploy complete"
