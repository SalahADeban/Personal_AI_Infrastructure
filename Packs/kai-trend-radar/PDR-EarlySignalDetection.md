# PDR: TrendRadar Early Signal Detection

**Created:** 2026-01-10
**Status:** 75% Complete (6/8 Stories Done)

---

## Context & Problem Statement

TrendRadar currently aggregates **mainstream trends** - topics that have already gone viral. By the time something appears on Twitter's trending list or Reddit's /hot, it's old news for early adopters.

**Current data sources (all lagging indicators):**
| Source | Current Method | Problem |
|--------|---------------|---------|
| Twitter/X | Scraped trending lists | Already viral (millions of tweets) |
| Reddit | `/hot` feeds | Posts with 1000+ upvotes |
| Google Trends | Trending searches | Mass market awareness |
| HackerNews | Front page | Already 100+ points |

**The gap:** No detection of emerging signals before they hit mainstream. We're a trend *reporter*, not a trend *radar*.

---

## Success Criteria

- [x] Detect topics 2-6 hours before they hit mainstream trending
- [x] Surface signals from niche communities that lead mainstream
- [x] Track velocity of new topics (rapid growth from small base)
- [x] Distinguish "early signal" vs "established trend" in UI
- [ ] Reduce noise: filter out false positives that never gain traction

---

## Technical Context

**Current architecture:**
```
collectors/*.ts → aggregator.ts → storage.ts → server.ts → UI
```

**Velocity scoring exists** but only compares current vs 6-hour historical. Needs enhancement for early detection.

**Key insight:** Early signals have *high velocity from low base*, not high absolute numbers.

---

## User Stories

### Story 1: Add Rising/New Reddit Feeds ✅ COMPLETE

**Description:**
As a trend watcher, I want to see what's gaining traction in /rising and /new, so that I can spot emerging topics before they hit /hot.

**Acceptance Criteria:**
- [x] Add `/rising` endpoint for each subreddit (highest signal)
- [x] Add `/new` with engagement velocity filter (upvote rate)
- [x] Weight rising posts higher than hot posts in scoring
- [ ] Track time-to-hot for posts we caught early (feedback loop)

**Technical Notes:**
- Files: `src/collectors/reddit.ts`
- Add: `https://www.reddit.com/r/{sub}/rising.rss`
- Complexity: Low

**Implementation:** Rewrote reddit.ts with multi-feed collection (/rising, /new, /hot), tier-based scoring, and source tier tagging.

---

### Story 2: Add Niche Subreddit Early Indicators ✅ COMPLETE

**Description:**
As a trend watcher, I want signals from niche communities that historically lead mainstream subs, so that I see topics before they cross over.

**Acceptance Criteria:**
- [x] Add niche/early-adopter subreddits per category
- [x] Tag mentions with "niche" vs "mainstream" source tier
- [x] Boost score when topic appears in niche THEN mainstream

**Technical Notes:**
- Files: `src/collectors/reddit.ts`
- Add subreddits like:
  - AI: `r/LocalLLaMA` → leads `r/artificial`
  - Crypto: `r/CryptoTechnology` → leads `r/cryptocurrency`
  - Tech: `r/SideProject`, `r/IndieBiz` → leads `r/startups`
- Complexity: Low

**Implementation:** Expanded from ~24 to 65 niche subreddits organized into 3 tiers (1=builders, 2=early adopters, 3=enthusiasts) across 6 categories. Tier-based engagement multipliers (Tier 1 = 2.5x, Tier 2 = 2x, Tier 3 = 1.5x).

---

### Story 3: Twitter/X Real Posts via Search

**Description:**
As a trend watcher, I want to see actual tweets about emerging topics (not just the trending list), so that I can detect signals before they trend.

**Acceptance Criteria:**
- [ ] Replace/supplement scraped trending with actual tweet search
- [ ] Monitor specific keywords, accounts, or hashtags
- [ ] Track reply/retweet velocity on specific posts
- [ ] Option: Track thought leader accounts for early signals

**Technical Notes:**
- Files: `src/collectors/twitter.ts`
- Options:
  1. Nitter instances for scraping (no auth)
  2. Twitter API (requires auth, rate limited)
  3. Third-party services (costs money)
- Complexity: Medium-High (auth/scraping challenges)

---

### Story 4: Enhanced Velocity Scoring for Early Signals ✅ COMPLETE

**Description:**
As a trend watcher, I want the scoring algorithm to prioritize "fast growth from small base" over "large absolute numbers", so that early signals surface above established trends.

**Acceptance Criteria:**
- [x] New velocity metric: mentions/hour when <100 total mentions
- [x] Bonus multiplier for topics under 1 hour old with >3 sources
- [x] "Early Signal" badge for high-velocity/low-volume topics
- [ ] Decay score for topics that plateau (no longer rising)

**Technical Notes:**
- Files: `src/aggregator.ts`
- Modify: `calculateVelocity()`, `calculateScore()`
- Add: `isEarlySignal` boolean to Topic type
- Complexity: Medium

**Implementation:** Added `calculateEarlySignalScore()` function with criteria: earlyRatio >= 30%, growing velocity, low volume or new. Score based on early source ratio (50pts), newness (30pts), velocity bonus (40pts), cross-platform validation (20pts). Added `isEarlySignal`, `earlySignalScore`, `firstSeenSource`, `sourceTierBreakdown` to Topic type.

---

### Story 5: Cross-Platform Correlation ✅ COMPLETE

**Description:**
As a trend watcher, I want to know when the same topic emerges on multiple platforms simultaneously, so that I can identify coordinated or viral breakouts early.

