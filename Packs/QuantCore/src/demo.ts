/**
 * QuantCore Demo
 *
 * Run with: bun run src/demo.ts
 */

import {
  MonteCarlo,
  ParticleFilter,
  TrendProbabilityFilter,
  ImportanceSampling,
  Copulas,
  TimeSeries,
  AnomalyDetector,
  RegimeHMM,
  getRegimeStrategyParams,
} from './index';

console.log('='.repeat(60));
console.log('QuantCore Demo - Quantitative Simulation Engine');
console.log('='.repeat(60));

// =============================================================================
// 1. Monte Carlo Simulation
// =============================================================================

console.log('\n1. MONTE CARLO SIMULATION');
console.log('-'.repeat(40));

// Binary contract pricing
const binaryResult = MonteCarlo.priceBinaryContractAntithetic(
  100,    // S0 = $100
  105,    // K = $105
  0.05,   // mu = 5% drift
  0.20,   // sigma = 20% vol
  30/365, // T = 30 days
  100000  // 100k paths
);

console.log('Binary Contract: P(S > $105 in 30 days)');
console.log(`  Estimate: ${(binaryResult.estimate * 100).toFixed(2)}%`);
console.log(`  95% CI: (${(binaryResult.ci95[0] * 100).toFixed(2)}%, ${(binaryResult.ci95[1] * 100).toFixed(2)}%)`);
console.log(`  Variance Reduction: ${binaryResult.varianceReduction?.toFixed(1)}x`);

// Jump diffusion paths
const jumpPaths = MonteCarlo.simulateJumpDiffusion({
  S0: 100,
  mu: 0.08,
  sigma: 0.20,
  lambda: 3,        // 3 jumps/year
  muJ: -0.02,       // -2% average jump
  sigmaJ: 0.05,     // 5% jump volatility
  T: 1,
  nSteps: 252,
  nPaths: 10000,
});

console.log('\nJump Diffusion (1 year, 10k paths):');
console.log(`  Mean terminal: $${jumpPaths.mean.toFixed(2)}`);
console.log(`  Std: $${jumpPaths.std.toFixed(2)}`);
console.log(`  5th percentile: $${jumpPaths.percentiles[5].toFixed(2)}`);
console.log(`  95th percentile: $${jumpPaths.percentiles[95].toFixed(2)}`);

// Risk metrics
const riskMetrics = MonteCarlo.calculateRiskMetrics(jumpPaths.paths);
console.log('\nRisk Metrics:');
console.log(`  95% VaR: ${(riskMetrics.var95 * 100).toFixed(2)}%`);
console.log(`  99% VaR: ${(riskMetrics.var99 * 100).toFixed(2)}%`);
console.log(`  95% CVaR: ${(riskMetrics.cvar95 * 100).toFixed(2)}%`);
console.log(`  Max Drawdown: ${(riskMetrics.maxDrawdown * 100).toFixed(2)}%`);
console.log(`  Volatility: ${(riskMetrics.volatility * 100).toFixed(2)}%`);

// =============================================================================
// 2. Particle Filter (Real-time Bayesian Updating)
// =============================================================================

console.log('\n2. PARTICLE FILTER - Real-time Probability Tracking');
console.log('-'.repeat(40));

const pf = new ParticleFilter(0.50, {
  nParticles: 5000,
  processVol: 0.03,
  obsNoise: 0.05,
});

// Simulate election night observations
const observations = [0.50, 0.52, 0.55, 0.58, 0.61, 0.65, 0.70, 0.75, 0.80];

console.log('Simulating election night updates...\n');
console.log('Time | Observed | Filtered | 95% CI');
console.log('-'.repeat(45));

for (let t = 0; t < observations.length; t++) {
  pf.update(observations[t]);
  const est = pf.getEstimate();
  const ci = pf.getCredibleInterval();
  console.log(`  ${t}  |   ${observations[t].toFixed(2)}   |   ${est.toFixed(3)}  | (${ci[0].toFixed(3)}, ${ci[1].toFixed(3)})`);
}

// =============================================================================
// 3. Trend Probability Filter
// =============================================================================

console.log('\n3. TREND PROBABILITY FILTER');
console.log('-'.repeat(40));

const trendFilter = new TrendProbabilityFilter(0.1);

