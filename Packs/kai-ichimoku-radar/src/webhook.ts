/**
 * IchimokuRadar — Webhook Notification Delivery
 */

import type { SignalState, WebhookPayload } from './types';

export function buildWebhookPayload(signal: SignalState, prevScore: number): WebhookPayload {
  return {
    asset: signal.asset,
    timeframe: signal.timeframe,
    signal: signal.label,
    score: signal.score,
    prevScore,
    triggers: signal.triggers,
    price: signal.price,
    timestamp: signal.timestamp,
    edgeToEdge: signal.edgeToEdge,
  };
}

export async function sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
  if (!url) return;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`[Webhook] HTTP ${res.status}`);
    } else {
      console.log(`[Webhook] Sent: ${payload.asset} ${payload.timeframe} ${payload.signal} (${payload.score})`);
    }
  } catch (err) {
    console.error('[Webhook] Error:', err);
  }
}
