import { readFileSync, existsSync } from "fs";
import { parse } from "yaml";
import { join } from "path";

export interface WebhookTarget {
  type: "ntfy" | "telegram" | "discord";
  url?: string;
  bot_token?: string;
  chat_id?: string;
  priority?: string;
}

export interface Config {
  server: {
    port: number;
  };
  schedule: {
    morning_brief: string;
    daily_review: string;
  };
  webhooks: {
    enabled: boolean;
    targets: WebhookTarget[];
  };
  archive: {
    enabled: boolean;
    path: string;
  };
  sources: {
    ichimoku: {
      url: string;
      timeout: number;
    };
    market: {
      assets: string[];
      timeout: number;
    };
    history: {
      path: string;
    };
  };
  captures: {
    path: string;
  };
  timezone: string;
}

const DEFAULT_CONFIG: Config = {
  server: { port: 4001 },
  schedule: {
    morning_brief: "0 7 * * *",
    daily_review: "0 22 * * *",
  },
  webhooks: { enabled: false, targets: [] },
  archive: { enabled: true, path: "${PAI_DIR}/briefs" },
  sources: {
    ichimoku: { url: "http://localhost:5181/api/signals", timeout: 5000 },
    market: {
      assets: ["bitcoin", "solana", "jupiter-exchange-solana"],
      timeout: 10000,
    },
    history: { path: "${PAI_DIR}/history/raw-outputs" },
  },
  captures: { path: "${PAI_DIR}/history/captures" },
  timezone: "America/Los_Angeles",
};

function expandEnvVars(str: string): string {
  return str.replace(/\$\{(\w+)\}/g, (_, key) => {
    if (key === "PAI_DIR") {
      return process.env.PAI_DIR || join(process.env.HOME || "", ".claude");
    }
    return process.env[key] || "";
  });
}

function expandConfigPaths(obj: any): any {
  if (typeof obj === "string") {
    return expandEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(expandConfigPaths);
  }
  if (obj && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = expandConfigPaths(value);
    }
    return result;
  }
  return obj;
}

let cachedConfig: Config | null = null;

export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const configPaths = [
    join(import.meta.dir, "..", "config", "services.yaml"),
    join(import.meta.dir, "..", "config", "services.example.yaml"),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf-8");
        const parsed = parse(content);
        const merged = deepMerge(DEFAULT_CONFIG, parsed);
        cachedConfig = expandConfigPaths(merged) as Config;
        console.log(`[config] Loaded from ${configPath}`);
        return cachedConfig;
      } catch (error) {
        console.error(`[config] Failed to parse ${configPath}:`, error);
      }
    }
  }

  console.log("[config] Using default configuration");
  cachedConfig = expandConfigPaths(DEFAULT_CONFIG) as Config;
  return cachedConfig;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function getConfig(): Config {
  return cachedConfig || loadConfig();
}
