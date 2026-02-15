/**
 * TrendRadar v2 Sentiment Analysis
 * VADER-based sentiment scoring for trend mentions
 */

import vader from 'vader-sentiment';
import type { Mention } from './types';
import type { SentimentScore, SentimentLabel } from './types';

// Analyze sentiment of a text string
export function analyzeSentiment(text: string): SentimentScore {
  const intensity = vader.SentimentIntensityAnalyzer.polarity_scores(text);
  return {
    compound: intensity.compound,
    pos: intensity.pos,
    neu: intensity.neu,
    neg: intensity.neg,
  };
}

// Classify compound score into a label
export function classifySentiment(compound: number): SentimentLabel {
  if (compound >= 0.05) return 'positive';
  if (compound <= -0.05) return 'negative';
  return 'neutral';
}

// Aggregate sentiment across multiple mentions
export function aggregateSentiment(mentions: Mention[]): {
  sentimentScore: number;
  sentimentLabel: SentimentLabel;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
} {
  if (mentions.length === 0) {
    return {
      sentimentScore: 0,
      sentimentLabel: 'neutral',
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 },
    };
  }

  let totalCompound = 0;
  let positive = 0;
  let neutral = 0;
  let negative = 0;

  for (const mention of mentions) {
    const compound = mention.sentiment?.compound ?? 0;
    totalCompound += compound;

    const label = classifySentiment(compound);
    if (label === 'positive') positive++;
    else if (label === 'negative') negative++;
    else neutral++;
  }

  const count = mentions.length;
  const avgCompound = totalCompound / count;

  return {
    sentimentScore: Math.round(avgCompound * 1000) / 1000,
    sentimentLabel: classifySentiment(avgCompound),
    sentimentBreakdown: {
      positive: Math.round((positive / count) * 100),
      neutral: Math.round((neutral / count) * 100),
      negative: Math.round((negative / count) * 100),
    },
  };
}

// Detect sentiment trend direction between current and historical scores
export function detectSentimentTrend(
  current: number,
  previous: number
): 'improving' | 'declining' | 'stable' {
  const delta = current - previous;
  if (delta >= 0.1) return 'improving';
  if (delta <= -0.1) return 'declining';
  return 'stable';
}
