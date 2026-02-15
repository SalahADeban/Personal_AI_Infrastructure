#!/bin/bash
# PAI Services - Server Setup
# Run once on your server to set up auto-deploy

set -e

PAI_DIR="${PAI_DIR:-/DATA/AppData/pai}"
REPO_URL="${1:-}"

if [ -z "$REPO_URL" ]; then
    echo "Usage: ./server-setup.sh https://github.com/YOUR_USERNAME/PAI.git"
    exit 1
fi

echo "=== PAI Services Setup ==="
echo "Install path: $PAI_DIR"
echo "Repo: $REPO_URL"
echo ""

# Create directory
sudo mkdir -p "$PAI_DIR"
sudo chown -R $(whoami):$(whoami) "$PAI_DIR"

# Clone repo
if [ -d "$PAI_DIR/.git" ]; then
    echo "Repo already exists, pulling latest..."
    cd "$PAI_DIR"
    git pull
else
    echo "Cloning repository..."
    git clone "$REPO_URL" "$PAI_DIR"
fi

cd "$PAI_DIR"

# Create docker network
sudo docker network create pai-network 2>/dev/null || true

# Make autodeploy executable
chmod +x Packs/autodeploy.sh

# Initial deploy of all services
echo ""
echo "=== Building Services ==="

deploy_service() {
    local name=$1
    local path=$2
    local port=$3

    if [ -d "Packs/$path/docker" ]; then
        echo "Building $name..."
        cd "$PAI_DIR/Packs/$path/docker"
        sudo docker compose build
        sudo docker compose up -d
        echo "$name running on port $port"
        cd "$PAI_DIR"
    else
        echo "Skipping $name (no docker config)"
    fi
}

deploy_service "PAI Gateway" "kai-services-gateway" 4001
deploy_service "NewsScanner" "kai-news-scanner" 5182
deploy_service "TrendRadar" "kai-trend-radar" 5180
deploy_service "IchimokuRadar" "kai-ichimoku-radar" 5181

# Set up cron job
echo ""
echo "=== Setting up Cron ==="
CRON_CMD="*/5 * * * * cd $PAI_DIR && ./Packs/autodeploy.sh >> $PAI_DIR/autodeploy.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "autodeploy.sh"; then
    echo "Cron job already exists"
else
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    echo "Cron job added (checks every 5 minutes)"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Services running:"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "gateway|scanner|radar|ichimoku" || echo "  (none yet)"
echo ""
echo "Dashboard: http://$(hostname -I | awk '{print $1}'):4001"
echo ""
echo "To deploy changes:"
echo "  1. Push to git: git push"
echo "  2. Wait up to 5 minutes (or run: $PAI_DIR/Packs/autodeploy.sh)"
echo ""
echo "Logs: tail -f $PAI_DIR/autodeploy.log"