// Simulate trend metrics over time
const velocities = [0, 0.5, 1, 1.5, 2, 2, 2.5, 2, 1.5, 1];
const mentions = [10, 25, 50, 100, 200, 350, 500, 400, 300, 250];

console.log('Tracking viral probability...\n');

for (let i = 0; i < velocities.length; i++) {
  const crossPlatform = i >= 4;
  const earlySignal = i < 3;

  trendFilter.updateWithMetrics(velocities[i], mentions[i], crossPlatform, earlySignal);
  const pred = trendFilter.getViralPrediction();

  console.log(`t=${i}: vel=${velocities[i].toFixed(1)}, mentions=${mentions[i]}, P(viral)=${(pred.probability * 100).toFixed(1)}%, trend=${pred.trend}`);
}

// =============================================================================
// 4. Importance Sampling for Tail Risk
// =============================================================================

console.log('\n4. IMPORTANCE SAMPLING - Crash Probability');
console.log('-'.repeat(40));

// Estimate probability of 20% crash in 5 trading days
const crashResult = ImportanceSampling.estimateCrashProbability(
  100,    // Current price
  0.20,   // 20% crash
  0.25,   // 25% volatility
  5,      // 5 days
  100000  // 100k simulations
);

console.log('P(20% crash in 5 days):');
console.log(`  IS Estimate: ${(crashResult.estimate * 10000).toFixed(2)} bps (${(crashResult.estimate * 100).toFixed(4)}%)`);
console.log(`  Crude Estimate: ${(crashResult.crudeEstimate * 10000).toFixed(2)} bps`);
console.log(`  Variance Reduction: ${crashResult.varianceReduction.toFixed(0)}x`);

// Tail VaR
const tailVaR = ImportanceSampling.tailVaRIS(100, 0.25, 5/252, 0.99, 50000);
console.log(`\n99% Tail VaR (5 days): ${tailVaR.varPercent.toFixed(2)}%`);
console.log(`99% Tail CVaR (5 days): ${tailVaR.cvarPercent.toFixed(2)}%`);

// =============================================================================
// 5. Copula - Tail Dependence Comparison
// =============================================================================

console.log('\n5. COPULA - Tail Dependence Analysis');
console.log('-'.repeat(40));

// 5 correlated assets (like swing states)
const probs = [0.52, 0.53, 0.51, 0.48, 0.50];
const corrMatrix = [
  [1.0, 0.7, 0.7, 0.4, 0.3],
  [0.7, 1.0, 0.8, 0.3, 0.3],
  [0.7, 0.8, 1.0, 0.3, 0.3],
  [0.4, 0.3, 0.3, 1.0, 0.5],
  [0.3, 0.3, 0.3, 0.5, 1.0],
];

const comparison = Copulas.compareCopulaTailRisk(probs, corrMatrix, 4, 100000);

console.log('Joint outcome probabilities (5 correlated assets):');
console.log(`\n                 Independent | Gaussian | t-copula(ν=4)`);
console.log(`  All up:        ${(comparison.independentAllUp * 100).toFixed(2)}%      | ${(comparison.gaussianAllUp * 100).toFixed(2)}%   | ${(comparison.tCopulaAllUp * 100).toFixed(2)}%`);
console.log(`  All down:      ${(comparison.independentAllDown * 100).toFixed(2)}%      | ${(comparison.gaussianAllDown * 100).toFixed(2)}%   | ${(comparison.tCopulaAllDown * 100).toFixed(2)}%`);
console.log(`\n  t vs Gaussian ratio (sweep): ${comparison.tVsGaussianRatioUp.toFixed(2)}x`);
console.log(`  t vs Gaussian ratio (all fail): ${comparison.tVsGaussianRatioDown.toFixed(2)}x`);

// Tail dependence
const tailDep = Copulas.calculateTailDependence('student-t', { family: 'student-t', rho: 0.6, nu: 4 });
console.log(`\n  t-copula tail dependence (ρ=0.6, ν=4): ${(tailDep.upper * 100).toFixed(1)}%`);

// =============================================================================
// 6. Time Series Analysis
// =============================================================================

console.log('\n6. TIME SERIES - Forecasting');
console.log('-'.repeat(40));

