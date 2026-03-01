/**
 * Time Series Analysis Module
 *
 * Implements:
 * - Exponential Smoothing (Single, Double, Triple)
 * - Simple moving averages
 * - Volatility estimation
 * - Trend detection
 *
 * Use cases:
 * - Trend velocity forecasting
 * - Price momentum estimation
 * - Seasonality detection
 */

import type {
  TimeSeriesPoint,
  ExponentialSmoothingParams,
  ForecastResult,
} from './types';

// =============================================================================
// Simple Moving Averages
// =============================================================================

/**
 * Simple Moving Average
 */
export function sma(values: number[], window: number): number[] {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        sum += values[i - j];
      }
      result.push(sum / window);
    }
  }

  return result;
}

/**
 * Exponential Moving Average
 */
export function ema(values: number[], window: number): number[] {
  const k = 2 / (window + 1);
  const result: number[] = [values[0]];

  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }

  return result;
}

/**
 * Weighted Moving Average
 */
export function wma(values: number[], window: number): number[] {
  const result: number[] = [];
  const weightSum = (window * (window + 1)) / 2;

  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      result.push(NaN);
    } else {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        sum += values[i - j] * (window - j);
      }
      result.push(sum / weightSum);
    }
  }

  return result;
}

// =============================================================================
// Exponential Smoothing
// =============================================================================

/**
 * Simple Exponential Smoothing (SES)
 *
 * Good for: Series with no trend or seasonality
 * S_t = α * Y_t + (1 - α) * S_{t-1}
 */
export function simpleExponentialSmoothing(
  values: number[],
  alpha: number = 0.3
): number[] {
  const result: number[] = [values[0]];

  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1]);
  }

  return result;
}

/**
 * Double Exponential Smoothing (Holt's method)
 *
 * Good for: Series with trend, no seasonality
 * Level: L_t = α * Y_t + (1 - α) * (L_{t-1} + T_{t-1})
 * Trend: T_t = β * (L_t - L_{t-1}) + (1 - β) * T_{t-1}
 */
export function doubleExponentialSmoothing(
  values: number[],
  alpha: number = 0.3,
  beta: number = 0.1
): { level: number[]; trend: number[]; fitted: number[] } {
  const n = values.length;

  // Initialize
  const level: number[] = [values[0]];
  const trend: number[] = [values[1] - values[0]];
  const fitted: number[] = [values[0]];

  for (let i = 1; i < n; i++) {
    const prevLevel = level[i - 1];
    const prevTrend = trend[i - 1];

    // Update level
    const newLevel = alpha * values[i] + (1 - alpha) * (prevLevel + prevTrend);
    level.push(newLevel);

    // Update trend
    const newTrend = beta * (newLevel - prevLevel) + (1 - beta) * prevTrend;
    trend.push(newTrend);

    // Fitted value
    fitted.push(prevLevel + prevTrend);
  }

  return { level, trend, fitted };
}

/**
 * Triple Exponential Smoothing (Holt-Winters)
 *
 * Good for: Series with trend AND seasonality
 */
