/**
 * Regime Detection Module
 *
 * Hidden Markov Model for market regime identification.
 *
 * Regimes:
 * - trending_up: Sustained upward movement
 * - trending_down: Sustained downward movement
 * - ranging: Sideways, mean-reverting
 * - volatile: High volatility, uncertain
 *
 * Use cases:
 * - IchimokuRadar: Switch between trend-following and mean-reversion
 * - TrendRadar: Distinguish viral growth from noise
 * - Risk management: Adjust position sizing by regime
 */

import type { MarketRegime, RegimeState, HMMParams } from './types';
import { randomNormal } from './monte-carlo';

// =============================================================================
// Regime Labels
// =============================================================================

export const REGIMES: MarketRegime[] = [
  'trending_up',
  'trending_down',
  'ranging',
  'volatile',
];

// =============================================================================
// Simple Regime Detector (Rule-Based)
// =============================================================================

/**
 * Simple rule-based regime detection
 *
 * Fast, interpretable, good baseline
 */
export function detectRegimeSimple(
  returns: number[],
  window: number = 20
): RegimeState {
  if (returns.length < window) {
    return {
      regime: 'ranging',
      probability: 0.5,
      transitionProbs: { trending_up: 0.25, trending_down: 0.25, ranging: 0.25, volatile: 0.25 },
      duration: 0,
    };
  }

  const recentReturns = returns.slice(-window);

  // Calculate statistics
  const mean = recentReturns.reduce((a, b) => a + b, 0) / window;
  const variance = recentReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / window;
  const volatility = Math.sqrt(variance);

  // Trend strength: sum of returns normalized
  const trendStrength = mean / (volatility + 0.0001);

  // Count direction consistency
  let posCount = 0;
  let negCount = 0;
  for (const r of recentReturns) {
    if (r > 0) posCount++;
    else if (r < 0) negCount++;
  }
  const consistency = Math.max(posCount, negCount) / window;

  // Volatility regime: annualized vol
  const annualizedVol = volatility * Math.sqrt(252);

  // Determine regime
  let regime: MarketRegime;
  let probability: number;

  if (annualizedVol > 0.4) {
    // Very high volatility
    regime = 'volatile';
    probability = Math.min(0.95, 0.5 + annualizedVol);
  } else if (trendStrength > 0.3 && consistency > 0.6) {
    regime = 'trending_up';
    probability = Math.min(0.95, 0.5 + trendStrength * consistency);
  } else if (trendStrength < -0.3 && consistency > 0.6) {
    regime = 'trending_down';
    probability = Math.min(0.95, 0.5 + Math.abs(trendStrength) * consistency);
  } else {
    regime = 'ranging';
    probability = Math.min(0.95, 0.5 + (1 - consistency));
  }

  return {
    regime,
    probability,
    transitionProbs: getDefaultTransitionProbs(regime),
    duration: 1,
  };
}

function getDefaultTransitionProbs(
  currentRegime: MarketRegime
): Record<MarketRegime, number> {
  // Persistence-heavy transition probabilities
  const base: Record<MarketRegime, Record<MarketRegime, number>> = {
    trending_up: { trending_up: 0.7, trending_down: 0.05, ranging: 0.15, volatile: 0.1 },
    trending_down: { trending_up: 0.05, trending_down: 0.7, ranging: 0.15, volatile: 0.1 },
    ranging: { trending_up: 0.15, trending_down: 0.15, ranging: 0.6, volatile: 0.1 },
    volatile: { trending_up: 0.15, trending_down: 0.15, ranging: 0.2, volatile: 0.5 },
  };

  return base[currentRegime];
}

// =============================================================================
// Hidden Markov Model
// =============================================================================

/**
 * Hidden Markov Model for regime detection
 *
 * States: trending_up, trending_down, ranging, volatile
 * Emissions: returns (modeled as Gaussian)
 */
export class RegimeHMM {
  private nStates: number = 4;
  private stateNames: MarketRegime[] = REGIMES;

  // Transition matrix: P(next_state | current_state)
  private transitionMatrix: number[][];

  // Emission parameters: mean and std for each state
  private emissionMeans: number[];
  private emissionStds: number[];

