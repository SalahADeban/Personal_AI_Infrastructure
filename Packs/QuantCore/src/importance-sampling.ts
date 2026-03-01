/**
 * Importance Sampling Module
 *
 * Variance reduction for rare event estimation.
 * Critical for tail risk analysis in trading.
 *
 * Use cases:
 * - Crash probability estimation
 * - Extreme move detection
 * - Tail VaR calculation
 */

import type { ImportanceSamplingResult, TiltingParams } from './types';
import { randomNormal, randomNormalArray } from './monte-carlo';

// =============================================================================
// Core Importance Sampling
// =============================================================================

/**
 * Importance sampling for rare event probability estimation
 *
 * Uses exponential tilting to oversample the rare region
 *
 * @param S0 Initial price
 * @param threshold Target threshold (e.g., crash level)
 * @param sigma Volatility (annual)
 * @param T Time horizon (years)
 * @param direction 'lower' for crashes, 'upper' for rallies
 * @param nPaths Number of simulation paths
 * @returns Probability estimate with variance reduction metrics
 */
export function importanceSamplingRareEvent(
  S0: number,
  threshold: number,
  sigma: number,
  T: number,
  direction: 'lower' | 'upper' = 'lower',
  nPaths: number = 100000
): ImportanceSamplingResult {
  // Original (risk-neutral) drift
  const muOriginal = -0.5 * sigma * sigma;

  // Log threshold
  const logThreshold = Math.log(threshold / S0);

  // Tilted drift: center distribution on the rare event
  // For crashes (lower), tilt toward negative returns
  // For rallies (upper), tilt toward positive returns
  const muTilt = direction === 'lower'
    ? logThreshold / T
    : logThreshold / T;

  const sqrtT = Math.sqrt(T);
  let sumIS = 0;
  let sumSqIS = 0;
  let sumCrude = 0;
  let sumSqCrude = 0;
  let effectiveN = 0;

  for (let i = 0; i < nPaths; i++) {
    const Z = randomNormal();

    // Simulate under TILTED measure
    const logReturnTilted = muTilt * T + sigma * sqrtT * Z;
    const S_T_tilted = S0 * Math.exp(logReturnTilted);

    // Likelihood ratio: original / tilted
    const logReturnOriginal = muOriginal * T + sigma * sqrtT * Z;

    // Log likelihood ratio calculation
    const term1 = -0.5 * ((logReturnTilted - muOriginal * T) / (sigma * sqrtT)) ** 2;
    const term2 = -0.5 * ((logReturnTilted - muTilt * T) / (sigma * sqrtT)) ** 2;
    const logLR = term1 - term2;
    const LR = Math.exp(logLR);

    // IS payoff
    const hit = direction === 'lower'
      ? (S_T_tilted < threshold)
      : (S_T_tilted > threshold);
    const isEstimate = hit ? LR : 0;

    sumIS += isEstimate;
    sumSqIS += isEstimate * isEstimate;
    effectiveN += LR * LR;

    // Crude MC for comparison (using original drift)
    const S_T_crude = S0 * Math.exp(logReturnOriginal);
    const crudehit = direction === 'lower'
      ? (S_T_crude < threshold)
      : (S_T_crude > threshold);
    sumCrude += crudehit ? 1 : 0;
    sumSqCrude += crudehit ? 1 : 0;
  }

  // IS estimate
  const pIS = sumIS / nPaths;
  const varIS = (sumSqIS / nPaths - pIS * pIS);
  const seIS = Math.sqrt(varIS / nPaths);

  // Crude estimate
  const pCrude = sumCrude / nPaths;
  const varCrude = pCrude * (1 - pCrude);
  const seCrude = Math.sqrt(varCrude / nPaths);

  // Variance reduction factor
  const varianceReduction = varCrude > 0 ? varCrude / (varIS + 1e-10) : 0;

  // Effective sample size
  const ess = nPaths / (effectiveN / nPaths + 1e-10);

  return {
    estimate: pIS,
    stdError: seIS,
    ci95: [pIS - 1.96 * seIS, pIS + 1.96 * seIS],
    varianceReduction,
    effectiveSampleSize: ess,
  };
}

// =============================================================================
// Crash Probability Estimation
// =============================================================================

