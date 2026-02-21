import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { getConfig } from "../config";

export interface HistoryEvent {
  timestamp: string;
  type: string;
  data: any;
  session_id?: string;
}

export interface SessionSummary {
  session_id: string;
  start_time: string;
  end_time?: string;
  event_count: number;
  tools_used: Record<string, number>;
  files_modified: string[];
  learnings: string[];
  skills_invoked: string[];
}

export interface DailyHistory {
  date: string;
  sessions: SessionSummary[];
  total_events: number;
  all_tools: Record<string, number>;
  all_files: string[];
  all_learnings: string[];
  all_skills: string[];
}

export function getHistoryPath(date?: Date): string {
  const config = getConfig();
  const basePath = config.sources.history.path;
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return join(basePath, `${year}-${month}`, `${year}-${month}-${day}_all-events.jsonl`);
}

export function readHistoryEvents(date?: Date): HistoryEvent[] {
  const filePath = getHistoryPath(date);

  if (!existsSync(filePath)) {
    console.log(`[history] No history file at ${filePath}`);
    return [];
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    return lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean) as HistoryEvent[];
  } catch (error: any) {
    console.error(`[history] Error reading ${filePath}:`, error.message);
    return [];
  }
}

export function parseHistoryToSummary(events: HistoryEvent[]): DailyHistory {
  const sessions = new Map<string, SessionSummary>();
  const allTools: Record<string, number> = {};
  const allFiles = new Set<string>();
  const allLearnings: string[] = [];
  const allSkills = new Set<string>();

  for (const event of events) {
    const sessionId = event.session_id || "unknown";

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        session_id: sessionId,
        start_time: event.timestamp,
        event_count: 0,
        tools_used: {},
        files_modified: [],
        learnings: [],
        skills_invoked: [],
      });
    }

    const session = sessions.get(sessionId)!;
    session.event_count++;
    session.end_time = event.timestamp;

    // Track tool usage
    if (event.type === "tool_use" || event.data?.tool) {
      const tool = event.data?.tool || event.type;
      session.tools_used[tool] = (session.tools_used[tool] || 0) + 1;
      allTools[tool] = (allTools[tool] || 0) + 1;
    }

    // Track file modifications
    if (event.data?.file_path && (event.type === "Edit" || event.type === "Write")) {
      const file = event.data.file_path;
      if (!session.files_modified.includes(file)) {
        session.files_modified.push(file);
      }
      allFiles.add(file);
    }

    // Track learnings
    if (event.type === "learning" || event.data?.type === "learning") {
      const learning = event.data?.content || event.data?.summary || "";
      if (learning) {
        session.learnings.push(learning);
        allLearnings.push(learning);
      }
    }

    // Track skills
    if (event.type === "Skill" || event.data?.skill) {
      const skill = event.data?.skill || "";
      if (skill && !session.skills_invoked.includes(skill)) {
        session.skills_invoked.push(skill);
        allSkills.add(skill);
      }
    }
  }

  const firstTimestamp = events[0]?.timestamp;
  const dateStr = typeof firstTimestamp === "string"
    ? firstTimestamp.split("T")[0]
    : new Date().toISOString().split("T")[0];
  const date = dateStr;

  return {
    date,
    sessions: Array.from(sessions.values()),
    total_events: events.length,
    all_tools: allTools,
    all_files: Array.from(allFiles),
    all_learnings: allLearnings,
    all_skills: Array.from(allSkills),
  };
}

export function getRecentAlerts(events: HistoryEvent[], hoursBack = 12): HistoryEvent[] {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;

  return events.filter((event) => {
    if (!event.timestamp) return false;
    const eventTime = new Date(event.timestamp).getTime();
    return eventTime >= cutoff && event.type === "webhook_alert";
  });
}

export function getDailyHistory(date?: Date): DailyHistory {
  const events = readHistoryEvents(date);
  return parseHistoryToSummary(events);
}
