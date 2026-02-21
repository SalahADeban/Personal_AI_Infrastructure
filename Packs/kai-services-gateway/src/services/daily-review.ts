import { getDailyHistory, type DailyHistory } from "../sources/history";
import { getConfig } from "../config";

export interface DailyReview {
  title: string;
  date: string;
  timestamp: string;
  summary: {
    session_count: number;
    event_count: number;
    learning_count: number;
  };
  sections: {
    tools_used: ToolUsage[];
    files_modified: string[];
    learnings: string[];
    skills_invoked: SkillUsage[];
  };
  raw: DailyHistory;
}

export interface ToolUsage {
  tool: string;
  count: number;
}

export interface SkillUsage {
  skill: string;
  count: number;
}

export async function generateDailyReview(date?: Date): Promise<DailyReview> {
  const config = getConfig();
  const targetDate = date || new Date();
  const dateStr = targetDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: config.timezone,
  });

  const history = getDailyHistory(targetDate);

  // Sort tools by usage
  const toolsUsed: ToolUsage[] = Object.entries(history.all_tools)
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);

  // Count skill invocations across sessions
  const skillCounts: Record<string, number> = {};
  for (const session of history.sessions) {
    for (const skill of session.skills_invoked) {
      skillCounts[skill] = (skillCounts[skill] || 0) + 1;
    }
  }

  const skillsInvoked: SkillUsage[] = Object.entries(skillCounts)
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count);

  // Dedupe and shorten file paths
  const filesModified = history.all_files
    .map(shortenPath)
    .filter((f, i, arr) => arr.indexOf(f) === i)
    .slice(0, 15);

  // Dedupe learnings
  const learnings = history.all_learnings
    .filter((l, i, arr) => arr.indexOf(l) === i)
    .slice(0, 10);

  return {
    title: "Daily Review",
    date: dateStr,
    timestamp: new Date().toISOString(),
    summary: {
      session_count: history.sessions.length,
      event_count: history.total_events,
      learning_count: learnings.length,
    },
    sections: {
      tools_used: toolsUsed,
      files_modified: filesModified,
      learnings,
      skills_invoked: skillsInvoked,
    },
    raw: history,
  };
}

function shortenPath(path: string): string {
  // Replace home directory
  const home = process.env.HOME || "";
  if (home && path.startsWith(home)) {
    path = "~" + path.slice(home.length);
  }

  // Replace common prefixes
  path = path.replace(/~\/\.claude\//, "~/.claude/");

  return path;
}

export function getReviewSummary(review: DailyReview): string {
  const { summary, sections } = review;

  let text = `${review.date}: `;
  text += `${summary.session_count} sessions, ${summary.event_count} events`;

  if (summary.learning_count > 0) {
    text += `, ${summary.learning_count} learnings captured`;
  }

  const topTools = sections.tools_used.slice(0, 3).map((t) => t.tool).join(", ");
  if (topTools) {
    text += `. Top tools: ${topTools}`;
  }

  return text;
}

export function formatToolsAsBar(tools: ToolUsage[], maxWidth = 50): string {
  if (tools.length === 0) return "No tools used";

  const total = tools.reduce((sum, t) => sum + t.count, 0);
  const lines: string[] = [];

  for (const { tool, count } of tools.slice(0, 8)) {
    const percentage = count / total;
    const barWidth = Math.round(percentage * maxWidth);
    const bar = "█".repeat(barWidth) + "░".repeat(maxWidth - barWidth);
    lines.push(`${tool.padEnd(15)} ${bar} ${count}`);
  }

  return lines.join("\n");
}