/**
 * Estimate probability of a market crash
 *
 * @param currentPrice Current asset price
 * @param crashPercent Crash magnitude (e.g., 0.20 for 20% crash)
 * @param volatility Annual volatility
 * @param days Time horizon in trading days
 * @param nPaths Number of simulations
 */
export function estimateCrashProbability(
  currentPrice: number,
  crashPercent: number,
  volatility: number,
  days: number,
  nPaths: number = 100000
): ImportanceSamplingResult & { crudeEstimate: number } {
  const crashLevel = currentPrice * (1 - crashPercent);
  const T = days / 252;  // Convert to years

  const isResult = importanceSamplingRareEvent(
    currentPrice,
    crashLevel,
    volatility,
    T,
    'lower',
    nPaths
  );

  // Also run crude MC for comparison
  const sqrtT = Math.sqrt(T);
  const mu = -0.5 * volatility * volatility;
  let crudeHits = 0;

  for (let i = 0; i < nPaths; i++) {
    const Z = randomNormal();
    const S_T = currentPrice * Math.exp(mu * T + volatility * sqrtT * Z);
    if (S_T < crashLevel) crudeHits++;
  }

  return {
    ...isResult,
    crudeEstimate: crudeHits / nPaths,
  };
}

/**
 * Estimate probability of extreme rally
 */
export function estimateRallyProbability(
  currentPrice: number,
  rallyPercent: number,
  volatility: number,
  days: number,
  nPaths: number = 100000
): ImportanceSamplingResult {
  const rallyLevel = currentPrice * (1 + rallyPercent);
  const T = days / 252;

  return importanceSamplingRareEvent(
    currentPrice,
    rallyLevel,
    volatility,
    T,
    'upper',
    nPaths
  );
}

// =============================================================================
// Multi-Asset Tail Risk
// =============================================================================

/**
 * Estimate joint tail event probability using importance sampling
 *
 * P(all assets crash simultaneously)
 *
 * @param assets Array of {price, crashLevel, volatility}
 * @param correlation Correlation between assets (simplified: same for all pairs)
 * @param T Time horizon (years)
 * @param nPaths Number of simulations
 */
export function estimateJointCrashProbability(
  assets: Array<{
    name: string;
    price: number;
    crashLevel: number;
    volatility: number;
  }>,
  correlation: number,
  T: number,
  nPaths: number = 100000
): ImportanceSamplingResult & { individualProbs: Record<string, number> } {
  const n = assets.length;
  const sqrtT = Math.sqrt(T);

  // Cholesky decomposition for correlated normals
  // Simplified: all pairs have same correlation
  const L = choleskyCorrelated(n, correlation);

  // Compute tilt for each asset
  const tilts = assets.map(a => {
    const logThreshold = Math.log(a.crashLevel / a.price);
    return logThreshold / T;
  });

  let sumIS = 0;
  let sumSqIS = 0;
  const individualHits: number[] = new Array(n).fill(0);

  for (let p = 0; p < nPaths; p++) {
    // Generate correlated normals
    const Z = generateCorrelatedNormals(L);

    let allCrashed = true;
    let productLR = 1;

    for (let i = 0; i < n; i++) {
      const asset = assets[i];
      const muOriginal = -0.5 * asset.volatility ** 2;

      // Simulate under tilted measure
      const logReturn = tilts[i] * T + asset.volatility * sqrtT * Z[i];
      const S_T = asset.price * Math.exp(logReturn);

      // Did this asset crash?
      const crashed = S_T < asset.crashLevel;
      if (!crashed) allCrashed = false;
      if (crashed) individualHits[i]++;

      // Likelihood ratio for this asset
      const term1 = -0.5 * ((logReturn - muOriginal * T) / (asset.volatility * sqrtT)) ** 2;
      const term2 = -0.5 * ((logReturn - tilts[i] * T) / (asset.volatility * sqrtT)) ** 2;
      productLR *= Math.exp(term1 - term2);
    }

    const isEstimate = allCrashed ? productLR : 0;
    sumIS += isEstimate;
    sumSqIS += isEstimate * isEstimate;
  }

  const pIS = sumIS / nPaths;
  const varIS = sumSqIS / nPaths - pIS * pIS;
  const seIS = Math.sqrt(Math.max(0, varIS) / nPaths);

  // Individual probabilities
  const individualProbs: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    individualProbs[assets[i].name] = individualHits[i] / nPaths;
  }

  return {
    estimate: pIS,
    stdError: seIS,
    ci95: [Math.max(0, pIS - 1.96 * seIS), pIS + 1.96 * seIS],
    varianceReduction: 0,  // Would need crude MC comparison
    effectiveSampleSize: nPaths,
    individualProbs,
  };
}

