import { getConfig, type WebhookTarget } from "../config";
import { formatBriefForWebhook, formatReviewForWebhook } from "./formatter";
import type { MorningBrief } from "../services/morning-brief";
import type { DailyReview } from "../services/daily-review";

export interface WebhookResult {
  target: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

export async function sendToWebhooks(
  content: string,
  title: string
): Promise<WebhookResult[]> {
  const config = getConfig();

  if (!config.webhooks.enabled || config.webhooks.targets.length === 0) {
    console.log("[webhook] Webhooks disabled or no targets configured");
    return [];
  }

  const results: WebhookResult[] = [];

  for (const target of config.webhooks.targets) {
    const result = await sendToTarget(target, content, title);
    results.push(result);
  }

  return results;
}

async function sendToTarget(
  target: WebhookTarget,
  content: string,
  title: string
): Promise<WebhookResult> {
  try {
    switch (target.type) {
      case "ntfy":
        return await sendToNtfy(target, content, title);
      case "telegram":
        return await sendToTelegram(target, content, title);
      case "discord":
        return await sendToDiscord(target, content, title);
      default:
        return {
          target: target.type,
          success: false,
          error: `Unknown webhook type: ${target.type}`,
        };
    }
  } catch (error: any) {
    return {
      target: target.type,
      success: false,
      error: error.message,
    };
  }
}

async function sendToNtfy(
  target: WebhookTarget,
  content: string,
  title: string
): Promise<WebhookResult> {
  if (!target.url) {
    return { target: "ntfy", success: false, error: "No URL configured" };
  }

  const response = await fetch(target.url, {
    method: "POST",
    headers: {
      Title: title,
      Priority: target.priority || "default",
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: content,
  });

  console.log(`[webhook] ntfy: ${response.status}`);

  return {
    target: "ntfy",
    success: response.ok,
    statusCode: response.status,
    error: response.ok ? undefined : `HTTP ${response.status}`,
  };
}

async function sendToTelegram(
  target: WebhookTarget,
  content: string,
  title: string
): Promise<WebhookResult> {
  const botToken = target.bot_token || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = target.chat_id || process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return {
      target: "telegram",
      success: false,
      error: "Missing bot_token or chat_id",
    };
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const text = `*${escapeMarkdown(title)}*\n\n${escapeMarkdown(content)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    }),
  });

  console.log(`[webhook] telegram: ${response.status}`);

  if (!response.ok) {
    const error = await response.text();
    return {
      target: "telegram",
      success: false,
      statusCode: response.status,
      error,
    };
  }

  return {
    target: "telegram",
    success: true,
    statusCode: response.status,
  };
}

async function sendToDiscord(
  target: WebhookTarget,
  content: string,
  title: string
): Promise<WebhookResult> {
  const url = target.url || process.env.DISCORD_WEBHOOK_URL;

  if (!url) {
    return { target: "discord", success: false, error: "No URL configured" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [
        {
          title,
          description: content.slice(0, 4000), // Discord limit
          color: 0x5865f2, // Discord blue
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  console.log(`[webhook] discord: ${response.status}`);

  return {
    target: "discord",
    success: response.ok,
    statusCode: response.status,
    error: response.ok ? undefined : `HTTP ${response.status}`,
  };
}

function escapeMarkdown(text: string): string {
  // Escape special characters for Telegram MarkdownV2
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export async function pushBrief(brief: MorningBrief): Promise<WebhookResult[]> {
  const content = formatBriefForWebhook(brief);
  return sendToWebhooks(content, "Morning Brief");
}

export async function pushReview(review: DailyReview): Promise<WebhookResult[]> {
  const content = formatReviewForWebhook(review);
  return sendToWebhooks(content, "Daily Review");
}
