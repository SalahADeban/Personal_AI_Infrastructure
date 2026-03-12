#!/bin/sh
# =============================================================================
# Network Segmentation Verification Script
# =============================================================================
#
# Run this ON the OpenWrt router to verify configuration
# Also includes tests to run from client devices
#
# Usage:
#   ssh root@10.0.1.1
#   sh verify.sh
#
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo "${GREEN}[PASS]${NC} $1"; }
fail() { echo "${RED}[FAIL]${NC} $1"; }
warn() { echo "${YELLOW}[WARN]${NC} $1"; }
info() { echo "[INFO] $1"; }

echo "=============================================================================="
echo " Network Segmentation Verification"
echo "=============================================================================="
echo ""

# =============================================================================
# Interface Checks
# =============================================================================

echo "${YELLOW}=== Interface Configuration ===${NC}"
echo ""

# Check interfaces exist
for iface in lan servers iot wg0; do
    if ip link show br-lan.$( [ "$iface" = "lan" ] && echo "10" || [ "$iface" = "servers" ] && echo "20" || [ "$iface" = "iot" ] && echo "30" ) > /dev/null 2>&1 || [ "$iface" = "wg0" ]; then
        pass "Interface $iface exists"
    else
        fail "Interface $iface missing"
    fi
done

# Check IP assignments
echo ""
echo "Interface IPs:"
for iface in lan servers iot wg0; do
    ip=$(uci get network.$iface.ipaddr 2>/dev/null)
    if [ -n "$ip" ]; then
        info "  $iface: $ip"
    fi
done

# =============================================================================
# VLAN Checks
# =============================================================================

echo ""
echo "${YELLOW}=== VLAN Configuration ===${NC}"
echo ""

# Check VLANs
for vid in 10 20 30; do
    if ip link show br-lan.$vid > /dev/null 2>&1; then
        pass "VLAN $vid configured"
    else
        fail "VLAN $vid missing"
    fi
done

# =============================================================================
# Firewall Checks
# =============================================================================

echo ""
echo "${YELLOW}=== Firewall Zones ===${NC}"
echo ""

for zone in lan servers iot vpn; do
    if uci show firewall | grep -q "name='$zone'"; then
        pass "Zone '$zone' exists"
    else
        fail "Zone '$zone' missing"
    fi
done

# Check WireGuard port
echo ""
if iptables -L -n | grep -q "51820"; then
    pass "WireGuard port 51820 open"
else
    warn "WireGuard port 51820 may not be open (check iptables)"
fi

# =============================================================================
# WireGuard Checks
# =============================================================================

echo ""
echo "${YELLOW}=== WireGuard Configuration ===${NC}"
echo ""

if command -v wg > /dev/null 2>&1; then
    pass "WireGuard installed"

    if wg show wg0 > /dev/null 2>&1; then
        pass "WireGuard interface active"
        peers=$(wg show wg0 peers | wc -l)
        info "  Configured peers: $peers"
    else
        warn "WireGuard interface not active (may not have started yet)"
    fi
else
    fail "WireGuard not installed"
fi

# =============================================================================
# WiFi Checks
# =============================================================================

echo ""
echo "${YELLOW}=== WiFi Configuration ===${NC}"
echo ""

iot_ssid=$(uci show wireless | grep "ssid='IoT" | head -1)
if [ -n "$iot_ssid" ]; then
    pass "IoT SSID configured"
else
    warn "IoT SSID not found"
fi

# =============================================================================
# DHCP Checks
# =============================================================================

echo ""
echo "${YELLOW}=== DHCP Configuration ===${NC}"
echo ""

for iface in lan iot; do
    if uci get dhcp.$iface > /dev/null 2>&1; then
        start=$(uci get dhcp.$iface.start 2>/dev/null)
        limit=$(uci get dhcp.$iface.limit 2>/dev/null)
        pass "DHCP on $iface: start=$start, limit=$limit"
    else
        fail "DHCP not configured for $iface"
    fi
done

# Check servers has DHCP disabled
if [ "$(uci get dhcp.servers.ignore 2>/dev/null)" = "1" ]; then
    pass "Servers DHCP disabled (static only)"
else
    warn "Servers DHCP should be disabled"
fi

# =============================================================================
# Connectivity Tests (from router)
# =============================================================================

echo ""
echo "${YELLOW}=== Connectivity Tests ===${NC}"
echo ""

# Internet connectivity
if ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1; then
    pass "Internet connectivity (8.8.8.8)"
else
    fail "No internet connectivity"
fi

# DNS resolution
if nslookup google.com > /dev/null 2>&1; then
    pass "DNS resolution working"
else
    fail "DNS resolution failed"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "=============================================================================="
echo " Client-Side Tests"
echo "=============================================================================="
echo ""
echo "Run these tests from devices on each network:"
echo ""
echo "${YELLOW}From Trusted Device (10.0.10.x):${NC}"
echo "  ping 10.0.20.10    # Should work (access server)"
echo "  ping 10.0.30.100   # Should work (access IoT)"
echo "  ping 8.8.8.8       # Should work (internet)"
echo ""
echo "${YELLOW}From IoT Device (10.0.30.x):${NC}"
echo "  ping 10.0.10.100   # Should FAIL (blocked from trusted)"
echo "  ping 10.0.20.10    # Should FAIL (blocked from server, except HA)"
echo "  curl 10.0.20.20:8123 # Should work (Home Assistant exception)"
echo "  ping 8.8.8.8       # Should work (internet)"
echo ""
echo "${YELLOW}From VPN Client (10.0.99.x):${NC}"
echo "  ping 10.0.10.1     # Should work (access trusted)"
echo "  ping 10.0.20.10    # Should work (access server)"
echo "  ping 10.0.30.1     # Should work (access IoT)"
echo ""
echo "${YELLOW}From Guest Device (10.0.40.x):${NC}"
echo "  ping 10.0.10.100   # Should FAIL (isolated)"
echo "  ping 10.0.20.10    # Should FAIL (isolated)"
echo "  ping 8.8.8.8       # Should work (internet only)"
echo ""
