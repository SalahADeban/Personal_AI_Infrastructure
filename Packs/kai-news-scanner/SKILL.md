---
name: NewsScanner
description: News aggregation and digest generation. USE WHEN news, headlines, what's happening, daily briefing, scan news, tech news, crypto news, world news, OR morning update. Fetches from web search, RSS feeds, and APIs.
---

# NewsScanner

Aggregates news across your interest areas and generates concise summary digests.

## Topics Covered

| Category | Sources | Keywords |
|----------|---------|----------|
| **Tech/AI** | Hacker News, TechCrunch, ArsTechnica | AI, LLMs, open source, programming |
| **Crypto/Finance** | CoinDesk, Bitcoin Magazine | Bitcoin, Solana, halal finance, markets |
| **World/Muslim** | Al Jazeera, Reuters | Global news, Muslim world, geopolitics |

## Workflow Routing

| Workflow | Trigger | File |
|----------|---------|------|
| **DailyScan** | "news", "what's happening", "morning briefing", "daily digest" | `Workflows/DailyScan.md` |
| **TopicScan** | "tech news", "crypto news", "AI news", "[topic] news" | `Workflows/TopicScan.md` |
| **CustomScan** | "news about [specific topic]", "search news for" | `Workflows/CustomScan.md` |

## CLI Tool

```bash
# Fetch news for a topic
bun run $PAI_DIR/skills/NewsScanner/Tools/FetchNews.ts <topic>

# Examples
bun run $PAI_DIR/skills/NewsScanner/Tools/FetchNews.ts tech
bun run $PAI_DIR/skills/NewsScanner/Tools/FetchNews.ts crypto
bun run $PAI_DIR/skills/NewsScanner/Tools/FetchNews.ts world
bun run $PAI_DIR/skills/NewsScanner/Tools/FetchNews.ts all
```

## Output Format

```
## [Category] News - [Date]

### Headlines
- **[Title]** - [Source] - [1-2 sentence summary]
- **[Title]** - [Source] - [1-2 sentence summary]

### Key Takeaways
- [Trend or pattern observed]
- [Important development]
```

## Examples

**Example 1: Morning briefing**
```
User: "What's the news today?"
→ Invokes DailyScan workflow
→ Fetches from all categories
→ Returns digest with top stories from Tech, Crypto, World
```

**Example 2: Topic-specific scan**
```
User: "Give me the latest crypto news"
→ Invokes TopicScan workflow
→ Fetches Bitcoin, Solana, halal finance news
→ Returns focused crypto digest
```

**Example 3: Custom search**
```
User: "Any news about Claude AI?"
→ Invokes CustomScan workflow
→ Web searches for "Claude AI" recent news
→ Returns relevant articles
```

## Configuration

RSS feeds and preferences stored in `Config.yaml`:
- Add/remove RSS sources
- Adjust topic keywords
- Set preferred sources per category
