#!/bin/sh
# =============================================================================
# Validate OpenWrt Configuration Before Applying
# =============================================================================
#
# Checks for common configuration errors that cause lockouts.
# Run this BEFORE applying any network changes.
#
# Usage:
#   sh validate-config.sh
#
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

error() { echo "${RED}[ERROR]${NC} $1"; ERRORS=$((ERRORS + 1)); }
warn()  { echo "${YELLOW}[WARN]${NC} $1"; WARNINGS=$((WARNINGS + 1)); }
pass()  { echo "${GREEN}[OK]${NC} $1"; }
info()  { echo "[INFO] $1"; }

echo "=============================================="
echo " OpenWrt Configuration Validator"
echo "=============================================="
echo ""

# =============================================================================
# Check UCI syntax
# =============================================================================

echo "=== Checking UCI Syntax ==="
echo ""

for cfg in network firewall dhcp wireless; do
    if [ -f "/etc/config/$cfg" ]; then
        if uci show $cfg > /dev/null 2>&1; then
            pass "$cfg: syntax OK"
        else
            error "$cfg: syntax error"
            uci show $cfg 2>&1 | head -5
        fi
    else
        info "$cfg: not found (may be optional)"
    fi
done

# =============================================================================
# Check for lockout conditions
# =============================================================================

echo ""
echo "=== Checking for Lockout Conditions ==="
echo ""

# Check LAN interface has valid IP
LAN_IP=$(uci get network.lan.ipaddr 2>/dev/null)
if [ -z "$LAN_IP" ]; then
    error "LAN interface has no IP address - YOU WILL BE LOCKED OUT"
else
    pass "LAN IP: $LAN_IP"
fi

# Check LAN interface has a device
LAN_DEV=$(uci get network.lan.device 2>/dev/null || uci get network.lan.ifname 2>/dev/null)
if [ -z "$LAN_DEV" ]; then
    error "LAN interface has no device assigned"
else
    pass "LAN device: $LAN_DEV"
fi

# Check if LAN device actually exists (for VLAN changes)
if echo "$LAN_DEV" | grep -q "\."; then
    # It's a VLAN device, check if base exists
    BASE_DEV=$(echo "$LAN_DEV" | cut -d. -f1)
    if ip link show "$BASE_DEV" > /dev/null 2>&1; then
        pass "Base device $BASE_DEV exists"
    else
        warn "Base device $BASE_DEV may not exist"
    fi
fi

# Check firewall has LAN zone
if uci show firewall 2>/dev/null | grep -q "name='lan'"; then
    pass "Firewall LAN zone exists"
else
    warn "No firewall zone named 'lan' - may lose router access"
fi

# Check LAN zone allows input
LAN_INPUT=$(uci show firewall 2>/dev/null | grep "name='lan'" -A5 | grep input | head -1)
if echo "$LAN_INPUT" | grep -qi "accept"; then
    pass "LAN zone accepts input"
elif echo "$LAN_INPUT" | grep -qi "reject\|drop"; then
    error "LAN zone REJECTS input - YOU WILL BE LOCKED OUT"
fi

# =============================================================================
# Check for common VLAN mistakes
# =============================================================================

echo ""
echo "=== Checking VLAN Configuration ==="
echo ""

# Check for VLANs without port assignments
for vid in $(uci show network 2>/dev/null | grep "vid='" | sed "s/.*vid='\([0-9]*\)'.*/\1/"); do
    # Check if there's a bridge-vlan entry for this VID
    if ! uci show network 2>/dev/null | grep -q "vlan='$vid'"; then
        warn "VLAN $vid defined but may not have port assignment"
    else
        pass "VLAN $vid has configuration"
    fi
done

# Check for interfaces without devices
for iface in $(uci show network 2>/dev/null | grep "=interface" | cut -d. -f2 | cut -d= -f1); do
    DEV=$(uci get network.$iface.device 2>/dev/null || uci get network.$iface.ifname 2>/dev/null)
    PROTO=$(uci get network.$iface.proto 2>/dev/null)

    # Skip loopback and special interfaces
    [ "$iface" = "loopback" ] && continue
    [ "$PROTO" = "wireguard" ] && continue

    if [ -z "$DEV" ] && [ "$PROTO" != "none" ]; then
        warn "Interface '$iface' has no device assigned"
    fi
done

# =============================================================================
# Check DHCP configuration
# =============================================================================

echo ""
echo "=== Checking DHCP Configuration ==="
echo ""

# Check if DHCP is enabled on LAN
LAN_DHCP=$(uci get dhcp.lan 2>/dev/null)
if [ -n "$LAN_DHCP" ]; then
    IGNORE=$(uci get dhcp.lan.ignore 2>/dev/null)
    if [ "$IGNORE" = "1" ]; then
        warn "DHCP disabled on LAN - clients won't get IPs automatically"
    else
        START=$(uci get dhcp.lan.start 2>/dev/null)
        LIMIT=$(uci get dhcp.lan.limit 2>/dev/null)
        pass "LAN DHCP: start=$START, limit=$LIMIT"
    fi
else
    warn "No DHCP configuration for LAN"
fi

# =============================================================================
# Check pending changes
# =============================================================================

echo ""
echo "=== Pending UCI Changes ==="
echo ""

CHANGES=$(uci changes 2>/dev/null)
if [ -n "$CHANGES" ]; then
    echo "$CHANGES"
    echo ""
    info "These changes will be applied on commit/restart"
else
    info "No pending changes"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "=============================================="
echo " Validation Summary"
echo "=============================================="
echo ""

if [ $ERRORS -gt 0 ]; then
    echo "${RED}ERRORS: $ERRORS${NC} - DO NOT APPLY CHANGES"
    echo ""
    echo "Fix the errors above before proceeding."
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo "${YELLOW}WARNINGS: $WARNINGS${NC} - Review before applying"
    echo ""
    echo "Consider using safe-apply.sh for auto-rollback protection."
    exit 0
else
    echo "${GREEN}All checks passed!${NC}"
    echo ""
    echo "Configuration looks safe to apply."
    exit 0
fi
