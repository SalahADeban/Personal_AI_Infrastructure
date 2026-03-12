#!/bin/sh
# =============================================================================
# OpenWrt Network Segmentation Setup Script
# =============================================================================
#
# This script automates the setup of VLANs, firewall rules, and WireGuard VPN
# Run this ON the OpenWrt router via SSH
#
# Usage:
#   ssh root@192.168.1.1
#   sh setup.sh
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "${GREEN}==============================================================================${NC}"
echo "${GREEN} OpenWrt Network Segmentation Setup${NC}"
echo "${GREEN}==============================================================================${NC}"
echo ""

# =============================================================================
# Pre-flight Checks
# =============================================================================

echo "${YELLOW}[1/8] Running pre-flight checks...${NC}"

# Check if running on OpenWrt
if [ ! -f /etc/openwrt_release ]; then
    echo "${RED}ERROR: This script must be run on OpenWrt${NC}"
    exit 1
fi

# Get OpenWrt version
. /etc/openwrt_release
echo "  OpenWrt Version: $DISTRIB_RELEASE"

# Check for required packages
check_package() {
    if opkg list-installed | grep -q "^$1 "; then
        echo "  $1: installed"
        return 0
    else
        echo "  $1: ${RED}not installed${NC}"
        return 1
    fi
}

# =============================================================================
# Backup Current Configuration
# =============================================================================

echo ""
echo "${YELLOW}[2/8] Creating backup...${NC}"

BACKUP_FILE="/tmp/backup-$(date +%Y%m%d-%H%M%S).tar.gz"
sysupgrade -b "$BACKUP_FILE"
echo "  Backup saved to: $BACKUP_FILE"
echo "  ${YELLOW}IMPORTANT: Download this backup to your computer!${NC}"
echo "  Run: scp root@$(uci get network.lan.ipaddr):$BACKUP_FILE ."

# =============================================================================
# Install Required Packages
# =============================================================================

echo ""
echo "${YELLOW}[3/8] Installing required packages...${NC}"

opkg update

# WireGuard
if ! check_package wireguard-tools; then
    echo "  Installing wireguard-tools..."
    opkg install wireguard-tools luci-proto-wireguard
fi

# Ad blocking (optional)
if ! check_package adblock; then
    echo "  Installing adblock..."
    opkg install adblock luci-app-adblock
fi

# QoS (optional)
if ! check_package sqm-scripts; then
    echo "  Installing SQM (QoS)..."
    opkg install sqm-scripts luci-app-sqm
fi

# =============================================================================
# Generate WireGuard Keys
# =============================================================================

echo ""
echo "${YELLOW}[4/8] Generating WireGuard keys...${NC}"

WG_DIR="/etc/wireguard"
mkdir -p "$WG_DIR"

if [ ! -f "$WG_DIR/server_private" ]; then
    wg genkey | tee "$WG_DIR/server_private" | wg pubkey > "$WG_DIR/server_public"
    chmod 600 "$WG_DIR/server_private"
    echo "  Server keys generated"
else
    echo "  Server keys already exist"
fi

# Generate peer keys (phone and laptop)
for peer in phone laptop; do
    if [ ! -f "$WG_DIR/${peer}_private" ]; then
        wg genkey | tee "$WG_DIR/${peer}_private" | wg pubkey > "$WG_DIR/${peer}_public"
        chmod 600 "$WG_DIR/${peer}_private"
        echo "  $peer keys generated"
    else
        echo "  $peer keys already exist"
    fi
done

# Display keys for manual config
echo ""
echo "${GREEN}WireGuard Keys (save these):${NC}"
echo "  Server Public Key: $(cat $WG_DIR/server_public)"
echo "  Phone Public Key: $(cat $WG_DIR/phone_public)"
echo "  Laptop Public Key: $(cat $WG_DIR/laptop_public)"

# =============================================================================
# Configure Network (VLANs)
# =============================================================================

echo ""
echo "${YELLOW}[5/8] Configuring VLANs and interfaces...${NC}"

# Detect switch type (DSA vs swconfig)
if [ -d /sys/class/net/br-lan/bridge ]; then
    echo "  Using DSA (modern) switch configuration"
    SWITCH_TYPE="dsa"
else
    echo "  Using swconfig (legacy) switch configuration"
    SWITCH_TYPE="swconfig"
fi

# Create VLAN interfaces
# Note: Actual configuration should be applied from the config files
# This is a placeholder showing UCI commands

