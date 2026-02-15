---
name: IchimokuRadar
description: Ichimoku Kinko Hyo technical analysis signal tracker for crypto and stocks. USE WHEN ichimoku, kumo twist, trading signals, BTC signal, technical analysis, TA dashboard, edge to edge, OR monitor crypto signals. Tracks BTC, SOL, JUP, ETH, TSLA on daily and monthly timeframes with webhook notifications.
---

# IchimokuRadar

Real-time Ichimoku technical analysis dashboard with composite signal scoring and Kumo twist alerts.

## Overview

| Attribute | Value |
|-----------|-------|
| **Type** | Dashboard webapp |
| **Port** | 5181 |
| **URL** | http://localhost:5181 |
| **Assets** | BTC, ETH, SOL, JUP, TSLA |
| **Timeframes** | Daily (1D), Monthly (1M) |

## Signal Components

| Component | Weight | Description |
|-----------|--------|-------------|
| Kumo Twist | +/-30 | Senkou Span A crosses Senkou Span B (cloud color change) |
| TK Cross | +/-25 | Tenkan-sen crosses Kijun-sen |
| Price vs Cloud | +/-20 | Price above/below/inside cloud |
| Chikou Span | +/-15 | Lagging span vs price 26 periods ago |
| Cloud Thickness | +/-10 | Cloud width as trend strength indicator |

## Special Signals

- **Edge-to-Edge Trade**: When price enters the cloud, tracks the trade to the opposite cloud edge
- **Kumo Twist**: Future cloud color change = major trend reversal signal

## CLI Tools

```bash
# Start the dashboard
$PAI_DIR/skills/IchimokuRadar/Tools/manage.sh start

# Stop
$PAI_DIR/skills/IchimokuRadar/Tools/manage.sh stop

# View logs
$PAI_DIR/skills/IchimokuRadar/Tools/manage.sh logs
```

## Data Sources

| Source | Assets | Timeframe | API Key Required |
|--------|--------|-----------|-----------------|
| CoinGecko | BTC, ETH, SOL, JUP | Daily | No (free tier) |
| CryptoCompare | BTC, ETH, SOL, JUP | Monthly | No (free tier) |
| Yahoo Finance | TSLA | Daily + Monthly | No |
