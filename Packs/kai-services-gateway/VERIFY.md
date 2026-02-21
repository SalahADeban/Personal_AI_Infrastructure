# Verification Checklist — kai-services-gateway

## Pre-flight Checks

- [ ] Bun installed: `bun --version`
- [ ] Dependencies installed: `ls node_modules`
- [ ] Config file exists: `ls config/services.yaml`
- [ ] Briefs directory exists: `ls ~/.claude/briefs`

## Server Startup

- [ ] Server starts without errors:
  ```bash
  bun run src/index.ts
  # Should see: "PAI Gateway listening on :4001"
  ```

## API Endpoints

- [ ] Health check returns 200:
  ```bash
  curl http://localhost:4001/api/health
  # {"status":"ok","timestamp":"..."}
  ```

- [ ] Brief endpoint works:
  ```bash
  curl http://localhost:4001/api/brief
  # Returns morning brief JSON
  ```

- [ ] Brief generation works:
  ```bash
  curl -X POST http://localhost:4001/api/brief/generate
  # Returns generated brief
  ```

- [ ] Daily review endpoint works:
  ```bash
  curl http://localhost:4001/api/daily-review
  # Returns daily review JSON
  ```

- [ ] Quick capture works:
  ```bash
  curl -X POST http://localhost:4001/api/capture \
    -H "Content-Type: application/json" \
    -d '{"insight":"Test capture"}'
  # {"success":true,"id":"..."}
  ```

- [ ] Recent captures work:
  ```bash
  curl http://localhost:4001/api/capture/recent
  # Returns array of captures
  ```

## Data Sources

- [ ] IchimokuRadar connection (if running):
  ```bash
  curl http://localhost:5181/api/signals
  # Returns signal data
  ```

- [ ] CoinGecko API accessible:
  ```bash
  curl "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
  # {"bitcoin":{"usd":...}}
  ```

- [ ] History JSONL readable:
  ```bash
  ls ~/.claude/history/raw-outputs/
  # Shows date directories
  ```

## Scheduled Jobs

- [ ] Cron jobs registered (check logs):
  ```
  [scheduler] Registered: morning_brief at 0 7 * * *
  [scheduler] Registered: daily_review at 0 22 * * *
  ```

- [ ] Manual trigger works:
  ```bash
  curl -X POST http://localhost:4001/api/brief/generate
  ```

## Webhook Delivery (if configured)

- [ ] ntfy notification received
- [ ] Telegram message received (if configured)
- [ ] Discord message received (if configured)

## Archive Files

- [ ] Brief archived after generation:
  ```bash
  ls ~/.claude/briefs/
  # YYYY-MM-DD_morning-brief.md exists
  ```

- [ ] Daily review archived:
  ```bash
  ls ~/.claude/briefs/
  # YYYY-MM-DD_daily-review.md exists
  ```

## Docker Deployment

- [ ] Image builds successfully:
  ```bash
  cd docker && docker-compose build
  ```

- [ ] Container starts:
  ```bash
  docker-compose up -d
  docker-compose logs pai-gateway
  # Shows startup logs
  ```

- [ ] Health check passes:
  ```bash
  docker-compose ps
  # pai-gateway should be "healthy"
  ```

## CLI Wrapper (if installed)

- [ ] CLI accessible:
  ```bash
  pai --help
  ```

- [ ] Capture command works:
  ```bash
  pai capture "Test insight"
  ```

## All Checks Passed?

If all checks pass, the gateway is fully operational.

If any fail, check:
1. Server logs for errors
2. Config file for typos
3. Network connectivity to external APIs
4. File permissions on archive directories
