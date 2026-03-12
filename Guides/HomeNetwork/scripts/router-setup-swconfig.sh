#!/bin/sh
# =============================================================================
# ASUS RT-AC1200 Network Segmentation (swconfig)
# =============================================================================
#
# Tested configuration for your specific router
#
# Port Layout:
#   Port 0 = WAN    → VLAN 2 (unchanged)
#   Port 1 = LAN1   → VLAN 10 (Trusted - Nest WiFi)
#   Port 2 = LAN2   → VLAN 20 (Servers)
#   Port 3 = LAN3   → VLAN 30 (IoT)
#   Port 4 = LAN4   → VLAN 1 (Fallback - keep original!)
#   Port 6 = CPU    → Tagged (all VLANs)
#
# BEFORE RUNNING:
#   1. Backup: sysupgrade -b /tmp/backup.tar.gz
#   2. Download backup to your computer
#   3. Keep a device ready to plug into LAN4 if needed
#
# =============================================================================

echo "=== Network Segmentation Setup ==="
echo ""
echo "This will configure:"
echo "  LAN1 (Port 1) → 10.0.10.0/24 (Trusted)"
echo "  LAN2 (Port 2) → 10.0.20.0/24 (Servers)"
echo "  LAN3 (Port 3) → 10.0.30.0/24 (IoT)"
echo "  LAN4 (Port 4) → 192.168.1.0/24 (Fallback)"
echo ""
echo "Press Enter to continue or Ctrl+C to abort..."
read dummy

# =============================================================================
# Step 1: Backup
# =============================================================================

echo "[1/6] Creating backup..."
BACKUP="/tmp/backup-$(date +%Y%m%d-%H%M%S).tar.gz"
sysupgrade -b "$BACKUP"
echo "  Saved: $BACKUP"
echo "  Download with: scp root@192.168.1.1:$BACKUP ."
echo ""

# =============================================================================
# Step 2: Install packages
# =============================================================================

echo "[2/6] Installing packages..."
opkg update
opkg install wireguard-tools luci-proto-wireguard
echo ""

# =============================================================================
# Step 3: Configure Switch VLANs (swconfig)
# =============================================================================

echo "[3/6] Configuring switch VLANs..."

# Keep VLAN 1 on Port 4 (LAN4) as fallback
uci set network.@switch_vlan[0].ports='4 6t'
uci set network.@switch_vlan[0].description='Fallback'

# VLAN 2 unchanged (WAN)
uci set network.@switch_vlan[1].description='WAN'

# Add VLAN 10 - Trusted (Port 1 = LAN1)
uci add network switch_vlan
uci set network.@switch_vlan[-1].device='switch0'
uci set network.@switch_vlan[-1].vlan='10'
uci set network.@switch_vlan[-1].ports='1 6t'
uci set network.@switch_vlan[-1].description='Trusted'

# Add VLAN 20 - Servers (Port 2 = LAN2)
uci add network switch_vlan
uci set network.@switch_vlan[-1].device='switch0'
uci set network.@switch_vlan[-1].vlan='20'
uci set network.@switch_vlan[-1].ports='2 6t'
uci set network.@switch_vlan[-1].description='Servers'

# Add VLAN 30 - IoT (Port 3 = LAN3)
uci add network switch_vlan
uci set network.@switch_vlan[-1].device='switch0'
uci set network.@switch_vlan[-1].vlan='30'
uci set network.@switch_vlan[-1].ports='3 6t'
uci set network.@switch_vlan[-1].description='IoT'

echo "  Switch VLANs configured"
echo ""

# =============================================================================
# Step 4: Create Network Interfaces
# =============================================================================

echo "[4/6] Creating network interfaces..."

# Update br-lan to only use eth0.1 (fallback VLAN)
uci set network.@device[0].ports='eth0.1'

# Trusted interface (VLAN 10)
uci set network.trusted=interface
uci set network.trusted.device='eth0.10'
uci set network.trusted.proto='static'
uci set network.trusted.ipaddr='10.0.10.1'
uci set network.trusted.netmask='255.255.255.0'

# Servers interface (VLAN 20)
uci set network.servers=interface
uci set network.servers.device='eth0.20'
uci set network.servers.proto='static'
uci set network.servers.ipaddr='10.0.20.1'
uci set network.servers.netmask='255.255.255.0'

# IoT interface (VLAN 30)
uci set network.iot=interface
uci set network.iot.device='eth0.30'
uci set network.iot.proto='static'
uci set network.iot.ipaddr='10.0.30.1'
uci set network.iot.netmask='255.255.255.0'

echo "  Network interfaces created"
echo ""

# =============================================================================
# Step 5: Configure Firewall Zones
# =============================================================================

