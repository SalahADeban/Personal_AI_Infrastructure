/**
 * QuantCore - Quantitative Simulation Engine
 *
 * A comprehensive library for quantitative analysis in trading and prediction markets.
 *
 * Modules:
 * - MonteCarlo: Path simulation, variance reduction, risk metrics
 * - ParticleFilter: Real-time Bayesian probability updating
 * - ImportanceSampling: Tail risk estimation
 * - Copulas: Dependency modeling with tail dependence
 * - TimeSeries: Forecasting, smoothing, volatility
 * - Anomaly: Statistical anomaly detection
 * - Regime: Hidden Markov Model regime detection
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
  // Monte Carlo
  MonteCarloResult,
  PathSimulationResult,
  JumpDiffusionParams,
  GBMParams,
  RiskMetrics,

  // Particle Filter
  Particle,
  ParticleFilterConfig,
  ParticleFilterState,
  Observation,

  // Copulas
  CopulaFamily,
  CopulaParams,
  CopulaResult,
  CorrelationMatrix,

  // Importance Sampling
  ImportanceSamplingResult,
  TiltingParams,

  // Time Series
  TimeSeriesPoint,
  ExponentialSmoothingParams,
  ForecastResult,

  // Anomaly
  AnomalyResult,
  AnomalyDetectorConfig,

  // Regime
  MarketRegime,
  RegimeState,
  HMMParams,

  // Unified
  QuantSignal,
} from './types';

// =============================================================================
// Module Exports
// =============================================================================

export { MonteCarlo } from './monte-carlo';
export {
  ParticleFilter,
  MultiAssetParticleFilter,
  TrendProbabilityFilter,
  ParticleFilters,
  sigmoid,
  logit,
} from './particle-filter';
export { ImportanceSampling } from './importance-sampling';
export { Copulas } from './copulas';
export { TimeSeries } from './time-series';
export { Anomaly, AnomalyDetector } from './anomaly';
export { Regime, RegimeHMM, REGIMES, getRegimeStrategyParams } from './regime';

// =============================================================================
// Convenience Re-exports
// =============================================================================

// Monte Carlo functions
export {
  randomNormal,
  randomNormalArray,
  randomPoisson,
  simulateGBM,
  simulateGBMAntithetic,
  simulateJumpDiffusion,
  priceBinaryContract,
  priceBinaryContractAntithetic,
  priceBinaryStratified,
  calculateVaRCVaR,
  calculateRiskMetrics,
} from './monte-carlo';

// Particle Filter functions
export {
  ParticleFilter as PF,
  MultiAssetParticleFilter as MultiPF,
  TrendProbabilityFilter as TrendPF,
} from './particle-filter';

// Importance Sampling functions
export {
  importanceSamplingRareEvent,
  estimateCrashProbability,
  estimateRallyProbability,
  estimateJointCrashProbability,
  tailVaRIS,
} from './importance-sampling';

// Copula functions
export {
  normalCDF,
  normalInvCDF,
  sampleGaussianCopula,
  sampleStudentTCopula,
  sampleClaytonCopula,
  sampleGumbelCopula,
  calculateTailDependence,
  simulateCorrelatedOutcomes,
  compareCopulaTailRisk,
  buildCorrelationMatrix,
} from './copulas';

// Time Series functions
export {
  sma,
  ema,
  wma,
  simpleExponentialSmoothing,
  doubleExponentialSmoothing,
  tripleExponentialSmoothing,
  forecast,
  historicalVolatility,
  ewmaVolatility,
  parkinsonVolatility,
  detectTrend,
  velocity,
  momentum,
  autocorrelation,
  acf,
} from './time-series';

// Anomaly functions
export {
  detectAnomalyZScore,
  detectAnomalyIQR,
  detectAnomalyMAD,
  detectAnomalyIsolationForest,
  isolationForestScore,
  rollingZScore,
  mahalanobisDistance,
} from './anomaly';

// Regime functions
export {
  detectRegimeSimple,
} from './regime';

// =============================================================================
// QuantCore Unified Interface
// =============================================================================

import { MonteCarlo } from './monte-carlo';
import { ParticleFilter, MultiAssetParticleFilter } from './particle-filter';
import { ImportanceSampling } from './importance-sampling';
import { Copulas } from './copulas';
import { TimeSeries } from './time-series';
import { Anomaly, AnomalyDetector } from './anomaly';
import { Regime, RegimeHMM } from './regime';

/**
 * Main QuantCore interface
 *
 * Provides access to all quantitative methods in one object
 */
export const QuantCore = {
  // Modules
  MonteCarlo,
  ParticleFilter,
  MultiAssetParticleFilter,
  ImportanceSampling,
  Copulas,
  TimeSeries,
  Anomaly,
  AnomalyDetector,
  Regime,
  RegimeHMM,

  // Quick access functions

  /**
   * Simulate price paths using jump diffusion
   */
  simulatePaths: MonteCarlo.simulateJumpDiffusion,

  /**
   * Price a binary contract
   */
  priceBinary: MonteCarlo.priceBinaryContractAntithetic,

  /**
   * Estimate crash probability
   */
  crashProb: ImportanceSampling.estimateCrashProbability,

  /**
   * Detect market regime
   */
  detectRegime: Regime.detectRegimeSimple,

  /**
   * Calculate risk metrics
   */
  riskMetrics: MonteCarlo.calculateRiskMetrics,

  /**
   * Compare tail risk with different copulas
   */
  tailRiskComparison: Copulas.compareCopulaTailRisk,

  /**
   * Create anomaly detector
   */
  createAnomalyDetector: (config?: any) => new AnomalyDetector(config),

  /**
   * Create particle filter
   */
  createParticleFilter: (prior?: number, config?: any) => new ParticleFilter(prior, config),

  /**
   * Create HMM regime detector
   */
  createHMM: (params?: any) => new RegimeHMM(params),

  /**
   * Forecast time series
   */
  forecast: TimeSeries.forecast,

  /**
   * Calculate volatility
   */
  volatility: TimeSeries.ewmaVolatility,

  // Version
  version: '1.0.0',
};

export default QuantCore;
