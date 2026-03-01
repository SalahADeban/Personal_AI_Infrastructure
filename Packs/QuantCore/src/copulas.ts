/**
 * Copula Module
 *
 * Dependency modeling for correlated assets.
 * Critical for understanding tail dependence.
 *
 * Key insight: Gaussian copula has ZERO tail dependence.
 * Student-t copula captures co-crashes that Gaussian misses.
 *
 * This is exactly why the 2008 crisis happened.
 */

import type { CopulaFamily, CopulaParams, CopulaResult, CorrelationMatrix } from './types';
import { randomNormal, randomNormalArray } from './monte-carlo';

// =============================================================================
// Distribution Functions
// =============================================================================

/**
 * Standard normal CDF (approximation)
 */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Standard normal inverse CDF (approximation)
 */
export function normalInvCDF(p: number): number {
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
}

/**
 * Student-t CDF (approximation using beta function relationship)
 */
export function studentTCDF(x: number, nu: number): number {
  const t = nu / (nu + x * x);
  const beta = incompleteBeta(t, nu / 2, 0.5);
  return x >= 0 ? 1 - 0.5 * beta : 0.5 * beta;
}

/**
 * Student-t inverse CDF (Newton-Raphson approximation)
 */
export function studentTInvCDF(p: number, nu: number): number {
  // Initial guess from normal
  let x = normalInvCDF(p);

  // Newton-Raphson iterations
  for (let iter = 0; iter < 10; iter++) {
    const cdf = studentTCDF(x, nu);
    const pdf = studentTPDF(x, nu);
    if (Math.abs(pdf) < 1e-10) break;
    const xNew = x - (cdf - p) / pdf;
    if (Math.abs(xNew - x) < 1e-8) break;
    x = xNew;
  }

  return x;
}

/**
 * Student-t PDF
 */
function studentTPDF(x: number, nu: number): number {
  const coeff = gamma((nu + 1) / 2) / (Math.sqrt(nu * Math.PI) * gamma(nu / 2));
  return coeff * Math.pow(1 + x * x / nu, -(nu + 1) / 2);
}

/**
 * Gamma function (Lanczos approximation)
 */
function gamma(z: number): number {
  const g = 7;
  const C = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];

  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }

  z -= 1;
  let x = C[0];
  for (let i = 1; i < g + 2; i++) {
    x += C[i] / (z + i);
  }

  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/**
 * Incomplete beta function (continued fraction)
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x === 0 || x === 1) return x;

  const bt = Math.exp(
    a * Math.log(x) + b * Math.log(1 - x) +
    Math.log(gamma(a + b)) - Math.log(gamma(a)) - Math.log(gamma(b))
  );

  if (x < (a + 1) / (a + b + 2)) {
    return bt * betaCF(x, a, b) / a;
  } else {
    return 1 - bt * betaCF(1 - x, b, a) / b;
  }
}

/**
 * Continued fraction for incomplete beta
 */
function betaCF(x: number, a: number, b: number): number {
  const maxIter = 100;
  const eps = 1e-10;

  let m, m2, aa, c, d, del, h;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  c = 1;
  d = 1 - qab * x / qap;
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  h = d;

  for (m = 1; m <= maxIter; m++) {
    m2 = 2 * m;
    aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    h *= d * c;

    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    del = d * c;
    h *= del;

    if (Math.abs(del - 1) < eps) break;
  }

  return h;
}

// =============================================================================
// Copula Sampling
// =============================================================================

/**
 * Sample from Gaussian copula
 *
 * No tail dependence (λ_U = λ_L = 0)
 */
export function sampleGaussianCopula(
  n: number,
  d: number,
  corrMatrix: number[][]
): number[][] {
  const L = cholesky(corrMatrix);
  const samples: number[][] = [];

  for (let i = 0; i < n; i++) {
    const Z = randomNormalArray(d);
    const X: number[] = [];

    // Correlate via Cholesky
    for (let j = 0; j < d; j++) {
      let sum = 0;
      for (let k = 0; k <= j; k++) {
        sum += L[j][k] * Z[k];
      }
      // Apply CDF to get uniform
      X.push(normalCDF(sum));
    }

    samples.push(X);
  }

  return samples;
}

/**
 * Sample from Student-t copula
 *
 * Symmetric tail dependence: λ_U = λ_L = 2 * T_{ν+1}(-√((ν+1)(1-ρ)/(1+ρ)))
 *
 * For ν=4, ρ=0.6: tail dependence ≈ 0.18
 * This is why t-copula is critical for crisis modeling
 */
export function sampleStudentTCopula(
  n: number,
  d: number,
  corrMatrix: number[][],
  nu: number = 4
): number[][] {
  const L = cholesky(corrMatrix);
  const samples: number[][] = [];

  for (let i = 0; i < n; i++) {
    const Z = randomNormalArray(d);

    // Chi-squared variate for t-distribution
    let chiSq = 0;
    for (let k = 0; k < nu; k++) {
      const z = randomNormal();
      chiSq += z * z;
    }
    const sqrtFactor = Math.sqrt(nu / chiSq);

    const X: number[] = [];
    for (let j = 0; j < d; j++) {
      let sum = 0;
      for (let k = 0; k <= j; k++) {
        sum += L[j][k] * Z[k];
      }
      // Scale to t-distribution, then apply CDF
      const t = sum * sqrtFactor;
      X.push(studentTCDF(t, nu));
    }

    samples.push(X);
  }

  return samples;
}

