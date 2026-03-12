#!/bin/sh
# =============================================================================
# OpenWrt Configuration Backup Script
# =============================================================================
#
# Run this ON the OpenWrt router via SSH before making changes
#
# Usage:
#   ssh root@192.168.1.1
#   sh backup.sh
#
# =============================================================================

set -e

BACKUP_DIR="/tmp"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/openwrt-backup-$TIMESTAMP.tar.gz"
CONFIG_BACKUP="$BACKUP_DIR/config-backup-$TIMESTAMP"

echo "=== OpenWrt Configuration Backup ==="
echo ""

# Full system backup
echo "[1/4] Creating full system backup..."
sysupgrade -b "$BACKUP_FILE"
echo "  Saved to: $BACKUP_FILE"

# Individual config files
echo ""
echo "[2/4] Backing up individual config files..."
mkdir -p "$CONFIG_BACKUP"
cp /etc/config/network "$CONFIG_BACKUP/" 2>/dev/null || echo "  network: not found"
cp /etc/config/firewall "$CONFIG_BACKUP/" 2>/dev/null || echo "  firewall: not found"
cp /etc/config/dhcp "$CONFIG_BACKUP/" 2>/dev/null || echo "  dhcp: not found"
cp /etc/config/wireless "$CONFIG_BACKUP/" 2>/dev/null || echo "  wireless: not found"
cp /etc/config/system "$CONFIG_BACKUP/" 2>/dev/null || echo "  system: not found"

# WireGuard keys (if exist)
echo ""
echo "[3/4] Backing up WireGuard keys..."
if [ -d /etc/wireguard ]; then
    cp -r /etc/wireguard "$CONFIG_BACKUP/" 2>/dev/null
    echo "  WireGuard keys backed up"
else
    echo "  No WireGuard keys found"
fi

# Package list
echo ""
echo "[4/4] Saving installed packages list..."
opkg list-installed > "$CONFIG_BACKUP/packages.txt"
echo "  Package list saved"

# Create tarball of config backup
tar -czf "$CONFIG_BACKUP.tar.gz" -C "$BACKUP_DIR" "config-backup-$TIMESTAMP"
rm -rf "$CONFIG_BACKUP"

echo ""
echo "=== Backup Complete ==="
echo ""
echo "Files created:"
echo "  Full backup:   $BACKUP_FILE"
echo "  Config backup: $CONFIG_BACKUP.tar.gz"
echo ""
echo "To download to your computer, run:"
echo "  scp root@$(uci get network.lan.ipaddr):$BACKUP_FILE ."
echo "  scp root@$(uci get network.lan.ipaddr):$CONFIG_BACKUP.tar.gz ."
echo ""
echo "To restore from backup:"
echo "  sysupgrade -r $BACKUP_FILE"
echo ""
