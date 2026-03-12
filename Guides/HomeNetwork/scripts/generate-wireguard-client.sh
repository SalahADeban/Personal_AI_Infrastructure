#!/bin/sh
# =============================================================================
# WireGuard Client Configuration Generator
# =============================================================================
#
# Generates client configuration files for WireGuard peers
# Run this ON the OpenWrt router after WireGuard is configured
#
# Usage:
#   ssh root@10.0.1.1
#   sh generate-wireguard-client.sh phone
#   sh generate-wireguard-client.sh laptop
#
# =============================================================================

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <client-name>"
    echo "Example: $0 phone"
    echo "         $0 laptop"
    exit 1
fi

CLIENT_NAME="$1"
WG_DIR="/etc/wireguard"
OUTPUT_DIR="/tmp/wireguard-clients"

# Get server info
SERVER_PUBLIC_KEY=$(cat "$WG_DIR/server_public" 2>/dev/null)
SERVER_PORT=$(uci get network.wg0.listen_port 2>/dev/null || echo "51820")

# Check for client keys
if [ ! -f "$WG_DIR/${CLIENT_NAME}_private" ]; then
    echo "Generating keys for $CLIENT_NAME..."
    wg genkey | tee "$WG_DIR/${CLIENT_NAME}_private" | wg pubkey > "$WG_DIR/${CLIENT_NAME}_public"
    chmod 600 "$WG_DIR/${CLIENT_NAME}_private"
fi

CLIENT_PRIVATE_KEY=$(cat "$WG_DIR/${CLIENT_NAME}_private")
CLIENT_PUBLIC_KEY=$(cat "$WG_DIR/${CLIENT_NAME}_public")

# Assign IP based on client name
case "$CLIENT_NAME" in
    phone)  CLIENT_IP="10.0.99.2" ;;
    laptop) CLIENT_IP="10.0.99.3" ;;
    tablet) CLIENT_IP="10.0.99.4" ;;
    *)      CLIENT_IP="10.0.99.10" ;;
esac

# Get public IP (or placeholder)
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_PUBLIC_IP")

mkdir -p "$OUTPUT_DIR"

# Generate client config
CONFIG_FILE="$OUTPUT_DIR/${CLIENT_NAME}.conf"

cat > "$CONFIG_FILE" << EOF
# WireGuard Configuration for $CLIENT_NAME
# Generated: $(date)

[Interface]
# Client private key
PrivateKey = $CLIENT_PRIVATE_KEY

# Client IP address on VPN
Address = $CLIENT_IP/24

# DNS server (use router or Pi-hole)
DNS = 10.0.20.10, 10.0.1.1

[Peer]
# Server public key
PublicKey = $SERVER_PUBLIC_KEY

# Server endpoint (change YOUR_PUBLIC_IP to actual public IP)
Endpoint = $PUBLIC_IP:$SERVER_PORT

# Route all home network traffic through VPN
# 10.0.0.0/16 covers all VLANs (10.0.10.x, 10.0.20.x, 10.0.30.x, etc.)
AllowedIPs = 10.0.0.0/16

# Keep connection alive (important for mobile)
PersistentKeepalive = 25
EOF

# Also generate a full-tunnel config (all traffic through VPN)
FULL_CONFIG_FILE="$OUTPUT_DIR/${CLIENT_NAME}-full-tunnel.conf"

cat > "$FULL_CONFIG_FILE" << EOF
# WireGuard Configuration for $CLIENT_NAME (Full Tunnel)
# All traffic routes through VPN - more secure on public WiFi
# Generated: $(date)

[Interface]
PrivateKey = $CLIENT_PRIVATE_KEY
Address = $CLIENT_IP/24
DNS = 10.0.20.10, 10.0.1.1

[Peer]
PublicKey = $SERVER_PUBLIC_KEY
Endpoint = $PUBLIC_IP:$SERVER_PORT

# Route ALL traffic through VPN (full tunnel)
AllowedIPs = 0.0.0.0/0, ::/0

PersistentKeepalive = 25
EOF

echo ""
echo "=== WireGuard Client Configurations Generated ==="
echo ""
echo "Files created:"
echo "  Split tunnel: $CONFIG_FILE"
echo "  Full tunnel:  $FULL_CONFIG_FILE"
echo ""
echo "Split tunnel routes only home network traffic through VPN."
echo "Full tunnel routes ALL traffic through VPN (use on public WiFi)."
echo ""
echo "To download:"
echo "  scp root@10.0.1.1:$CONFIG_FILE ."
echo "  scp root@10.0.1.1:$FULL_CONFIG_FILE ."
echo ""
echo "Import into WireGuard app on your device."
echo ""
echo "IMPORTANT: If using DDNS or port forwarding, update Endpoint in config."
echo "Current detected public IP: $PUBLIC_IP"
echo ""

# Generate QR code if qrencode is available
if command -v qrencode > /dev/null 2>&1; then
    echo "QR Code for split tunnel (scan with WireGuard app):"
    echo ""
    qrencode -t ANSIUTF8 < "$CONFIG_FILE"
    echo ""
else
    echo "Install qrencode for QR code generation:"
    echo "  opkg install qrencode"
fi
