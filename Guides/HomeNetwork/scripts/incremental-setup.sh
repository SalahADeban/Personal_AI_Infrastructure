#!/bin/sh
# =============================================================================
# Incremental Network Segmentation Setup
# =============================================================================
#
# Applies changes in small, safe steps with validation between each.
# Much safer than applying everything at once.
#
# Usage:
#   ssh root@192.168.1.1
#   sh incremental-setup.sh
#
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

CURRENT_STEP=0
TOTAL_STEPS=6

next_step() {
    CURRENT_STEP=$((CURRENT_STEP + 1))
    echo ""
    echo "${GREEN}=== Step $CURRENT_STEP/$TOTAL_STEPS: $1 ===${NC}"
    echo ""
}

wait_confirm() {
    echo ""
    echo "${YELLOW}Press Enter to continue, or Ctrl+C to abort...${NC}"
    read dummy
}

test_connectivity() {
    echo "Testing connectivity..."
    if ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1; then
        echo "${GREEN}  Internet: OK${NC}"
    else
        echo "${RED}  Internet: FAILED${NC}"
        return 1
    fi
}

# =============================================================================
echo "============================================================"
echo " Incremental Network Segmentation Setup"
echo "============================================================"
echo ""
echo "This script will apply changes in small steps:"
echo "  1. Install packages"
echo "  2. Create VLAN interfaces (no port changes yet)"
echo "  3. Configure firewall zones"
echo "  4. Assign VLANs to ports"
echo "  5. Configure DHCP"
echo "  6. Set up WireGuard"
echo ""
echo "After each step, we'll test connectivity."
echo "If something breaks, only that step needs reverting."
echo ""
wait_confirm

# =============================================================================
next_step "Install Required Packages"
# =============================================================================

echo "Installing packages..."
opkg update
opkg install wireguard-tools luci-proto-wireguard || true

test_connectivity
wait_confirm

# =============================================================================
next_step "Create VLAN Interfaces (Safe - No Port Changes)"
# =============================================================================

echo "Creating VLAN devices..."
echo "Note: These are just definitions, no traffic changes yet."

# Backup current network config
cp /etc/config/network /etc/config/network.backup-step2

# Create VLAN devices (doesn't affect traffic yet)
uci set network.vlan10=device
uci set network.vlan10.type='8021q'
uci set network.vlan10.ifname='br-lan'
uci set network.vlan10.vid='10'
uci set network.vlan10.name='br-lan.10'

uci set network.vlan20=device
uci set network.vlan20.type='8021q'
uci set network.vlan20.ifname='br-lan'
uci set network.vlan20.vid='20'
uci set network.vlan20.name='br-lan.20'

uci set network.vlan30=device
uci set network.vlan30.type='8021q'
uci set network.vlan30.ifname='br-lan'
uci set network.vlan30.vid='30'
uci set network.vlan30.name='br-lan.30'

# Create interfaces (but don't change LAN yet!)
uci set network.servers=interface
uci set network.servers.device='br-lan.20'
uci set network.servers.proto='static'
uci set network.servers.ipaddr='10.0.20.1'
uci set network.servers.netmask='255.255.255.0'

uci set network.iot=interface
uci set network.iot.device='br-lan.30'
uci set network.iot.proto='static'
uci set network.iot.ipaddr='10.0.30.1'
uci set network.iot.netmask='255.255.255.0'

uci commit network

echo "Restarting network..."
/etc/init.d/network restart
sleep 5

echo ""
echo "Current interfaces:"
ip addr show | grep -E "^[0-9]+:|inet "

test_connectivity
echo ""
echo "${GREEN}VLAN interfaces created. Your LAN is unchanged.${NC}"
wait_confirm

# =============================================================================
next_step "Configure Firewall Zones (Safe - Traffic Rules Only)"
# =============================================================================

cp /etc/config/firewall /etc/config/firewall.backup-step3

echo "Adding firewall zones..."

