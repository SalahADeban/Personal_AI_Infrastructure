import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { getConfig } from "../config";
import { formatBriefAsMarkdown } from "./formatter";
import { formatReviewAsMarkdown } from "./formatter";
import type { MorningBrief } from "../services/morning-brief";
import type { DailyReview } from "../services/daily-review";

export interface ArchiveResult {
  success: boolean;
  path: string;
  message: string;
}

function getArchivePath(type: "morning-brief" | "daily-review", date?: Date): string {
  const config = getConfig();
  const basePath = config.archive.path;
  const d = date || new Date();
  const dateStr = d.toISOString().split("T")[0];

  return join(basePath, `${dateStr}_${type}.md`);
}

function ensureDirectory(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function archiveBrief(brief: MorningBrief): ArchiveResult {
  const config = getConfig();

  if (!config.archive.enabled) {
    return {
      success: false,
      path: "",
      message: "Archive disabled in config",
    };
  }

  const filePath = getArchivePath("morning-brief");
  const content = formatBriefAsMarkdown(brief);

  try {
    ensureDirectory(filePath);
    writeFileSync(filePath, content);
    console.log(`[archive] Brief saved to ${filePath}`);

    // Also save JSON version
    const jsonPath = filePath.replace(".md", ".json");
    writeFileSync(jsonPath, JSON.stringify(brief, null, 2));

    return {
      success: true,
      path: filePath,
      message: "Brief archived successfully",
    };
  } catch (error: any) {
    console.error(`[archive] Error:`, error.message);
    return {
      success: false,
      path: "",
      message: `Failed to archive: ${error.message}`,
    };
  }
}

export function archiveReview(review: DailyReview): ArchiveResult {
  const config = getConfig();

  if (!config.archive.enabled) {
    return {
      success: false,
      path: "",
      message: "Archive disabled in config",
    };
  }

  const filePath = getArchivePath("daily-review");
  const content = formatReviewAsMarkdown(review);

  try {
    ensureDirectory(filePath);
    writeFileSync(filePath, content);
    console.log(`[archive] Review saved to ${filePath}`);

    // Also save JSON version
    const jsonPath = filePath.replace(".md", ".json");
    writeFileSync(jsonPath, JSON.stringify(review, null, 2));

    return {
      success: true,
      path: filePath,
      message: "Review archived successfully",
    };
  } catch (error: any) {
    console.error(`[archive] Error:`, error.message);
    return {
      success: false,
      path: "",
      message: `Failed to archive: ${error.message}`,
    };
  }
}

export function getLatestArchive(
  type: "morning-brief" | "daily-review"
): string | null {
  const config = getConfig();
  const basePath = config.archive.path;

  // Check today and yesterday
  for (let i = 0; i < 2; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const filePath = getArchivePath(type, date);

    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}
