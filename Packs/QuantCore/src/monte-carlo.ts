/**
 * Monte Carlo Simulation Engine
 *
 * Implements:
 * - Geometric Brownian Motion (GBM)
 * - Merton Jump Diffusion
 * - Variance reduction techniques (antithetic, control variates, stratification)
 * - Binary contract pricing
 */

import type {
  MonteCarloResult,
  PathSimulationResult,
  JumpDiffusionParams,
  GBMParams,
  RiskMetrics,
} from './types';

// =============================================================================
// Random Number Generation
// =============================================================================

/**
 * Box-Muller transform for standard normal random variates
 */
export function randomNormal(): number {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

/**
 * Generate array of standard normal random variates
 */
export function randomNormalArray(n: number): number[] {
  const result: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    result[i] = randomNormal();
  }
  return result;
}

/**
 * Poisson random variate
 */
export function randomPoisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

// =============================================================================
// Geometric Brownian Motion
// =============================================================================

/**
 * Simulate GBM paths
 *
 * dS = μS dt + σS dW
 *
 * @param params GBM parameters
 * @returns Simulated paths and statistics
 */
export function simulateGBM(params: GBMParams): PathSimulationResult {
  const { S0, mu, sigma, T, nSteps, nPaths } = params;
  const dt = T / nSteps;
  const sqrtDt = Math.sqrt(dt);

  const paths: number[][] = [];
  const terminalValues: number[] = [];

  for (let p = 0; p < nPaths; p++) {
    const path: number[] = [S0];
    let S = S0;

    for (let t = 1; t <= nSteps; t++) {
      const Z = randomNormal();
      S = S * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * sqrtDt * Z);
      path.push(S);
    }

    paths.push(path);
    terminalValues.push(S);
  }

  return computePathStatistics(paths, terminalValues);
}

/**
 * Simulate GBM with antithetic variates for variance reduction
 */
export function simulateGBMAntithetic(params: GBMParams): PathSimulationResult {
  const { S0, mu, sigma, T, nSteps, nPaths } = params;
  const dt = T / nSteps;
  const sqrtDt = Math.sqrt(dt);
  const halfPaths = Math.floor(nPaths / 2);

  const paths: number[][] = [];
  const terminalValues: number[] = [];

  for (let p = 0; p < halfPaths; p++) {
    // Original path
    const path1: number[] = [S0];
    let S1 = S0;

    // Antithetic path (negated random variates)
    const path2: number[] = [S0];
    let S2 = S0;

    for (let t = 1; t <= nSteps; t++) {
      const Z = randomNormal();

      S1 = S1 * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * sqrtDt * Z);
      S2 = S2 * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * sqrtDt * (-Z));

      path1.push(S1);
      path2.push(S2);
    }

    paths.push(path1, path2);
    terminalValues.push(S1, S2);
  }

  return computePathStatistics(paths, terminalValues);
}

// =============================================================================
// Merton Jump Diffusion
// =============================================================================

/**
 * Simulate Merton Jump Diffusion paths
 *
 * dS/S = (μ - λk) dt + σ dW + dJ
 *
 * where:
 * - λ = jump intensity
 * - k = E[e^J - 1] = expected jump impact
 * - J ~ N(muJ, sigmaJ²)
 *
 * @param params Jump diffusion parameters
 * @returns Simulated paths and statistics
 */
export function simulateJumpDiffusion(params: JumpDiffusionParams): PathSimulationResult {
  const { S0, mu, sigma, lambda, muJ, sigmaJ, T, nSteps, nPaths } = params;
  const dt = T / nSteps;
  const sqrtDt = Math.sqrt(dt);

  // Compensated drift: adjust for expected jump impact
  const k = Math.exp(muJ + 0.5 * sigmaJ * sigmaJ) - 1;
  const adjustedMu = mu - lambda * k;

  const paths: number[][] = [];
  const terminalValues: number[] = [];

  for (let p = 0; p < nPaths; p++) {
    const path: number[] = [S0];
    let S = S0;

    for (let t = 1; t <= nSteps; t++) {
      const Z = randomNormal();

      // Diffusion component
      const diffusion = (adjustedMu - 0.5 * sigma * sigma) * dt + sigma * sqrtDt * Z;

      // Jump component (Poisson-driven)
      const nJumps = randomPoisson(lambda * dt);
      let jumpSum = 0;
      for (let j = 0; j < nJumps; j++) {
        jumpSum += muJ + sigmaJ * randomNormal();
      }

      S = S * Math.exp(diffusion + jumpSum);
      path.push(S);
    }

    paths.push(path);
    terminalValues.push(S);
  }

  return computePathStatistics(paths, terminalValues);
}