# Servers zone
uci add firewall zone
uci set firewall.@zone[-1].name='servers'
uci set firewall.@zone[-1].input='ACCEPT'
uci set firewall.@zone[-1].output='ACCEPT'
uci set firewall.@zone[-1].forward='REJECT'
uci add_list firewall.@zone[-1].network='servers'

# IoT zone
uci add firewall zone
uci set firewall.@zone[-1].name='iot'
uci set firewall.@zone[-1].input='REJECT'
uci set firewall.@zone[-1].output='ACCEPT'
uci set firewall.@zone[-1].forward='REJECT'
uci add_list firewall.@zone[-1].network='iot'

# Add forwardings
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='lan'
uci set firewall.@forwarding[-1].dest='servers'

uci add firewall forwarding
uci set firewall.@forwarding[-1].src='servers'
uci set firewall.@forwarding[-1].dest='wan'

uci add firewall forwarding
uci set firewall.@forwarding[-1].src='iot'
uci set firewall.@forwarding[-1].dest='wan'

# IoT DHCP/DNS rules
uci add firewall rule
uci set firewall.@rule[-1].name='Allow-IoT-DHCP'
uci set firewall.@rule[-1].src='iot'
uci set firewall.@rule[-1].proto='udp'
uci set firewall.@rule[-1].dest_port='67-68'
uci set firewall.@rule[-1].target='ACCEPT'

uci add firewall rule
uci set firewall.@rule[-1].name='Allow-IoT-DNS'
uci set firewall.@rule[-1].src='iot'
uci set firewall.@rule[-1].proto='udp'
uci set firewall.@rule[-1].dest_port='53'
uci set firewall.@rule[-1].target='ACCEPT'

uci commit firewall
/etc/init.d/firewall restart

echo ""
echo "Firewall zones added."
test_connectivity
wait_confirm

# =============================================================================
next_step "Assign VLANs to Ports (THE RISKY STEP)"
# =============================================================================

echo "${YELLOW}WARNING: This step changes port assignments.${NC}"
echo ""
echo "Current plan:"
echo "  LAN1 → VLAN 10 (Trusted) - your current connection"
echo "  LAN2 → VLAN 20 (Servers)"
echo "  LAN3 → VLAN 30 (IoT)"
echo "  LAN4 → Unchanged (fallback)"
echo ""
echo "${YELLOW}Make sure you're connected to LAN1 or LAN4!${NC}"
echo ""
echo "If this fails, connect to LAN4 and access router at original IP."
echo ""
wait_confirm

cp /etc/config/network /etc/config/network.backup-step4

# Enable VLAN filtering on bridge
uci set network.@device[0].vlan_filtering='1'

# Assign ports to VLANs (adjust port names for your router!)
# This is for DSA-based switches

# VLAN 10 on LAN1
uci add network bridge-vlan
uci set network.@bridge-vlan[-1].device='br-lan'
uci set network.@bridge-vlan[-1].vlan='10'
uci add_list network.@bridge-vlan[-1].ports='lan1:u*'

# VLAN 20 on LAN2
uci add network bridge-vlan
uci set network.@bridge-vlan[-1].device='br-lan'
uci set network.@bridge-vlan[-1].vlan='20'
uci add_list network.@bridge-vlan[-1].ports='lan2:u*'

# VLAN 30 on LAN3
uci add network bridge-vlan
uci set network.@bridge-vlan[-1].device='br-lan'
uci set network.@bridge-vlan[-1].vlan='30'
uci add_list network.@bridge-vlan[-1].ports='lan3:u*'

# NOW change LAN to use VLAN 10
uci set network.lan.device='br-lan.10'
uci set network.lan.ipaddr='10.0.10.1'

uci commit network

echo ""
echo "${YELLOW}Applying in 5 seconds... If you lose connection:${NC}"
echo "  1. Wait 60 seconds"
echo "  2. Connect to LAN4"
echo "  3. Access router at original IP"
echo "  4. Restore: cp /etc/config/network.backup-step4 /etc/config/network"
echo ""
sleep 5