export function tripleExponentialSmoothing(
  values: number[],
  seasonalPeriod: number,
  alpha: number = 0.3,
  beta: number = 0.1,
  gamma: number = 0.1,
  multiplicative: boolean = true
): {
  level: number[];
  trend: number[];
  seasonal: number[];
  fitted: number[];
} {
  const n = values.length;

  // Initialize seasonal factors from first period
  const seasonal: number[] = [];
  const firstPeriodAvg = values.slice(0, seasonalPeriod).reduce((a, b) => a + b, 0) / seasonalPeriod;

  for (let i = 0; i < seasonalPeriod; i++) {
    if (multiplicative) {
      seasonal.push(values[i] / firstPeriodAvg);
    } else {
      seasonal.push(values[i] - firstPeriodAvg);
    }
  }

  // Initialize level and trend
  const level: number[] = [firstPeriodAvg];
  const trend: number[] = [(values[seasonalPeriod] - values[0]) / seasonalPeriod];
  const fitted: number[] = [];

  // First period uses initial values
  for (let i = 0; i < seasonalPeriod; i++) {
    if (multiplicative) {
      fitted.push(level[0] * seasonal[i]);
    } else {
      fitted.push(level[0] + seasonal[i]);
    }
  }

  // Update for remaining observations
  for (let i = seasonalPeriod; i < n; i++) {
    const prevLevel = level[level.length - 1];
    const prevTrend = trend[trend.length - 1];
    const prevSeasonal = seasonal[i - seasonalPeriod];

    let newLevel: number, newTrend: number, newSeasonal: number, fit: number;

    if (multiplicative) {
      newLevel = alpha * (values[i] / prevSeasonal) + (1 - alpha) * (prevLevel + prevTrend);
      newTrend = beta * (newLevel - prevLevel) + (1 - beta) * prevTrend;
      newSeasonal = gamma * (values[i] / newLevel) + (1 - gamma) * prevSeasonal;
      fit = (prevLevel + prevTrend) * prevSeasonal;
    } else {
      newLevel = alpha * (values[i] - prevSeasonal) + (1 - alpha) * (prevLevel + prevTrend);
      newTrend = beta * (newLevel - prevLevel) + (1 - beta) * prevTrend;
      newSeasonal = gamma * (values[i] - newLevel) + (1 - gamma) * prevSeasonal;
      fit = prevLevel + prevTrend + prevSeasonal;
    }

    level.push(newLevel);
    trend.push(newTrend);
    seasonal.push(newSeasonal);
    fitted.push(fit);
  }

  return { level, trend, seasonal, fitted };
}

// =============================================================================
// Forecasting
// =============================================================================

/**
 * Forecast future values using Holt's double exponential smoothing
 */
export function forecast(
  values: number[],
  nAhead: number,
  alpha: number = 0.3,
  beta: number = 0.1
): ForecastResult {
  const { level, trend, fitted } = doubleExponentialSmoothing(values, alpha, beta);
  const lastLevel = level[level.length - 1];
  const lastTrend = trend[trend.length - 1];

  // Point forecasts
  const forecasts: number[] = [];
  for (let h = 1; h <= nAhead; h++) {
    forecasts.push(lastLevel + h * lastTrend);
  }

  // Estimate forecast error from in-sample residuals
  const residuals: number[] = [];
  for (let i = 1; i < values.length; i++) {
    residuals.push(values[i] - fitted[i]);
  }
  const mse = residuals.reduce((s, r) => s + r * r, 0) / residuals.length;
  const rmse = Math.sqrt(mse);
  const mae = residuals.reduce((s, r) => s + Math.abs(r), 0) / residuals.length;

  // Confidence intervals (approximate, assuming normal errors)
  const ci95Upper: number[] = [];
  const ci95Lower: number[] = [];
  for (let h = 1; h <= nAhead; h++) {
    const se = rmse * Math.sqrt(1 + (h - 1) * 0.1);  // Simplified widening
    ci95Upper.push(forecasts[h - 1] + 1.96 * se);
    ci95Lower.push(forecasts[h - 1] - 1.96 * se);
  }

  return {
    forecast: forecasts,
    ci95Upper,
    ci95Lower,
    mse,
    mae,
  };
}

// =============================================================================
// Volatility Estimation
// =============================================================================

/**
 * Historical volatility (standard deviation of returns)
 */
export function historicalVolatility(
  prices: number[],
  window: number = 20
): number[] {
  // Calculate log returns
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  // Rolling std
  const vol: number[] = [NaN];  // First price has no return
  for (let i = 0; i < returns.length; i++) {
    if (i < window - 1) {
      vol.push(NaN);
    } else {
      const windowReturns = returns.slice(i - window + 1, i + 1);
      const mean = windowReturns.reduce((a, b) => a + b, 0) / window;
      const variance = windowReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / window;
      vol.push(Math.sqrt(variance * 252));  // Annualize
    }
  }

  return vol;
}

/**
 * EWMA Volatility (Exponentially Weighted)
 *
 * Reacts faster to recent changes than historical vol
 */
