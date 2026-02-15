/**
 * TrendRadar v2 Entity Extractor
 * Extracts entities (companies, people, products, etc.) from text
 */

import { loadEntities } from './storage';
import type { EntitiesDB, TopicCategory, EntityEntry } from './types';

// Noise patterns to filter out
const NOISE_PATTERNS = [
  // Daily games
  /wordle\s*#?\d+/i,
  /connections\s*#?\d+/i,
  /strands\s*#?\d+/i,
  /quordle\s*#?\d+/i,
  /heardle\s*#?\d+/i,
  /nyt\s*(mini|crossword|puzzle)/i,
  /crossword\s*(answer|solution|clue)/i,
  /daily\s*(puzzle|game)\s*(answer|solution)/i,
  /spelling\s*bee/i,

  // Spam patterns
  /^rt\s*@/i,
  /follow\s+for\s+follow/i,
  /giveaway.*follow.*retweet/i,
  /^\s*#\w+\s*#\w+\s*#\w+\s*#\w+/, // 4+ consecutive hashtags

  // Low-value
  /horoscope/i,
  /zodiac.*today/i,
  /daily\s+horoscope/i,

  // Meme/entertainment noise
  /^meme:/i,
  /^shitpost/i,
  /based\s+and\s+redpilled/i,
];

// Common words to ignore as entities
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
  'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
  'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'but', 'and', 'or', 'if', 'because', 'as', 'until', 'while', 'of',
  'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from',
  'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
  'how', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'new', 'old', 'first', 'last', 'long', 'great', 'little', 'own',
  'other', 'old', 'right', 'big', 'high', 'different', 'small', 'large',
  'next', 'early', 'young', 'important', 'few', 'public', 'bad', 'same',
  'able', 'breaking', 'breaking news', 'news', 'update', 'updates',
  'just in', 'happening now', 'live', 'today', 'yesterday', 'tomorrow',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december',
]);

// Short words to ignore as proper nouns
const MIN_ENTITY_LENGTH = 2;
const MAX_ENTITY_LENGTH = 50;

interface ExtractedEntity {
  name: string;
  normalizedName: string;
  category: TopicCategory;
  confidence: number; // 0-1
}

let entitiesCache: EntitiesDB | null = null;
let entityLookup: Map<string, EntityEntry> | null = null;

function getEntitiesDB(): EntitiesDB {
  if (!entitiesCache) {
    entitiesCache = loadEntities();
  }
  return entitiesCache;
}

function getEntityLookup(): Map<string, EntityEntry> {
  if (!entityLookup) {
    const db = getEntitiesDB();
    entityLookup = new Map();

    // Flatten all entities into lookup map
    const allCategories: (keyof EntitiesDB)[] = [
      'companies', 'products', 'people', 'crypto', 'technologies', 'countries', 'other'
    ];

    for (const category of allCategories) {
      for (const entity of db[category]) {
        // Add main name
        entityLookup.set(entity.name.toLowerCase(), entity);

        // Add aliases
        if (entity.aliases) {
          for (const alias of entity.aliases) {
            entityLookup.set(alias.toLowerCase(), entity);
          }
        }
      }
    }
  }
  return entityLookup;
}

// Check if text should be filtered as noise
export function isNoise(text: string): boolean {
  const normalized = text.toLowerCase().trim();

  // Too short
  if (normalized.length < 10) return true;

  // Matches noise patterns
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  return false;
}

