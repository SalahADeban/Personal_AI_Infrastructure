/**
 * TrendRadar Categorizer
 * Auto-categorizes trends based on keywords and patterns
 */

import type { Trend } from './aggregator';

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  keywords: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: 'tech-ai',
    name: 'Tech & AI',
    icon: '🤖',
    color: '#3B82F6',
    keywords: [
      'ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'gpt', 'claude',
      'openai', 'anthropic', 'google', 'microsoft', 'apple', 'programming', 'software',
      'developer', 'code', 'github', 'open source', 'startup', 'tech', 'api', 'data',
      'algorithm', 'neural', 'model', 'chatgpt', 'gemini', 'copilot', 'automation'
    ],
  },
  {
    id: 'crypto-finance',
    name: 'Crypto & Finance',
    icon: '💰',
    color: '#F59E0B',
    keywords: [
      'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol', 'crypto', 'cryptocurrency',
      'blockchain', 'defi', 'nft', 'web3', 'trading', 'market', 'stock', 'invest',
      'finance', 'bank', 'fed', 'interest rate', 'economy', 'inflation', 'dollar',
      'halal', 'shariah', 'wallet', 'token', 'altcoin'
    ],
  },
  {
    id: 'world-politics',
    name: 'World & Politics',
    icon: '🌍',
    color: '#EF4444',
    keywords: [
      'president', 'election', 'government', 'congress', 'senate', 'law', 'policy',
      'war', 'military', 'russia', 'ukraine', 'china', 'iran', 'israel', 'palestine',
      'middle east', 'europe', 'asia', 'africa', 'united nations', 'nato', 'diplomacy',
      'protest', 'democracy', 'vote', 'legislation', 'trump', 'biden'
    ],
  },
  {
    id: 'science-health',
    name: 'Science & Health',
    icon: '🔬',
    color: '#10B981',
    keywords: [
      'science', 'research', 'study', 'discovery', 'nasa', 'space', 'mars', 'moon',
      'climate', 'environment', 'energy', 'nuclear', 'physics', 'biology', 'chemistry',
      'health', 'medical', 'doctor', 'hospital', 'vaccine', 'disease', 'cancer',
      'brain', 'dna', 'gene', 'therapy', 'drug', 'fda'
    ],
  },
  {
    id: 'business',
    name: 'Business',
    icon: '📈',
    color: '#8B5CF6',
    keywords: [
      'company', 'ceo', 'acquisition', 'merger', 'ipo', 'revenue', 'profit', 'loss',
      'layoff', 'hire', 'job', 'employee', 'amazon', 'tesla', 'nvidia', 'meta',
      'facebook', 'twitter', 'x', 'linkedin', 'product', 'launch', 'funding',
      'venture', 'valuation', 'billion', 'million', 'enterprise', 'saas'
    ],
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    icon: '🎬',
    color: '#EC4899',
    keywords: [
      'movie', 'film', 'netflix', 'disney', 'streaming', 'show', 'series', 'actor',
      'actress', 'director', 'music', 'song', 'album', 'artist', 'concert', 'tour',
      'game', 'gaming', 'playstation', 'xbox', 'nintendo', 'steam', 'celebrity',
      'award', 'oscar', 'grammy', 'emmy', 'viral', 'tiktok', 'youtube'
    ],
  },
  {
    id: 'sports',
    name: 'Sports',
    icon: '⚽',
    color: '#06B6D4',
    keywords: [
      'football', 'soccer', 'basketball', 'nba', 'nfl', 'baseball', 'mlb', 'hockey',
      'nhl', 'tennis', 'golf', 'olympics', 'world cup', 'championship', 'playoff',
      'team', 'player', 'coach', 'score', 'win', 'loss', 'game', 'match', 'league',
      'transfer', 'contract', 'injury', 'espn', 'sports'
    ],
  },
  {
    id: 'culture',
    name: 'Culture & Social',
    icon: '🎭',
    color: '#F97316',
    keywords: [
      'meme', 'viral', 'trend', 'social media', 'twitter', 'reddit', 'community',
      'opinion', 'debate', 'controversy', 'cancel', 'influencer', 'creator',
      'lifestyle', 'fashion', 'food', 'travel', 'relationship', 'dating', 'family',
      'education', 'college', 'university', 'student', 'generation', 'gen z'
    ],
  },
];

// Categorize a single trend
export function categorizeTrend(trend: Trend): Trend {
  const text = `${trend.title} ${trend.summary || ''} ${trend.source}`.toLowerCase();

  let bestCategory: Category | null = null;
  let bestScore = 0;

  for (const category of CATEGORIES) {
    let score = 0;
    for (const keyword of category.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += keyword.length; // Longer matches = higher weight
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return {
    ...trend,
    category: bestCategory?.id || 'other',
  };
}

// Categorize all trends
export function categorizeTrends(trends: Trend[]): Trend[] {
  return trends.map(categorizeTrend);
}

// Get category by ID
export function getCategoryById(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

// Group trends by category
export function groupByCategory(trends: Trend[]): Record<string, Trend[]> {
  const grouped: Record<string, Trend[]> = {};

  for (const category of CATEGORIES) {
    grouped[category.id] = [];
  }
  grouped['other'] = [];

  for (const trend of trends) {
    const cat = trend.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(trend);
  }

  return grouped;
}
