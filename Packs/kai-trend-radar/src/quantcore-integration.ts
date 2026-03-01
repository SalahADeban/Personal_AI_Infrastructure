/**
 * QuantCore Integration for TrendRadar
 *
 * Provides quantitative analysis for trending topics:
 * - Viral probability tracking (Particle Filters)
 * - Anomaly detection for velocity spikes
 * - Trend lifecycle regime detection
 * - Time series forecasting
 */

import type { Topic, TimelinePoint } from './types';

// Import QuantCore
// Docker: QuantCore at /app/QuantCore, src at /app/src
import {
  TrendProbabilityFilter,
  AnomalyDetector,
  TimeSeries,
} from '../QuantCore/src/index';

// ============ TYPES ============

export type TrendPhase = 'discovery' | 'growth' | 'peak' | 'saturation' | 'decline';

export interface ViralPrediction {
  probability: number;         // 0-1 probability of going viral
  confidence: number;          // Confidence interval width
  expectedPeak: string | null; // ISO timestamp of expected peak
  spreadPattern: 'explosive' | 'sustained' | 'organic' | 'declining';
  riskOfFade: number;          // 0-1 probability of quick decline
}

export interface AnomalyResult {
  isAnomaly: boolean;
  anomalyScore: number;        // 0-1 strength of anomaly
  expectedBaseline: number;    // Expected mention rate
  deviation: number;           // Standard deviations from normal
  anomalyType: 'spike' | 'drop' | 'normal';
}

export interface TrendRegime {
  phase: TrendPhase;
  phaseConfidence: number;     // 0-1 confidence in phase
  phaseDuration: number;       // Hours in current phase
  nextPhaseETA: number | null; // Hours until likely phase change
  momentum: number;            // -1 to +1 momentum indicator
}

export interface TrendForecast {
  points: ForecastPoint[];
  peakTime: string | null;
  expectedDuration: number;    // Hours until 50% decline
  confidence: { lower: number[]; upper: number[] };
}

export interface ForecastPoint {
  timestamp: string;
  mentionCount: number;
  isForecasted: boolean;
}

export interface QuantAnalysis {
  viralPrediction: ViralPrediction;
  anomaly: AnomalyResult;
  regime: TrendRegime;
  forecast: TrendForecast | null;
}

// ============ PARTICLE FILTER FOR VIRAL PROBABILITY ============

// Cache particle filters per topic
const viralFilters = new Map<string, TrendProbabilityFilter>();

/**
 * Calculate viral probability using particle filter
 */
export function calculateViralProbability(
  topic: Topic,
  timeline: TimelinePoint[],
): ViralPrediction {
  const key = topic.normalizedName;

  // Get or create particle filter
  let filter = viralFilters.get(key);
  if (!filter) {
    // Initialize with base viral probability based on early signals
    const initialProb = topic.isEarlySignal ? 0.3 : 0.1;
    filter = new TrendProbabilityFilter(initialProb, {
      nParticles: 500,
      processVol: 0.05,
      obsNoise: 0.1,
    });
    viralFilters.set(key, filter);
  }

  // Calculate metrics for particle filter update
  const velocity = Math.max(0, topic.velocity + 2) / 5; // Normalize to 0-1
  const mentions = topic.mentionCount;
  const crossPlatform = topic.isCrossPlatform ? 1 : 0;
  const earlySignal = topic.isEarlySignal ? 1 : 0;

  // Update filter with current metrics
  filter.updateWithMetrics(velocity, mentions, crossPlatform, earlySignal);

  // Get viral prediction
  const prediction = filter.getViralPrediction();

  // Determine spread pattern
  let spreadPattern: 'explosive' | 'sustained' | 'organic' | 'declining';
  if (topic.velocityPercent > 200 && topic.isCrossPlatform) {
    spreadPattern = 'explosive';
  } else if (topic.velocityPercent > 50 && mentions > 100) {
    spreadPattern = 'sustained';
  } else if (topic.velocity >= 0) {
    spreadPattern = 'organic';
  } else {
    spreadPattern = 'declining';
  }

  // Calculate risk of fade (inverse of sustained growth probability)
  const riskOfFade = topic.isEarlySignal && mentions < 20
    ? 0.7 - (topic.sourceDiversity * 0.1)  // High risk for very new topics
    : 1 - prediction.probability;

  // Estimate peak time based on velocity and current state
  let expectedPeak: string | null = null;
  if (spreadPattern !== 'declining' && prediction.probability > 0.3) {
    const hoursUntilPeak = spreadPattern === 'explosive' ? 2 : spreadPattern === 'sustained' ? 12 : 24;
    expectedPeak = new Date(Date.now() + hoursUntilPeak * 60 * 60 * 1000).toISOString();
  }

  return {
    probability: prediction.probability,
    confidence: prediction.confidence,
    expectedPeak,
    spreadPattern,
    riskOfFade: Math.max(0, Math.min(1, riskOfFade)),
  };
}

