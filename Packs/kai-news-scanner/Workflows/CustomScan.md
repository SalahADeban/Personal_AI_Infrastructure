# CustomScan Workflow

**Search for news on a specific custom topic.**

## Trigger Phrases
- "news about [topic]", "search news for [topic]", "any news on [topic]"

## Execution Steps

### Step 1: Extract Topic
Parse the user's request to identify the specific topic.

Examples:
- "Any news about Claude AI?" → topic: "Claude AI"
- "What's happening with Solana?" → topic: "Solana"
- "News about 3D printing" → topic: "3D printing"

### Step 2: Web Search
Use WebSearch tool with query:
```
"[topic] news [current month] [current year]"
```

### Step 3: Filter & Summarize
- Select top 5-7 most relevant results
- Summarize each article in 1-2 sentences
- Note the source and date

### Step 4: Format Output

```markdown
## News: [Topic] - [Date]

### Found [N] Recent Articles

1. **[Headline]** - [Source] ([Date])
   [Summary]

2. **[Headline]** - [Source] ([Date])
   [Summary]

[Continue for relevant articles...]

### Summary
[1-2 sentence overview of what's happening with this topic]
```

## Notes
- If no recent news found, expand search timeframe
- Cross-reference with Salah's interests when relevant
- Flag if topic intersects with halal/haram considerations
