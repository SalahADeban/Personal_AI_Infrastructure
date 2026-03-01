/**
 * Particle Filter (Sequential Monte Carlo)
 *
 * Real-time Bayesian updating for probability estimation.
 * Works in logit space to keep probabilities bounded (0, 1).
 *
 * Use cases:
 * - Prediction market probability tracking
 * - Election night real-time updates
 * - Trend probability estimation
 */

import type {
  Particle,
  ParticleFilterConfig,
  ParticleFilterState,
  Observation,
} from './types';
import { randomNormal } from './monte-carlo';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Sigmoid function: logit -> probability
 */
export function sigmoid(x: number): number {
  if (x >= 0) {
    return 1 / (1 + Math.exp(-x));
  } else {
    const expX = Math.exp(x);
    return expX / (1 + expX);
  }
}

/**
 * Logit function: probability -> logit
 */
export function logit(p: number): number {
  // Clamp to avoid infinity
  const clampedP = Math.max(0.0001, Math.min(0.9999, p));
  return Math.log(clampedP / (1 - clampedP));
}

/**
 * Log-sum-exp for numerical stability
 */
function logSumExp(logWeights: number[]): number {
  const maxLog = Math.max(...logWeights);
  let sum = 0;
  for (const lw of logWeights) {
    sum += Math.exp(lw - maxLog);
  }
  return maxLog + Math.log(sum);
}

// =============================================================================
// Particle Filter Class
// =============================================================================

export class ParticleFilter {
  private particles: Particle[];
  private config: ParticleFilterConfig;
  private history: number[];

  constructor(
    priorProbability: number = 0.5,
    config: Partial<ParticleFilterConfig> = {}
  ) {
    this.config = {
      nParticles: config.nParticles ?? 5000,
      processVol: config.processVol ?? 0.05,
      obsNoise: config.obsNoise ?? 0.03,
      resampleThreshold: config.resampleThreshold ?? 0.5,
    };

    this.history = [];
    this.particles = this.initializeParticles(priorProbability);
  }

  /**
   * Initialize particles around prior probability
   */
  private initializeParticles(priorProb: number): Particle[] {
    const logitPrior = logit(priorProb);
    const particles: Particle[] = [];
    const uniformWeight = 1 / this.config.nParticles;

    for (let i = 0; i < this.config.nParticles; i++) {
      particles.push({
        state: logitPrior + randomNormal() * 0.5,
        weight: uniformWeight,
      });
    }

    return particles;
  }

  /**
   * Update filter with new observation
   *
   * @param observation Observed value (e.g., market price 0-1)
   */
  update(observation: number | Observation): void {
    const obsValue = typeof observation === 'number'
      ? observation
      : observation.value;

    const obsConfidence = typeof observation === 'number'
      ? 1.0
      : (observation.confidence ?? 1.0);

    // Adjust observation noise by confidence
    const effectiveNoise = this.config.obsNoise / Math.sqrt(obsConfidence);

    // 1. PROPAGATE: Random walk in logit space
    for (const particle of this.particles) {
      particle.state += randomNormal() * this.config.processVol;
    }

    // 2. REWEIGHT: Likelihood of observation given each particle
    const logWeights: number[] = [];
    for (const particle of this.particles) {
      const prob = sigmoid(particle.state);
      const logLikelihood = -0.5 * ((obsValue - prob) / effectiveNoise) ** 2;
      logWeights.push(Math.log(particle.weight + 1e-300) + logLikelihood);
    }

    // Normalize weights
    const logNorm = logSumExp(logWeights);
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].weight = Math.exp(logWeights[i] - logNorm);
    }

    // 3. RESAMPLE if ESS is low
    const ess = this.computeESS();
    if (ess < this.config.nParticles * this.config.resampleThreshold) {
      this.systematicResample();
    }

    // Record estimate
    this.history.push(this.getEstimate());
  }

  /**
   * Batch update with multiple observations
   */
  updateBatch(observations: Array<number | Observation>): void {
    for (const obs of observations) {
      this.update(obs);
    }
  }

  /**
   * Systematic resampling - lower variance than multinomial
   */
  private systematicResample(): void {
    const n = this.particles.length;
    const cumsum: number[] = [0];

    for (const p of this.particles) {
      cumsum.push(cumsum[cumsum.length - 1] + p.weight);
    }

    // Sample starting point
    const u = Math.random() / n;
    const newParticles: Particle[] = [];
    let j = 0;

    for (let i = 0; i < n; i++) {
      const target = u + i / n;
      while (cumsum[j + 1] < target) {
        j++;
      }
      newParticles.push({
        state: this.particles[j].state,
        weight: 1 / n,
      });
    }

    this.particles = newParticles;
  }

  /**
   * Compute Effective Sample Size
   */
  private computeESS(): number {
    let sumSq = 0;
    for (const p of this.particles) {
      sumSq += p.weight ** 2;
    }
    return 1 / sumSq;
  }

  /**
   * Get current probability estimate (weighted mean)
   */
  getEstimate(): number {
    let sum = 0;
    for (const p of this.particles) {
      sum += sigmoid(p.state) * p.weight;
    }
    return sum;
  }

  /**
   * Get 95% credible interval
   */
  getCredibleInterval(alpha: number = 0.05): [number, number] {
    // Sort particles by probability
    const sorted = this.particles
      .map(p => ({ prob: sigmoid(p.state), weight: p.weight }))
      .sort((a, b) => a.prob - b.prob);

    // Find quantiles
    let cumWeight = 0;
    let lower = sorted[0].prob;
    let upper = sorted[sorted.length - 1].prob;

    for (const s of sorted) {
      cumWeight += s.weight;
      if (cumWeight >= alpha / 2 && lower === sorted[0].prob) {
        lower = s.prob;
      }
      if (cumWeight >= 1 - alpha / 2) {
        upper = s.prob;
        break;
      }
    }

    return [lower, upper];
  }

  /**
   * Get full state for serialization/inspection
   */
  getState(): ParticleFilterState {
    const estimate = this.getEstimate();
    const ci95 = this.getCredibleInterval();

    return {
      particles: [...this.particles],
      estimate,
      ci95,
      ess: this.computeESS(),
      history: [...this.history],
    };
  }

  /**
   * Reset filter with new prior
   */
  reset(priorProbability: number = 0.5): void {
    this.particles = this.initializeParticles(priorProbability);
    this.history = [];
  }

  /**
   * Get probability distribution (for visualization)
   */
  getDistribution(nBins: number = 50): Array<{ prob: number; density: number }> {
    const bins: number[] = new Array(nBins).fill(0);

    for (const p of this.particles) {
      const prob = sigmoid(p.state);
      const binIdx = Math.min(Math.floor(prob * nBins), nBins - 1);
      bins[binIdx] += p.weight;
    }

    return bins.map((density, i) => ({
      prob: (i + 0.5) / nBins,
      density: density * nBins,
    }));
  }

  /**
   * Get historical estimates
   */
  getHistory(): number[] {
    return [...this.history];
  }
}