// ============ ANOMALY DETECTION ============

// Cache anomaly detectors per topic
const anomalyDetectors = new Map<string, AnomalyDetector>();

/**
 * Detect velocity anomalies in topic mention patterns
 */
export function detectVelocityAnomaly(
  topic: Topic,
  timeline: TimelinePoint[],
): AnomalyResult {
  const key = topic.normalizedName;

  // Get or create anomaly detector
  let detector = anomalyDetectors.get(key);
  if (!detector) {
    detector = new AnomalyDetector({
      method: 'mad',
      threshold: 2.5,
      windowSize: 24,
    });
    anomalyDetectors.set(key, detector);
  }

  // Extract mention counts from timeline
  const mentionCounts = timeline.map(p => p.mentionCount);

  // Load history if needed
  if (detector.getHistory().length === 0 && mentionCounts.length > 5) {
    detector.loadHistory(mentionCounts.slice(0, -1));
  }

  // Check current mention count for anomaly
  const currentCount = topic.mentionCount;
  const result = detector.check(currentCount);

  // Calculate expected baseline
  const history = detector.getHistory();
  const expectedBaseline = history.length > 0
    ? history.reduce((a, b) => a + b, 0) / history.length
    : currentCount;

  // Determine anomaly type
  let anomalyType: 'spike' | 'drop' | 'normal' = 'normal';
  if (result.isAnomaly) {
    anomalyType = currentCount > expectedBaseline ? 'spike' : 'drop';
  }

  return {
    isAnomaly: result.isAnomaly,
    anomalyScore: Math.min(1, Math.abs(result.score) / 5), // Normalize to 0-1
    expectedBaseline,
    deviation: result.score,
    anomalyType,
  };
}

// ============ TREND REGIME DETECTION ============

/**
 * Detect the current phase of a trend's lifecycle
 */
export function detectTrendRegime(
  topic: Topic,
  timeline: TimelinePoint[],
): TrendRegime {
  // Calculate momentum from recent timeline
  let momentum = 0;
  if (timeline.length >= 3) {
    const recent = timeline.slice(-6);
    const velocities: number[] = [];

    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1].mentionCount;
      const curr = recent[i].mentionCount;
      if (prev > 0) {
        velocities.push((curr - prev) / prev);
      }
    }

    if (velocities.length > 0) {
      momentum = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    }
  }

  // Determine phase based on velocity, momentum, and mention count
  let phase: TrendPhase;
  let phaseConfidence: number;

  const isNew = topic.velocityLabel === 'new';
  const isExploding = topic.velocity >= 2;
  const isGrowing = topic.velocity >= 1;
  const isStable = topic.velocity === 0;
  const isDeclining = topic.velocity < 0;
  const isHighVolume = topic.mentionCount > 100;
  const isMidVolume = topic.mentionCount > 30;

  if (isNew || (topic.isEarlySignal && !isHighVolume)) {
    phase = 'discovery';
    phaseConfidence = isNew ? 0.9 : 0.7;
  } else if (isExploding || (isGrowing && momentum > 0.2)) {
    phase = 'growth';
    phaseConfidence = Math.min(0.95, 0.6 + Math.abs(momentum));
  } else if (isHighVolume && isStable && Math.abs(momentum) < 0.1) {
    phase = 'peak';
    phaseConfidence = 0.7;
  } else if (isMidVolume && isStable) {
    phase = 'saturation';
    phaseConfidence = 0.6;
  } else if (isDeclining) {
    phase = 'decline';
    phaseConfidence = Math.min(0.9, 0.5 + Math.abs(topic.velocity) * 0.2);
  } else {
    phase = 'growth';
    phaseConfidence = 0.5;
  }

  // Estimate phase duration based on timeline
  let phaseDuration = 0;
  if (topic.firstSeenAt) {
    const firstSeen = new Date(topic.firstSeenAt).getTime();
    phaseDuration = Math.round((Date.now() - firstSeen) / (1000 * 60 * 60));
  }

  // Estimate next phase ETA
  let nextPhaseETA: number | null = null;
  if (phase === 'discovery' && isGrowing) {
    nextPhaseETA = 2; // Growth likely soon
  } else if (phase === 'growth' && topic.velocityPercent < 50) {
    nextPhaseETA = 6; // Peak approaching
  } else if (phase === 'peak') {
    nextPhaseETA = 12; // Saturation/decline expected
  }

  return {
    phase,
    phaseConfidence,
    phaseDuration,
    nextPhaseETA,
    momentum: Math.max(-1, Math.min(1, momentum)),
  };
}

