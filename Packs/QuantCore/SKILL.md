---
name: QuantCore
description: Quantitative simulation engine for trading and prediction markets. Provides Monte Carlo simulation, particle filters, copulas, regime detection, and anomaly detection.
---

# QuantCore - Quantitative Simulation Engine

A TypeScript library implementing institutional-grade quantitative methods for prediction markets and trading analysis.

## Modules

| Module | Purpose |
|--------|---------|
| **MonteCarlo** | GBM, Jump Diffusion, Binary pricing, VaR/CVaR |
| **ParticleFilter** | Real-time Bayesian probability updating |
| **ImportanceSampling** | Tail risk estimation (crash probabilities) |
| **Copulas** | Dependency modeling with tail dependence |
| **TimeSeries** | Forecasting, smoothing, volatility |
| **Anomaly** | Statistical anomaly detection |
| **Regime** | Hidden Markov Model regime detection |

## Quick Start

```typescript
import { QuantCore } from './src/index';

// Price a binary contract
const prob = QuantCore.priceBinary(100, 105, 0.05, 0.20, 30/365);
console.log(`P(price > $105): ${(prob.estimate * 100).toFixed(2)}%`);

// Track real-time probability
const pf = QuantCore.createParticleFilter(0.50);
pf.update(0.52);  // New observation
console.log(`Current estimate: ${pf.getEstimate()}`);

// Estimate crash probability
const crash = QuantCore.crashProb(100, 0.20, 0.25, 5);
console.log(`P(20% crash in 5 days): ${crash.estimate}`);

// Detect market regime
const returns = [0.01, -0.005, 0.02, 0.015, -0.01];
const regime = QuantCore.detectRegime(returns);
console.log(`Current regime: ${regime.regime}`);
```

## Usage Examples

### Monte Carlo Simulation

```typescript
import { MonteCarlo } from './src/index';

// Simulate jump diffusion paths
const paths = MonteCarlo.simulateJumpDiffusion({
  S0: 100,
  mu: 0.08,
  sigma: 0.20,
  lambda: 3,      // 3 jumps/year
  muJ: -0.02,     // Mean jump size
  sigmaJ: 0.05,   // Jump volatility
  T: 1,
  nSteps: 252,
  nPaths: 10000,
});

// Calculate risk metrics
const risk = MonteCarlo.calculateRiskMetrics(paths.paths);
console.log(`95% VaR: ${risk.var95}`);
console.log(`Max Drawdown: ${risk.maxDrawdown}`);
```

### Particle Filter for Elections/Prediction Markets

```typescript
import { ParticleFilter } from './src/index';

const pf = new ParticleFilter(0.50, {
  nParticles: 5000,
  processVol: 0.03,
  obsNoise: 0.05,
});

// Update with incoming observations (e.g., election results)
pf.update(0.52);
pf.update(0.55);
pf.update(0.58);

console.log(`Probability: ${pf.getEstimate()}`);
console.log(`95% CI: ${pf.getCredibleInterval()}`);
```

### Copula Tail Dependence

```typescript
import { Copulas } from './src/index';

// Compare Gaussian vs t-copula for correlated assets
const probs = [0.52, 0.53, 0.51];
const corr = [
  [1.0, 0.7, 0.6],
  [0.7, 1.0, 0.5],
  [0.6, 0.5, 1.0],
];

const result = Copulas.compareCopulaTailRisk(probs, corr, 4);
console.log(`t-copula shows ${result.tVsGaussianRatioDown}x more joint crashes`);
```

### Regime Detection

```typescript
import { RegimeHMM, getRegimeStrategyParams } from './src/index';

const hmm = new RegimeHMM();
const states = hmm.updateBatch(dailyReturns);

const current = states[states.length - 1];
console.log(`Regime: ${current.regime}`);
console.log(`Confidence: ${current.probability}`);

// Get strategy adjustments
const strategy = getRegimeStrategyParams(current.regime);
console.log(`Recommended: ${strategy.strategy}`);
```

## Integration with Other Skills

### TrendRadar Integration

```typescript
import { TrendProbabilityFilter, AnomalyDetector } from 'QuantCore';

// Track viral probability
const trendFilter = new TrendProbabilityFilter(0.1);
trendFilter.updateWithMetrics(velocity, mentions, crossPlatform, earlySignal);
const pred = trendFilter.getViralPrediction();

// Detect unusual velocity
const anomaly = new AnomalyDetector({ method: 'mad' });
anomaly.loadHistory(historicalVelocities);
const result = anomaly.check(currentVelocity);
```

### IchimokuRadar Integration

```typescript
import { RegimeHMM, MonteCarlo, Copulas } from 'QuantCore';

// Regime-aware trading
const hmm = new RegimeHMM();
const regime = hmm.update(todayReturn);

// Adjust strategy based on regime
const params = getRegimeStrategyParams(regime.regime);

// Calculate tail risk for correlated assets
const corrMatrix = buildCorrelationMatrix(['BTC', 'ETH', 'SOL'], pairCorrs);
const tailRisk = Copulas.compareCopulaTailRisk(probabilities, corrMatrix);
```

## Run Demo

```bash
cd ~/.claude/skills/QuantCore
bun run src/demo.ts
```

## Files

```
QuantCore/
├── SKILL.md           # This file
├── package.json       # Dependencies
└── src/
    ├── index.ts       # Main exports
    ├── types.ts       # Type definitions
    ├── monte-carlo.ts # MC simulation
    ├── particle-filter.ts # Sequential MC
    ├── importance-sampling.ts # Tail risk
    ├── copulas.ts     # Dependency modeling
    ├── time-series.ts # Forecasting
    ├── anomaly.ts     # Anomaly detection
    ├── regime.ts      # HMM regime detection
    └── demo.ts        # Demo script
```