export function ewmaVolatility(
  prices: number[],
  lambda: number = 0.94
): number[] {
  // Calculate log returns
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  // Initialize variance
  let variance = returns[0] ** 2;
  const vol: number[] = [NaN, Math.sqrt(variance * 252)];

  for (let i = 1; i < returns.length; i++) {
    variance = lambda * variance + (1 - lambda) * returns[i] ** 2;
    vol.push(Math.sqrt(variance * 252));
  }

  return vol;
}

/**
 * Parkinson volatility estimator
 *
 * Uses high-low range, more efficient than close-to-close
 */
export function parkinsonVolatility(
  highs: number[],
  lows: number[],
  window: number = 20
): number[] {
  const factor = 1 / (4 * Math.log(2));
  const vol: number[] = [];

  for (let i = 0; i < highs.length; i++) {
    if (i < window - 1) {
      vol.push(NaN);
    } else {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        const hlRatio = Math.log(highs[i - j] / lows[i - j]);
        sum += hlRatio ** 2;
      }
      vol.push(Math.sqrt(factor * sum / window * 252));
    }
  }

  return vol;
}

// =============================================================================
// Trend Detection
// =============================================================================

/**
 * Detect trend direction and strength
 */
export function detectTrend(
  values: number[],
  shortWindow: number = 10,
  longWindow: number = 30
): {
  direction: 'up' | 'down' | 'sideways';
  strength: number;  // 0-1
  shortMA: number;
  longMA: number;
} {
  if (values.length < longWindow) {
    return { direction: 'sideways', strength: 0, shortMA: NaN, longMA: NaN };
  }

  // Calculate MAs
  const shortMA = values.slice(-shortWindow).reduce((a, b) => a + b, 0) / shortWindow;
  const longMA = values.slice(-longWindow).reduce((a, b) => a + b, 0) / longWindow;

  // Direction
  const diff = (shortMA - longMA) / longMA;
  let direction: 'up' | 'down' | 'sideways';
  if (diff > 0.02) direction = 'up';
  else if (diff < -0.02) direction = 'down';
  else direction = 'sideways';

  // Strength: how consistently is it trending?
  let consistentMoves = 0;
  for (let i = values.length - shortWindow; i < values.length; i++) {
    if (direction === 'up' && values[i] > values[i - 1]) consistentMoves++;
    if (direction === 'down' && values[i] < values[i - 1]) consistentMoves++;
  }
  const strength = consistentMoves / (shortWindow - 1);

  return { direction, strength, shortMA, longMA };
}

/**
 * Calculate velocity (rate of change)
 */
export function velocity(values: number[], period: number = 5): number[] {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      const change = (values[i] - values[i - period]) / values[i - period];
      result.push(change * 100);  // Percentage
    }
  }

  return result;
}

/**
 * Momentum indicator (current value / past value)
 */
export function momentum(values: number[], period: number = 10): number[] {
  const result: number[] = [];

  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      result.push(values[i] / values[i - period] * 100);
    }
  }

  return result;
}

// =============================================================================
// Autocorrelation
// =============================================================================

/**
 * Calculate autocorrelation at lag k
 */
export function autocorrelation(values: number[], lag: number): number {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    denominator += (values[i] - mean) ** 2;
    if (i >= lag) {
      numerator += (values[i] - mean) * (values[i - lag] - mean);
    }
  }

  return numerator / denominator;
}

/**
 * Calculate autocorrelation function for multiple lags
 */
export function acf(values: number[], maxLag: number = 20): number[] {
  const result: number[] = [1];  // ACF at lag 0 is always 1

  for (let k = 1; k <= maxLag; k++) {
    result.push(autocorrelation(values, k));
  }

  return result;
}

// =============================================================================
// Exports
// =============================================================================

export const TimeSeries = {
  // Moving averages
  sma,
  ema,
  wma,

  // Exponential smoothing
  simpleExponentialSmoothing,
  doubleExponentialSmoothing,
  tripleExponentialSmoothing,

  // Forecasting
  forecast,

  // Volatility
  historicalVolatility,
  ewmaVolatility,
  parkinsonVolatility,

  // Trend
  detectTrend,
  velocity,
  momentum,

  // Autocorrelation
  autocorrelation,
  acf,
};
