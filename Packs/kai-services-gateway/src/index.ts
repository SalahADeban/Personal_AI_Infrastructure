import { loadConfig, getConfig } from "./config";
import { initializeScheduler, runMorningBriefJob, runDailyReviewJob, getJobStatus } from "./scheduler";
import { generateMorningBrief, getBriefSummary } from "./services/morning-brief";
import { generateDailyReview, getReviewSummary } from "./services/daily-review";
import { captureInsight, getRecentCaptures, searchCaptures, getCaptureStats } from "./services/quick-capture";
import { archiveBrief, archiveReview } from "./output/archive";
import { pushBrief, pushReview } from "./output/webhook";
import { formatBriefAsMarkdown, formatReviewAsMarkdown } from "./output/formatter";
import { existsSync } from "fs";
import { join } from "path";

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Load configuration
const config = loadConfig();

// Initialize scheduler
initializeScheduler();

// HTTP Server
const server = Bun.serve({
  port: config.server.port,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // CORS headers
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    try {
      // Health check
      if (path === "/api/health") {
        return Response.json(
          {
            status: "ok",
            timestamp: new Date().toISOString(),
            version: "1.0.0",
            jobs: getJobStatus(),
          },
          { headers }
        );
      }

      // Morning Brief - Get latest
      if (path === "/api/brief" && method === "GET") {
        const brief = await generateMorningBrief();
        const format = url.searchParams.get("format");

        if (format === "markdown") {
          return new Response(formatBriefAsMarkdown(brief), {
            headers: { ...headers, "Content-Type": "text/markdown" },
          });
        }

        return Response.json(
          {
            ...brief,
            summary: getBriefSummary(brief),
          },
          { headers }
        );
      }

      // Morning Brief - Generate and push
      if (path === "/api/brief/generate" && method === "POST") {
        const brief = await generateMorningBrief();

        // Archive
        const archiveResult = archiveBrief(brief);

        // Push to webhooks
        const webhookResults = await pushBrief(brief);

        return Response.json(
          {
            success: true,
            brief,
            summary: getBriefSummary(brief),
            archive: archiveResult,
            webhooks: webhookResults,
          },
          { headers }
        );
      }

      // Daily Review - Get latest
      if (path === "/api/daily-review" && method === "GET") {
        const dateParam = url.searchParams.get("date");
        const date = dateParam ? new Date(dateParam) : undefined;
        const review = await generateDailyReview(date);
        const format = url.searchParams.get("format");

        if (format === "markdown") {
          return new Response(formatReviewAsMarkdown(review), {
            headers: { ...headers, "Content-Type": "text/markdown" },
          });
        }

        return Response.json(
          {
            ...review,
            summary: getReviewSummary(review),
          },
          { headers }
        );
      }

      // Daily Review - Generate and push
      if (path === "/api/daily-review/generate" && method === "POST") {
        const review = await generateDailyReview();

        // Archive
        const archiveResult = archiveReview(review);

        // Push to webhooks
        const webhookResults = await pushReview(review);

        return Response.json(
          {
            success: true,
            review,
            summary: getReviewSummary(review),
            archive: archiveResult,
            webhooks: webhookResults,
          },
          { headers }
        );
      }

      // Quick Capture - Create
      if (path === "/api/capture" && method === "POST") {
        const body = await req.json();
        const { insight, tags = [], source = "api" } = body;

        const result = captureInsight(insight, tags, source);

        return Response.json(result, {
          status: result.success ? 201 : 400,
          headers,
        });
      }

      // Quick Capture - Recent
      if (path === "/api/capture/recent" && method === "GET") {
        const limit = parseInt(url.searchParams.get("limit") || "10");
        const captures = getRecentCaptures(limit);

        return Response.json({ captures }, { headers });
      }

      // Quick Capture - Search
      if (path === "/api/capture/search" && method === "GET") {
        const query = url.searchParams.get("q") || "";
        const tags = url.searchParams.get("tags")?.split(",").filter(Boolean);
        const limit = parseInt(url.searchParams.get("limit") || "20");

        const captures = searchCaptures(query, tags, limit);

        return Response.json({ captures, query, tags }, { headers });
      }

      // Quick Capture - Stats
      if (path === "/api/capture/stats" && method === "GET") {
        const stats = getCaptureStats();
        return Response.json(stats, { headers });
      }

      // Scheduler status
      if (path === "/api/scheduler" && method === "GET") {
        return Response.json({ jobs: getJobStatus() }, { headers });
      }

      // Manual trigger endpoints
      if (path === "/api/scheduler/brief" && method === "POST") {
        await runMorningBriefJob();
        return Response.json({ success: true, message: "Morning brief job triggered" }, { headers });
      }

      if (path === "/api/scheduler/review" && method === "POST") {
        await runDailyReviewJob();
        return Response.json({ success: true, message: "Daily review job triggered" }, { headers });
      }

      // Serve static files
      const publicDir = join(import.meta.dir, "..", "public");
      const filePath = join(publicDir, path === "/" ? "index.html" : path);

      if (existsSync(filePath)) {
        const file = Bun.file(filePath);
        const ext = "." + (filePath.split(".").pop() || "html");
        return new Response(file, {
          headers: {
            "Content-Type": MIME_TYPES[ext] || "text/plain",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // 404
      return Response.json(
        {
          error: "Not Found",
          path,
          availableEndpoints: [
            "GET  /",
            "GET  /api/health",
            "GET  /api/brief",
            "POST /api/brief/generate",
            "GET  /api/daily-review",
            "POST /api/daily-review/generate",
            "POST /api/capture",
            "GET  /api/capture/recent",
            "GET  /api/capture/search",
            "GET  /api/capture/stats",
            "GET  /api/scheduler",
            "POST /api/scheduler/brief",
            "POST /api/scheduler/review",
          ],
        },
        { status: 404, headers }
      );
    } catch (error: any) {
      console.error(`[server] Error handling ${method} ${path}:`, error);
      return Response.json(
        {
          error: "Internal Server Error",
          message: error.message,
        },
        { status: 500, headers }
      );
    }
  },
});

console.log(`
╔════════════════════════════════════════════════════╗
║         PAI Services Gateway v1.0.0                ║
╠════════════════════════════════════════════════════╣
║  Dashboard: http://localhost:${config.server.port}                 ║
║  Timezone:  ${config.timezone.padEnd(32)}║
║                                                    ║
║  API Endpoints:                                    ║
║    GET  /api/health         Health check           ║
║    GET  /api/brief          Morning brief          ║
║    GET  /api/daily-review   Daily review           ║
║    POST /api/capture        Quick capture          ║
║                                                    ║
║  Scheduled Jobs:                                   ║
║    Morning Brief: ${config.schedule.morning_brief.padEnd(28)}║
║    Daily Review:  ${config.schedule.daily_review.padEnd(28)}║
╚════════════════════════════════════════════════════╝
`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[server] Shutting down...");
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[server] Shutting down...");
  server.stop();
  process.exit(0);
});