  // Current state distribution
  private stateProbs: number[];
  private history: MarketRegime[] = [];

  constructor(params?: Partial<HMMParams>) {
    // Default transition matrix (high persistence)
    this.transitionMatrix = params?.transitionMatrix ?? [
      [0.90, 0.02, 0.05, 0.03],  // trending_up
      [0.02, 0.90, 0.05, 0.03],  // trending_down
      [0.10, 0.10, 0.75, 0.05],  // ranging
      [0.10, 0.10, 0.15, 0.65],  // volatile
    ];

    // Emission parameters (daily returns)
    this.emissionMeans = params?.emissionMeans ?? [
      0.002,   // trending_up: +0.2% daily
      -0.002,  // trending_down: -0.2% daily
      0.0,     // ranging: 0%
      0.0,     // volatile: 0%
    ];

    this.emissionStds = params?.emissionStds ?? [
      0.01,   // trending_up: 1% std
      0.01,   // trending_down: 1% std
      0.008,  // ranging: 0.8% std
      0.025,  // volatile: 2.5% std
    ];

    // Start with uniform prior
    this.stateProbs = [0.25, 0.25, 0.25, 0.25];
  }

  /**
   * Update state probabilities given new return observation
   *
   * Forward algorithm step
   */
  update(return_: number): RegimeState {
    // 1. Predict: multiply by transition matrix
    const predicted: number[] = [];
    for (let j = 0; j < this.nStates; j++) {
      let sum = 0;
      for (let i = 0; i < this.nStates; i++) {
        sum += this.stateProbs[i] * this.transitionMatrix[i][j];
      }
      predicted.push(sum);
    }

    // 2. Update: multiply by emission likelihood
    const likelihoods: number[] = [];
    for (let j = 0; j < this.nStates; j++) {
      const ll = gaussianPDF(return_, this.emissionMeans[j], this.emissionStds[j]);
      likelihoods.push(ll);
    }

    const updated: number[] = [];
    let sumProb = 0;
    for (let j = 0; j < this.nStates; j++) {
      const p = predicted[j] * likelihoods[j];
      updated.push(p);
      sumProb += p;
    }

    // Normalize
    for (let j = 0; j < this.nStates; j++) {
      this.stateProbs[j] = updated[j] / sumProb;
    }

    // Get most likely state
    let maxIdx = 0;
    for (let j = 1; j < this.nStates; j++) {
      if (this.stateProbs[j] > this.stateProbs[maxIdx]) {
        maxIdx = j;
      }
    }

    const currentRegime = this.stateNames[maxIdx];
    this.history.push(currentRegime);

    // Calculate duration in current regime
    let duration = 1;
    for (let i = this.history.length - 2; i >= 0; i--) {
      if (this.history[i] === currentRegime) {
        duration++;
      } else {
        break;
      }
    }

    return {
      regime: currentRegime,
      probability: this.stateProbs[maxIdx],
      transitionProbs: this.getTransitionProbs(maxIdx),
      duration,
    };
  }

  /**
   * Process batch of returns
   */
  updateBatch(returns: number[]): RegimeState[] {
    const states: RegimeState[] = [];
    for (const r of returns) {
      states.push(this.update(r));
    }
    return states;
  }

  /**
   * Get current state probabilities
   */
  getStateProbs(): Record<MarketRegime, number> {
    const result: Record<string, number> = {};
    for (let i = 0; i < this.nStates; i++) {
      result[this.stateNames[i]] = this.stateProbs[i];
    }
    return result as Record<MarketRegime, number>;
  }

  /**
   * Get transition probabilities from state
   */
  private getTransitionProbs(stateIdx: number): Record<MarketRegime, number> {
    const result: Record<string, number> = {};
    for (let j = 0; j < this.nStates; j++) {
      result[this.stateNames[j]] = this.transitionMatrix[stateIdx][j];
    }
    return result as Record<MarketRegime, number>;
  }