// Sample price data
const prices = [100, 102, 105, 103, 107, 110, 108, 112, 115, 118, 120, 122];

const fcst = TimeSeries.forecast(prices, 5, 0.3, 0.1);
console.log('Forecast next 5 periods:');
for (let i = 0; i < fcst.forecast.length; i++) {
  console.log(`  t+${i+1}: ${fcst.forecast[i].toFixed(2)} (${fcst.ci95Lower[i].toFixed(2)}, ${fcst.ci95Upper[i].toFixed(2)})`);
}

// Trend detection
const trend = TimeSeries.detectTrend(prices, 5, 10);
console.log(`\nTrend: ${trend.direction}, strength: ${(trend.strength * 100).toFixed(0)}%`);

// Volatility
const vol = TimeSeries.ewmaVolatility(prices, 0.94);
console.log(`EWMA Volatility (last): ${(vol[vol.length - 1] * 100).toFixed(2)}%`);

// =============================================================================
// 7. Anomaly Detection
// =============================================================================

console.log('\n7. ANOMALY DETECTION');
console.log('-'.repeat(40));

const detector = new AnomalyDetector({ method: 'mad', threshold: 3.0 });

// Load history
const normalData = [10, 11, 9, 10, 12, 11, 10, 9, 11, 10, 12, 11, 10, 9, 10, 11, 10, 12, 11, 10];
detector.loadHistory(normalData);

// Test values
const testValues = [10, 25, 11, 50, 9];
console.log('Testing values against historical data:');
for (const v of testValues) {
  const result = detector.detect(v);
  const status = result.isAnomaly ? 'ANOMALY' : 'normal';
  console.log(`  ${v}: ${status} (score: ${result.score.toFixed(2)})`);
}

// =============================================================================
// 8. Regime Detection
// =============================================================================

console.log('\n8. REGIME DETECTION (Hidden Markov Model)');
console.log('-'.repeat(40));

const hmm = new RegimeHMM();

// Simulate returns for different regimes
const trendingReturns = Array(20).fill(0).map(() => 0.002 + 0.01 * (Math.random() - 0.5));
const rangingReturns = Array(20).fill(0).map(() => 0.005 * (Math.random() - 0.5));
const volatileReturns = Array(20).fill(0).map(() => 0.03 * (Math.random() - 0.5));

const allReturns = [...trendingReturns, ...rangingReturns, ...volatileReturns];

console.log('Processing 60 daily returns through HMM...\n');

const states = hmm.updateBatch(allReturns);

// Show regime transitions
console.log('Regime sequence (first 20 = trending, next 20 = ranging, last 20 = volatile):');
let lastRegime = '';
let count = 0;
for (let i = 0; i < states.length; i++) {
  if (states[i].regime !== lastRegime) {
    if (lastRegime) {
      console.log(`  t=${i-count}-${i-1}: ${lastRegime} (${count} periods)`);
    }
    lastRegime = states[i].regime;
    count = 1;
  } else {
    count++;
  }
}
console.log(`  t=${states.length-count}-${states.length-1}: ${lastRegime} (${count} periods)`);

// Strategy params
const finalRegime = states[states.length - 1].regime;
const strategyParams = getRegimeStrategyParams(finalRegime);
console.log(`\nCurrent regime: ${finalRegime}`);
console.log(`Recommended strategy: ${strategyParams.strategy}`);
console.log(`Position size multiplier: ${strategyParams.positionSizeMultiplier}x`);

// =============================================================================
// Summary
// =============================================================================

console.log('\n' + '='.repeat(60));
console.log('QuantCore Demo Complete');
console.log('='.repeat(60));
console.log('\nModules demonstrated:');
console.log('  - Monte Carlo (GBM, Jump Diffusion, Binary Pricing)');
console.log('  - Particle Filter (Real-time Bayesian Updating)');
console.log('  - Trend Probability Filter (Social Media)');
console.log('  - Importance Sampling (Tail Risk)');
console.log('  - Copulas (Tail Dependence)');
console.log('  - Time Series (Forecasting, Volatility)');
console.log('  - Anomaly Detection (MAD)');
console.log('  - Regime Detection (HMM)');
console.log('\nReady for integration with TrendRadar, NewsScanner, IchimokuRadar!');