// =============================================================================
// Binary Contract Pricing
// =============================================================================

/**
 * Price a binary (digital) contract using Monte Carlo
 *
 * Payoff = 1 if S_T > K, else 0
 *
 * @param S0 Current price
 * @param K Strike/threshold
 * @param mu Drift
 * @param sigma Volatility
 * @param T Time to expiry (years)
 * @param nPaths Number of simulation paths
 * @returns Monte Carlo estimate with confidence interval
 */
export function priceBinaryContract(
  S0: number,
  K: number,
  mu: number,
  sigma: number,
  T: number,
  nPaths: number = 100000
): MonteCarloResult {
  const Z = randomNormalArray(nPaths);

  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < nPaths; i++) {
    const S_T = S0 * Math.exp((mu - 0.5 * sigma * sigma) * T + sigma * Math.sqrt(T) * Z[i]);
    const payoff = S_T > K ? 1 : 0;
    sum += payoff;
    sumSq += payoff * payoff;
  }

  const estimate = sum / nPaths;
  const variance = (sumSq / nPaths - estimate * estimate);
  const stdError = Math.sqrt(variance / nPaths);

  return {
    estimate,
    stdError,
    ci95: [estimate - 1.96 * stdError, estimate + 1.96 * stdError],
    nSamples: nPaths,
  };
}

/**
 * Price binary contract with antithetic variates
 */
export function priceBinaryContractAntithetic(
  S0: number,
  K: number,
  mu: number,
  sigma: number,
  T: number,
  nPaths: number = 100000
): MonteCarloResult {
  const halfPaths = Math.floor(nPaths / 2);
  const drift = (mu - 0.5 * sigma * sigma) * T;
  const vol = sigma * Math.sqrt(T);

  let sum = 0;
  let sumSq = 0;

  for (let i = 0; i < halfPaths; i++) {
    const Z = randomNormal();

    const S_T1 = S0 * Math.exp(drift + vol * Z);
    const S_T2 = S0 * Math.exp(drift + vol * (-Z));

    const payoff1 = S_T1 > K ? 1 : 0;
    const payoff2 = S_T2 > K ? 1 : 0;

    // Average of antithetic pair
    const avgPayoff = (payoff1 + payoff2) / 2;
    sum += avgPayoff;
    sumSq += avgPayoff * avgPayoff;
  }

  const estimate = sum / halfPaths;
  const variance = (sumSq / halfPaths - estimate * estimate);
  const stdError = Math.sqrt(variance / halfPaths);

  // Compare to crude MC for variance reduction
  const crudeVariance = estimate * (1 - estimate);
  const varianceReduction = crudeVariance / (variance || 0.0001);

  return {
    estimate,
    stdError,
    ci95: [estimate - 1.96 * stdError, estimate + 1.96 * stdError],
    nSamples: nPaths,
    varianceReduction,
  };
}

// =============================================================================
// Risk Metrics
// =============================================================================

/**
 * Calculate VaR and CVaR from simulated returns
 *
 * @param returns Array of simulated returns
 * @param confidence Confidence level (e.g., 0.95)
 * @returns VaR and CVaR
 */
export function calculateVaRCVaR(
  returns: number[],
  confidence: number = 0.95
): { var: number; cvar: number } {
  const sorted = [...returns].sort((a, b) => a - b);
  const n = sorted.length;
  const idx = Math.floor(n * (1 - confidence));

  const var_ = -sorted[idx];

  // CVaR = average of returns below VaR
  let sumTail = 0;
  for (let i = 0; i <= idx; i++) {
    sumTail += sorted[i];
  }
  const cvar = -sumTail / (idx + 1);

  return { var: var_, cvar };
}

/**
 * Calculate comprehensive risk metrics from price paths
 */