  /**
   * Get most likely state sequence (Viterbi algorithm)
   */
  viterbi(returns: number[]): MarketRegime[] {
    const T = returns.length;
    const V: number[][] = [];  // Viterbi path probabilities
    const backtrack: number[][] = [];

    // Initialize
    const init: number[] = [];
    for (let s = 0; s < this.nStates; s++) {
      const emission = gaussianPDF(returns[0], this.emissionMeans[s], this.emissionStds[s]);
      init.push(Math.log(0.25) + Math.log(emission));
    }
    V.push(init);
    backtrack.push(new Array(this.nStates).fill(0));

    // Forward pass
    for (let t = 1; t < T; t++) {
      const vt: number[] = [];
      const bt: number[] = [];

      for (let s = 0; s < this.nStates; s++) {
        let maxProb = -Infinity;
        let maxState = 0;

        for (let sPrev = 0; sPrev < this.nStates; sPrev++) {
          const prob = V[t - 1][sPrev] + Math.log(this.transitionMatrix[sPrev][s]);
          if (prob > maxProb) {
            maxProb = prob;
            maxState = sPrev;
          }
        }

        const emission = gaussianPDF(returns[t], this.emissionMeans[s], this.emissionStds[s]);
        vt.push(maxProb + Math.log(emission));
        bt.push(maxState);
      }

      V.push(vt);
      backtrack.push(bt);
    }

    // Backtrack to get most likely sequence
    const path: number[] = new Array(T);

    // Find best final state
    let maxIdx = 0;
    for (let s = 1; s < this.nStates; s++) {
      if (V[T - 1][s] > V[T - 1][maxIdx]) {
        maxIdx = s;
      }
    }
    path[T - 1] = maxIdx;

    // Backtrack
    for (let t = T - 2; t >= 0; t--) {
      path[t] = backtrack[t + 1][path[t + 1]];
    }

    return path.map(s => this.stateNames[s]);
  }

  /**
   * Reset to uniform prior
   */
  reset(): void {
    this.stateProbs = [0.25, 0.25, 0.25, 0.25];
    this.history = [];
  }

  /**
   * Get regime history
   */
  getHistory(): MarketRegime[] {
    return [...this.history];
  }

  /**
   * Train HMM on historical data (simplified Baum-Welch)
   *
   * This is a simplified version - full EM would iterate until convergence
   */
  train(returns: number[], nIterations: number = 10): void {
    for (let iter = 0; iter < nIterations; iter++) {
      // E-step: compute state probabilities for all observations
      const stateProbsAll = this.forwardBackward(returns);

      // M-step: update parameters
      this.updateEmissionParams(returns, stateProbsAll);
      this.updateTransitionMatrix(stateProbsAll);
    }
  }

  private forwardBackward(returns: number[]): number[][] {
    const T = returns.length;

    // Forward pass
    const alpha: number[][] = [];
    const init: number[] = [];
    let scale0 = 0;
    for (let s = 0; s < this.nStates; s++) {
      const p = 0.25 * gaussianPDF(returns[0], this.emissionMeans[s], this.emissionStds[s]);
      init.push(p);
      scale0 += p;
    }
    alpha.push(init.map(p => p / scale0));

    for (let t = 1; t < T; t++) {
      const at: number[] = [];
      let scaleT = 0;
      for (let s = 0; s < this.nStates; s++) {
        let sum = 0;
        for (let sPrev = 0; sPrev < this.nStates; sPrev++) {
          sum += alpha[t - 1][sPrev] * this.transitionMatrix[sPrev][s];
        }
        const p = sum * gaussianPDF(returns[t], this.emissionMeans[s], this.emissionStds[s]);
        at.push(p);
        scaleT += p;
      }
      alpha.push(at.map(p => p / scaleT));
    }

    // Backward pass
    const beta: number[][] = new Array(T).fill(null).map(() => new Array(this.nStates));
    beta[T - 1] = new Array(this.nStates).fill(1 / this.nStates);

    for (let t = T - 2; t >= 0; t--) {
      let scaleT = 0;
      for (let s = 0; s < this.nStates; s++) {
        let sum = 0;
        for (let sNext = 0; sNext < this.nStates; sNext++) {
          sum += this.transitionMatrix[s][sNext] *
                 gaussianPDF(returns[t + 1], this.emissionMeans[sNext], this.emissionStds[sNext]) *
                 beta[t + 1][sNext];
        }
        beta[t][s] = sum;
        scaleT += sum;
      }
      for (let s = 0; s < this.nStates; s++) {
        beta[t][s] /= scaleT;
      }
    }

    // Compute gamma (state probabilities)
    const gamma: number[][] = [];
    for (let t = 0; t < T; t++) {
      const gt: number[] = [];
      let sumG = 0;
      for (let s = 0; s < this.nStates; s++) {
        const g = alpha[t][s] * beta[t][s];
        gt.push(g);
        sumG += g;
      }
      gamma.push(gt.map(g => g / sumG));
    }

    return gamma;
  }

