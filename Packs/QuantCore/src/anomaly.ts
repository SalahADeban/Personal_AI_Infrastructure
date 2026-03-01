/**
 * Anomaly Detection Module
 *
 * Statistical methods for detecting unusual values.
 *
 * Use cases:
 * - Unusual trend velocity (TrendRadar)
 * - Abnormal price movements (IchimokuRadar)
 * - Suspicious news volume (NewsScanner)
 */

import type { AnomalyResult, AnomalyDetectorConfig } from './types';

// =============================================================================
// Z-Score Anomaly Detection
// =============================================================================

/**
 * Detect anomaly using Z-score
 *
 * Z = (x - μ) / σ
 *
 * |Z| > threshold indicates anomaly
 */
export function detectAnomalyZScore(
  value: number,
  history: number[],
  threshold: number = 3.0
): AnomalyResult {
  if (history.length < 2) {
    return {
      isAnomaly: false,
      score: 0,
      zScore: 0,
      threshold,
      method: 'zscore',
    };
  }

  // Calculate mean and std
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance = history.reduce((s, x) => s + (x - mean) ** 2, 0) / history.length;
  const std = Math.sqrt(variance);

  if (std === 0) {
    return {
      isAnomaly: value !== mean,
      score: value !== mean ? 999 : 0,
      zScore: value !== mean ? 999 : 0,
      threshold,
      method: 'zscore',
    };
  }

  const zScore = (value - mean) / std;
  const score = Math.abs(zScore);

  return {
    isAnomaly: score > threshold,
    score,
    zScore,
    threshold,
    method: 'zscore',
  };
}

/**
 * Rolling Z-score for time series
 */
export function rollingZScore(
  values: number[],
  window: number = 20
): number[] {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < window) {
      result.push(0);
    } else {
      const windowData = values.slice(i - window, i);
      const mean = windowData.reduce((a, b) => a + b, 0) / window;
      const variance = windowData.reduce((s, x) => s + (x - mean) ** 2, 0) / window;
      const std = Math.sqrt(variance);

      if (std === 0) {
        result.push(0);
      } else {
        result.push((values[i] - mean) / std);
      }
    }
  }

  return result;
}

// =============================================================================
// IQR (Interquartile Range) Anomaly Detection
// =============================================================================

/**
 * Detect anomaly using IQR method
 *
 * Anomaly if: x < Q1 - k*IQR or x > Q3 + k*IQR
 *
 * More robust to existing outliers than Z-score
 */
export function detectAnomalyIQR(
  value: number,
  history: number[],
  k: number = 1.5
): AnomalyResult {
  if (history.length < 4) {
    return {
      isAnomaly: false,
      score: 0,
      threshold: k,
      method: 'iqr',
    };
  }

  const sorted = [...history].sort((a, b) => a - b);
  const n = sorted.length;

  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;

  const lowerBound = q1 - k * iqr;
  const upperBound = q3 + k * iqr;

  const isAnomaly = value < lowerBound || value > upperBound;

  // Score: how many IQRs away from bounds
  let score = 0;
  if (value < lowerBound) {
    score = (lowerBound - value) / (iqr || 1);
  } else if (value > upperBound) {
    score = (value - upperBound) / (iqr || 1);
  }

  return {
    isAnomaly,
    score,
    threshold: k,
    method: 'iqr',
  };
}

// =============================================================================
// MAD (Median Absolute Deviation) Anomaly Detection
// =============================================================================

/**
 * Detect anomaly using MAD
 *
 * MAD = median(|x_i - median(x)|)
 * Modified Z-score = 0.6745 * (x - median) / MAD
 *
 * Most robust method - resistant to outliers
 */
export function detectAnomalyMAD(
  value: number,
  history: number[],
  threshold: number = 3.5
): AnomalyResult {
  if (history.length < 3) {
    return {
      isAnomaly: false,
      score: 0,
      threshold,
      method: 'mad',
    };
  }

  const sorted = [...history].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Calculate MAD
  const deviations = history.map(x => Math.abs(x - median));
  const sortedDev = deviations.sort((a, b) => a - b);
  const mad = sortedDev[Math.floor(sortedDev.length / 2)];

  if (mad === 0) {
    return {
      isAnomaly: value !== median,
      score: value !== median ? 999 : 0,
      threshold,
      method: 'mad',
    };
  }

  // Modified Z-score
  const modifiedZ = 0.6745 * (value - median) / mad;
  const score = Math.abs(modifiedZ);

  return {
    isAnomaly: score > threshold,
    score,
    zScore: modifiedZ,
    threshold,
    method: 'mad',
  };
}

// =============================================================================
// Isolation Forest (Simplified)
// =============================================================================

/**
 * Simplified Isolation Forest for univariate data
 *
 * Anomalies are isolated with fewer splits
 * Returns anomaly score between 0 (normal) and 1 (anomalous)
 */
export function isolationForestScore(
  value: number,
  history: number[],
  nTrees: number = 100,
  sampleSize: number = 256
): number {
  if (history.length < 10) return 0;

  const actualSampleSize = Math.min(sampleSize, history.length);
  const avgPathLength = c(actualSampleSize);
  let totalPathLength = 0;

  for (let t = 0; t < nTrees; t++) {
    // Sample data
    const sample = randomSample(history, actualSampleSize);

    // Build tree and get path length for value
    const pathLength = isolationPathLength(value, sample, 0, Math.ceil(Math.log2(actualSampleSize)));
    totalPathLength += pathLength;
  }

  const avgPath = totalPathLength / nTrees;

  // Anomaly score: s(x, n) = 2^(-E[h(x)] / c(n))
  return Math.pow(2, -avgPath / avgPathLength);
}