echo "  Creating VLAN 10 (Trusted)..."
uci set network.vlan10=device
uci set network.vlan10.type='8021q'
uci set network.vlan10.ifname='br-lan'
uci set network.vlan10.vid='10'

uci set network.lan=interface
uci set network.lan.device='br-lan.10'
uci set network.lan.proto='static'
uci set network.lan.ipaddr='10.0.10.1'
uci set network.lan.netmask='255.255.255.0'

echo "  Creating VLAN 20 (Servers)..."
uci set network.vlan20=device
uci set network.vlan20.type='8021q'
uci set network.vlan20.ifname='br-lan'
uci set network.vlan20.vid='20'

uci set network.servers=interface
uci set network.servers.device='br-lan.20'
uci set network.servers.proto='static'
uci set network.servers.ipaddr='10.0.20.1'
uci set network.servers.netmask='255.255.255.0'

echo "  Creating VLAN 30 (IoT)..."
uci set network.vlan30=device
uci set network.vlan30.type='8021q'
uci set network.vlan30.ifname='br-lan'
uci set network.vlan30.vid='30'

uci set network.iot=interface
uci set network.iot.device='br-lan.30'
uci set network.iot.proto='static'
uci set network.iot.ipaddr='10.0.30.1'
uci set network.iot.netmask='255.255.255.0'

# WireGuard interface
echo "  Configuring WireGuard..."
uci set network.wg0=interface
uci set network.wg0.proto='wireguard'
uci set network.wg0.private_key="$(cat $WG_DIR/server_private)"
uci add_list network.wg0.addresses='10.0.99.1/24'
uci set network.wg0.listen_port='51820'

# Add WireGuard peers
uci add network wireguard_wg0
uci set network.@wireguard_wg0[-1].description='Phone'
uci set network.@wireguard_wg0[-1].public_key="$(cat $WG_DIR/phone_public)"
uci add_list network.@wireguard_wg0[-1].allowed_ips='10.0.99.2/32'
uci set network.@wireguard_wg0[-1].persistent_keepalive='25'

uci add network wireguard_wg0
uci set network.@wireguard_wg0[-1].description='Laptop'
uci set network.@wireguard_wg0[-1].public_key="$(cat $WG_DIR/laptop_public)"
uci add_list network.@wireguard_wg0[-1].allowed_ips='10.0.99.3/32'
uci set network.@wireguard_wg0[-1].persistent_keepalive='25'

uci commit network

# =============================================================================
# Configure Firewall
# =============================================================================

echo ""
echo "${YELLOW}[6/8] Configuring firewall zones and rules...${NC}"

# Servers zone
echo "  Creating servers zone..."
uci add firewall zone
uci set firewall.@zone[-1].name='servers'
uci set firewall.@zone[-1].input='ACCEPT'
uci set firewall.@zone[-1].output='ACCEPT'
uci set firewall.@zone[-1].forward='REJECT'
uci add_list firewall.@zone[-1].network='servers'

# IoT zone
echo "  Creating iot zone..."
uci add firewall zone
uci set firewall.@zone[-1].name='iot'
uci set firewall.@zone[-1].input='REJECT'
uci set firewall.@zone[-1].output='ACCEPT'
uci set firewall.@zone[-1].forward='REJECT'
uci add_list firewall.@zone[-1].network='iot'

# VPN zone
echo "  Creating vpn zone..."
uci add firewall zone
uci set firewall.@zone[-1].name='vpn'
uci set firewall.@zone[-1].input='ACCEPT'
uci set firewall.@zone[-1].output='ACCEPT'
uci set firewall.@zone[-1].forward='ACCEPT'
uci add_list firewall.@zone[-1].network='wg0'

# Forwarding rules
echo "  Adding forwarding rules..."

# LAN -> Servers
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='lan'
uci set firewall.@forwarding[-1].dest='servers'

# LAN -> IoT
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='lan'
uci set firewall.@forwarding[-1].dest='iot'

# Servers -> WAN
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='servers'
uci set firewall.@forwarding[-1].dest='wan'

# Servers -> LAN
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='servers'
uci set firewall.@forwarding[-1].dest='lan'

# IoT -> WAN
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='iot'
uci set firewall.@forwarding[-1].dest='wan'

# VPN -> All
for dest in wan lan servers iot; do
    uci add firewall forwarding
    uci set firewall.@forwarding[-1].src='vpn'
    uci set firewall.@forwarding[-1].dest="$dest"
done