// =============================================================================
// Tail VaR with Importance Sampling
// =============================================================================

/**
 * Calculate tail VaR using importance sampling
 *
 * More accurate than crude MC for extreme quantiles
 *
 * @param S0 Initial price
 * @param sigma Volatility
 * @param T Time horizon
 * @param alpha VaR confidence (e.g., 0.99 for 99% VaR)
 * @param nPaths Number of paths
 */
export function tailVaRIS(
  S0: number,
  sigma: number,
  T: number,
  alpha: number = 0.99,
  nPaths: number = 100000
): {
  var: number;
  cvar: number;
  varPercent: number;
  cvarPercent: number;
} {
  const sqrtT = Math.sqrt(T);
  const mu = -0.5 * sigma * sigma;

  // Target the tail by tilting
  // Tilt strength based on quantile
  const zAlpha = -2.326;  // Approx z for 99th percentile
  const tiltMu = zAlpha * sigma / sqrtT;

  const returns: Array<{ ret: number; weight: number }> = [];

  for (let i = 0; i < nPaths; i++) {
    const Z = randomNormal();

    // Simulate under tilted measure
    const logReturn = tiltMu * T + sigma * sqrtT * Z;

    // Likelihood ratio
    const term1 = -0.5 * ((logReturn - mu * T) / (sigma * sqrtT)) ** 2;
    const term2 = -0.5 * ((logReturn - tiltMu * T) / (sigma * sqrtT)) ** 2;
    const LR = Math.exp(term1 - term2);

    returns.push({ ret: logReturn, weight: LR });
  }

  // Normalize weights
  const sumWeights = returns.reduce((s, r) => s + r.weight, 0);
  for (const r of returns) {
    r.weight /= sumWeights;
  }

  // Sort by return
  returns.sort((a, b) => a.ret - b.ret);

  // Find weighted quantile (VaR)
  let cumWeight = 0;
  let varReturn = returns[0].ret;
  for (const r of returns) {
    cumWeight += r.weight;
    if (cumWeight >= 1 - alpha) {
      varReturn = r.ret;
      break;
    }
  }

  // CVaR: weighted average of returns below VaR
  let sumTail = 0;
  let sumTailWeight = 0;
  for (const r of returns) {
    if (r.ret <= varReturn) {
      sumTail += r.ret * r.weight;
      sumTailWeight += r.weight;
    }
  }
  const cvarReturn = sumTailWeight > 0 ? sumTail / sumTailWeight : varReturn;

  return {
    var: -varReturn * S0,
    cvar: -cvarReturn * S0,
    varPercent: -varReturn * 100,
    cvarPercent: -cvarReturn * 100,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Cholesky decomposition for uniform correlation matrix
 */
function choleskyCorrelated(n: number, rho: number): number[][] {
  const L: number[][] = [];

  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (j > i) {
        row.push(0);
      } else if (i === j) {
        if (i === 0) {
          row.push(1);
        } else {
          row.push(Math.sqrt(1 - rho));
        }
      } else {
        if (j === 0) {
          row.push(Math.sqrt(rho));
        } else {
          row.push(0);
        }
      }
    }
    L.push(row);
  }

  return L;
}

/**
 * Generate correlated standard normals using Cholesky matrix
 */
function generateCorrelatedNormals(L: number[][]): number[] {
  const n = L.length;
  const Z = randomNormalArray(n);
  const result: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      result[i] += L[i][j] * Z[j];
    }
  }

  return result;
}

// =============================================================================
// Exports
// =============================================================================

export const ImportanceSampling = {
  importanceSamplingRareEvent,
  estimateCrashProbability,
  estimateRallyProbability,
  estimateJointCrashProbability,
  tailVaRIS,
};
