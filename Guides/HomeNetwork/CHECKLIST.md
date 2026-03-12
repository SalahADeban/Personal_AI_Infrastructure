# Network Segmentation Checklist

Interactive checklist for tracking implementation progress.

---

## Phase 1: Preparation

- [ ] Downloaded OpenWrt backup to local machine
- [ ] Noted current router IP and credentials
- [ ] Have physical access to router (can reconnect if locked out)
- [ ] Installed required packages (wireguard-tools, adblock)

## Phase 2: VLAN Configuration

- [ ] Created VLAN 10 device (br-lan.10)
- [ ] Created VLAN 20 device (br-lan.20)
- [ ] Created VLAN 30 device (br-lan.30)
- [ ] Assigned LAN1 to VLAN 10 (Trusted)
- [ ] Assigned LAN2 to VLAN 20 (Servers)
- [ ] Assigned LAN3 to VLAN 30 (IoT)
- [ ] Created `lan` interface (10.0.10.1/24)
- [ ] Created `servers` interface (10.0.20.1/24)
- [ ] Created `iot` interface (10.0.30.1/24)

## Phase 3: Firewall Zones

- [ ] Created `servers` zone
- [ ] Created `iot` zone
- [ ] Created `vpn` zone
- [ ] Configured zone defaults (input/output/forward)
- [ ] Added forwarding: lan → servers
- [ ] Added forwarding: lan → iot
- [ ] Added forwarding: servers → wan
- [ ] Added forwarding: servers → lan
- [ ] Added forwarding: iot → wan (only)
- [ ] Added forwarding: vpn → all zones

## Phase 4: Firewall Rules

- [ ] Allow IoT DHCP (UDP 67-68)
- [ ] Allow IoT DNS (UDP 53)
- [ ] Allow WireGuard from WAN (UDP 51820)
- [ ] Allow IoT → Home Assistant (TCP 8123 to 10.0.20.20)
- [ ] Block IoT → LAN (with logging)
- [ ] Block IoT → Servers (except HA)

## Phase 5: DHCP Configuration

- [ ] LAN DHCP: 10.0.10.100-199, 24h lease
- [ ] Servers DHCP: Disabled (static only)
- [ ] IoT DHCP: 10.0.30.100-199, 12h lease
- [ ] Static lease: docker-host → 10.0.20.10
- [ ] Static lease: home-assistant → 10.0.20.20

## Phase 6: IoT WiFi

- [ ] Created IoT SSID on 2.4GHz radio
- [ ] Assigned IoT SSID to `iot` network
- [ ] Enabled client isolation
- [ ] Set strong WPA2 password

## Phase 7: WireGuard VPN

- [ ] Generated server keys
- [ ] Generated phone client keys
- [ ] Generated laptop client keys
- [ ] Created wg0 interface (10.0.99.1/24)
- [ ] Added phone peer (10.0.99.2)
- [ ] Added laptop peer (10.0.99.3)
- [ ] Created phone.conf client config
- [ ] Created laptop.conf client config
- [ ] Imported config into WireGuard apps

## Phase 8: Physical Setup

- [ ] Moved Nest WiFi to LAN1 (VLAN 10)
- [ ] Moved server to LAN2 (VLAN 20)
- [ ] Set server static IP to 10.0.20.10
- [ ] Connected IoT hub to LAN3 (VLAN 30) or IoT WiFi

## Phase 9: Server Setup

- [ ] Installed Docker on server
- [ ] Configured docker-compose.yml
- [ ] Started Home Assistant container
- [ ] Started Plex/Jellyfin container
- [ ] Started Nextcloud container
- [ ] Started Pi-hole container (optional)
- [ ] Configured Pi-hole as DNS on OpenWrt (optional)

## Phase 10: Verification

### From Trusted Device (10.0.10.x)
- [ ] Gets IP in 10.0.10.x range
- [ ] Can ping 10.0.20.10 (server)
- [ ] Can ping 10.0.30.1 (IoT gateway)
- [ ] Can access internet (ping 8.8.8.8)
- [ ] Can access Plex/Jellyfin
- [ ] Can access Nextcloud

### From IoT Device (10.0.30.x)
- [ ] Gets IP in 10.0.30.x range
- [ ] Cannot ping 10.0.10.x (trusted) - SHOULD FAIL
- [ ] Cannot ping 10.0.20.10 (server) - SHOULD FAIL
- [ ] Can access Home Assistant (10.0.20.20:8123)
- [ ] Can access internet (ping 8.8.8.8)

### From VPN Client (10.0.99.x)
- [ ] WireGuard connects successfully
- [ ] Gets IP in 10.0.99.x range
- [ ] Can ping 10.0.10.1 (trusted gateway)
- [ ] Can ping 10.0.20.10 (server)
- [ ] Can access all home services

## Phase 11: Security Hardening

- [ ] Changed default OpenWrt root password
- [ ] Enabled HTTPS for LuCI (`opkg install luci-ssl`)
- [ ] Verified SSH disabled from WAN
- [ ] Set up weekly config backup
- [ ] Tested full restore from backup

---

## Quick Reference

| Network | Subnet | Gateway | DHCP Range |
|---------|--------|---------|------------|
| Trusted | 10.0.10.0/24 | 10.0.10.1 | .100-.199 |
| Servers | 10.0.20.0/24 | 10.0.20.1 | Static only |
| IoT | 10.0.30.0/24 | 10.0.30.1 | .100-.199 |
| VPN | 10.0.99.0/24 | 10.0.99.1 | .2-.10 |

| Port | Device | IP |
|------|--------|-----|
| LAN1 | Nest WiFi | DHCP (trusted) |
| LAN2 | Server | 10.0.20.10 |
| LAN3 | IoT (wired) | DHCP (iot) |
| LAN4 | Spare | - |

| Service | URL |
|---------|-----|
| OpenWrt | http://10.0.1.1 or http://10.0.10.1 |
| Home Assistant | http://10.0.20.20:8123 |
| Plex | http://10.0.20.10:32400/web |
| Nextcloud | http://10.0.20.10:8080 |
| Pi-hole | http://10.0.20.10:8081/admin |
| Portainer | http://10.0.20.10:9000 |
