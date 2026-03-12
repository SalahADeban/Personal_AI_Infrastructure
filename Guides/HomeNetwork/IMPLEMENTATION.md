# Implementation Guide: Home Network Segmentation

Step-by-step manual instructions for setting up network segmentation on OpenWrt.

---

## Prerequisites

- OpenWrt installed on ASUS RT-AC1200 (or similar)
- SSH access to router
- Physical access to reconnect if something breaks
- 30-60 minutes of time

---

## Phase 1: Backup & Preparation

### 1.1 Create Backup

```bash
# SSH into router
ssh root@192.168.1.1

# Create full backup
sysupgrade -b /tmp/backup-$(date +%Y%m%d).tar.gz

# Download to your computer (run on your machine, not router)
scp root@192.168.1.1:/tmp/backup-*.tar.gz ~/Downloads/
```

### 1.2 Note Current Configuration

```bash
# Record current IPs
uci show network.lan.ipaddr
uci show network.wan.proto

# Record interface mappings
ip addr show
```

### 1.3 Install Required Packages

```bash
opkg update
opkg install wireguard-tools luci-proto-wireguard
opkg install adblock luci-app-adblock  # Optional
```

---

## Phase 2: VLAN Configuration

### Option A: LuCI Web Interface (Recommended for beginners)

1. **Access LuCI**: http://192.168.1.1

2. **Create VLAN Interfaces**:
   - Go to **Network → Interfaces → Devices**
   - Click **Add device configuration**
   - Device type: **VLAN (802.1q)**
   - Base device: **br-lan**
   - VLAN ID: **10**
   - Save

   Repeat for VLANs 20 and 30.

3. **Create Network Interfaces**:
   - Go to **Network → Interfaces**
   - Click **Add new interface**
   - Name: **servers**
   - Protocol: **Static address**
   - Device: **br-lan.20**
   - IPv4 address: **10.0.20.1**
   - Netmask: **255.255.255.0**
   - Save

   Repeat for IoT (br-lan.30, 10.0.30.1).

4. **Update LAN Interface**:
   - Edit the **lan** interface
   - Change device to **br-lan.10**
   - Change IPv4 to **10.0.10.1**
   - Save

5. **Assign Ports to VLANs** (for DSA switches):
   - Go to **Network → Interfaces → Devices**
   - Edit **br-lan**
   - Enable **VLAN filtering**
   - Go to **Bridge VLAN filtering**
   - Add VLAN 10: LAN1 (untagged, primary)
   - Add VLAN 20: LAN2 (untagged, primary)
   - Add VLAN 30: LAN3 (untagged, primary)

### Option B: Command Line

```bash
# Create VLAN devices
uci set network.vlan10=device
uci set network.vlan10.type='8021q'
uci set network.vlan10.ifname='br-lan'
uci set network.vlan10.vid='10'

uci set network.vlan20=device
uci set network.vlan20.type='8021q'
uci set network.vlan20.ifname='br-lan'
uci set network.vlan20.vid='20'

uci set network.vlan30=device
uci set network.vlan30.type='8021q'
uci set network.vlan30.ifname='br-lan'
uci set network.vlan30.vid='30'

# Create interfaces
uci set network.lan.device='br-lan.10'
uci set network.lan.ipaddr='10.0.10.1'

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
```

---

## Phase 3: Firewall Configuration

### 3.1 Create Firewall Zones

**LuCI Method:**
1. Go to **Network → Firewall**
2. Click **Add** to create new zones:

| Zone | Input | Output | Forward | Networks |
|------|-------|--------|---------|----------|
| servers | accept | accept | reject | servers |
| iot | reject | accept | reject | iot |
| vpn | accept | accept | accept | wg0 |

### 3.2 Configure Zone Forwarding

**LuCI Method:**
1. Go to **Network → Firewall → General Settings**
2. For each zone, set allowed forwarding:

| Source | → Destination |
|--------|---------------|
| lan | wan, servers, iot |
| servers | wan, lan |
| iot | wan |
| vpn | wan, lan, servers, iot |

### 3.3 Add Traffic Rules

**LuCI Method:**
1. Go to **Network → Firewall → Traffic Rules**
2. Add rules:

**IoT DHCP:**
- Name: Allow-IoT-DHCP
- Source zone: iot
- Protocol: UDP
- Destination port: 67-68
- Action: accept

**IoT DNS:**
- Name: Allow-IoT-DNS
- Source zone: iot
- Protocol: UDP
- Destination port: 53
- Action: accept

**IoT to Home Assistant:**
- Name: IoT-to-HomeAssistant
- Source zone: iot
- Destination zone: servers
- Destination address: 10.0.20.20
- Destination port: 8123
- Protocol: TCP
- Action: accept

**WireGuard Port:**
- Name: Allow-WireGuard
- Source zone: wan
- Protocol: UDP
- Destination port: 51820
- Action: accept

---

## Phase 4: DHCP Configuration

### 4.1 Configure DHCP Pools

**LuCI Method:**
1. Go to **Network → Interfaces**
2. Edit each interface → **DHCP Server** tab:

| Interface | Start | Limit | Lease Time |
|-----------|-------|-------|------------|
| lan | 100 | 100 | 24h |
| servers | Ignore DHCP | - | - |
| iot | 100 | 100 | 12h |

### 4.2 Add Static Leases