// Normalize entity name for deduplication
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Extract hashtags from text
function extractHashtags(text: string): ExtractedEntity[] {
  const matches = text.match(/#[a-zA-Z][a-zA-Z0-9_]{1,30}/g) || [];

  return matches
    .map(tag => {
      const name = tag.slice(1); // Remove #
      if (STOP_WORDS.has(name.toLowerCase())) return null;
      if (name.length < MIN_ENTITY_LENGTH) return null;

      return {
        name: name,
        normalizedName: normalizeEntityName(name),
        category: 'other' as TopicCategory,
        confidence: 0.6,
      };
    })
    .filter((e): e is ExtractedEntity => e !== null);
}

// Extract @mentions from text
function extractMentions(text: string): ExtractedEntity[] {
  const matches = text.match(/@[a-zA-Z][a-zA-Z0-9_]{1,30}/g) || [];

  return matches
    .map(mention => {
      const name = mention.slice(1); // Remove @
      if (name.length < MIN_ENTITY_LENGTH) return null;

      // Check if this is a known person/company
      const lookup = getEntityLookup();
      const known = lookup.get(mention.toLowerCase()) || lookup.get(name.toLowerCase());

      return {
        name: known?.name || name,
        normalizedName: normalizeEntityName(known?.name || name),
        category: (known?.category || 'people') as TopicCategory,
        confidence: known ? 0.9 : 0.5,
      };
    })
    .filter((e): e is ExtractedEntity => e !== null);
}

// Extract known entities from database
function extractKnownEntities(text: string): ExtractedEntity[] {
  const lookup = getEntityLookup();
  const entities: ExtractedEntity[] = [];
  const textLower = text.toLowerCase();

  for (const [key, entity] of lookup) {
    // Check if key appears in text (with word boundaries for short names)
    const regex = key.length < 4
      ? new RegExp(`\\b${escapeRegex(key)}\\b`, 'i')
      : new RegExp(escapeRegex(key), 'i');

    if (regex.test(textLower)) {
      entities.push({
        name: entity.name,
        normalizedName: normalizeEntityName(entity.name),
        category: entity.category,
        confidence: 0.95,
      });
    }
  }

  return entities;
}

// Extract capitalized phrases (potential proper nouns)
function extractProperNouns(text: string): ExtractedEntity[] {
  // Match 1-3 word capitalized phrases
  const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  const matches = text.match(pattern) || [];

  return matches
    .map(phrase => {
      const normalized = normalizeEntityName(phrase);

      // Skip if too short or in stop words
      if (phrase.length < MIN_ENTITY_LENGTH) return null;
      if (phrase.length > MAX_ENTITY_LENGTH) return null;
      if (STOP_WORDS.has(phrase.toLowerCase())) return null;

      // Skip if it's a sentence start (preceded by . or at start)
      // This is a heuristic - not perfect

      return {
        name: phrase,
        normalizedName: normalized,
        category: 'other' as TopicCategory,
        confidence: 0.4, // Lower confidence for guessed proper nouns
      };
    })
    .filter((e): e is ExtractedEntity => e !== null);
}

// Helper to escape regex special chars
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Main extraction function
export function extractEntities(text: string): ExtractedEntity[] {
  if (isNoise(text)) {
    return [];
  }

  const allEntities: ExtractedEntity[] = [];

  // Extract from different sources (order matters - higher priority first)
  allEntities.push(...extractKnownEntities(text));
  allEntities.push(...extractHashtags(text));
  allEntities.push(...extractMentions(text));
  allEntities.push(...extractProperNouns(text));

  // Deduplicate by normalized name, keeping highest confidence
  const entityMap = new Map<string, ExtractedEntity>();

  for (const entity of allEntities) {
    const existing = entityMap.get(entity.normalizedName);
    if (!existing || entity.confidence > existing.confidence) {
      entityMap.set(entity.normalizedName, entity);
    }
  }

  return Array.from(entityMap.values());
}

// Extract just entity names (simplified interface)
export function extractEntityNames(text: string): string[] {
  const entities = extractEntities(text);
  return entities.map(e => e.name);
}

// Get category for an entity
export function getEntityCategory(name: string): TopicCategory {
  const lookup = getEntityLookup();
  const entity = lookup.get(name.toLowerCase());
  return entity?.category || 'other';
}

// Clear entity cache (call when entities.json is updated)
export function clearEntityCache(): void {
  entitiesCache = null;
  entityLookup = null;
}