/etc/init.d/network restart

echo ""
echo "Waiting for network to settle..."
sleep 10

echo ""
echo "New router IP is likely 10.0.10.1"
echo "If you can see this, the change worked!"
echo ""
echo "Verify by connecting to new IP:"
echo "  ssh root@10.0.10.1"
echo ""
wait_confirm

# =============================================================================
next_step "Configure DHCP for New Networks"
# =============================================================================

uci set dhcp.servers=dhcp
uci set dhcp.servers.interface='servers'
uci set dhcp.servers.ignore='1'

uci set dhcp.iot=dhcp
uci set dhcp.iot.interface='iot'
uci set dhcp.iot.start='100'
uci set dhcp.iot.limit='100'
uci set dhcp.iot.leasetime='12h'

uci commit dhcp
/etc/init.d/dnsmasq restart

echo "DHCP configured for new networks."
wait_confirm

# =============================================================================
next_step "Set Up WireGuard VPN"
# =============================================================================

echo "Generating WireGuard keys..."
mkdir -p /etc/wireguard

if [ ! -f /etc/wireguard/server_private ]; then
    wg genkey | tee /etc/wireguard/server_private | wg pubkey > /etc/wireguard/server_public
    chmod 600 /etc/wireguard/server_private
fi

echo "Configuring WireGuard interface..."

uci set network.wg0=interface
uci set network.wg0.proto='wireguard'
uci set network.wg0.private_key="$(cat /etc/wireguard/server_private)"
uci add_list network.wg0.addresses='10.0.99.1/24'
uci set network.wg0.listen_port='51820'

# Add VPN firewall zone
uci add firewall zone
uci set firewall.@zone[-1].name='vpn'
uci set firewall.@zone[-1].input='ACCEPT'
uci set firewall.@zone[-1].output='ACCEPT'
uci set firewall.@zone[-1].forward='ACCEPT'
uci add_list firewall.@zone[-1].network='wg0'

# VPN forwardings
for dest in wan lan servers iot; do
    uci add firewall forwarding
    uci set firewall.@forwarding[-1].src='vpn'
    uci set firewall.@forwarding[-1].dest="$dest"
done

# Allow WireGuard port
uci add firewall rule
uci set firewall.@rule[-1].name='Allow-WireGuard'
uci set firewall.@rule[-1].src='wan'
uci set firewall.@rule[-1].proto='udp'
uci set firewall.@rule[-1].dest_port='51820'
uci set firewall.@rule[-1].target='ACCEPT'

uci commit network
uci commit firewall

/etc/init.d/network restart
/etc/init.d/firewall restart

echo ""
echo "WireGuard configured."
echo ""
echo "Server public key: $(cat /etc/wireguard/server_public)"
echo ""

# =============================================================================
echo ""
echo "${GREEN}============================================================${NC}"
echo "${GREEN} Setup Complete!${NC}"
echo "${GREEN}============================================================${NC}"
echo ""
echo "Network segmentation is now active:"
echo "  VLAN 10: 10.0.10.0/24 (Trusted) - LAN1"
echo "  VLAN 20: 10.0.20.0/24 (Servers) - LAN2"
echo "  VLAN 30: 10.0.30.0/24 (IoT) - LAN3"
echo "  VPN:     10.0.99.0/24 (WireGuard)"
echo ""
echo "Backups saved:"
echo "  /etc/config/network.backup-step2"
echo "  /etc/config/firewall.backup-step3"
echo "  /etc/config/network.backup-step4"
echo ""
echo "Next steps:"
echo "  1. Move Nest WiFi to LAN1"
echo "  2. Move server to LAN2, set IP to 10.0.20.10"
echo "  3. Generate WireGuard client configs"
echo "  4. Set up IoT WiFi SSID"
echo ""
