# kai-services-gateway

PAI Services Gateway — standalone intelligence services that run independently of Claude Code.

## Overview

This pack provides containerized services for:
- **MorningBrief** — Aggregated market data, Ichimoku signals, and daily focus
- **DailyReview** — Automated end-of-day summary from history events
- **QuickCapture** — CLI/API for instant insight capture

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    PAI Services Gateway                  │
│                      (port 4001)                         │
├─────────────────────────────────────────────────────────┤
│  /api/brief          → MorningBrief (aggregated data)   │
│  /api/daily-review   → DailyReview (parsed history)     │
│  /api/capture        → QuickCapture (POST insights)     │
│  /api/health         → Health check                     │
├─────────────────────────────────────────────────────────┤
│  Scheduled Jobs (cron)                                   │
│  • 07:00 → Generate brief → Push webhook → Archive      │
│  • 22:00 → Generate daily review → Push → Archive       │
├─────────────────────────────────────────────────────────┤
│  Output Channels                                         │
│  • JSON API (on-demand)                                 │
│  • Webhook push (ntfy/Telegram/Discord)                 │
│  • File archive (~/.claude/briefs/)                     │
└─────────────────────────────────────────────────────────┘
```

## Data Sources

- **IchimokuRadar** (`localhost:5181/api/signals`) — Composite scores, labels, triggers
- **CoinGecko API** — Prices, 24h changes
- **History JSONL** — Session events, learnings, decisions

## Quick Start

```bash
# Development
cd PAI/Packs/kai-services-gateway
bun install
bun run src/index.ts

# Docker
cd docker
docker-compose up -d
```

## Configuration

Copy `config/services.example.yaml` to `config/services.yaml` and configure:
- Webhook targets (ntfy, Telegram, Discord)
- Cron schedules
- Assets to track

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/brief` | GET | Get latest morning brief |
| `/api/brief/generate` | POST | Generate new brief |
| `/api/daily-review` | GET | Get latest daily review |
| `/api/daily-review/generate` | POST | Generate new review |
| `/api/capture` | POST | Capture insight |
| `/api/capture/recent` | GET | Get recent captures |

## Dependencies

- **Runtime:** Bun
- **IchimokuRadar** running on port 5181
- **Network access** to CoinGecko API

## Files

```
kai-services-gateway/
├── README.md
├── INSTALL.md
├── VERIFY.md
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── scheduler.ts
│   ├── output/
│   │   ├── webhook.ts
│   │   ├── archive.ts
│   │   └── formatter.ts
│   ├── services/
│   │   ├── morning-brief.ts
│   │   ├── daily-review.ts
│   │   └── quick-capture.ts
│   └── sources/
│       ├── ichimoku.ts
│       ├── market.ts
│       └── history.ts
└── config/
    ├── services.example.yaml
    └── services.yaml
```