# WireGuard port rule
echo "  Adding WireGuard port rule..."
uci add firewall rule
uci set firewall.@rule[-1].name='Allow-WireGuard'
uci set firewall.@rule[-1].src='wan'
uci set firewall.@rule[-1].proto='udp'
uci set firewall.@rule[-1].dest_port='51820'
uci set firewall.@rule[-1].target='ACCEPT'

# IoT DHCP/DNS rules
echo "  Adding IoT DHCP/DNS rules..."
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

# IoT -> Home Assistant exception
echo "  Adding Home Assistant exception..."
uci add firewall rule
uci set firewall.@rule[-1].name='IoT-to-HomeAssistant'
uci set firewall.@rule[-1].src='iot'
uci set firewall.@rule[-1].dest='servers'
uci set firewall.@rule[-1].dest_ip='10.0.20.20'
uci set firewall.@rule[-1].dest_port='8123'
uci set firewall.@rule[-1].proto='tcp'
uci set firewall.@rule[-1].target='ACCEPT'

uci commit firewall

# =============================================================================
# Configure DHCP
# =============================================================================

echo ""
echo "${YELLOW}[7/8] Configuring DHCP...${NC}"

# LAN DHCP
uci set dhcp.lan.start='100'
uci set dhcp.lan.limit='100'
uci set dhcp.lan.leasetime='24h'

# Servers - static only
uci set dhcp.servers=dhcp
uci set dhcp.servers.interface='servers'
uci set dhcp.servers.ignore='1'

# IoT DHCP
uci set dhcp.iot=dhcp
uci set dhcp.iot.interface='iot'
uci set dhcp.iot.start='100'
uci set dhcp.iot.limit='100'
uci set dhcp.iot.leasetime='12h'

uci commit dhcp

# =============================================================================
# Configure WiFi (IoT SSID)
# =============================================================================

echo ""
echo "${YELLOW}[8/8] Configuring IoT WiFi...${NC}"

# Find 2.4GHz radio
RADIO_24=""
for radio in radio0 radio1; do
    band=$(uci get wireless.$radio.band 2>/dev/null || echo "")
    if [ "$band" = "2g" ]; then
        RADIO_24=$radio
        break
    fi
done

if [ -n "$RADIO_24" ]; then
    echo "  Found 2.4GHz radio: $RADIO_24"

    # Create IoT WiFi
    uci add wireless wifi-iface
    uci set wireless.@wifi-iface[-1].device="$RADIO_24"
    uci set wireless.@wifi-iface[-1].network='iot'
    uci set wireless.@wifi-iface[-1].mode='ap'
    uci set wireless.@wifi-iface[-1].ssid='IoT-Network'
    uci set wireless.@wifi-iface[-1].encryption='psk2'
    uci set wireless.@wifi-iface[-1].key='ChangeThisPassword123!'
    uci set wireless.@wifi-iface[-1].isolate='1'

    uci commit wireless

    echo "  ${YELLOW}NOTE: Change the IoT WiFi password in LuCI!${NC}"
else
    echo "  ${RED}Could not find 2.4GHz radio. Configure IoT WiFi manually in LuCI.${NC}"
fi

# =============================================================================
# Apply Configuration
# =============================================================================

echo ""
echo "${GREEN}==============================================================================${NC}"
echo "${GREEN} Configuration Complete!${NC}"
echo "${GREEN}==============================================================================${NC}"
echo ""
echo "Configuration has been staged. To apply:"
echo ""
echo "  1. Review changes in LuCI (Network -> Interfaces, Firewall, Wireless)"
echo "  2. Apply with: ${YELLOW}/etc/init.d/network restart && /etc/init.d/firewall restart${NC}"
echo ""
echo "${YELLOW}WARNING: This will disconnect your current session if IP changes!${NC}"
echo "New router IP will be: ${GREEN}10.0.1.1${NC} (management) or ${GREEN}10.0.10.1${NC} (trusted LAN)"
echo ""
echo "WireGuard client configs need:"
echo "  Server Public Key: $(cat $WG_DIR/server_public)"
echo "  Endpoint: YOUR_PUBLIC_IP:51820"
echo ""
echo "Don't forget to:"
echo "  1. Download the backup: scp root@$(uci get network.lan.ipaddr):$BACKUP_FILE ."
echo "  2. Change IoT WiFi password"
echo "  3. Update server static IP to 10.0.20.10"
echo "  4. Move Nest WiFi to LAN1 port"
echo ""
