# Installation Guide — kai-services-gateway

## Prerequisites

- Bun runtime installed
- IchimokuRadar pack installed and running (optional, for signals)
- Network access to CoinGecko API

## Installation Steps

### 1. Install Dependencies

```bash
cd PAI/Packs/kai-services-gateway
bun install
```

### 2. Configure Services

```bash
cp config/services.example.yaml config/services.yaml
```

Edit `config/services.yaml`:

```yaml
server:
  port: 4001

schedule:
  morning_brief: "0 7 * * *"    # 7:00 AM daily
  daily_review: "0 22 * * *"    # 10:00 PM daily

webhooks:
  enabled: true
  targets:
    - type: ntfy
      url: https://ntfy.sh/your-topic

archive:
  enabled: true
  path: ${PAI_DIR}/briefs

sources:
  ichimoku:
    url: http://localhost:5181/api/signals
  market:
    assets: [bitcoin, solana, jupiter-exchange-solana]

timezone: America/Los_Angeles
```

### 3. Set Environment Variables

Add to `~/.claude/.env`:

```bash
# Optional: Telegram webhook
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Optional: Discord webhook
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### 4. Create Directories

```bash
mkdir -p ~/.claude/briefs
mkdir -p ~/.claude/history/captures
```

### 5. Start the Server

```bash
# Development
bun run src/index.ts

# Or with Docker
cd docker
docker-compose up -d
```

### 6. Create Skill Symlinks (Optional)

To invoke services via Claude Code skills:

```bash
mkdir -p ~/.claude/skills/DailyReview
mkdir -p ~/.claude/skills/QuickCapture

# Skills are created during installation
```

### 7. Install CLI Wrapper (Optional)

```bash
mkdir -p ~/.claude/bin
cp bin/pai ~/.claude/bin/
chmod +x ~/.claude/bin/pai

# Add to PATH in ~/.zshrc or ~/.bashrc
export PATH="$HOME/.claude/bin:$PATH"
```

## Docker Installation

For containerized deployment:

```bash
cd docker
docker-compose up -d
```

This starts:
- PAI Gateway on port 4001
- IchimokuRadar on port 5181 (if included in compose)

## Verify Installation

Run through `VERIFY.md` checklist to confirm everything works.