/**
 * Detect anomaly using Isolation Forest
 */
export function detectAnomalyIsolationForest(
  value: number,
  history: number[],
  threshold: number = 0.6,
  nTrees: number = 100
): AnomalyResult {
  const score = isolationForestScore(value, history, nTrees);

  return {
    isAnomaly: score > threshold,
    score,
    threshold,
    method: 'isolation_forest',
  };
}

// Isolation Forest helpers

function isolationPathLength(
  value: number,
  data: number[],
  currentDepth: number,
  maxDepth: number
): number {
  if (data.length <= 1 || currentDepth >= maxDepth) {
    return currentDepth + c(data.length);
  }

  // Random split
  const min = Math.min(...data);
  const max = Math.max(...data);

  if (min === max) {
    return currentDepth + c(data.length);
  }

  const splitPoint = min + Math.random() * (max - min);

  if (value < splitPoint) {
    const left = data.filter(x => x < splitPoint);
    return isolationPathLength(value, left, currentDepth + 1, maxDepth);
  } else {
    const right = data.filter(x => x >= splitPoint);
    return isolationPathLength(value, right, currentDepth + 1, maxDepth);
  }
}

function c(n: number): number {
  if (n <= 1) return 0;
  if (n === 2) return 1;
  return 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n;
}

function randomSample<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// =============================================================================
// Composite Anomaly Detector
// =============================================================================

export class AnomalyDetector {
  private config: AnomalyDetectorConfig;
  private history: number[] = [];
  private maxHistory: number;

  constructor(config: Partial<AnomalyDetectorConfig> = {}) {
    this.config = {
      method: config.method ?? 'mad',
      threshold: config.threshold ?? 3.5,
      windowSize: config.windowSize ?? 100,
    };
    this.maxHistory = this.config.windowSize!;
  }

  /**
   * Add value to history and check for anomaly
   */
  check(value: number): AnomalyResult {
    const result = this.detect(value);

    // Update history
    this.history.push(value);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return result;
  }

  /**
   * Detect anomaly without adding to history
   */
  detect(value: number): AnomalyResult {
    switch (this.config.method) {
      case 'zscore':
        return detectAnomalyZScore(value, this.history, this.config.threshold);

      case 'iqr':
        return detectAnomalyIQR(value, this.history, this.config.threshold);

      case 'mad':
        return detectAnomalyMAD(value, this.history, this.config.threshold);

      case 'isolation_forest':
        return detectAnomalyIsolationForest(value, this.history, this.config.threshold);

      default:
        return detectAnomalyMAD(value, this.history, this.config.threshold);
    }
  }

  /**
   * Batch load historical data
   */
  loadHistory(data: number[]): void {
    this.history = data.slice(-this.maxHistory);
  }

  /**
   * Get current history
   */
  getHistory(): number[] {
    return [...this.history];
  }

  /**
   * Reset detector
   */
  reset(): void {
    this.history = [];
  }
}

// =============================================================================
// Multi-Variate Anomaly Detection
// =============================================================================

/**
 * Detect multivariate anomaly using Mahalanobis distance
 *
 * Accounts for correlations between variables
 */
export function mahalanobisDistance(
  point: number[],
  data: number[][]
): number {
  const n = data.length;
  const d = point.length;

  if (n < d + 1) return 0;

  // Calculate mean vector
  const mean = new Array(d).fill(0);
  for (const row of data) {
    for (let j = 0; j < d; j++) {
      mean[j] += row[j];
    }
  }
  for (let j = 0; j < d; j++) {
    mean[j] /= n;
  }

  // Calculate covariance matrix
  const cov: number[][] = Array(d).fill(null).map(() => Array(d).fill(0));
  for (const row of data) {
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        cov[i][j] += (row[i] - mean[i]) * (row[j] - mean[j]);
      }
    }
  }
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      cov[i][j] /= (n - 1);
    }
  }

  // Invert covariance (simplified for 2D)
  const covInv = invertMatrix(cov);
  if (!covInv) return 0;

  // Calculate Mahalanobis distance
  const diff = point.map((v, i) => v - mean[i]);
  let distance = 0;
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      distance += diff[i] * covInv[i][j] * diff[j];
    }
  }

  return Math.sqrt(distance);
}

/**
 * Simple matrix inversion (for small matrices)
 */
function invertMatrix(m: number[][]): number[][] | null {
  const n = m.length;

  // Create augmented matrix [M | I]
  const aug: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = [...m[i]];
    for (let j = 0; j < n; j++) {
      row.push(i === j ? 1 : 0);
    }
    aug.push(row);
  }

  // Gauss-Jordan elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) {
        maxRow = k;
      }
    }
    [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];

    if (Math.abs(aug[i][i]) < 1e-10) return null;  // Singular

    // Scale row
    const scale = aug[i][i];
    for (let j = 0; j < 2 * n; j++) {
      aug[i][j] /= scale;
    }

    // Eliminate column
    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = aug[k][i];
        for (let j = 0; j < 2 * n; j++) {
          aug[k][j] -= factor * aug[i][j];
        }
      }
    }
  }

  // Extract inverse
  return aug.map(row => row.slice(n));
}

// =============================================================================
// Exports
// =============================================================================

export const Anomaly = {
  // Single methods
  detectAnomalyZScore,
  detectAnomalyIQR,
  detectAnomalyMAD,
  detectAnomalyIsolationForest,
  isolationForestScore,

  // Rolling
  rollingZScore,

  // Multivariate
  mahalanobisDistance,

  // Class
  AnomalyDetector,
};