  private updateEmissionParams(returns: number[], gamma: number[][]): void {
    for (let s = 0; s < this.nStates; s++) {
      let sumGamma = 0;
      let sumGammaReturn = 0;

      for (let t = 0; t < returns.length; t++) {
        sumGamma += gamma[t][s];
        sumGammaReturn += gamma[t][s] * returns[t];
      }

      this.emissionMeans[s] = sumGammaReturn / sumGamma;

      // Update std
      let sumGammaVar = 0;
      for (let t = 0; t < returns.length; t++) {
        sumGammaVar += gamma[t][s] * (returns[t] - this.emissionMeans[s]) ** 2;
      }
      this.emissionStds[s] = Math.sqrt(sumGammaVar / sumGamma + 0.0001);
    }
  }

  private updateTransitionMatrix(gamma: number[][]): void {
    const T = gamma.length;

    for (let i = 0; i < this.nStates; i++) {
      let sumGammaI = 0;
      for (let t = 0; t < T - 1; t++) {
        sumGammaI += gamma[t][i];
      }

      for (let j = 0; j < this.nStates; j++) {
        let sumXi = 0;
        for (let t = 0; t < T - 1; t++) {
          sumXi += gamma[t][i] * gamma[t + 1][j];  // Simplified
        }
        this.transitionMatrix[i][j] = sumXi / (sumGammaI + 0.0001);
      }

      // Normalize row
      let rowSum = this.transitionMatrix[i].reduce((a, b) => a + b, 0);
      for (let j = 0; j < this.nStates; j++) {
        this.transitionMatrix[i][j] /= rowSum;
      }
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function gaussianPDF(x: number, mean: number, std: number): number {
  const z = (x - mean) / std;
  return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
}

// =============================================================================
// Regime-Based Strategy Signals
// =============================================================================

/**
 * Get trading strategy parameters based on regime
 */
export function getRegimeStrategyParams(regime: MarketRegime): {
  strategy: 'trend_following' | 'mean_reversion' | 'reduce_exposure';
  positionSizeMultiplier: number;
  stopLossMultiplier: number;
  takeProfitMultiplier: number;
  lookbackPeriod: number;
} {
  switch (regime) {
    case 'trending_up':
      return {
        strategy: 'trend_following',
        positionSizeMultiplier: 1.2,
        stopLossMultiplier: 1.5,
        takeProfitMultiplier: 2.0,
        lookbackPeriod: 10,
      };

    case 'trending_down':
      return {
        strategy: 'trend_following',
        positionSizeMultiplier: 0.8,  // Smaller shorts
        stopLossMultiplier: 1.5,
        takeProfitMultiplier: 2.0,
        lookbackPeriod: 10,
      };

    case 'ranging':
      return {
        strategy: 'mean_reversion',
        positionSizeMultiplier: 1.0,
        stopLossMultiplier: 1.0,
        takeProfitMultiplier: 1.0,
        lookbackPeriod: 20,
      };

    case 'volatile':
      return {
        strategy: 'reduce_exposure',
        positionSizeMultiplier: 0.5,
        stopLossMultiplier: 2.0,  // Wider stops
        takeProfitMultiplier: 1.5,
        lookbackPeriod: 5,
      };
  }
}

// =============================================================================
// Exports
// =============================================================================

export const Regime = {
  REGIMES,
  detectRegimeSimple,
  RegimeHMM,
  getRegimeStrategyParams,
};
