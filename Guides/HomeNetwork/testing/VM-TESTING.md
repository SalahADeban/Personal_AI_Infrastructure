# Testing OpenWrt in a Virtual Machine

Test your entire VLAN configuration safely before touching real hardware.

---

## Option A: UTM (Recommended for Mac)

UTM is free and works great on Apple Silicon.

### 1. Download OpenWrt x86 Image

```bash
# Download combined EFI image
curl -L -o ~/Downloads/openwrt.img.gz \
  "https://downloads.openwrt.org/releases/23.05.2/targets/x86/64/openwrt-23.05.2-x86-64-generic-ext4-combined-efi.img.gz"

# Extract
gunzip ~/Downloads/openwrt.img.gz

# Convert to qcow2 for UTM
qemu-img convert -f raw -O qcow2 ~/Downloads/openwrt.img ~/Downloads/openwrt.qcow2
```

### 2. Create VM in UTM

1. Open UTM → **Create a New Virtual Machine**
2. **Emulate** (not Virtualize) → **Other**
3. Skip ISO (we'll use the disk image)
4. RAM: **256 MB** (OpenWrt is lightweight)
5. Storage: **Skip** (we'll import our disk)
6. **Save**

7. Edit the VM:
   - **QEMU** → Architecture: **x86_64**
   - **Drives** → **Import Drive** → Select `openwrt.qcow2`
   - **Network** → Mode: **Emulated VLAN** (for WAN)
   - Add second network: **Bridged** to your Mac's network (for LAN testing)

### 3. Boot and Access

```bash
# After VM starts, access via serial console in UTM
# Or SSH once you set an IP:

# In VM console, set a password:
passwd

# Set LAN IP for SSH access:
uci set network.lan.ipaddr='192.168.100.1'
uci commit network
/etc/init.d/network restart

# From Mac:
ssh root@192.168.100.1
```

---

## Option B: VirtualBox (Cross-platform)

### 1. Download and Convert Image

```bash
# Download
curl -L -o ~/Downloads/openwrt.img.gz \
  "https://downloads.openwrt.org/releases/23.05.2/targets/x86/64/openwrt-23.05.2-x86-64-generic-ext4-combined-efi.img.gz"

gunzip ~/Downloads/openwrt.img.gz

# Convert to VDI
VBoxManage convertfromraw ~/Downloads/openwrt.img ~/Downloads/openwrt.vdi --format VDI
```

### 2. Create VM

1. **New** → Name: OpenWrt, Type: Linux, Version: Other Linux (64-bit)
2. RAM: **256 MB**
3. **Use existing virtual hard disk** → Select `openwrt.vdi`
4. **Settings** → **Network**:
   - Adapter 1: NAT (WAN)
   - Adapter 2: Host-only Adapter (LAN) - create one first in VBox preferences

### 3. Access

Same as UTM - set password, configure LAN IP, SSH in.

---

## Option C: Docker (Quick Syntax Testing)

For quickly validating UCI config syntax (not full network testing):

```bash
# Run OpenWrt container
docker run -d --name openwrt-test \
  --privileged \
  openwrt/rootfs:x86_64-23.05.2

# Enter container
docker exec -it openwrt-test sh

# Test your UCI commands
uci set network.lan.ipaddr='10.0.10.1'
uci show network
uci changes
uci revert network  # Undo without applying

# Cleanup
docker rm -f openwrt-test
```

---

## Testing Workflow

### Step 1: Set Up VM

```bash
# In VM, install packages to match your router
opkg update
opkg install luci
```

### Step 2: Copy Your Config Files

```bash
# From your Mac, copy config to VM
scp config/network root@192.168.100.1:/etc/config/
scp config/firewall root@192.168.100.1:/etc/config/
scp config/dhcp root@192.168.100.1:/etc/config/
```

### Step 3: Validate Syntax

```bash
# On VM
uci show network    # Should parse without errors
uci show firewall   # Should parse without errors

# Check for issues
uci changes         # Should show pending changes
```

### Step 4: Test Apply

```bash
# Apply in VM (safe - it's just a VM!)
/etc/init.d/network restart
/etc/init.d/firewall restart

# Check interfaces came up
ip addr show
```

### Step 5: Test Firewall Rules

```bash
# Check iptables rules were created
iptables -L -n
iptables -L -n -t nat

# Check zones
cat /tmp/etc/firewall.d/*
```

---

## Simulating VLANs in VM

OpenWrt x86 can create virtual interfaces to simulate VLANs:

```bash
# Create virtual interfaces
ip link add link eth0 name eth0.10 type vlan id 10
ip link add link eth0 name eth0.20 type vlan id 20
ip link add link eth0 name eth0.30 type vlan id 30

# Bring them up
ip link set eth0.10 up
ip link set eth0.20 up
ip link set eth0.30 up
```

Or configure in `/etc/config/network`:

```
config device
    option type '8021q'
    option ifname 'eth0'
    option vid '10'
    option name 'eth0.10'
```

---

## Common Issues to Catch

### 1. Syntax Errors
```bash
# This will fail if config has errors
uci show network 2>&1 | grep -i error
```

### 2. Missing Interfaces
```bash
# Check configured vs actual interfaces
uci show network | grep interface
ip link show
```

### 3. Firewall Zone Conflicts
```bash
# Check for duplicate zones
uci show firewall | grep "zone\[" | sort | uniq -d
```

### 4. DHCP Conflicts
```bash
# Verify DHCP ranges don't overlap
uci show dhcp | grep -E "(start|limit)"
```

---

## Export Tested Config

Once your VM config works:

```bash
# On VM, export working config
scp root@192.168.100.1:/etc/config/network ./tested-network
scp root@192.168.100.1:/etc/config/firewall ./tested-firewall

# Then apply to real router with safe-apply.sh
```

---

## Failsafe Access (Real Router)

If you do get locked out of your real router:

### Option 1: Failsafe Mode
1. Power off router
2. Press and hold reset button
3. Power on while holding reset
4. Wait for LED pattern (usually fast blinking)
5. Release reset
6. Connect via ethernet, set your IP to `192.168.1.2`
7. Telnet to `192.168.1.1`
8. Run `firstboot` to reset, or `mount_root` to edit config

### Option 2: Serial Console
If your router has serial headers, you can access even with broken network config.

### Option 3: TFTP Recovery
Some routers allow flashing via TFTP during boot. Check your model's wiki page.