echo "[5/6] Configuring firewall zones..."

# Trusted zone
uci add firewall zone
uci set firewall.@zone[-1].name='trusted'
uci set firewall.@zone[-1].input='ACCEPT'
uci set firewall.@zone[-1].output='ACCEPT'
uci set firewall.@zone[-1].forward='ACCEPT'
uci add_list firewall.@zone[-1].network='trusted'

# Servers zone
uci add firewall zone
uci set firewall.@zone[-1].name='servers'
uci set firewall.@zone[-1].input='ACCEPT'
uci set firewall.@zone[-1].output='ACCEPT'
uci set firewall.@zone[-1].forward='REJECT'
uci add_list firewall.@zone[-1].network='servers'

# IoT zone (isolated)
uci add firewall zone
uci set firewall.@zone[-1].name='iot'
uci set firewall.@zone[-1].input='REJECT'
uci set firewall.@zone[-1].output='ACCEPT'
uci set firewall.@zone[-1].forward='REJECT'
uci add_list firewall.@zone[-1].network='iot'

# Forwarding rules
# Trusted -> WAN
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='trusted'
uci set firewall.@forwarding[-1].dest='wan'

# Trusted -> Servers
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='trusted'
uci set firewall.@forwarding[-1].dest='servers'

# Trusted -> IoT
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='trusted'
uci set firewall.@forwarding[-1].dest='iot'

# Servers -> WAN
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='servers'
uci set firewall.@forwarding[-1].dest='wan'

# Servers -> Trusted (for Plex, etc.)
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='servers'
uci set firewall.@forwarding[-1].dest='trusted'

# IoT -> WAN only
uci add firewall forwarding
uci set firewall.@forwarding[-1].src='iot'
uci set firewall.@forwarding[-1].dest='wan'

# IoT needs DHCP/DNS from router
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

# IoT -> Home Assistant exception (when you set it up)
uci add firewall rule
uci set firewall.@rule[-1].name='IoT-to-HomeAssistant'
uci set firewall.@rule[-1].src='iot'
uci set firewall.@rule[-1].dest='servers'
uci set firewall.@rule[-1].dest_ip='10.0.20.20'
uci set firewall.@rule[-1].dest_port='8123'
uci set firewall.@rule[-1].proto='tcp'
uci set firewall.@rule[-1].target='ACCEPT'

echo "  Firewall zones configured"
echo ""

# =============================================================================
# Step 6: Configure DHCP
# =============================================================================

echo "[6/6] Configuring DHCP..."

# Trusted DHCP
uci set dhcp.trusted=dhcp
uci set dhcp.trusted.interface='trusted'
uci set dhcp.trusted.start='100'
uci set dhcp.trusted.limit='100'
uci set dhcp.trusted.leasetime='24h'

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

echo "  DHCP configured"
echo ""

# =============================================================================
# Review and Apply
# =============================================================================

echo "=== Configuration Summary ==="
echo ""
echo "Switch VLANs:"
uci show network | grep switch_vlan | grep -E "(vlan=|ports=|description=)"
echo ""
echo "New interfaces:"
uci show network | grep -E "^network\.(trusted|servers|iot)\."
echo ""

echo "=== Ready to Apply ==="
echo ""
echo "IMPORTANT:"
echo "  - LAN4 remains on 192.168.1.1 (fallback)"
echo "  - After applying, Nest WiFi (LAN1) will need DHCP from 10.0.10.x"
echo "  - Your server (LAN2) should be set to static IP 10.0.20.10"
echo ""
echo "If something goes wrong:"
echo "  1. Plug into LAN4"
echo "  2. Set your IP to 192.168.1.100"
echo "  3. Access router at 192.168.1.1"
echo "  4. Restore: sysupgrade -r $BACKUP"
echo ""
echo "Press Enter to apply, or Ctrl+C to abort..."
read dummy

# Commit and apply
uci commit
/etc/init.d/network restart
/etc/init.d/firewall restart
/etc/init.d/dnsmasq restart

echo ""
echo "=== Applied! ==="
echo ""
echo "If you can see this, it worked!"
echo ""
echo "Next steps:"
echo "  1. Move Nest WiFi to LAN1 (if not already)"
echo "  2. Set server to static IP 10.0.20.10"
echo "  3. Reconnect to router via Nest WiFi"
echo "  4. New router IPs:"
echo "     - 10.0.10.1 (from Trusted/LAN1)"
echo "     - 10.0.20.1 (from Servers/LAN2)"
echo "     - 10.0.30.1 (from IoT/LAN3)"
echo "     - 192.168.1.1 (from Fallback/LAN4)"
echo ""
