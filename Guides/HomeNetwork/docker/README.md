# Home Server Docker Stack

Docker Compose configuration for running home services on the server (10.0.20.10).

## Services

| Service | Port | URL | Purpose |
|---------|------|-----|---------|
| Home Assistant | 8123 | http://10.0.20.10:8123 | IoT hub |
| Plex | 32400 | http://10.0.20.10:32400/web | Media server |
| Nextcloud | 8080 | http://10.0.20.10:8080 | File sync |
| Pi-hole | 8081 | http://10.0.20.10:8081/admin | DNS/Ad blocking |
| Portainer | 9000 | http://10.0.20.10:9000 | Docker management |

## Quick Start

### 1. Prerequisites

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose (if not included)
sudo apt install docker-compose-plugin
```

### 2. Configure

```bash
# Clone or copy files
mkdir -p ~/homelab
cd ~/homelab

# Create directories
mkdir -p homeassistant/config plex/config nextcloud/{data,db} pihole/{etc-pihole,etc-dnsmasq.d} portainer/data

# Copy docker-compose.yml to ~/homelab/
```

### 3. Update Configuration

Edit `docker-compose.yml`:

1. Change timezone (`TZ`) to your timezone
2. Update media paths for Plex (`/path/to/movies`, etc.)
3. Change all `CHANGE_THIS_PASSWORD` values
4. Get Plex claim token from https://plex.tv/claim

### 4. Start Services

```bash
cd ~/homelab
docker compose up -d

# Check status
docker compose ps
docker compose logs -f
```

## Network Configuration

Most services use `network_mode: host` for:
- Device discovery (Home Assistant, Plex)
- mDNS/Bonjour support
- Direct LAN access without port mapping

This means services bind directly to the host's IP (10.0.20.10).

## Pi-hole as DNS

To use Pi-hole for network-wide ad blocking:

1. **On OpenWrt:**
   ```bash
   # Set Pi-hole as upstream DNS
   uci set dhcp.@dnsmasq[0].server='10.0.20.10'
   uci commit dhcp
   /etc/init.d/dnsmasq restart
   ```

2. **Or per-VLAN DHCP option:**
   - Edit DHCP settings for each interface
   - Set DNS server to 10.0.20.10

## Home Assistant + IoT

IoT devices on VLAN 30 can reach Home Assistant on port 8123.

For Zigbee/Z-Wave devices:
- Add USB coordinator to server
- Map in docker-compose.yml:
  ```yaml
  homeassistant:
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0  # Zigbee stick
  ```

## Backups

### Manual Backup

```bash
cd ~/homelab
docker compose down
tar -czvf homelab-backup-$(date +%Y%m%d).tar.gz \
    homeassistant/config \
    plex/config \
    nextcloud/data \
    pihole/etc-pihole
docker compose up -d
```

### Automated Backup Script

```bash
#!/bin/bash
# Save as ~/homelab/backup.sh

BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d)

cd ~/homelab

# Stop containers for consistent backup
docker compose stop homeassistant nextcloud

# Backup
tar -czvf "$BACKUP_DIR/homelab-$DATE.tar.gz" \
    homeassistant/config \
    nextcloud/data \
    pihole/etc-pihole

# Restart
docker compose start

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/homelab-*.tar.gz | tail -n +8 | xargs -r rm
```

## Updating

Watchtower automatically updates containers at 4 AM daily.

Manual update:
```bash
docker compose pull
docker compose up -d
```

## Troubleshooting

### Container won't start
```bash
docker compose logs <service-name>
```

### Port already in use
```bash
sudo lsof -i :<port>
```

### Pi-hole DNS not working
```bash
# Test from server
dig @127.0.0.1 google.com

# Check Pi-hole is listening
sudo ss -tulpn | grep :53
```

### Home Assistant can't discover devices
- Ensure `network_mode: host` is set
- Check firewall allows mDNS (UDP 5353)
- For IoT devices, ensure they're on VLAN 30 with route to HA
