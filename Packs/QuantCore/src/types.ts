/**
 * QuantCore Type Definitions
 *
 * Core types for quantitative simulation and analysis
 */

// =============================================================================
// Monte Carlo Types
// =============================================================================

export interface MonteCarloResult {
  estimate: number;
  stdError: number;
  ci95: [number, number];
  nSamples: number;
  varianceReduction?: number;
}

export interface PathSimulationResult {
  paths: number[][];           // [nPaths][nSteps]
  terminalValues: number[];
  mean: number;
  std: number;
  percentiles: Record<number, number>;  // e.g., {5: value, 50: value, 95: value}
}

export interface JumpDiffusionParams {
  S0: number;          // Initial price
  mu: number;          // Drift (annual)
  sigma: number;       // Volatility (annual)
  lambda: number;      // Jump intensity (jumps/year)
  muJ: number;         // Mean jump size (log)
  sigmaJ: number;      // Jump size volatility
  T: number;           // Time horizon (years)
  nSteps: number;      // Number of time steps
  nPaths: number;      // Number of paths to simulate
}

export interface GBMParams {
  S0: number;
  mu: number;
  sigma: number;
  T: number;
  nSteps: number;
  nPaths: number;
}

// =============================================================================
// Particle Filter Types
// =============================================================================

export interface Particle {
  state: number;       // Logit-space state
  weight: number;      // Normalized weight
}

export interface ParticleFilterConfig {
  nParticles: number;
  processVol: number;      // State transition volatility
  obsNoise: number;        // Observation noise
  resampleThreshold: number;  // ESS threshold for resampling
}

export interface ParticleFilterState {
  particles: Particle[];
  estimate: number;         // Current probability estimate
  ci95: [number, number];   // 95% credible interval
  ess: number;              // Effective sample size
  history: number[];        // Historical estimates
}

export interface Observation {
  value: number;
  timestamp: number;
  source?: string;
  confidence?: number;
}

// =============================================================================
// Copula Types
// =============================================================================

export type CopulaFamily =
  | 'gaussian'
  | 'student-t'
  | 'clayton'
  | 'gumbel'
  | 'frank';

export interface CopulaParams {
  family: CopulaFamily;
  rho?: number;            // Correlation (Gaussian, t)
  nu?: number;             // Degrees of freedom (t)
  theta?: number;          // Dependence parameter (Archimedean)
}

export interface CopulaResult {
  samples: number[][];     // [nSamples][nDimensions]
  tailDependence: {
    upper: number;
    lower: number;
  };
}

export interface CorrelationMatrix {
  assets: string[];
  matrix: number[][];
  tailDependence: number[][];
}

// =============================================================================
// Importance Sampling Types
// =============================================================================

export interface ImportanceSamplingResult {
  estimate: number;
  stdError: number;
  ci95: [number, number];
  varianceReduction: number;  // vs crude MC
  effectiveSampleSize: number;
}

export interface TiltingParams {
  targetRegion: 'upper' | 'lower';
  threshold: number;
  tiltStrength?: number;
}

// =============================================================================
// Time Series Types
// =============================================================================

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
}

export interface ExponentialSmoothingParams {
  alpha: number;          // Level smoothing (0-1)
  beta?: number;          // Trend smoothing (0-1)
  gamma?: number;         // Seasonal smoothing (0-1)
  seasonalPeriod?: number;
}

export interface ForecastResult {
  forecast: number[];
  ci95Upper: number[];
  ci95Lower: number[];
  mse: number;
  mae: number;
}

// =============================================================================
// Anomaly Detection Types
// =============================================================================

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;           // Higher = more anomalous
  zScore?: number;
  threshold: number;
  method: 'zscore' | 'iqr' | 'isolation_forest' | 'mad';
}

export interface AnomalyDetectorConfig {
  method: 'zscore' | 'iqr' | 'isolation_forest' | 'mad';
  threshold?: number;
  windowSize?: number;
}

// =============================================================================
// Regime Detection Types
// =============================================================================

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';

export interface RegimeState {
  regime: MarketRegime;
  probability: number;
  transitionProbs: Record<MarketRegime, number>;
  duration: number;        // Periods in current regime
}

export interface HMMParams {
  nStates: number;
  transitionMatrix: number[][];
  emissionMeans: number[];
  emissionStds: number[];
}

// =============================================================================
// Risk Metrics Types
// =============================================================================

export interface RiskMetrics {
  var95: number;           // 95% Value at Risk
  var99: number;           // 99% Value at Risk
  cvar95: number;          // 95% Conditional VaR (Expected Shortfall)
  cvar99: number;          // 99% Conditional VaR
  maxDrawdown: number;
  sharpe?: number;
  sortino?: number;
  volatility: number;
}

// =============================================================================
// Unified Signal Types
// =============================================================================

export interface QuantSignal {
  asset: string;
  timestamp: number;

  // Probability estimates
  probability: number;     // P(up) or P(event)
  confidence: number;      // CI width

  // Regime
  regime: MarketRegime;
  regimeProbability: number;

  // Risk
  risk: RiskMetrics;

  // Anomaly
  isAnomaly: boolean;
  anomalyScore: number;

  // Correlation context
  correlatedAssets: Array<{
    asset: string;
    correlation: number;
    tailDependence: number;
  }>;

  // Sources
  sources: Array<{
    name: string;
    signal: number;
    weight: number;
  }>;
}
