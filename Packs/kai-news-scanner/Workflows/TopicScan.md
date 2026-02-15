# TopicScan Workflow

**Focused news scan for a specific topic category.**

## Trigger Phrases
- "tech news", "crypto news", "AI news", "world news", "[topic] news"

## Execution Steps

### Step 1: Identify Topic

Map user request to category:
| Request | Category | Keywords |
|---------|----------|----------|
| "tech news", "AI news" | tech | AI, LLM, programming, open source |
| "crypto news", "bitcoin news" | crypto | Bitcoin, Solana, cryptocurrency, halal finance |
| "world news", "global news" | world | Muslim world, geopolitics, Middle East |

### Step 2: Fetch News

```bash
bun run $PAI_DIR/skills/NewsScanner/Tools/FetchNews.ts <category>
```

Or use WebSearch with category-specific queries.

### Step 3: Format Output

```markdown
## [Category] News - [Date]

### Top Stories
1. **[Headline]** - [Source]
   [2-3 sentence summary with key details]

2. **[Headline]** - [Source]
   [2-3 sentence summary with key details]

3. **[Headline]** - [Source]
   [2-3 sentence summary with key details]

### Analysis
[Brief analysis of trends or patterns in this category]
```

## Category-Specific Notes

**Tech/AI:**
- Highlight open source projects
- Note AI safety/ethics developments
- Flag tools relevant to data engineering

**Crypto/Finance:**
- Always note Shariah compliance considerations
- Highlight Bitcoin and Solana specifically
- Include regulatory news

**World:**
- Prioritize Muslim world news
- Note geopolitical impacts on tech/finance
