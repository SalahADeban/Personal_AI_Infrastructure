/**
 * TrendRadar v2 Storage
 * JSON file persistence for mentions, topics, and history
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type {
  Mention,
  Topic,
  EntitiesDB,
  HistorySnapshot,
  TopicSnapshot,
  TimelinePoint,
} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const HISTORY_DIR = join(DATA_DIR, 'history');

// Ensure directories exist
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });

// File paths
const MENTIONS_FILE = join(DATA_DIR, 'mentions.json');
const TOPICS_FILE = join(DATA_DIR, 'topics.json');
const ENTITIES_FILE = join(DATA_DIR, 'entities.json');

// ============ MENTIONS ============

export function loadMentions(): Mention[] {
  try {
    if (!existsSync(MENTIONS_FILE)) return [];
    const data = readFileSync(MENTIONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveMentions(mentions: Mention[]): void {
  writeFileSync(MENTIONS_FILE, JSON.stringify(mentions, null, 2));
}

export function addMentions(newMentions: Mention[]): void {
  const existing = loadMentions();
  const existingIds = new Set(existing.map(m => m.id));

  // Only add new mentions
  const toAdd = newMentions.filter(m => !existingIds.has(m.id));
  const combined = [...existing, ...toAdd];

  // Keep only last 48 hours of mentions
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const filtered = combined.filter(m =>
    new Date(m.timestamp).getTime() > cutoff
  );

  saveMentions(filtered);
  console.log(`[Storage] Added ${toAdd.length} mentions, total: ${filtered.length}`);
}

export function getMentionsForTopic(normalizedName: string): Mention[] {
  const mentions = loadMentions();
  return mentions.filter(m =>
    m.entities.some(e => e.toLowerCase() === normalizedName)
  );
}

// ============ TOPICS ============

export function loadTopics(): Topic[] {
  try {
    if (!existsSync(TOPICS_FILE)) return [];
    const data = readFileSync(TOPICS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveTopics(topics: Topic[]): void {
  writeFileSync(TOPICS_FILE, JSON.stringify(topics, null, 2));
}

// ============ ENTITIES DATABASE ============

const DEFAULT_ENTITIES: EntitiesDB = {
  companies: [
    { name: 'OpenAI', aliases: ['open ai'], category: 'company' },
    { name: 'Anthropic', category: 'company' },
    { name: 'Google', aliases: ['Alphabet', 'GOOGL'], category: 'company' },
    { name: 'Apple', aliases: ['AAPL'], category: 'company' },
    { name: 'Microsoft', aliases: ['MSFT'], category: 'company' },
    { name: 'Meta', aliases: ['Facebook', 'FB'], category: 'company' },
    { name: 'Amazon', aliases: ['AMZN', 'AWS'], category: 'company' },
    { name: 'Tesla', aliases: ['TSLA'], category: 'company' },
    { name: 'Nvidia', aliases: ['NVDA'], category: 'company' },
    { name: 'Netflix', aliases: ['NFLX'], category: 'company' },
    { name: 'SpaceX', category: 'company' },
    { name: 'xAI', category: 'company' },
    { name: 'Palantir', category: 'company' },
    { name: 'Coinbase', category: 'company' },
    { name: 'Stripe', category: 'company' },
    { name: 'OpenAI', category: 'company' },
    { name: 'Databricks', category: 'company' },
    { name: 'Snowflake', category: 'company' },
    { name: 'Cloudflare', category: 'company' },
    { name: 'ByteDance', aliases: ['TikTok'], category: 'company' },
  ],
  products: [
    { name: 'ChatGPT', aliases: ['GPT-4', 'GPT-5', 'GPT4', 'GPT5'], category: 'product' },
    { name: 'Claude', aliases: ['Claude 3', 'Claude 4', 'Opus', 'Sonnet'], category: 'product' },
    { name: 'Gemini', aliases: ['Bard'], category: 'product' },
    { name: 'iPhone', aliases: ['iPhone 16', 'iPhone 17'], category: 'product' },
    { name: 'Vision Pro', category: 'product' },
    { name: 'Cybertruck', category: 'product' },
    { name: 'Copilot', aliases: ['GitHub Copilot'], category: 'product' },
    { name: 'Midjourney', category: 'product' },
    { name: 'Stable Diffusion', aliases: ['SDXL'], category: 'product' },
    { name: 'Sora', category: 'product' },
    { name: 'Grok', category: 'product' },
    { name: 'Perplexity', category: 'product' },
    { name: 'Notion', category: 'product' },
    { name: 'Figma', category: 'product' },
    { name: 'Starlink', category: 'product' },
  ],
  people: [
    { name: 'Elon Musk', aliases: ['@elonmusk', 'Musk'], category: 'people' },
    { name: 'Sam Altman', aliases: ['@sama', 'Altman'], category: 'people' },
    { name: 'Dario Amodei', category: 'people' },
    { name: 'Tim Cook', category: 'people' },
    { name: 'Satya Nadella', aliases: ['Nadella'], category: 'people' },
    { name: 'Sundar Pichai', aliases: ['Pichai'], category: 'people' },
    { name: 'Mark Zuckerberg', aliases: ['Zuck', 'Zuckerberg'], category: 'people' },
    { name: 'Jensen Huang', aliases: ['Huang'], category: 'people' },
    { name: 'Jeff Bezos', aliases: ['Bezos'], category: 'people' },
    { name: 'Bill Gates', aliases: ['Gates'], category: 'people' },
    { name: 'Andrej Karpathy', aliases: ['@karpathy', 'Karpathy'], category: 'people' },
    { name: 'Yann LeCun', aliases: ['@ylecun', 'LeCun'], category: 'people' },
    { name: 'Donald Trump', aliases: ['Trump', 'POTUS'], category: 'people' },
    { name: 'Joe Biden', aliases: ['Biden'], category: 'people' },
  ],
  crypto: [
    { name: 'Bitcoin', aliases: ['BTC', '$BTC', 'bitcoin'], category: 'crypto' },
    { name: 'Ethereum', aliases: ['ETH', '$ETH', 'ethereum'], category: 'crypto' },
    { name: 'Solana', aliases: ['SOL', '$SOL'], category: 'crypto' },
    { name: 'XRP', aliases: ['Ripple', '$XRP'], category: 'crypto' },
    { name: 'Dogecoin', aliases: ['DOGE', '$DOGE'], category: 'crypto' },
    { name: 'Cardano', aliases: ['ADA', '$ADA'], category: 'crypto' },
    { name: 'Polkadot', aliases: ['DOT', '$DOT'], category: 'crypto' },
    { name: 'Chainlink', aliases: ['LINK', '$LINK'], category: 'crypto' },
  ],
  technologies: [
    { name: 'AI', aliases: ['Artificial Intelligence', 'Machine Learning', 'ML'], category: 'tech' },
    { name: 'LLM', aliases: ['Large Language Model', 'language model'], category: 'tech' },
    { name: 'AGI', aliases: ['Artificial General Intelligence'], category: 'tech' },
    { name: 'Blockchain', category: 'tech' },
    { name: 'Web3', aliases: ['web 3'], category: 'tech' },
    { name: 'VR', aliases: ['Virtual Reality', 'Metaverse'], category: 'tech' },
    { name: 'AR', aliases: ['Augmented Reality'], category: 'tech' },
    { name: 'Quantum Computing', aliases: ['Quantum'], category: 'tech' },
    { name: '5G', category: 'tech' },
    { name: 'IoT', aliases: ['Internet of Things'], category: 'tech' },
    { name: 'Robotics', aliases: ['Robot', 'Robots'], category: 'tech' },
    { name: 'Neural Network', aliases: ['Deep Learning'], category: 'tech' },
  ],
  countries: [
    { name: 'United States', aliases: ['USA', 'US', 'America'], category: 'world' },
    { name: 'China', aliases: ['Chinese', 'PRC'], category: 'world' },
    { name: 'Russia', aliases: ['Russian', 'Putin'], category: 'world' },
    { name: 'Ukraine', aliases: ['Ukrainian', 'Kyiv'], category: 'world' },
    { name: 'Israel', aliases: ['Israeli', 'Gaza'], category: 'world' },
    { name: 'Taiwan', aliases: ['Taiwanese'], category: 'world' },
    { name: 'Iran', aliases: ['Iranian'], category: 'world' },
    { name: 'North Korea', aliases: ['DPRK', 'Kim Jong'], category: 'world' },
    { name: 'India', aliases: ['Indian', 'Modi'], category: 'world' },
    { name: 'UK', aliases: ['United Kingdom', 'Britain', 'British'], category: 'world' },
    { name: 'EU', aliases: ['European Union', 'Europe'], category: 'world' },
  ],
  other: [],
};

export function loadEntities(): EntitiesDB {
  try {
    if (!existsSync(ENTITIES_FILE)) {
      saveEntities(DEFAULT_ENTITIES);
      return DEFAULT_ENTITIES;
    }
    const data = readFileSync(ENTITIES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return DEFAULT_ENTITIES;
  }
}

export function saveEntities(entities: EntitiesDB): void {
  writeFileSync(ENTITIES_FILE, JSON.stringify(entities, null, 2));
}

// ============ HISTORY (for velocity calculation) ============

function getHistoryFilePath(hoursAgo: number): string {
  const date = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const dateStr = date.toISOString().slice(0, 13).replace(/[-:T]/g, ''); // YYYYMMDDHH
  return join(HISTORY_DIR, `snapshot_${dateStr}.json`);
}

export function saveHistorySnapshot(topics: Topic[]): void {
  const snapshot: HistorySnapshot = {
    timestamp: new Date().toISOString(),
    topics: topics.map(t => ({
      normalizedName: t.normalizedName,
      mentionCount: t.mentionCount,
      sentimentScore: t.sentimentScore,
    })),
  };

  // Save to current hour file
  const filePath = getHistoryFilePath(0);
  writeFileSync(filePath, JSON.stringify(snapshot, null, 2));

  // Clean up old history files (keep last 48 hours)
  cleanOldHistory();
}

export function getHistoricalMentionCount(normalizedName: string, hoursAgo: number): number {
  const filePath = getHistoryFilePath(hoursAgo);

  try {
    if (!existsSync(filePath)) return 0;
    const data = readFileSync(filePath, 'utf-8');
    const snapshot: HistorySnapshot = JSON.parse(data);
    const topic = snapshot.topics.find(t => t.normalizedName === normalizedName);
    return topic?.mentionCount || 0;
  } catch {
    return 0;
  }
}

export function getHistoricalSentimentScore(normalizedName: string, hoursAgo: number): number | null {
  const filePath = getHistoryFilePath(hoursAgo);

  try {
    if (!existsSync(filePath)) return null;
    const data = readFileSync(filePath, 'utf-8');
    const snapshot: HistorySnapshot = JSON.parse(data);
    const topic = snapshot.topics.find(t => t.normalizedName === normalizedName);
    return topic?.sentimentScore ?? null;
  } catch {
    return null;
  }
}

export function getTopicTimeline(normalizedName: string): TimelinePoint[] {
  const timeline: TimelinePoint[] = [];

  try {
    const files = readdirSync(HISTORY_DIR)
      .filter(f => f.startsWith('snapshot_') && f.endsWith('.json'))
      .sort(); // YYYYMMDDHH sorts chronologically

    for (const file of files) {
      const filePath = join(HISTORY_DIR, file);
      const data = readFileSync(filePath, 'utf-8');
      const snapshot: HistorySnapshot = JSON.parse(data);
      const topic = snapshot.topics.find(t => t.normalizedName === normalizedName);

      timeline.push({
        timestamp: snapshot.timestamp,
        mentionCount: topic?.mentionCount || 0,
        sentimentScore: topic?.sentimentScore,
      });
    }
  } catch {
    // Return whatever we have
  }

  return timeline;
}

function cleanOldHistory(): void {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;

  try {
    const files = readdirSync(HISTORY_DIR);
    for (const file of files) {
      if (!file.startsWith('snapshot_')) continue;

      const filePath = join(HISTORY_DIR, file);
      const data = readFileSync(filePath, 'utf-8');
      const snapshot: HistorySnapshot = JSON.parse(data);

      if (new Date(snapshot.timestamp).getTime() < cutoff) {
        unlinkSync(filePath);
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ============ STATS ============

export function getStorageStats(): {
  mentionCount: number;
  topicCount: number;
  oldestMention: string | null;
  newestMention: string | null;
} {
  const mentions = loadMentions();
  const topics = loadTopics();

  const timestamps = mentions.map(m => new Date(m.timestamp).getTime());
  const oldest = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null;
  const newest = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

  return {
    mentionCount: mentions.length,
    topicCount: topics.length,
    oldestMention: oldest,
    newestMention: newest,
  };
}