**Acceptance Criteria:**
- [x] Detect same entity appearing on 3+ platforms within 2 hours
- [x] "Cross-platform breakout" indicator in UI
- [x] Higher confidence score for correlated signals
- [x] Track first-seen platform per topic

**Technical Notes:**
- Files: `src/aggregator.ts`, `src/types.ts`
- Add: `firstSeenSource`, `crossPlatformCount` to Topic
- Complexity: Medium

**Implementation:** Added `calculateCrossPlatformScore()` with: base 20pts per platform beyond 2, rapid spread bonus (+30 if all platforms within 2h), distribution bonus (+20 for balanced mentions). Added `isCrossPlatform`, `platformCount`, `platforms`, `crossPlatformScore`, `platformTimeline` to Topic type. UI shows purple "Cross-Platform" badge.

---

### Story 6: Bluesky/Mastodon Firehose Access ✅ COMPLETE

**Description:**
As a trend watcher, I want real-time access to decentralized social feeds, so that I can detect signals from early-adopter communities.

**Acceptance Criteria:**
- [x] Bluesky: Use firehose or search API for real-time posts
- [x] Mastodon: Add trending tags endpoint + instance monitoring
- [x] Filter by engagement velocity, not just existence
- [ ] Track Bluesky/Mastodon → Twitter crossover

**Technical Notes:**
- Files: `src/collectors/bluesky.ts`, `src/collectors/mastodon.ts`
- Bluesky has public API, firehose available
- Mastodon: `GET /api/v1/trends/tags` on major instances
- Complexity: Medium

**Implementation:**
- **Bluesky v2:** Added search API for 8 keywords (AI, crypto, launch terms), expanded to 18 tiered accounts (Tier 1: protocol devs, AI researchers; Tier 2: journalists; Tier 3: mainstream). Mentions increased from 25 → 50.
- **Mastodon v2:** Added trending tags from 8 instances (hachyderm, infosec.exchange, fosstodon, sigmoid.social, etc.), trending statuses, 12 tiered accounts. Mentions increased from 10 → 111.

---

### Story 7: Backtest Engine for Trend Validation

**Description:**
As a trend analyst, I want to backtest historical trends to see when they first appeared vs when they went mainstream, so that I can validate and tune the early signal detection algorithm.

**Acceptance Criteria:**
- [ ] Query historical data for a given topic (e.g., "Claude Code")
- [ ] Find first mention date/source across platforms
- [ ] Find mainstream breakout date (when it hit trending/hot)
- [ ] Calculate "early detection lead time" (breakout - first mention)
- [ ] Generate report showing signal timeline
- [ ] Compare niche vs mainstream source timing

**Example Output:**
```
Topic: "Claude Code"
First Mention: 2024-10-15 on r/LocalLLaMA (14 upvotes)
First HackerNews: 2024-10-16 (32 points)
First Twitter Mention: 2024-10-17
Mainstream Breakout: 2024-10-20 (r/technology front page)
Early Detection Lead: 5 days
Signal Path: r/LocalLLaMA → HackerNews → Twitter → Mainstream
```

**Technical Notes:**
- Files: New `src/backtest.ts`, `Tools/Backtest.ts`
- Data sources for historical:
  - Reddit: Pushshift API or Arctic Shift
  - HackerNews: Algolia API (searchable archive)
  - Twitter: Limited (no public archive)
- Complexity: Medium

---

### Story 8: UI Differentiation for Signal Types ✅ COMPLETE

**Description:**
As a user, I want to visually distinguish early signals from established trends, so that I know what's emerging vs what's already mainstream.

**Acceptance Criteria:**
- [x] "Early Signal" badge/tag for high-velocity low-volume topics
- [x] Time indicator: "Emerging 23m ago" vs "Trending for 6h"
- [x] Filter view: "Early Signals Only" toggle
- [x] Source tier indicator (niche vs mainstream)

**Technical Notes:**
- Files: `public/index.html`, `src/types.ts`
- Add UI components for signal classification
- Complexity: Low

**Implementation:** Added green "Early" badge with pulse animation, purple "Cross-Platform" badge, Early Signals and Cross-Platform filter toggles, stat cards showing counts, tier breakdown display (early/rising/mainstream), first seen source indicator, platform tags on cross-platform cards. Early signal cards have green left border.

---

## Out of Scope

- Paid API access (Twitter, data providers) - stick to free tier
- ML-based prediction models - keep it rule-based for now
- Historical trend archive/replay
- Push notifications for breakouts
- Sentiment analysis (future enhancement)

---

## Open Questions

- [ ] Should we add configurable "watch keywords" for targeted monitoring?
- [ ] Rate limit concerns: How aggressive can we poll /rising without getting blocked?
- [ ] Should we track specific influencer accounts as leading indicators?
- [ ] Do we need a separate "confidence score" vs "trend score"?

---

## Dependencies

- Bluesky API access (public, no auth needed)
- Reddit rate limits (respect their guidelines)
- Nitter instances availability (for Twitter scraping fallback)

---

## Implementation Order (Recommended)

1. **Story 7** - Backtest engine (validate hypothesis first)
2. **Story 1** - Reddit /rising (quick win, high impact)
3. **Story 4** - Velocity scoring (algorithmic improvement)
4. **Story 2** - Niche subreddits (expand coverage)
5. **Story 8** - UI differentiation (make improvements visible)
6. **Story 5** - Cross-platform correlation
7. **Story 6** - Bluesky/Mastodon enhancement
8. **Story 3** - Twitter real posts (hardest, save for last)
