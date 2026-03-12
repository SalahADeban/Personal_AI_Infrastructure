# Home Network Segmentation Guide

Secure home network architecture with VLANs, firewall rules, and WireGuard VPN for OpenWrt.

## Quick Reference

| VLAN | Subnet | Purpose | Gateway |
|------|--------|---------|---------|
| 1 | 10.0.1.0/24 | Management | 10.0.1.1 |
| 10 | 10.0.10.0/24 | Trusted LAN | 10.0.10.1 |
| 20 | 10.0.20.0/24 | Servers | 10.0.20.1 |
| 30 | 10.0.30.0/24 | IoT | 10.0.30.1 |
| 40 | 10.0.40.0/24 | Guest | 10.0.40.1 |

## Physical Topology

```
                    ┌─────────────────────────────────────────┐
                    │         OpenWrt (ASUS RT-AC1200)        │
                    │                                         │
Internet ──► WAN    │  LAN1: Nest WiFi (VLAN 10 - Trusted)   │
                    │  LAN2: Server (VLAN 20 - Servers)       │
                    │  LAN3: IoT devices (VLAN 30 - IoT)      │
                    │  LAN4: Spare / Management               │
                    │                                         │
                    │  WiFi: IoT SSID (VLAN 30) - 2.4GHz      │
                    └─────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Google Nest     │
                    │   (Trusted WiFi)  │
                    │   Phones, Laptops │
                    └───────────────────┘
```

## Files in This Directory

| File | Purpose |
|------|---------|
| `config/network` | OpenWrt network configuration (VLANs, interfaces) |
| `config/firewall` | Firewall zones and rules |
| `config/dhcp` | DHCP server configuration |
| `config/wireless` | IoT WiFi SSID configuration |
| `scripts/setup.sh` | Automated setup script |
| `scripts/backup.sh` | Configuration backup script |
| `scripts/verify.sh` | Verification checklist script |
| `scripts/safe-apply.sh` | Apply with auto-rollback (60s timeout) |
| `scripts/validate-config.sh` | Check config for lockout issues |
| `scripts/incremental-setup.sh` | Step-by-step setup with checkpoints |
| `scripts/generate-wireguard-client.sh` | Generate VPN client configs |
| `testing/VM-TESTING.md` | Test configs in VM before real router |
| `docker/` | Docker Compose for server services |
| `IMPLEMENTATION.md` | Step-by-step manual instructions |
| `CHECKLIST.md` | Progress tracking checklist |

## Implementation Order

1. **Backup** - Run `scripts/backup.sh` first
2. **VLANs** - Apply `config/network`
3. **Firewall** - Apply `config/firewall`
4. **DHCP** - Apply `config/dhcp`
5. **WiFi** - Apply `config/wireless`
6. **VPN** - Apply `config/wireguard`
7. **Verify** - Run `scripts/verify.sh`

## Quick Start

```bash
# SSH into OpenWrt
ssh root@192.168.1.1

# Backup current config
sysupgrade -b /tmp/backup-$(date +%Y%m%d).tar.gz

# Copy config files (from your local machine)
scp config/* root@192.168.1.1:/etc/config/

# Restart networking
/etc/init.d/network restart
/etc/init.d/firewall restart
```

## Security Notes

- IoT devices are isolated from trusted network
- Only Home Assistant port (8123) accessible from IoT
- WireGuard VPN for secure remote access
- Guest network has internet-only access
