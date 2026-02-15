---
name: TrendRadar
description: Real-time social media trend discovery and categorization dashboard. USE WHEN trends, what's trending, social media, twitter trends, reddit trends, viral content, OR trend analysis. Aggregates trends from X, Reddit, HackerNews and auto-categorizes them.
---

# TrendRadar

Real-time trend discovery dashboard that monitors social platforms and auto-categorizes emerging conversations.

## Overview

| Attribute | Value |
|-----------|-------|
| **Type** | Dashboard webapp |
| **Port** | 5180 |
| **URL** | http://localhost:5180 |
| **Data Sources** | X/Twitter, Reddit, HackerNews, RSS, Web Search |

## Features

- **Real-time Dashboard** - Live-updating trend feed
- **Auto-Categorization** - AI-powered topic classification
- **Multi-Platform** - Aggregates from multiple sources
- **Velocity Tracking** - Spots emerging trends early
- **No Topic Limits** - Discovers ALL trends, then categorizes

## Categories (Auto-Detected)

| Category | Examples |
|----------|----------|
| Tech/AI | AI releases, programming, startups |
| Crypto/Finance | Bitcoin, DeFi, markets |
| World/Politics | Global news, policy |
| Entertainment | Movies, music, celebrities |
| Sports | Games, athletes, leagues |
| Science | Research, space, health |
| Business | Companies, products, acquisitions |
| Culture | Memes, viral content, social |

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **ViewDashboard** | "show trends", "open trend radar", "what's trending" | Opens browser |
| **TrendReport** | "trend report", "export trends" | `Workflows/TrendReport.md` |

## CLI Tools

```bash
# Start the dashboard server
$PAI_DIR/skills/TrendRadar/Tools/manage.sh start

# Stop the server
$PAI_DIR/skills/TrendRadar/Tools/manage.sh stop

# Check status
$PAI_DIR/skills/TrendRadar/Tools/manage.sh status

# Open in browser
open http://localhost:5180
```

## Data Sources

| Source | Method | Update Frequency |
|--------|--------|------------------|
| HackerNews | API | 5 min |
| Reddit | RSS/API | 5 min |
| X/Twitter | Web search trends | 10 min |
| Google Trends | RSS | 15 min |
| Tech News | RSS feeds | 10 min |

## Examples

**Example 1: View trends**
```
User: "What's trending right now?"
→ Opens TrendRadar dashboard at localhost:5180
→ Shows live categorized trends
```

**Example 2: Get trend report**
```
User: "Give me a trend report"
→ Generates snapshot of current trends
→ Saves to Reports/TrendReport-YYYY-MM-DD.md
```

## Architecture

```
TrendRadar/
├── SKILL.md
├── package.json
├── src/
│   ├── server.ts      # Bun HTTP server
│   ├── aggregator.ts  # Multi-source fetching
│   └── categorizer.ts # Auto-categorization
├── public/
│   └── index.html     # Dashboard UI
├── Tools/
│   └── manage.sh      # Start/stop script
└── Reports/
    └── [generated reports]
```
