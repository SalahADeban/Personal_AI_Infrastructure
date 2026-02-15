# DailyScan Workflow

**Comprehensive daily news digest across all interest areas.**

## Trigger Phrases
- "news", "what's happening", "morning briefing", "daily digest", "catch me up"

## Execution Steps

### Step 1: Fetch Tech/AI News
```bash
bun run $PAI_DIR/skills/NewsScanner/Tools/FetchNews.ts tech
```

Or use WebSearch tool:
- Query: "AI technology news today [current date]"
- Query: "open source software news this week"

### Step 2: Fetch Crypto/Finance News
```bash
bun run $PAI_DIR/skills/NewsScanner/Tools/FetchNews.ts crypto
```

Or use WebSearch tool:
- Query: "Bitcoin Solana cryptocurrency news today"
- Query: "halal finance Islamic banking news"

### Step 3: Fetch World/Muslim News
```bash
bun run $PAI_DIR/skills/NewsScanner/Tools/FetchNews.ts world
```

Or use WebSearch tool:
- Query: "Muslim world news today"
- Query: "Middle East global news headlines"

### Step 4: Compile Digest

Format output as:

```markdown
## Daily News Digest - [Date]

### Tech & AI
- **[Headline]** ([Source]) - [Summary]
- **[Headline]** ([Source]) - [Summary]

### Crypto & Finance
- **[Headline]** ([Source]) - [Summary]
- **[Headline]** ([Source]) - [Summary]

### World News
- **[Headline]** ([Source]) - [Summary]
- **[Headline]** ([Source]) - [Summary]

### Key Takeaways
- [Major trend or theme across stories]
- [Relevant insight for Salah's interests]
```

## Notes
- Prioritize stories relevant to Salah's interests (AI/ML, Bitcoin, Solana, halal finance)
- Flag any stories with Islamic finance implications
- Keep summaries concise (1-2 sentences max)
