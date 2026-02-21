import type { MorningBrief, ActiveSignal } from "../services/morning-brief";
import type { DailyReview, ToolUsage, SkillUsage } from "../services/daily-review";

export function formatBriefAsMarkdown(brief: MorningBrief): string {
  const lines: string[] = [];
  const { sections } = brief;

  lines.push(`# Morning Brief — ${brief.date}`);
  lines.push("");

  // Market Snapshot
  lines.push("## Market Snapshot");
  if (sections.market_snapshot.assets.length > 0) {
    lines.push("| Asset | Price | 24h | Signal | Score |");
    lines.push("|-------|-------|-----|--------|-------|");

    for (const asset of sections.market_snapshot.assets) {
      const signal = asset.signal || "—";
      const score = asset.score !== undefined ? formatScore(asset.score) : "—";
      lines.push(
        `| ${asset.symbol} | ${asset.price} | ${asset.change} | ${signal} | ${score} |`
      );
    }
  } else {
    lines.push("*No market data available*");
  }
  lines.push("");

  // Active Signals
  lines.push("## Active Signals");
  if (sections.active_signals.length > 0) {
    for (const signal of sections.active_signals) {
      const emoji = getSignalEmoji(signal.score);
      lines.push(
        `- ${signal.asset} (${signal.timeframe}): ${emoji} ${signal.label} (${formatScore(signal.score)}) — ${signal.details}`
      );
    }
  } else {
    lines.push("*No significant signals*");
  }
  lines.push("");

  // Overnight Alerts
  if (sections.overnight_alerts.length > 0) {
    lines.push("## Overnight Alerts");
    for (const alert of sections.overnight_alerts) {
      lines.push(`- ${alert.time} — ${alert.message}`);
    }
    lines.push("");
  }

  // Today's Focus
  lines.push("## Today's Focus");
  for (const focus of sections.todays_focus) {
    lines.push(`- ${focus}`);
  }
  lines.push("");

  // Footer
  lines.push("---");
  lines.push(`*Generated ${new Date(brief.timestamp).toLocaleTimeString()}*`);

  return lines.join("\n");
}

export function formatBriefForWebhook(brief: MorningBrief): string {
  const lines: string[] = [];
  const { sections } = brief;

  lines.push(`📋 Morning Brief — ${brief.date}`);
  lines.push("");

  // Compact market snapshot
  if (sections.market_snapshot.assets.length > 0) {
    lines.push("📊 Market:");
    for (const asset of sections.market_snapshot.assets) {
      const emoji = getChangeEmoji(parseFloat(asset.change));
      lines.push(`  ${asset.symbol}: ${asset.price} ${emoji}${asset.change}`);
    }
    lines.push("");
  }

  // Active signals (top 3)
  if (sections.active_signals.length > 0) {
    lines.push("📡 Signals:");
    for (const signal of sections.active_signals.slice(0, 3)) {
      const emoji = getSignalEmoji(signal.score);
      lines.push(
        `  ${signal.asset} ${emoji} ${signal.label} (${formatScore(signal.score)})`
      );
    }
    lines.push("");
  }

  // Today's focus (top 2)
  if (sections.todays_focus.length > 0) {
    lines.push("🎯 Focus:");
    for (const focus of sections.todays_focus.slice(0, 2)) {
      lines.push(`  • ${focus}`);
    }
  }

  return lines.join("\n");
}

export function formatReviewAsMarkdown(review: DailyReview): string {
  const lines: string[] = [];
  const { summary, sections } = review;

  lines.push(`# Daily Review — ${review.date}`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push(`- ${summary.session_count} sessions, ${summary.event_count} events`);
  lines.push(`- ${summary.learning_count} learnings captured`);
  lines.push("");

  // Tools Used
  lines.push("## Tools Used");
  if (sections.tools_used.length > 0) {
    const toolStr = sections.tools_used
      .slice(0, 8)
      .map((t) => `${t.tool} (${t.count})`)
      .join(" | ");
    lines.push(toolStr);
  } else {
    lines.push("*No tool usage recorded*");
  }
  lines.push("");

  // Files Modified
  if (sections.files_modified.length > 0) {
    lines.push("## Files Modified");
    const shown = sections.files_modified.slice(0, 10);
    for (const file of shown) {
      lines.push(`- ${file}`);
    }
    if (sections.files_modified.length > 10) {
      lines.push(`- *(${sections.files_modified.length - 10} more)*`);
    }
    lines.push("");
  }

  // Learnings
  if (sections.learnings.length > 0) {
    lines.push("## Learnings");
    sections.learnings.forEach((learning, i) => {
      lines.push(`${i + 1}. ${learning}`);
    });
    lines.push("");
  }

  // Skills Invoked
  if (sections.skills_invoked.length > 0) {
    lines.push("## Skills Invoked");
    const skillStr = sections.skills_invoked
      .map((s) => `${s.skill} (${s.count})`)
      .join(" | ");
    lines.push(skillStr);
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push(`*Generated ${new Date(review.timestamp).toLocaleTimeString()}*`);

  return lines.join("\n");
}

export function formatReviewForWebhook(review: DailyReview): string {
  const lines: string[] = [];
  const { summary, sections } = review;

  lines.push(`📝 Daily Review — ${review.date}`);
  lines.push("");
  lines.push(
    `📊 ${summary.session_count} sessions | ${summary.event_count} events | ${summary.learning_count} learnings`
  );
  lines.push("");

  // Top tools
  if (sections.tools_used.length > 0) {
    const topTools = sections.tools_used.slice(0, 4).map((t) => t.tool).join(", ");
    lines.push(`🔧 Top tools: ${topTools}`);
  }

  // Files count
  if (sections.files_modified.length > 0) {
    lines.push(`📁 ${sections.files_modified.length} files modified`);
  }

  // Learnings summary
  if (sections.learnings.length > 0) {
    lines.push(`💡 ${sections.learnings.length} learnings captured`);
  }

  return lines.join("\n");
}

function formatScore(score: number): string {
  return score > 0 ? `+${score}` : `${score}`;
}

function getSignalEmoji(score: number): string {
  if (score >= 40) return "🟢🟢";
  if (score > 15) return "🟢";
  if (score <= -40) return "🔴🔴";
  if (score < -15) return "🔴";
  return "⚪";
}

function getChangeEmoji(change: number): string {
  if (change > 5) return "🚀";
  if (change > 0) return "📈";
  if (change < -5) return "💥";
  if (change < 0) return "📉";
  return "➡️";
}