export function calculateRiskMetrics(paths: number[][]): RiskMetrics {
  // Calculate returns from terminal values
  const returns: number[] = [];
  for (const path of paths) {
    const initialPrice = path[0];
    const finalPrice = path[path.length - 1];
    returns.push((finalPrice - initialPrice) / initialPrice);
  }

  const var95 = calculateVaRCVaR(returns, 0.95);
  const var99 = calculateVaRCVaR(returns, 0.99);

  // Max drawdown across all paths
  let maxDrawdown = 0;
  for (const path of paths) {
    let peak = path[0];
    for (const price of path) {
      if (price > peak) peak = price;
      const drawdown = (peak - price) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }

  // Volatility (std of returns)
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / returns.length;
  const volatility = Math.sqrt(variance);

  return {
    var95: var95.var,
    var99: var99.var,
    cvar95: var95.cvar,
    cvar99: var99.cvar,
    maxDrawdown,
    volatility,
  };
}

// =============================================================================
// Stratified Sampling
// =============================================================================

/**
 * Stratified Monte Carlo for binary contract
 *
 * Divides probability space into strata, samples within each
 */
export function priceBinaryStratified(
  S0: number,
  K: number,
  mu: number,
  sigma: number,
  T: number,
  nStrata: number = 10,
  nTotal: number = 100000
): MonteCarloResult {
  const nPerStratum = Math.floor(nTotal / nStrata);
  const stratumEstimates: number[] = [];

  const drift = (mu - 0.5 * sigma * sigma) * T;
  const vol = sigma * Math.sqrt(T);

  // Standard normal CDF inverse (approximation)
  const normInv = (p: number): number => {
    // Rational approximation
    const a = [
      -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
      1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0
    ];
    const b = [
      -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
      6.680131188771972e1, -1.328068155288572e1
    ];
    const c = [
      -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
      -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0
    ];
    const d = [
      7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
      3.754408661907416e0
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q: number, r: number;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
  };

  for (let s = 0; s < nStrata; s++) {
    let stratumSum = 0;

    for (let i = 0; i < nPerStratum; i++) {
      // Uniform draw within stratum
      const U = (s + Math.random()) / nStrata;
      const Z = normInv(U);

      const S_T = S0 * Math.exp(drift + vol * Z);
      stratumSum += S_T > K ? 1 : 0;
    }

    stratumEstimates.push(stratumSum / nPerStratum);
  }

  const estimate = stratumEstimates.reduce((a, b) => a + b, 0) / nStrata;
  const stratumVariance = stratumEstimates.reduce(
    (sum, e) => sum + (e - estimate) ** 2, 0
  ) / (nStrata - 1);
  const stdError = Math.sqrt(stratumVariance / nStrata);

  return {
    estimate,
    stdError,
    ci95: [estimate - 1.96 * stdError, estimate + 1.96 * stdError],
    nSamples: nTotal,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function computePathStatistics(
  paths: number[][],
  terminalValues: number[]
): PathSimulationResult {
  const n = terminalValues.length;

  // Mean
  const mean = terminalValues.reduce((a, b) => a + b, 0) / n;

  // Std
  const variance = terminalValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  // Percentiles
  const sorted = [...terminalValues].sort((a, b) => a - b);
  const percentiles: Record<number, number> = {
    1: sorted[Math.floor(n * 0.01)],
    5: sorted[Math.floor(n * 0.05)],
    25: sorted[Math.floor(n * 0.25)],
    50: sorted[Math.floor(n * 0.50)],
    75: sorted[Math.floor(n * 0.75)],
    95: sorted[Math.floor(n * 0.95)],
    99: sorted[Math.floor(n * 0.99)],
  };

  return {
    paths,
    terminalValues,
    mean,
    std,
    percentiles,
  };
}

// =============================================================================
// Exports
// =============================================================================

export const MonteCarlo = {
  // Random generation
  randomNormal,
  randomNormalArray,
  randomPoisson,

  // Path simulation
  simulateGBM,
  simulateGBMAntithetic,
  simulateJumpDiffusion,

  // Binary pricing
  priceBinaryContract,
  priceBinaryContractAntithetic,
  priceBinaryStratified,

  // Risk
  calculateVaRCVaR,
  calculateRiskMetrics,
};