// =============================================================================
// Multi-Asset Particle Filter
// =============================================================================

export class MultiAssetParticleFilter {
  private filters: Map<string, ParticleFilter>;
  private config: Partial<ParticleFilterConfig>;

  constructor(config: Partial<ParticleFilterConfig> = {}) {
    this.filters = new Map();
    this.config = config;
  }

  /**
   * Add or get filter for an asset
   */
  getFilter(asset: string, priorProb: number = 0.5): ParticleFilter {
    if (!this.filters.has(asset)) {
      this.filters.set(asset, new ParticleFilter(priorProb, this.config));
    }
    return this.filters.get(asset)!;
  }

  /**
   * Update specific asset
   */
  update(asset: string, observation: number | Observation): void {
    const filter = this.getFilter(asset);
    filter.update(observation);
  }

  /**
   * Get all estimates
   */
  getAllEstimates(): Record<string, number> {
    const estimates: Record<string, number> = {};
    for (const [asset, filter] of this.filters) {
      estimates[asset] = filter.getEstimate();
    }
    return estimates;
  }

  /**
   * Get all states
   */
  getAllStates(): Record<string, ParticleFilterState> {
    const states: Record<string, ParticleFilterState> = {};
    for (const [asset, filter] of this.filters) {
      states[asset] = filter.getState();
    }
    return states;
  }

  /**
   * List tracked assets
   */
  getAssets(): string[] {
    return Array.from(this.filters.keys());
  }
}

// =============================================================================
// Trend Probability Filter
// =============================================================================

/**
 * Specialized particle filter for trend analysis
 *
 * Estimates P(trend goes viral/mainstream)
 */
export class TrendProbabilityFilter extends ParticleFilter {
  private velocityHistory: number[];
  private mentionHistory: number[];

  constructor(priorViralProb: number = 0.1) {
    // Lower process vol for trends (more stable)
    // Higher obs noise (noisy social data)
    super(priorViralProb, {
      nParticles: 3000,
      processVol: 0.03,
      obsNoise: 0.1,
    });

    this.velocityHistory = [];
    this.mentionHistory = [];
  }

  /**
   * Update with trend metrics
   *
   * @param velocity Current velocity score (-2 to +3)
   * @param mentions Current mention count
   * @param crossPlatform Is it spreading across platforms?
   * @param earlySignal Is it an early signal?
   */
  updateWithMetrics(
    velocity: number,
    mentions: number,
    crossPlatform: boolean = false,
    earlySignal: boolean = false
  ): void {
    this.velocityHistory.push(velocity);
    this.mentionHistory.push(mentions);

    // Convert metrics to viral probability estimate
    // This is our "observation" of the underlying viral potential

    // Base: velocity normalized to 0-1
    let observedProb = (velocity + 2) / 5;  // -2..+3 -> 0..1

    // Boost for cross-platform spread
    if (crossPlatform) {
      observedProb = Math.min(1, observedProb + 0.15);
    }

    // Boost for early signal (high potential)
    if (earlySignal) {
      observedProb = Math.min(1, observedProb + 0.1);
    }

    // Mention volume adjustment (log scale)
    const mentionBoost = Math.min(0.2, Math.log10(mentions + 1) / 20);
    observedProb = Math.min(1, observedProb + mentionBoost);

    // Update filter with this observation
    this.update({
      value: observedProb,
      timestamp: Date.now(),
      confidence: crossPlatform ? 1.2 : 1.0,  // Higher confidence if cross-platform
    });
  }

  /**
   * Get viral prediction
   */
  getViralPrediction(): {
    probability: number;
    confidence: [number, number];
    trend: 'rising' | 'stable' | 'falling';
  } {
    const estimate = this.getEstimate();
    const ci = this.getCredibleInterval();
    const history = this.getHistory();

    // Determine trend from recent history
    let trend: 'rising' | 'stable' | 'falling' = 'stable';
    if (history.length >= 3) {
      const recent = history.slice(-3);
      const change = recent[recent.length - 1] - recent[0];
      if (change > 0.05) trend = 'rising';
      else if (change < -0.05) trend = 'falling';
    }

    return {
      probability: estimate,
      confidence: ci,
      trend,
    };
  }
}

// =============================================================================
// Exports
// =============================================================================

export const ParticleFilters = {
  ParticleFilter,
  MultiAssetParticleFilter,
  TrendProbabilityFilter,
  sigmoid,
  logit,
};