/**
 * Sample from Clayton copula (bivariate)
 *
 * Lower tail dependence: λ_L = 2^(-1/θ)
 * Upper tail dependence: λ_U = 0
 *
 * Good for modeling co-crashes
 */
export function sampleClaytonCopula(
  n: number,
  theta: number = 2.0
): number[][] {
  const samples: number[][] = [];

  for (let i = 0; i < n; i++) {
    const V = randomGamma(1 / theta, 1);
    const E1 = -Math.log(Math.random());
    const E2 = -Math.log(Math.random());

    const U1 = Math.pow(1 + E1 / V, -1 / theta);
    const U2 = Math.pow(1 + E2 / V, -1 / theta);

    samples.push([U1, U2]);
  }

  return samples;
}

/**
 * Sample from Gumbel copula (bivariate)
 *
 * Upper tail dependence: λ_U = 2 - 2^(1/θ)
 * Lower tail dependence: λ_L = 0
 *
 * Good for modeling co-rallies
 */
export function sampleGumbelCopula(
  n: number,
  theta: number = 2.0
): number[][] {
  const samples: number[][] = [];

  for (let i = 0; i < n; i++) {
    // Sample from stable distribution with α = 1/θ
    const V = sampleStable(1 / theta);

    const E1 = -Math.log(Math.random());
    const E2 = -Math.log(Math.random());

    const U1 = Math.exp(-Math.pow(E1 / V, 1 / theta));
    const U2 = Math.exp(-Math.pow(E2 / V, 1 / theta));

    samples.push([U1, U2]);
  }

  return samples;
}

// =============================================================================
// Tail Dependence Calculation
// =============================================================================

/**
 * Calculate tail dependence coefficients
 */
export function calculateTailDependence(
  family: CopulaFamily,
  params: CopulaParams
): { upper: number; lower: number } {
  switch (family) {
    case 'gaussian':
      // Gaussian copula has no tail dependence
      return { upper: 0, lower: 0 };

    case 'student-t': {
      const nu = params.nu ?? 4;
      const rho = params.rho ?? 0.5;

      // λ = 2 * T_{ν+1}(-√((ν+1)(1-ρ)/(1+ρ)))
      const arg = Math.sqrt((nu + 1) * (1 - rho) / (1 + rho));
      const lambda = 2 * studentTCDF(-arg, nu + 1);

      return { upper: lambda, lower: lambda };
    }

    case 'clayton': {
      const theta = params.theta ?? 2;
      // λ_L = 2^(-1/θ), λ_U = 0
      return { upper: 0, lower: Math.pow(2, -1 / theta) };
    }

    case 'gumbel': {
      const theta = params.theta ?? 2;
      // λ_U = 2 - 2^(1/θ), λ_L = 0
      return { upper: 2 - Math.pow(2, 1 / theta), lower: 0 };
    }

    case 'frank':
      // Frank copula has no tail dependence
      return { upper: 0, lower: 0 };

    default:
      return { upper: 0, lower: 0 };
  }
}

// =============================================================================
// Joint Outcome Simulation
// =============================================================================

/**
 * Simulate correlated binary outcomes
 *
 * Use for correlated prediction market contracts or
 * correlated asset up/down movements
 */
export function simulateCorrelatedOutcomes(
  probabilities: number[],
  corrMatrix: number[][],
  copula: CopulaFamily = 'student-t',
  copulaParams: CopulaParams = { nu: 4 },
  nSamples: number = 100000
): {
  outcomes: number[][];
  jointProbs: {
    allUp: number;
    allDown: number;
    anyUp: number;
    anyDown: number;
  };
  tailDependence: { upper: number; lower: number };
} {
  const d = probabilities.length;

  // Sample from copula
  let U: number[][];
  switch (copula) {
    case 'gaussian':
      U = sampleGaussianCopula(nSamples, d, corrMatrix);
      break;
    case 'student-t':
      U = sampleStudentTCopula(nSamples, d, corrMatrix, copulaParams.nu ?? 4);
      break;
    default:
      U = sampleGaussianCopula(nSamples, d, corrMatrix);
  }

  // Convert to binary outcomes
  const outcomes: number[][] = [];
  let allUp = 0;
  let allDown = 0;
  let anyUp = 0;
  let anyDown = 0;

  for (const u of U) {
    const outcome: number[] = [];
    let thisAllUp = true;
    let thisAllDown = true;
    let thisAnyUp = false;
    let thisAnyDown = false;

    for (let j = 0; j < d; j++) {
      const up = u[j] < probabilities[j] ? 1 : 0;
      outcome.push(up);

      if (up === 0) thisAllUp = false;
      if (up === 1) thisAllDown = false;
      if (up === 1) thisAnyUp = true;
      if (up === 0) thisAnyDown = true;
    }

    outcomes.push(outcome);
    if (thisAllUp) allUp++;
    if (thisAllDown) allDown++;
    if (thisAnyUp) anyUp++;
    if (thisAnyDown) anyDown++;
  }

  return {
    outcomes,
    jointProbs: {
      allUp: allUp / nSamples,
      allDown: allDown / nSamples,
      anyUp: anyUp / nSamples,
      anyDown: anyDown / nSamples,
    },
    tailDependence: calculateTailDependence(copula, copulaParams),
  };
}