// ============ TIME SERIES FORECASTING ============

/**
 * Forecast future mention counts for a topic
 */
export function forecastTrend(
  topic: Topic,
  timeline: TimelinePoint[],
  hoursAhead: number = 24,
): TrendForecast | null {
  // Need at least 6 data points for forecasting
  if (timeline.length < 6) {
    return null;
  }

  const mentionCounts = timeline.map(p => p.mentionCount);
  const timestamps = timeline.map(p => new Date(p.timestamp).getTime());

  // Use exponential smoothing for forecast
  const alpha = 0.3; // Smoothing factor
  const smoothed = TimeSeries.exponentialSmoothing(mentionCounts, alpha);

  // Calculate trend component
  const trend = TimeSeries.detectTrend(mentionCounts);
  const velocity = TimeSeries.velocity(mentionCounts);
  const lastVelocity = velocity.length > 0 ? velocity[velocity.length - 1] : 0;

  // Generate forecast points
  const points: ForecastPoint[] = [];
  const confidenceLower: number[] = [];
  const confidenceUpper: number[] = [];

  // Add historical points
  for (const point of timeline) {
    points.push({
      timestamp: point.timestamp,
      mentionCount: point.mentionCount,
      isForecasted: false,
    });
  }

  // Generate forecasted points
  let lastValue = smoothed[smoothed.length - 1];
  const lastTimestamp = timestamps[timestamps.length - 1];
  const hourMs = 60 * 60 * 1000;

  for (let i = 1; i <= hoursAhead; i++) {
    // Apply trend with decay
    const decayFactor = Math.pow(0.95, i);
    const trendAdjustment = lastVelocity * decayFactor;
    const forecastValue = Math.max(0, Math.round(lastValue * (1 + trendAdjustment)));

    const forecastTimestamp = new Date(lastTimestamp + i * hourMs).toISOString();

    points.push({
      timestamp: forecastTimestamp,
      mentionCount: forecastValue,
      isForecasted: true,
    });

    // Confidence intervals widen over time
    const uncertainty = 0.1 + (i * 0.02);
    confidenceLower.push(Math.max(0, forecastValue * (1 - uncertainty)));
    confidenceUpper.push(forecastValue * (1 + uncertainty));

    lastValue = forecastValue;
  }

  // Estimate peak time
  let peakTime: string | null = null;
  let peakValue = 0;
  for (const point of points) {
    if (point.mentionCount > peakValue) {
      peakValue = point.mentionCount;
      peakTime = point.timestamp;
    }
  }

  // Estimate duration until 50% decline from peak
  let expectedDuration = 48; // Default 48 hours
  const currentMentions = topic.mentionCount;
  if (trend.direction === 'down' && lastVelocity < -0.1) {
    expectedDuration = Math.round(12 / Math.abs(lastVelocity));
  } else if (trend.direction === 'up') {
    expectedDuration = Math.round(36 + (24 * Math.abs(lastVelocity)));
  }

  return {
    points,
    peakTime,
    expectedDuration: Math.min(168, expectedDuration), // Cap at 1 week
    confidence: { lower: confidenceLower, upper: confidenceUpper },
  };
}

// ============ COMBINED ANALYSIS ============

/**
 * Run full QuantCore analysis on a topic
 */
export function analyzeTopicQuant(
  topic: Topic,
  timeline: TimelinePoint[],
): QuantAnalysis {
  const viralPrediction = calculateViralProbability(topic, timeline);
  const anomaly = detectVelocityAnomaly(topic, timeline);
  const regime = detectTrendRegime(topic, timeline);
  const forecast = forecastTrend(topic, timeline);

  return {
    viralPrediction,
    anomaly,
    regime,
    forecast,
  };
}

// ============ CLEANUP ============

/**
 * Clear cached filters for topics that are no longer tracked
 */
export function cleanupStaleFilters(activeTopics: Set<string>): void {
  for (const key of viralFilters.keys()) {
    if (!activeTopics.has(key)) {
      viralFilters.delete(key);
      anomalyDetectors.delete(key);
    }
  }
}

// ============ EXPORTS ============

export const QuantCoreIntegration = {
  calculateViralProbability,
  detectVelocityAnomaly,
  detectTrendRegime,
  forecastTrend,
  analyzeTopicQuant,
  cleanupStaleFilters,
};

export default QuantCoreIntegration;
