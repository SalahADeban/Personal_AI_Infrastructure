/**
 * TrendRadar v2 Types
 * Core data structures for trend intelligence
 */

// Source tier for early signal detection
export type SourceTier = 'early' | 'rising' | 'mainstream';

// Raw mention collected from any source
export interface Mention {
  id: string;
  source: string;           // "twitter", "tiktok", "hackernews", "reddit", etc.
  sourceIcon: string;       // Emoji for the source
  text: string;             // Original text/title
  url: string;
  timestamp: string;        // ISO date
  engagement?: number;      // likes, upvotes, views, etc.
  entities: string[];       // Extracted entity names
  sourceTier?: SourceTier;  // 'early' (niche/new), 'rising', 'mainstream' (hot/trending)
  feedType?: string;        // 'new', 'rising', 'hot' for Reddit; 'front', 'newest' for HN
  sentiment?: SentimentScore;
}

// Context snippet for a topic
export interface ContextSnippet {
  text: string;             // Excerpt showing the mention
  source: string;
  sourceIcon: string;
  url: string;
  timestamp: string;
  engagement?: number;
}

// Aggregated trending topic
export interface Topic {
  id: string;
  name: string;             // Display name: "OpenAI", "Bitcoin", "Elon Musk"
  normalizedName: string;   // Lowercase, no spaces: "openai", "bitcoin"
  category: TopicCategory;
  score: number;            // Composite score
  velocity: number;         // -3 to +3 scale
  velocityLabel: VelocityLabel;
  velocityPercent: number;  // Actual percentage change
  mentionCount: number;     // Total mentions in current window
  sourceDiversity: number;  // How many different sources
  sources: SourceCount[];   // Which sources and counts
  context: ContextSnippet[];// Top context snippets
  relatedTopics: string[];  // Related trending topics
  lastUpdated: string;
  // Early signal detection fields
  isEarlySignal?: boolean;  // High velocity from low base
  earlySignalScore?: number;// Separate score for early detection
  firstSeenSource?: string; // Which source first mentioned this
  firstSeenAt?: string;     // When first detected
  sourceTierBreakdown?: {   // Breakdown by source tier
    early: number;
    rising: number;
    mainstream: number;
  };
  // Cross-platform correlation fields
  isCrossPlatform?: boolean;      // Detected on 3+ platforms
  platformCount?: number;         // Number of unique platforms
  platforms?: string[];           // List of platforms detected on
  crossPlatformScore?: number;    // Correlation strength score
  platformTimeline?: {            // When detected on each platform
    platform: string;
    firstSeen: string;
    count: number;
  }[];
  // Sentiment analysis fields
  sentimentScore?: number;
  sentimentLabel?: SentimentLabel;
  sentimentBreakdown?: { positive: number; neutral: number; negative: number };
  sentimentTrend?: 'improving' | 'declining' | 'stable';
  timeline?: TimelinePoint[];
}

export interface SourceCount {
  source: string;
  icon: string;
  count: number;
}

export type TopicCategory =
  | 'tech'
  | 'crypto'
  | 'people'
  | 'company'
  | 'product'
  | 'world'
  | 'entertainment'
  | 'science'
  | 'sports'
  | 'other';

export type VelocityLabel =
  | 'exploding'    // +3: >200% growth
  | 'rising-fast'  // +2: >100% growth
  | 'rising'       // +1: >25% growth
  | 'stable'       //  0: -25% to +25%
  | 'declining'    // -1: >25% decline
  | 'falling'      // -2: >50% decline
  | 'new';         // First appearance

// Known entities database structure
export interface EntitiesDB {
  companies: EntityEntry[];
  products: EntityEntry[];
  people: EntityEntry[];
  crypto: EntityEntry[];
  technologies: EntityEntry[];
  countries: EntityEntry[];
  other: EntityEntry[];
}

export interface EntityEntry {
  name: string;
  aliases?: string[];       // Alternative names
  category: TopicCategory;
}

// Historical snapshot for velocity calculation
export interface HistorySnapshot {
  timestamp: string;
  topics: TopicSnapshot[];
}

export interface TopicSnapshot {
  normalizedName: string;
  mentionCount: number;
  sentimentScore?: number;
}

export interface TimelinePoint {
  timestamp: string;
  mentionCount: number;
  sentimentScore?: number;
}

export interface SentimentScore {
  compound: number;  // -1 to +1
  pos: number;       // 0 to 1
  neu: number;       // 0 to 1
  neg: number;       // 0 to 1
}

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

// API response types
export interface TopicsResponse {
  topics: Topic[];
  totalCount: number;
  lastUpdated: string;
  sources: string[];
}

export interface TopicDetailResponse {
  topic: Topic;
  allMentions: Mention[];
  timeline: TimelinePoint[];
}

export interface HealthResponse {
  status: 'ok' | 'error';
  uptime: number;
  lastRefresh: string;
  topicCount: number;
  mentionCount: number;
  sources: SourceStatus[];
}

export interface SourceStatus {
  name: string;
  lastFetch: string;
  mentionCount: number;
  status: 'ok' | 'error' | 'pending';
}

// Collector output format
export interface CollectorResult {
  source: string;
  mentions: Mention[];
  timestamp: string;
  error?: string;
}

// Filter patterns for noise
export interface NoisePattern {
  pattern: RegExp;
  reason: string;
}

// Category metadata
export interface CategoryMeta {
  id: TopicCategory;
  name: string;
  icon: string;
  color: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'tech', name: 'Tech & AI', icon: '🤖', color: '#3B82F6' },
  { id: 'crypto', name: 'Crypto', icon: '₿', color: '#F59E0B' },
  { id: 'company', name: 'Companies', icon: '🏢', color: '#8B5CF6' },
  { id: 'product', name: 'Products', icon: '📦', color: '#EC4899' },
  { id: 'people', name: 'People', icon: '👤', color: '#10B981' },
  { id: 'world', name: 'World', icon: '🌍', color: '#EF4444' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: '#F97316' },
  { id: 'science', name: 'Science', icon: '🔬', color: '#06B6D4' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: '#84CC16' },
  { id: 'other', name: 'Other', icon: '📌', color: '#64748B' },
];

// Source metadata
export interface SourceMeta {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export const SOURCES: SourceMeta[] = [
  { id: 'twitter', name: 'X/Twitter', icon: '𝕏', color: '#000000' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', color: '#000000' },
  { id: 'hackernews', name: 'Hacker News', icon: '🟠', color: '#FF6600' },
  { id: 'reddit', name: 'Reddit', icon: '🔴', color: '#FF4500' },
  { id: 'bluesky', name: 'Bluesky', icon: '🦋', color: '#0085FF' },
  { id: 'mastodon', name: 'Mastodon', icon: '🐘', color: '#6364FF' },
  { id: 'google', name: 'Google Trends', icon: '🔍', color: '#4285F4' },
  { id: 'techcrunch', name: 'TechCrunch', icon: '💚', color: '#0A9E01' },
  { id: 'verge', name: 'The Verge', icon: '🟣', color: '#E80C7A' },
  { id: 'arstechnica', name: 'Ars Technica', icon: '🟤', color: '#FF4E00' },
];
