import { Cron } from "croner";
import { getConfig } from "./config";
import { generateMorningBrief } from "./services/morning-brief";
import { generateDailyReview } from "./services/daily-review";
import { archiveBrief, archiveReview } from "./output/archive";
import { pushBrief, pushReview } from "./output/webhook";

export interface ScheduledJob {
  name: string;
  cron: Cron;
  lastRun?: Date;
  nextRun?: Date;
}

const jobs: Map<string, ScheduledJob> = new Map();

export function initializeScheduler(): void {
  const config = getConfig();

  // Morning Brief job
  if (config.schedule.morning_brief) {
    const briefJob = new Cron(
      config.schedule.morning_brief,
      { timezone: config.timezone },
      async () => {
        console.log("[scheduler] Running morning brief job...");
        await runMorningBriefJob();
      }
    );

    jobs.set("morning_brief", {
      name: "morning_brief",
      cron: briefJob,
      nextRun: briefJob.nextRun(),
    });

    console.log(
      `[scheduler] Registered: morning_brief at ${config.schedule.morning_brief}`
    );
    console.log(`[scheduler] Next run: ${briefJob.nextRun()}`);
  }

  // Daily Review job
  if (config.schedule.daily_review) {
    const reviewJob = new Cron(
      config.schedule.daily_review,
      { timezone: config.timezone },
      async () => {
        console.log("[scheduler] Running daily review job...");
        await runDailyReviewJob();
      }
    );

    jobs.set("daily_review", {
      name: "daily_review",
      cron: reviewJob,
      nextRun: reviewJob.nextRun(),
    });

    console.log(
      `[scheduler] Registered: daily_review at ${config.schedule.daily_review}`
    );
    console.log(`[scheduler] Next run: ${reviewJob.nextRun()}`);
  }
}

export async function runMorningBriefJob(): Promise<void> {
  try {
    const brief = await generateMorningBrief();

    // Archive to file
    const archiveResult = archiveBrief(brief);
    if (archiveResult.success) {
      console.log(`[scheduler] Brief archived: ${archiveResult.path}`);
    }

    // Push to webhooks
    const webhookResults = await pushBrief(brief);
    for (const result of webhookResults) {
      if (result.success) {
        console.log(`[scheduler] Brief pushed to ${result.target}`);
      } else {
        console.error(
          `[scheduler] Failed to push to ${result.target}: ${result.error}`
        );
      }
    }

    // Update job metadata
    const job = jobs.get("morning_brief");
    if (job) {
      job.lastRun = new Date();
      job.nextRun = job.cron.nextRun();
    }
  } catch (error: any) {
    console.error(`[scheduler] Morning brief job failed:`, error.message);
  }
}

export async function runDailyReviewJob(): Promise<void> {
  try {
    const review = await generateDailyReview();

    // Archive to file
    const archiveResult = archiveReview(review);
    if (archiveResult.success) {
      console.log(`[scheduler] Review archived: ${archiveResult.path}`);
    }

    // Push to webhooks
    const webhookResults = await pushReview(review);
    for (const result of webhookResults) {
      if (result.success) {
        console.log(`[scheduler] Review pushed to ${result.target}`);
      } else {
        console.error(
          `[scheduler] Failed to push to ${result.target}: ${result.error}`
        );
      }
    }

    // Update job metadata
    const job = jobs.get("daily_review");
    if (job) {
      job.lastRun = new Date();
      job.nextRun = job.cron.nextRun();
    }
  } catch (error: any) {
    console.error(`[scheduler] Daily review job failed:`, error.message);
  }
}

export function getJobStatus(): {
  name: string;
  lastRun?: string;
  nextRun?: string;
}[] {
  const status: { name: string; lastRun?: string; nextRun?: string }[] = [];

  for (const [name, job] of jobs) {
    status.push({
      name,
      lastRun: job.lastRun?.toISOString(),
      nextRun: job.cron.nextRun()?.toISOString(),
    });
  }

  return status;
}

export function stopScheduler(): void {
  for (const [name, job] of jobs) {
    job.cron.stop();
    console.log(`[scheduler] Stopped: ${name}`);
  }
  jobs.clear();
}