/**
 * Compare Gaussian vs t-copula for joint tail events
 *
 * This demonstrates why t-copula is critical
 */
export function compareCopulaTailRisk(
  probabilities: number[],
  corrMatrix: number[][],
  nu: number = 4,
  nSamples: number = 100000
): {
  gaussianAllUp: number;
  gaussianAllDown: number;
  tCopulaAllUp: number;
  tCopulaAllDown: number;
  independentAllUp: number;
  independentAllDown: number;
  tVsGaussianRatioUp: number;
  tVsGaussianRatioDown: number;
} {
  // Gaussian copula
  const gaussian = simulateCorrelatedOutcomes(
    probabilities, corrMatrix, 'gaussian', {}, nSamples
  );

  // t-copula
  const tCopula = simulateCorrelatedOutcomes(
    probabilities, corrMatrix, 'student-t', { nu }, nSamples
  );

  // Independent (product of marginals)
  const indepAllUp = probabilities.reduce((a, b) => a * b, 1);
  const indepAllDown = probabilities.reduce((a, b) => a * (1 - b), 1);

  return {
    gaussianAllUp: gaussian.jointProbs.allUp,
    gaussianAllDown: gaussian.jointProbs.allDown,
    tCopulaAllUp: tCopula.jointProbs.allUp,
    tCopulaAllDown: tCopula.jointProbs.allDown,
    independentAllUp: indepAllUp,
    independentAllDown: indepAllDown,
    tVsGaussianRatioUp: tCopula.jointProbs.allUp / (gaussian.jointProbs.allUp || 0.0001),
    tVsGaussianRatioDown: tCopula.jointProbs.allDown / (gaussian.jointProbs.allDown || 0.0001),
  };
}

// =============================================================================
// Correlation Matrix Utilities
// =============================================================================

/**
 * Build correlation matrix from asset pairs
 */
export function buildCorrelationMatrix(
  assets: string[],
  pairCorrelations: Array<{ asset1: string; asset2: string; corr: number }>
): CorrelationMatrix {
  const n = assets.length;
  const matrix: number[][] = [];

  // Initialize with identity
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      row.push(i === j ? 1 : 0);
    }
    matrix.push(row);
  }

  // Fill in correlations
  for (const { asset1, asset2, corr } of pairCorrelations) {
    const i = assets.indexOf(asset1);
    const j = assets.indexOf(asset2);
    if (i >= 0 && j >= 0) {
      matrix[i][j] = corr;
      matrix[j][i] = corr;
    }
  }

  // Calculate tail dependence for each pair (assuming t-copula with ν=4)
  const tailDep: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        row.push(1);
      } else {
        const { upper } = calculateTailDependence('student-t', {
          family: 'student-t',
          rho: matrix[i][j],
          nu: 4,
        });
        row.push(upper);
      }
    }
    tailDep.push(row);
  }

  return {
    assets,
    matrix,
    tailDependence: tailDep,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Cholesky decomposition
 */
function cholesky(A: number[][]): number[][] {
  const n = A.length;
  const L: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }

      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(0, A[i][i] - sum));
      } else {
        L[i][j] = (A[i][j] - sum) / (L[j][j] || 1e-10);
      }
    }
  }

  return L;
}

/**
 * Gamma random variate (Marsaglia & Tsang)
 */
function randomGamma(shape: number, scale: number): number {
  if (shape < 1) {
    return randomGamma(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number, v: number;
    do {
      x = randomNormal();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * (x * x) * (x * x)) {
      return d * v * scale;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v * scale;
    }
  }
}

/**
 * Stable distribution sampler (Chambers-Mallows-Stuck)
 */
function sampleStable(alpha: number): number {
  const U = Math.random() * Math.PI - Math.PI / 2;
  const W = -Math.log(Math.random());

  const S = Math.pow(
    Math.sin(alpha * U) / Math.pow(Math.cos(U), 1 / alpha),
    1
  ) * Math.pow(
    Math.cos(U - alpha * U) / W,
    (1 - alpha) / alpha
  );

  return S;
}

// =============================================================================
// Exports
// =============================================================================

export const Copulas = {
  // Distribution functions
  normalCDF,
  normalInvCDF,
  studentTCDF,
  studentTInvCDF,

  // Copula sampling
  sampleGaussianCopula,
  sampleStudentTCopula,
  sampleClaytonCopula,
  sampleGumbelCopula,

  // Analysis
  calculateTailDependence,
  simulateCorrelatedOutcomes,
  compareCopulaTailRisk,

  // Utilities
  buildCorrelationMatrix,
};
