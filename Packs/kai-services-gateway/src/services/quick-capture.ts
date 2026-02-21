import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { getConfig } from "../config";
import { randomUUID } from "crypto";

export interface CaptureEntry {
  id: string;
  timestamp: string;
  insight: string;
  tags: string[];
  source: string;
}

export interface CaptureResult {
  success: boolean;
  id: string;
  message: string;
}

export function getCapturesPath(date?: Date): string {
  const config = getConfig();
  const basePath = config.captures.path;
  const d = date || new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return join(basePath, `${year}-${month}-${day}.jsonl`);
}

export function captureInsight(
  insight: string,
  tags: string[] = [],
  source = "api"
): CaptureResult {
  if (!insight || insight.trim().length === 0) {
    return {
      success: false,
      id: "",
      message: "Insight cannot be empty",
    };
  }

  const filePath = getCapturesPath();
  const dirPath = dirname(filePath);

  // Ensure directory exists
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  const entry: CaptureEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    insight: insight.trim(),
    tags: normalizeTags(tags),
    source,
  };

  try {
    appendFileSync(filePath, JSON.stringify(entry) + "\n");
    console.log(`[capture] Saved: ${entry.id.slice(0, 8)} - ${insight.slice(0, 50)}`);

    return {
      success: true,
      id: entry.id,
      message: "Capture saved successfully",
    };
  } catch (error: any) {
    console.error(`[capture] Error saving:`, error.message);
    return {
      success: false,
      id: "",
      message: `Failed to save: ${error.message}`,
    };
  }
}

function normalizeTags(tags: string[]): string[] {
  return tags
    .map((t) => t.toLowerCase().trim().replace(/[^a-z0-9-_]/g, ""))
    .filter((t) => t.length > 0)
    .filter((t, i, arr) => arr.indexOf(t) === i); // dedupe
}

export function getRecentCaptures(limit = 10): CaptureEntry[] {
  const today = new Date();
  const captures: CaptureEntry[] = [];

  // Check today and yesterday
  for (let i = 0; i < 2 && captures.length < limit; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const filePath = getCapturesPath(date);

    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);

        for (const line of lines.reverse()) {
          try {
            const entry = JSON.parse(line) as CaptureEntry;
            captures.push(entry);
            if (captures.length >= limit) break;
          } catch {
            // Skip malformed lines
          }
        }
      } catch (error: any) {
        console.error(`[capture] Error reading ${filePath}:`, error.message);
      }
    }
  }

  return captures;
}

export function searchCaptures(
  query: string,
  tags?: string[],
  limit = 20
): CaptureEntry[] {
  const queryLower = query.toLowerCase();
  const tagSet = new Set(tags?.map((t) => t.toLowerCase()) || []);
  const results: CaptureEntry[] = [];

  // Search last 7 days
  const today = new Date();
  for (let i = 0; i < 7 && results.length < limit; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const filePath = getCapturesPath(date);

    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as CaptureEntry;

            // Check query match
            const matchesQuery =
              !query || entry.insight.toLowerCase().includes(queryLower);

            // Check tag match
            const matchesTags =
              tagSet.size === 0 ||
              entry.tags.some((t) => tagSet.has(t.toLowerCase()));

            if (matchesQuery && matchesTags) {
              results.push(entry);
              if (results.length >= limit) break;
            }
          } catch {
            // Skip malformed lines
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }
  }

  // Sort by timestamp descending
  return results.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export function getCaptureStats(): {
  today: number;
  week: number;
  topTags: { tag: string; count: number }[];
} {
  const tagCounts: Record<string, number> = {};
  let today = 0;
  let week = 0;

  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const filePath = getCapturesPath(date);

    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as CaptureEntry;
            week++;

            if (entry.timestamp.startsWith(todayStr)) {
              today++;
            }

            for (const tag of entry.tags) {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
          } catch {
            // Skip malformed
          }
        }
      } catch {
        // Skip unreadable
      }
    }
  }

  const topTags = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return { today, week, topTags };
}
