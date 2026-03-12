#!/bin/sh
# =============================================================================
# Safe Apply - Auto-revert if confirmation not received
# =============================================================================
#
# Applies network/firewall changes with automatic rollback after 60 seconds
# if you don't confirm. Prevents lockouts!
#
# Usage:
#   ssh root@192.168.1.1
#   sh safe-apply.sh
#
# =============================================================================

TIMEOUT=60
BACKUP_DIR="/tmp/safe-apply-backup"

echo "=== Safe Apply - Network Changes ==="
echo ""
echo "This will:"
echo "  1. Backup current config"
echo "  2. Apply pending changes"
echo "  3. Wait ${TIMEOUT}s for confirmation"
echo "  4. Auto-revert if no confirmation received"
echo ""

# Check for pending changes
PENDING=$(uci changes)
if [ -z "$PENDING" ]; then
    echo "No pending UCI changes. Nothing to apply."
    echo ""
    echo "Make changes first with 'uci set' commands, then run this script."
    exit 0
fi

echo "Pending changes:"
echo "$PENDING"
echo ""

read -p "Continue? (y/N) " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Aborted."
    exit 1
fi

# Create backup
echo ""
echo "[1/4] Creating backup..."
mkdir -p "$BACKUP_DIR"
cp /etc/config/network "$BACKUP_DIR/"
cp /etc/config/firewall "$BACKUP_DIR/"
cp /etc/config/dhcp "$BACKUP_DIR/"
cp /etc/config/wireless "$BACKUP_DIR/"
echo "  Backup saved to $BACKUP_DIR"

# Create revert script
cat > /tmp/revert-changes.sh << 'REVERT'
#!/bin/sh
echo "Reverting changes..."
cp /tmp/safe-apply-backup/* /etc/config/
/etc/init.d/network restart
/etc/init.d/firewall restart
echo "Reverted to previous configuration."
REVERT
chmod +x /tmp/revert-changes.sh

# Schedule automatic revert
echo ""
echo "[2/4] Scheduling auto-revert in ${TIMEOUT} seconds..."
(
    sleep $TIMEOUT
    if [ -f /tmp/safe-apply-pending ]; then
        echo "No confirmation received. Reverting..."
        /tmp/revert-changes.sh
        rm -f /tmp/safe-apply-pending
    fi
) &
REVERT_PID=$!

# Mark as pending
touch /tmp/safe-apply-pending

# Apply changes
echo ""
echo "[3/4] Applying changes..."
uci commit
/etc/init.d/network restart
/etc/init.d/firewall restart

echo ""
echo "============================================================"
echo " Changes applied! You have ${TIMEOUT} seconds to confirm."
echo "============================================================"
echo ""
echo "If you can still connect, run:"
echo "  rm /tmp/safe-apply-pending"
echo ""
echo "Or confirm now by typing 'confirm':"
echo ""

# Wait for confirmation
while [ -f /tmp/safe-apply-pending ]; do
    read -t 5 input
    if [ "$input" = "confirm" ]; then
        rm -f /tmp/safe-apply-pending
        kill $REVERT_PID 2>/dev/null
        echo ""
        echo "[4/4] Confirmed! Changes are permanent."
        echo ""
        rm -rf "$BACKUP_DIR"
        rm -f /tmp/revert-changes.sh
        exit 0
    fi
done

echo "Changes confirmed (pending file removed)."
kill $REVERT_PID 2>/dev/null
rm -rf "$BACKUP_DIR"
rm -f /tmp/revert-changes.sh
