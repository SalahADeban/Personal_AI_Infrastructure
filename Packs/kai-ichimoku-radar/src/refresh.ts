/**
 * IchimokuRadar — Refresh Orchestrator
 * Fetch OHLCV → Calculate Ichimoku → Score → Compare → Notify
 */

import type { SignalState, OHLCVData, Timeframe } from './types';
import { loadConfig, loadSignals, saveSignals, loadOHLCV, saveOHLCV, saveSignalSnapshot } from './storage';
import { fetchCryptoOHLCV } from './data-sources/coingecko';
import { fetchStockOHLCV } from './data-sources/yahoo';
import { calculateIchimoku } from './ichimoku';
import { calculateSignalScore, getSignalLabel, detectEdgeToEdge, shouldFireWebhook } from './signals';
import { buildWebhookPayload, sendWebhook } from './webhook';

export async function refreshAllSignals(): Promise<SignalState[]> {
  const config = loadConfig();
  const prevSignals = loadSignals();
  const newSignals: SignalState[] = [];

  for (const asset of config.watchlist) {
    for (const timeframe of config.timeframes) {
      try {
        // Rate limit before CoinGecko daily requests (free tier: ~10-30 req/min)
        // Monthly uses CryptoCompare, so only delay for daily CoinGecko calls
        if (asset.type === 'crypto' && timeframe === '1D') {
          await new Promise(r => setTimeout(r, 4000));
        }

        // Fetch OHLCV
        let candles;
        if (asset.type === 'crypto' && asset.coingeckoId) {
          candles = await fetchCryptoOHLCV(asset.coingeckoId, timeframe, asset.symbol);
        } else if (asset.type === 'stock' && asset.yahooSymbol) {
          candles = await fetchStockOHLCV(asset.yahooSymbol, timeframe);
        } else {
          console.error(`[Refresh] No data source for ${asset.symbol}`);
          continue;
        }

        // Fall back to cache if fetch failed
        if (!candles || candles.length === 0) {
          const cached = loadOHLCV(asset.symbol, timeframe);
          if (cached) {
            candles = cached.candles;
            console.log(`[Refresh] Using cached data for ${asset.symbol} ${timeframe}`);
          } else {
            console.error(`[Refresh] No data for ${asset.symbol} ${timeframe}`);
            continue;
          }
        } else {
          // Save fresh data
          const ohlcvData: OHLCVData = {
            asset: asset.symbol,
            timeframe: timeframe as Timeframe,
            candles,
            lastUpdated: new Date().toISOString(),
            source: asset.type === 'crypto' ? 'coingecko' : 'yahoo',
          };
          saveOHLCV(ohlcvData);
        }

        if (candles.length < 52) {
          console.error(`[Refresh] Insufficient candles for ${asset.symbol} ${timeframe}: ${candles.length}/52`);
          continue;
        }

        // Calculate Ichimoku
        const ich = calculateIchimoku(candles);
        if (!ich) {
          console.error(`[Refresh] Ichimoku calculation failed for ${asset.symbol} ${timeframe}`);
          continue;
        }

        // Score
        const { score, components, triggers } = calculateSignalScore(ich, candles);
        const label = getSignalLabel(score);

        // Previous signal
        const prevSignal = prevSignals.find(
          s => s.asset === asset.symbol && s.timeframe === timeframe,
        ) || null;

        // Edge-to-edge
        const edgeToEdge = detectEdgeToEdge(ich, prevSignal);
        if (edgeToEdge?.active && (!prevSignal?.edgeToEdge?.active)) {
          triggers.push({
            type: 'edge_to_edge',
            direction: edgeToEdge.direction,
            description: `Price entered cloud — edge-to-edge ${edgeToEdge.direction} target $${edgeToEdge.target.toFixed(2)} (${edgeToEdge.distancePercent}%)`,
          });
        }

        const signal: SignalState = {
          asset: asset.symbol,
          timeframe: timeframe as Timeframe,
          timestamp: new Date().toISOString(),
          price: ich.currentPrice,
          ichimoku: ich,
          components,
          score,
          label,
          prevScore: prevSignal?.score ?? null,
          triggers,
          edgeToEdge,
        };

        newSignals.push(signal);

        // Webhook
        if (shouldFireWebhook(signal, prevSignal, config)) {
          const payload = buildWebhookPayload(signal, prevSignal?.score ?? 0);
          await sendWebhook(config.webhookUrl, payload);
        }

        console.log(`[Refresh] ${asset.symbol} ${timeframe}: ${label} (${score}) price=$${ich.currentPrice.toFixed(2)}`);
      } catch (err) {
        console.error(`[Refresh] Error for ${asset.symbol} ${timeframe}:`, err);
      }
    }

    // No additional inter-asset delay needed — delay is per-request now
  }

  saveSignals(newSignals);
  saveSignalSnapshot(newSignals);
  console.log(`[Refresh] Complete: ${newSignals.length} signals updated`);
  return newSignals;
}