1. Go to **Network → DHCP and DNS → Static Leases**
2. Add entries:

| Hostname | MAC Address | IP |
|----------|-------------|-----|
| docker-host | XX:XX:XX:XX:XX:XX | 10.0.20.10 |
| home-assistant | XX:XX:XX:XX:XX:XX | 10.0.20.20 |

---

## Phase 5: IoT WiFi Setup

### 5.1 Create IoT SSID

**LuCI Method:**
1. Go to **Network → Wireless**
2. Find your 2.4GHz radio (usually radio0)
3. Click **Add** under that radio
4. Configure:
   - SSID: `IoT-Network`
   - Network: `iot`
   - Encryption: WPA2-PSK
   - Key: (strong password)
5. Under **Advanced Settings**:
   - Isolate Clients: checked
6. Save & Apply

---

## Phase 6: WireGuard VPN Setup

### 6.1 Generate Keys

```bash
# On router
mkdir -p /etc/wireguard
cd /etc/wireguard

# Generate server keys
wg genkey | tee server_private | wg pubkey > server_public
chmod 600 server_private

# Generate client keys
wg genkey | tee phone_private | wg pubkey > phone_public
wg genkey | tee laptop_private | wg pubkey > laptop_public
chmod 600 *_private

# Display keys
cat server_public
cat phone_public
cat laptop_public
```

### 6.2 Configure WireGuard Interface

**LuCI Method:**
1. Go to **Network → Interfaces**
2. Click **Add new interface**
3. Name: `wg0`
4. Protocol: **WireGuard VPN**
5. Configure:
   - Private Key: (paste server_private contents)
   - Listen Port: 51820
   - IP Addresses: 10.0.99.1/24

### 6.3 Add Peers

1. In the wg0 interface, go to **Peers** tab
2. Add peer:
   - Description: Phone
   - Public Key: (paste phone_public contents)
   - Allowed IPs: 10.0.99.2/32
   - Persistent Keep Alive: 25

Repeat for laptop (10.0.99.3/32).

### 6.4 Create Client Configs

Create a file `phone.conf` on your computer:

```ini
[Interface]
PrivateKey = (contents of phone_private)
Address = 10.0.99.2/24
DNS = 10.0.1.1

[Peer]
PublicKey = (contents of server_public)
Endpoint = YOUR_PUBLIC_IP:51820
AllowedIPs = 10.0.0.0/16
PersistentKeepalive = 25
```

Import into WireGuard app on your phone.

---

## Phase 7: Apply & Test

### 7.1 Apply Configuration

```bash
# Commit all changes
uci commit

# Restart services
/etc/init.d/network restart
/etc/init.d/firewall restart
/etc/init.d/dnsmasq restart
```

**WARNING:** You will be disconnected. Reconnect to new IP (10.0.10.1 or 10.0.1.1).

### 7.2 Physical Connections

1. Move **Nest WiFi** to **LAN1** (VLAN 10 - Trusted)
2. Move **Server** to **LAN2** (VLAN 20 - Servers)
3. Move **IoT hub** (if wired) to **LAN3** (VLAN 30 - IoT)

### 7.3 Verification Tests

**From Trusted Device (Nest WiFi):**
```bash
# Should get 10.0.10.x IP
ip addr

# Should work
ping 10.0.20.10  # Server
ping 10.0.30.1   # IoT gateway
ping 8.8.8.8     # Internet
```

**From IoT Device:**
```bash
# Should get 10.0.30.x IP

# Should FAIL
ping 10.0.10.100  # Trusted device

# Should work
ping 8.8.8.8      # Internet
curl 10.0.20.20:8123  # Home Assistant only
```

**From VPN (outside network):**
```bash
# Connect WireGuard on phone
# Should get 10.0.99.x IP

# Should work
ping 10.0.10.1   # Router
ping 10.0.20.10  # Server
```

---

## Troubleshooting

### Lost Access to Router

1. Connect computer directly to LAN4
2. Set static IP: 10.0.1.100/24
3. Access router at 10.0.1.1
4. If still failing, use failsafe mode (hold reset during boot)

### VLANs Not Working

Check if your OpenWrt uses DSA or swconfig:
```bash
# DSA (modern)
ls /sys/class/net/br-lan/bridge

# swconfig (legacy)
swconfig list
```

Configuration differs between the two. See OpenWrt wiki for your router model.

### WireGuard Not Connecting

1. Verify port 51820 is forwarded if behind another NAT
2. Check public IP is correct in client config
3. Verify firewall rule for WireGuard exists
4. Check `wg show wg0` for errors

### IoT Devices Can't Connect

1. Verify IoT SSID is broadcasting
2. Check device is connecting to correct SSID
3. Verify DHCP is running on iot interface
4. Check firewall logs: `logread | grep IOT`

---

## Post-Setup Hardening

1. **Change default password:**
   ```bash
   passwd
   ```

2. **Enable HTTPS for LuCI:**
   ```bash
   opkg install luci-ssl
   ```

3. **Disable SSH from WAN** (should be default):
   ```bash
   uci show dropbear
   ```

4. **Enable regular backups:**
   ```bash
   # Add to crontab
   0 3 * * 0 sysupgrade -b /tmp/weekly-backup.tar.gz
   ```

5. **Keep OpenWrt updated:**
   ```bash
   opkg update && opkg list-upgradable
   ```
